/**
 * Local-mode store: everything in memory, persisted to one JSON file so the Room survives restarts.
 * Used when no Supabase credentials are configured. Same behaviour as the Supabase store.
 */
import type { AgentTool, NormalisedEvent, Stage } from "@glasshouse/schema";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { applyEvent, hashToken, latencyStats, newToken } from "./derive";
import type { EventView, IngestResult, ProjectSummary, RoomState, SessionView, Stats, Store, TaskView } from "./types";

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
  externalKey?: string;
  prompt?: string;
  headline?: string;
  location?: string;
  stage: Stage;
  endReason?: string;
  startedAt: string;
  endedAt?: string;
  lastEventAt?: string;
  eventCount: number;
}
interface EventRow extends EventView {
  projectId: string;
  sessionId: string;
  taskId?: string;
}
interface Db {
  projects: Record<string, ProjectRow>;
  tokens: Record<string, string>; // token hash -> project id
  sessions: Record<string, SessionRow>;
  tasks: Record<string, TaskRow>;
  events: EventRow[];
}

const MAX_EVENTS = 20000;
const ROOM_SESSIONS = 12;
const RECENT_EVENTS = 40;

export interface MemoryStoreOptions {
  /** File to persist to. Omit for a purely in-memory store (tests). */
  persistPath?: string;
}

export class MemoryStore implements Store {
  readonly mode = "local" as const;
  private db: Db = { projects: {}, tokens: {}, sessions: {}, tasks: {}, events: [] };
  private sessionIndex = new Map<string, string>();
  private taskIndex = new Map<string, string>();
  private eventIds = new Set<string>();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(private readonly opts: MemoryStoreOptions = {}) {
    if (opts.persistPath) this.load(opts.persistPath);
  }

  private load(path: string) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as Db;
      this.db = Object.assign({ projects: {}, tokens: {}, sessions: {}, tasks: {}, events: [] }, parsed);
    } catch {
      /* first run */
    }
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

  async createProject(input: { name: string; rootHint?: string }) {
    const project: ProjectRow = { id: crypto.randomUUID(), name: input.name, rootHint: input.rootHint, createdAt: new Date().toISOString() };
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

  async listProjects() {
    return Object.values(this.db.projects).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getProject(id: string) {
    return this.db.projects[id] ?? null;
  }

  async ingest(projectId: string, events: NormalisedEvent[]): Promise<IngestResult> {
    let inserted = 0;
    let duplicates = 0;
    const receivedAt = new Date().toISOString();
    const sorted = [...events].sort((a, b) => a.ts.localeCompare(b.ts));
    for (const e of sorted) {
      if (this.eventIds.has(e.id)) {
        duplicates++;
        continue;
      }
      const session = this.upsertSession(projectId, e);
      const task = e.taskKey ? this.upsertTask(projectId, session, e) : undefined;
      if (task) {
        Object.assign(task, applyEvent(task, e));
        task.eventCount++;
      }
      session.lastEventAt = e.ts;
      if (e.kind === "session_end") session.endedAt = e.ts;
      this.db.events.push({
        id: e.id,
        projectId,
        sessionId: session.id,
        taskId: task?.id,
        kind: e.kind,
        ts: e.ts,
        receivedAt,
        summary: e.summary,
        paths: e.paths,
        command: e.command,
        sourceEvent: e.sourceEvent,
        sourceTool: e.sourceTool,
        agentId: e.agentId,
        success: e.success,
        raw: e.raw,
      });
      this.eventIds.add(e.id);
      inserted++;
    }
    if (this.db.events.length > MAX_EVENTS) {
      const drop = this.db.events.splice(0, Math.floor(MAX_EVENTS * 0.1));
      for (const d of drop) this.eventIds.delete(d.id);
    }
    if (inserted > 0) this.scheduleSave();
    return { inserted, duplicates };
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
    const row: TaskRow = { id: crypto.randomUUID(), projectId, sessionId: session.id, externalKey: e.taskKey, stage: "investigating", startedAt: e.ts, eventCount: 0 };
    this.db.tasks[row.id] = row;
    this.taskIndex.set(key, row.id);
    return row;
  }

  async getRoom(projectId: string): Promise<RoomState | null> {
    const project = this.db.projects[projectId];
    if (!project) return null;
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
          .map(stripRow);
        return {
          id: s.id,
          tool: s.tool,
          externalId: s.externalId,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          lastEventAt: s.lastEventAt,
          task: task ? toTaskView(task) : null,
          recentEvents,
        };
      });
    return { project, sessions, generatedAt: new Date().toISOString() };
  }

  async getStats(projectId: string): Promise<Stats> {
    const events = this.db.events.filter((e) => e.projectId === projectId);
    const { avg, p95 } = latencyStats(events.slice(-500));
    return {
      sessions: Object.values(this.db.sessions).filter((s) => s.projectId === projectId).length,
      tasks: Object.values(this.db.tasks).filter((t) => t.projectId === projectId).length,
      events: events.length,
      avgLatencyMs: avg,
      p95LatencyMs: p95,
    };
  }
}

const sessionKey = (projectId: string, tool: string, externalId: string) => `${projectId}|${tool}|${externalId}`;
const taskKey = (sessionId: string, externalKey: string) => `${sessionId}|${externalKey}`;

function toTaskView(t: TaskRow): TaskView {
  return {
    id: t.id,
    externalKey: t.externalKey,
    prompt: t.prompt,
    headline: t.headline,
    location: t.location,
    stage: t.stage,
    endReason: t.endReason,
    startedAt: t.startedAt,
    endedAt: t.endedAt,
    lastEventAt: t.lastEventAt,
    eventCount: t.eventCount,
  };
}

function stripRow(e: EventRow): EventView {
  const { projectId: _p, sessionId: _s, taskId: _t, ...view } = e;
  return view;
}
