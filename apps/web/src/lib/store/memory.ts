/**
 * Local-mode store: everything in memory, persisted to one JSON file so the Room survives restarts.
 * Used when no Supabase credentials are configured. Same behaviour as the Supabase store.
 */
import type { AgentTool, Area, AreaMap, NormalisedEvent, ProjectTree } from "@glasshouse/schema";
import type { DigestWindowKind, EndedTask } from "@glasshouse/translate";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  CONTINUITY_MAX_CHECKS,
  DEPTH,
  WATCHER_DEDUPE_MS,
  applyEvent,
  areaIdsOf,
  changeLines,
  continuationFor,
  hashToken,
  inboxItemFrom,
  latencyStats,
  newTaskState,
  newToken,
  reportFactsFor,
  templateReportFor,
  translateContext,
  viewEvent,
  viewTask,
  type TaskState,
} from "./derive";
import { WEEK_MS, activityFrom, areaProgress } from "../progress";
import { storyFrom } from "../story";
import type { AiCallLog, DigestCache, EventView, FeedbackRecord, FeedbackView, IngestResult, Invite, LinkCode, MetricCounts, MetricEvent, Profile, ProjectSummary, ReportRecord, RoomState, SessionView, Stats, Store, TaskDetail, TaskView, TesterNote } from "./types";

type ProjectRow = ProjectSummary;
interface SessionRow {
  id: string;
  projectId: string;
  tool: AgentTool;
  externalId: string;
  startedAt: string;
  endedAt?: string;
  lastEventAt?: string;
}
interface TaskRow {
  id: string;
  projectId: string;
  sessionId: string;
  tool: AgentTool;
  externalKey?: string;
  startedAt: string;
  state: TaskState;
}
interface EventRow extends Omit<EventView, "plain" | "areaId" | "areaName"> {
  projectId: string;
  sessionId: string;
  taskId?: string;
}
interface AiCallRow extends AiCallLog {
  id: string;
  createdAt: string;
}
interface Db {
  projects: Record<string, ProjectRow>;
  tokens: Record<string, string>; // token hash -> project id
  sessions: Record<string, SessionRow>;
  tasks: Record<string, TaskRow>;
  events: EventRow[];
  areaMaps: Record<string, AreaMap>;
  trees: Record<string, ProjectTree>;
  fileDescriptions: Record<string, Record<string, string>>;
  aiCalls: AiCallRow[];
  // Phase 3
  reports: Record<string, ReportRecord>; // task id -> card words
  feedback: FeedbackRecord[];
  digests: DigestCache[];
  lastChecked: Record<string, string>; // project id -> when the digest was last opened
  // Phase 4
  profiles: Record<string, Profile>;
  linkCodes: Record<string, LinkCode>;
  invites: Record<string, Invite>; // lower-case email
  testerNotes: TesterNote[];
  metrics: Array<{ event: MetricEvent; visitorId: string; at: string }>;
}

const emptyDb = (): Db => ({
  projects: {},
  tokens: {},
  sessions: {},
  tasks: {},
  events: [],
  areaMaps: {},
  trees: {},
  fileDescriptions: {},
  aiCalls: [],
  reports: {},
  feedback: [],
  digests: [],
  lastChecked: {},
  profiles: {},
  linkCodes: {},
  invites: {},
  testerNotes: [],
  metrics: [],
});

/** In local mode there is one person: whoever owns the machine. */
export const LOCAL_OWNER = "local";
const LINK_CODE_TTL_MS = 15 * 60 * 1000;

export function newLinkCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I
  const pick = () => alphabet[Math.floor(Math.random() * alphabet.length)]!;
  return `${pick()}${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}${pick()}`;
}

export const normaliseCode = (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^(.{4})(.{4})$/, "$1-$2");

const MAX_EVENTS = 20000;
const ROOM_SESSIONS = 12;
const RECENT_EVENTS = 60;
const DETAIL_EVENTS = 500;
const CONTINUITY_WINDOW_MS = 6 * 60 * 60 * 1000;

export interface MemoryStoreOptions {
  /** File to persist to. Omit for a purely in-memory store (tests). */
  persistPath?: string;
  now?: () => string;
}

export class MemoryStore implements Store {
  readonly mode = "local" as const;
  private db: Db = emptyDb();
  private sessionIndex = new Map<string, string>();
  private taskIndex = new Map<string, string>();
  private eventIds = new Set<string>();
  private saveTimer: NodeJS.Timeout | null = null;
  private readonly now: () => string;

  constructor(private readonly opts: MemoryStoreOptions = {}) {
    this.now = opts.now ?? (() => new Date().toISOString());
    if (opts.persistPath) this.load(opts.persistPath);
  }

  private load(path: string) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<Db>;
      this.db = Object.assign(emptyDb(), parsed);
    } catch {
      /* first run */
    }
    // Rows from before Phase 2 have no state; give them an empty one rather than crash.
    for (const t of Object.values(this.db.tasks)) if (!t.state) t.state = newTaskState();
    for (const s of Object.values(this.db.sessions)) this.sessionIndex.set(sessionKey(s.projectId, s.tool, s.externalId), s.id);
    for (const t of Object.values(this.db.tasks)) if (t.externalKey) this.taskIndex.set(taskKey(t.sessionId, t.externalKey), t.id);
    for (const e of this.db.events) this.eventIds.add(e.id);
  }

  private scheduleSave() {
    const path = this.opts.persistPath;
    if (!path) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, JSON.stringify(this.db));
      } catch (err) {
        console.error("[glasshouse] could not persist local store:", err);
      }
    }, 300);
  }

  async createProject(input: { name: string; rootHint?: string; ownerId?: string | null }) {
    const project: ProjectRow = { id: crypto.randomUUID(), name: input.name, rootHint: input.rootHint, createdAt: this.now(), ownerId: input.ownerId === undefined ? LOCAL_OWNER : input.ownerId };
    const token = newToken();
    this.db.projects[project.id] = project;
    this.db.tokens[hashToken(token)] = project.id;
    this.scheduleSave();
    return { project, token };
  }

  async resolveToken(token: string) {
    const id = this.db.tokens[hashToken(token)];
    return id ? (this.db.projects[id] ?? null) : null;
  }

  async listProjects(ownerId?: string) {
    return Object.values(this.db.projects)
      .filter((p) => ownerId === undefined || p.ownerId === ownerId || (ownerId === LOCAL_OWNER && !p.ownerId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getProject(id: string) {
    return this.db.projects[id] ?? null;
  }

  // -- ingest -------------------------------------------------------------------------------

  async ingest(projectId: string, events: NormalisedEvent[]): Promise<IngestResult> {
    const result: IngestResult = { inserted: 0, duplicates: 0, headlineRequests: [], undescribedPaths: [], finishedTasks: [] };
    const receivedAt = this.now();
    const ctx = translateContext(this.db.areaMaps[projectId], this.db.fileDescriptions[projectId] ?? {});
    const described = this.db.fileDescriptions[projectId] ?? {};
    const sorted = [...events].sort((a, b) => a.ts.localeCompare(b.ts));

    for (const e of sorted) {
      if (this.eventIds.has(e.id)) {
        result.duplicates++;
        continue;
      }
      if (e.tool === "watcher" && e.kind === "edit" && this.agentEditedRecently(projectId, e)) {
        result.duplicates++;
        this.eventIds.add(e.id);
        continue;
      }
      const session = this.upsertSession(projectId, e);
      const task = e.taskKey ? this.upsertTask(projectId, session, e) : undefined;
      if (task) {
        const { state, trigger, finished } = applyEvent(task.state, e, ctx);
        task.state = state;
        if (trigger) result.headlineRequests.push({ taskId: task.id, trigger });
        this.maybeLinkContinuation(projectId, task, ctx.areas);
        if (finished) {
          // The template card exists the moment the task ends; the AI worker improves the words later.
          this.writeReport({ ...templateReportFor(state, task.tool, ctx), taskId: task.id, projectId, eventCount: state.eventCount, resolvedAt: undefined }, receivedAt, true);
          if (!result.finishedTasks.includes(task.id)) result.finishedTasks.push(task.id);
        }
      }
      session.lastEventAt = e.ts;
      if (e.kind === "session_end") session.endedAt = e.ts;
      for (const p of e.paths) if ((e.kind === "edit" || e.kind === "read") && !described[p] && !result.undescribedPaths.includes(p)) result.undescribedPaths.push(p);
      this.db.events.push({
        id: e.id,
        projectId,
        sessionId: session.id,
        taskId: task?.id,
        kind: e.kind,
        tool: e.tool,
        ts: e.ts,
        receivedAt,
        summary: e.summary,
        paths: e.paths,
        command: e.command,
        text: e.text ?? (e.kind === "prompt" ? e.prompt : undefined),
        tests: e.tests,
        sourceEvent: e.sourceEvent,
        sourceTool: e.sourceTool,
        agentId: e.agentId,
        success: e.success,
        raw: e.raw,
      });
      this.eventIds.add(e.id);
      result.inserted++;
    }
    if (this.db.events.length > MAX_EVENTS) {
      const drop = this.db.events.splice(0, Math.floor(MAX_EVENTS * 0.1));
      for (const d of drop) this.eventIds.delete(d.id);
    }
    // Only one request per task per batch: the latest trigger wins.
    result.headlineRequests = [...new Map(result.headlineRequests.map((r) => [r.taskId, r])).values()];
    if (result.inserted > 0) this.scheduleSave();
    return result;
  }

  private agentEditedRecently(projectId: string, e: NormalisedEvent): boolean {
    const t = new Date(e.ts).getTime();
    for (let i = this.db.events.length - 1; i >= 0 && i > this.db.events.length - 400; i--) {
      const row = this.db.events[i]!;
      if (row.projectId !== projectId) continue;
      if (t - new Date(row.ts).getTime() > WATCHER_DEDUPE_MS) break;
      if (row.tool !== "watcher" && row.kind === "edit" && row.paths.some((p) => e.paths.includes(p))) return true;
    }
    return false;
  }

  private upsertSession(projectId: string, e: NormalisedEvent): SessionRow {
    const key = sessionKey(projectId, e.tool, e.sessionId);
    const existing = this.sessionIndex.get(key);
    if (existing) return this.db.sessions[existing]!;
    const row: SessionRow = { id: crypto.randomUUID(), projectId, tool: e.tool, externalId: e.sessionId, startedAt: e.ts };
    this.db.sessions[row.id] = row;
    this.sessionIndex.set(key, row.id);
    return row;
  }

  private upsertTask(projectId: string, session: SessionRow, e: NormalisedEvent): TaskRow {
    const key = taskKey(session.id, e.taskKey!);
    const existing = this.taskIndex.get(key);
    if (existing) return this.db.tasks[existing]!;
    const row: TaskRow = { id: crypto.randomUUID(), projectId, sessionId: session.id, tool: e.tool, externalKey: e.taskKey, startedAt: e.ts, state: newTaskState() };
    this.db.tasks[row.id] = row;
    this.taskIndex.set(key, row.id);
    return row;
  }

  private endedCandidates(projectId: string, before: string, areas: readonly Area[]): EndedTask[] {
    const since = new Date(before).getTime() - CONTINUITY_WINDOW_MS;
    return Object.values(this.db.tasks)
      .filter((t) => t.projectId === projectId && t.state.endedAt && new Date(t.state.endedAt).getTime() >= since)
      .map((t) => ({ id: t.id, tool: t.tool, prompt: t.state.prompt, areaIds: areaIdsOf(t.state, areas), endedAt: t.state.endedAt!, endReason: t.state.endReason, continuedBy: t.state.continuedBy }));
  }

  /**
   * Link to an ended task in another tool. Checked on each of the first few events: the prompt
   * alone may be enough, and a later read in the same area makes the stated reason stronger.
   */
  private maybeLinkContinuation(projectId: string, task: TaskRow, areas: readonly Area[]) {
    const s = task.state;
    if (s.continuityChecks >= CONTINUITY_MAX_CHECKS || task.tool === "watcher") return;
    s.continuityChecks++;
    const candidates = this.endedCandidates(projectId, task.startedAt, areas)
      .filter((c) => c.id !== task.id)
      .map((c) => (c.continuedBy === task.id ? { ...c, continuedBy: undefined } : c));
    if (candidates.length === 0) return;
    const link = continuationFor(s, task.tool, task.startedAt, candidates, areas);
    if (!link || (s.continuedFrom && link.taskId !== s.continuedFrom)) return;
    s.continuedFrom = link.taskId;
    s.continuedReason = link.reason;
    const from = this.db.tasks[link.taskId];
    if (from) from.state.continuedBy = task.id;
  }

  // -- reads --------------------------------------------------------------------------------

  private ctx(projectId: string) {
    return translateContext(this.db.areaMaps[projectId], this.db.fileDescriptions[projectId] ?? {});
  }

  private taskView(t: TaskRow, sessionEnded: boolean, nowIso: string, ctx: ReturnType<MemoryStore["ctx"]>) {
    const from = t.state.continuedFrom ? this.db.tasks[t.state.continuedFrom] : undefined;
    const by = t.state.continuedBy ? this.db.tasks[t.state.continuedBy] : undefined;
    return viewTask(
      {
        id: t.id,
        sessionId: t.sessionId,
        tool: t.tool,
        externalKey: t.externalKey,
        startedAt: t.startedAt,
        state: t.state,
        sessionEnded,
        nowIso,
        continuedFrom: from ? { taskId: from.id, tool: from.tool, headline: from.state.headline, prompt: from.state.prompt } : undefined,
        continuedByTool: by?.tool,
        report: this.db.reports[t.id] ?? null,
      },
      ctx,
    );
  }

  private writeReport(record: Omit<ReportRecord, "createdAt" | "updatedAt"> & { resolvedAt?: string }, now: string, fresh: boolean) {
    const existing = this.db.reports[record.taskId];
    this.db.reports[record.taskId] = {
      ...record,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      // A fresh ending is a new card: an old "cleared" mark must not hide a new flag.
      resolvedAt: fresh ? record.resolvedAt : (record.resolvedAt ?? existing?.resolvedAt),
    };
    this.scheduleSave();
  }

  async getRoom(projectId: string): Promise<RoomState | null> {
    const project = this.db.projects[projectId];
    if (!project) return null;
    const ctx = this.ctx(projectId);
    const nowIso = this.now();
    const sessions = Object.values(this.db.sessions)
      .filter((s) => s.projectId === projectId)
      .sort((a, b) => (b.lastEventAt ?? b.startedAt).localeCompare(a.lastEventAt ?? a.startedAt))
      .slice(0, ROOM_SESSIONS)
      .map((s): SessionView => {
        const task = Object.values(this.db.tasks)
          .filter((t) => t.sessionId === s.id)
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
        const recentEvents = this.db.events
          .filter((e) => e.sessionId === s.id)
          .slice(-RECENT_EVENTS)
          .reverse()
          .map((e) => viewEvent(stripRow(e), ctx));
        return {
          id: s.id,
          tool: s.tool,
          depth: DEPTH[s.tool],
          externalId: s.externalId,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          lastEventAt: s.lastEventAt,
          task: task ? this.taskView(task, Boolean(s.endedAt), nowIso, ctx) : null,
          recentEvents,
        };
      });
    const map = this.db.areaMaps[projectId];
    const lastCheckedAt = this.db.lastChecked[projectId];
    const recent = await this.listTasks(projectId, { since: new Date(new Date(nowIso).getTime() - 30 * 24 * 3600 * 1000).toISOString() });
    const open = recent.map(inboxItemFrom).filter((i) => i && !i.resolvedAt);
    const since = lastCheckedAt ?? new Date(new Date(nowIso).getTime() - 24 * 3600 * 1000).toISOString();
    const doneSince = recent.filter((t) => t.tool !== "watcher" && t.endedAt && t.endedAt >= since);
    const weekAgo = new Date(new Date(nowIso).getTime() - WEEK_MS).toISOString();
    const week = recent.filter((t) => (t.lastEventAt ?? t.startedAt) >= weekAgo || (t.endedAt ?? "") >= weekAgo);
    const areas = map?.areas ?? [];
    return {
      project,
      sessions,
      areas,
      areaMapSource: map?.source,
      generatedAt: nowIso,
      inboxOpen: open.length,
      lastCheckedAt,
      sinceChecked: { done: doneSince.length, needsYou: doneSince.filter((t) => t.report && t.report.needsYou !== "nothing" && !t.report.resolvedAt).length },
      story: storyFrom(week),
      progress: areaProgress(week, areas, weekAgo),
      activity: activityFrom(
        this.db.events.filter((e) => e.projectId === projectId && e.ts >= weekAgo),
        weekAgo,
      ),
    };
  }

  async getTask(taskId: string): Promise<TaskDetail | null> {
    const t = this.db.tasks[taskId];
    if (!t) return null;
    const ctx = this.ctx(t.projectId);
    const session = this.db.sessions[t.sessionId];
    const events = this.db.events
      .filter((e) => e.taskId === t.id)
      .slice(-DETAIL_EVENTS)
      .reverse()
      .map((e) => viewEvent(stripRow(e), ctx));
    return { ...this.taskView(t, Boolean(session?.endedAt), this.now(), ctx), events, changes: changeLines(events, ctx), projectId: t.projectId, facts: reportFactsFor(t.state, t.tool, ctx.areas) };
  }

  async setHeadline(taskId: string, headline: string, source: "ai" | "template") {
    const t = this.db.tasks[taskId];
    if (!t) return;
    t.state.headline = headline;
    t.state.headlineSource = source;
    this.scheduleSave();
  }

  async getStats(projectId: string): Promise<Stats> {
    const events = this.db.events.filter((e) => e.projectId === projectId);
    const { avg, p95 } = latencyStats(events.slice(-500));
    const calls = this.db.aiCalls.filter((c) => c.projectId === projectId);
    return {
      sessions: Object.values(this.db.sessions).filter((s) => s.projectId === projectId).length,
      tasks: Object.values(this.db.tasks).filter((t) => t.projectId === projectId).length,
      events: events.length,
      avgLatencyMs: avg,
      p95LatencyMs: p95,
      aiCalls: calls.length,
      aiCostGbp: Math.round(calls.reduce((a, c) => a + c.costGbp, 0) * 1e6) / 1e6,
    };
  }

  // -- area map, tree, descriptions, ai calls -----------------------------------------------

  async getAreaMap(projectId: string) {
    return this.db.areaMaps[projectId] ?? null;
  }
  async saveAreaMap(projectId: string, map: AreaMap) {
    this.db.areaMaps[projectId] = map;
    this.scheduleSave();
  }
  async getTree(projectId: string) {
    return this.db.trees[projectId] ?? null;
  }
  async saveTree(projectId: string, tree: ProjectTree) {
    this.db.trees[projectId] = tree;
    this.scheduleSave();
  }
  async getFileDescriptions(projectId: string) {
    return { ...(this.db.fileDescriptions[projectId] ?? {}) };
  }
  async saveFileDescriptions(projectId: string, descriptions: Record<string, string>) {
    this.db.fileDescriptions[projectId] = { ...(this.db.fileDescriptions[projectId] ?? {}), ...descriptions };
    this.scheduleSave();
  }
  async logAiCall(call: AiCallLog) {
    this.db.aiCalls.push({ ...call, id: crypto.randomUUID(), createdAt: this.now() });
    if (this.db.aiCalls.length > 5000) this.db.aiCalls.splice(0, 500);
    this.scheduleSave();
  }

  // -- Phase 3: reports, digest, inbox, feedback --------------------------------------------

  async listTasks(projectId: string, opts: { since: string; limit?: number }): Promise<TaskView[]> {
    const ctx = this.ctx(projectId);
    const nowIso = this.now();
    return Object.values(this.db.tasks)
      .filter((t) => t.projectId === projectId && ((t.state.lastEventAt ?? t.startedAt) >= opts.since || (t.state.endedAt ?? "") >= opts.since))
      .sort((a, b) => (b.state.lastEventAt ?? b.startedAt).localeCompare(a.state.lastEventAt ?? a.startedAt))
      .slice(0, opts.limit ?? 200)
      .map((t) => this.taskView(t, Boolean(this.db.sessions[t.sessionId]?.endedAt), nowIso, ctx));
  }

  async getReport(taskId: string) {
    return this.db.reports[taskId] ?? null;
  }

  async saveReport(record: Omit<ReportRecord, "createdAt" | "updatedAt"> & { resolvedAt?: string }) {
    if (!this.db.tasks[record.taskId]) return;
    this.writeReport(record, this.now(), false);
  }

  async setReportResolved(taskId: string, resolved: boolean) {
    const r = this.db.reports[taskId];
    if (!r) return;
    r.resolvedAt = resolved ? this.now() : undefined;
    r.updatedAt = this.now();
    this.scheduleSave();
  }

  async getLastChecked(projectId: string) {
    return this.db.lastChecked[projectId];
  }

  async markChecked(projectId: string, at: string) {
    this.db.lastChecked[projectId] = at;
    this.scheduleSave();
  }

  async getDigestCache(projectId: string, kind: DigestWindowKind) {
    return [...this.db.digests].reverse().find((d) => d.projectId === projectId && d.kind === kind) ?? null;
  }

  async saveDigestCache(cache: DigestCache) {
    this.db.digests = this.db.digests.filter((d) => !(d.projectId === cache.projectId && d.kind === cache.kind));
    this.db.digests.push(cache);
    if (this.db.digests.length > 200) this.db.digests.splice(0, 50);
    this.scheduleSave();
  }

  async addFeedback(input: { eventId: string; projectId?: string; note?: string }): Promise<FeedbackRecord | null> {
    const row = this.db.events.find((e) => e.id === input.eventId);
    if (!row || (input.projectId && row.projectId !== input.projectId)) return null;
    const plain = viewEvent(stripRow(row), this.ctx(row.projectId)).plain;
    const record: FeedbackRecord = { id: crypto.randomUUID(), eventId: row.id, projectId: row.projectId, taskId: row.taskId, plain, summary: row.summary, kind: row.kind, note: input.note?.slice(0, 500), createdAt: this.now() };
    this.db.feedback.push(record);
    if (this.db.feedback.length > 2000) this.db.feedback.splice(0, 200);
    this.scheduleSave();
    return record;
  }

  async listFeedback(projectId: string): Promise<FeedbackView[]> {
    const ctx = this.ctx(projectId);
    return this.db.feedback
      .filter((f) => f.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((f) => {
        const row = this.db.events.find((e) => e.id === f.eventId);
        const event = row ? viewEvent(stripRow(row), ctx) : undefined;
        return { ...f, event, plainNow: event?.plain };
      });
  }

  // -- Phase 4: people, plans, onboarding, testers ---------------------------------------------

  async getProfile(userId: string) {
    return this.db.profiles[userId] ?? null;
  }

  async upsertProfile(profile: Partial<Profile> & { userId: string }): Promise<Profile> {
    const existing = this.db.profiles[profile.userId];
    const next: Profile = { plan: "free", createdAt: this.now(), ...existing, ...profile };
    this.db.profiles[profile.userId] = next;
    this.scheduleSave();
    return next;
  }

  async findProfileByCustomer(stripeCustomerId: string) {
    return Object.values(this.db.profiles).find((p) => p.stripeCustomerId === stripeCustomerId) ?? null;
  }

  async listProfiles() {
    return Object.values(this.db.profiles).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createLinkCode(ownerId: string, now = this.now()): Promise<LinkCode> {
    let code = newLinkCode();
    while (this.db.linkCodes[code]) code = newLinkCode();
    const row: LinkCode = { code, ownerId, createdAt: now, expiresAt: new Date(new Date(now).getTime() + LINK_CODE_TTL_MS).toISOString() };
    this.db.linkCodes[code] = row;
    // Keep the table small: drop codes older than a day.
    const cutoff = new Date(new Date(now).getTime() - 24 * 3600 * 1000).toISOString();
    for (const [k, v] of Object.entries(this.db.linkCodes)) if (v.createdAt < cutoff) delete this.db.linkCodes[k];
    this.scheduleSave();
    return row;
  }

  async consumeLinkCode(code: string, now = this.now()): Promise<LinkCode | null> {
    const row = this.db.linkCodes[normaliseCode(code)];
    if (!row || row.usedAt || row.expiresAt < now) return null;
    row.usedAt = now;
    this.scheduleSave();
    return row;
  }

  async getLinkCode(code: string) {
    return this.db.linkCodes[normaliseCode(code)] ?? null;
  }

  /** Called by createProject's caller once the project exists, so the connect page can find it. */
  async attachLinkCode(code: string, projectId: string) {
    const row = this.db.linkCodes[normaliseCode(code)];
    if (row) row.projectId = projectId;
    this.scheduleSave();
  }

  async addInvite(email: string, note?: string): Promise<Invite> {
    const key = email.trim().toLowerCase();
    const row: Invite = this.db.invites[key] ?? { email: key, note, createdAt: this.now() };
    if (note) row.note = note;
    this.db.invites[key] = row;
    this.scheduleSave();
    return row;
  }

  async removeInvite(email: string) {
    delete this.db.invites[email.trim().toLowerCase()];
    this.scheduleSave();
  }

  async isInvited(email: string) {
    return Boolean(this.db.invites[email.trim().toLowerCase()]);
  }

  async markInviteAccepted(email: string, at: string) {
    const row = this.db.invites[email.trim().toLowerCase()];
    if (row && !row.acceptedAt) {
      row.acceptedAt = at;
      this.scheduleSave();
    }
  }

  async listInvites() {
    return Object.values(this.db.invites).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async addTesterNote(note: Omit<TesterNote, "id" | "createdAt">): Promise<TesterNote> {
    const row: TesterNote = { ...note, id: crypto.randomUUID(), createdAt: this.now() };
    this.db.testerNotes.push(row);
    if (this.db.testerNotes.length > 2000) this.db.testerNotes.splice(0, 200);
    this.scheduleSave();
    return row;
  }

  async listTesterNotes(limit = 200) {
    return [...this.db.testerNotes].reverse().slice(0, limit);
  }

  async recordMetric(event: MetricEvent, visitorId: string, at = this.now()) {
    this.db.metrics.push({ event, visitorId, at });
    if (this.db.metrics.length > 50000) this.db.metrics.splice(0, 5000);
    this.scheduleSave();
  }

  async metricCounts(days: number, now = this.now()): Promise<MetricCounts> {
    const since = new Date(new Date(now).getTime() - days * 24 * 3600 * 1000).toISOString();
    const byEvent: MetricCounts["byEvent"] = { landing_view: 0, signup_started: 0, signup_completed: 0, project_connected: 0, first_session: 0, upgrade_clicked: 0 };
    const seen = new Set<string>();
    for (const m of this.db.metrics) {
      if (m.at < since) continue;
      const key = `${m.event}|${m.visitorId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      byEvent[m.event]++;
    }
    return { byEvent, days, signupRatePct: byEvent.landing_view > 0 ? Math.round((byEvent.signup_completed / byEvent.landing_view) * 1000) / 10 : null };
  }

  async ownerActivity(ownerId: string) {
    const projects = await this.listProjects(ownerId);
    const ids = new Set(projects.map((p) => p.id));
    const sessions = Object.values(this.db.sessions).filter((s) => ids.has(s.projectId));
    const tasks = Object.values(this.db.tasks).filter((t) => ids.has(t.projectId));
    const lastEventAt = sessions.map((s) => s.lastEventAt ?? s.startedAt).sort().pop();
    return { projects: projects.length, sessions: sessions.length, tasks: tasks.length, lastEventAt };
  }
}

const sessionKey = (projectId: string, tool: string, externalId: string) => `${projectId}|${tool}|${externalId}`;
const taskKey = (sessionId: string, externalKey: string) => `${sessionId}|${externalKey}`;

function stripRow(e: EventRow): Omit<EventView, "plain" | "areaId" | "areaName"> {
  const { projectId: _p, sessionId: _s, taskId: _t, ...view } = e;
  return view;
}
