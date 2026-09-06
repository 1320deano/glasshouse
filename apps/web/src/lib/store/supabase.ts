/**
 * Supabase store. Same behaviour as MemoryStore against the tables in supabase/migrations.
 * Uses the service-role key: this code only ever runs on the server.
 *
 * NOT YET VERIFIED against a live project (none linked at time of writing). It compiles and
 * mirrors the memory store call for call; run the fixture replay against the real database
 * as soon as the hosted project exists (docs/supabase-setup.md).
 */
import type { AgentTool, Area, AreaMap, NormalisedEvent, ProjectTree } from "@glasshouse/schema";
import { reportCard, type DigestWindowKind, type EndedTask } from "@glasshouse/translate";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  CONTINUITY_MAX_CHECKS,
  DEPTH,
  WATCHER_DEDUPE_MS,
  applyEvent,
  areaIdsOf,
  changeLines,
  continuationFor,
  fullState,
  hashToken,
  inboxItemFrom,
  latencyStats,
  newToken,
  reportFactsFor,
  riskFor,
  templateReportFor,
  translateContext,
  viewEvent,
  viewTask,
  type TaskState,
} from "./derive";
import { WEEK_MS, activityFrom, areaProgress } from "../progress";
import { storyFrom } from "../story";
import { newLinkCode, normaliseCode } from "./memory";
import type { AiCallLog, DigestCache, EventView, FeedbackRecord, FeedbackView, IngestResult, Invite, LinkCode, MetricCounts, MetricEvent, Profile, ProjectSummary, ReportRecord, RoomState, SessionView, Stats, Store, TaskDetail, TaskView, TesterNote } from "./types";

interface TaskRow {
  id: string;
  project_id: string;
  session_id: string;
  tool: AgentTool | null;
  external_key: string | null;
  started_at: string;
  state: Partial<TaskState> | null;
}

interface EventRow {
  id: string;
  kind: EventView["kind"];
  tool: AgentTool | null;
  ts: string;
  received_at: string;
  summary: string;
  paths: string[] | null;
  command: string | null;
  text: string | null;
  tests: EventView["tests"] | null;
  source_event: string;
  source_tool: string | null;
  agent_id: string | null;
  success: boolean | null;
  raw: unknown;
  task_id?: string | null;
}

interface AreaRow {
  key: string;
  name: string;
  description: string | null;
  path_prefixes: string[];
  user_corrected: boolean;
  source: Area["source"];
  sensitive: boolean;
}

interface ReportRow {
  task_id: string;
  project_id: string;
  headline: string;
  before_after: string | null;
  touched_reasons: Record<string, string> | null;
  risk_reason: string | null;
  needs_you: ReportRecord["needsYou"];
  needs_you_detail: string | null;
  source: ReportRecord["source"] | null;
  event_count: number | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string | null;
}

const PROJECT_COLUMNS = "id,name,repo_root_hint,created_at,owner_id";
const TASK_COLUMNS = "id,project_id,session_id,tool,external_key,started_at,state";
const EVENT_COLUMNS = "id,kind,tool,ts,received_at,summary,paths,command,text,tests,source_event,source_tool,agent_id,success,raw,task_id";
const REPORT_COLUMNS = "task_id,project_id,headline,before_after,touched_reasons,risk_reason,needs_you,needs_you_detail,source,event_count,resolved_at,created_at,updated_at";
const CONTINUITY_WINDOW_MS = 6 * 60 * 60 * 1000;

export class SupabaseStore implements Store {
  readonly mode = "supabase" as const;
  private readonly db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async createProject(input: { name: string; rootHint?: string; ownerId?: string | null }) {
    const { data, error } = await this.db
      .from("projects")
      .insert({ name: input.name, repo_root_hint: input.rootHint ?? null, owner_id: input.ownerId ?? null })
      .select(PROJECT_COLUMNS)
      .single();
    if (error) throw error;
    const token = newToken();
    const { error: tokenError } = await this.db.from("project_tokens").insert({ project_id: data.id, token_hash: hashToken(token), label: input.rootHint ?? null });
    if (tokenError) throw tokenError;
    return { project: toProject(data), token };
  }

  async resolveToken(token: string) {
    const { data } = await this.db
      .from("project_tokens")
      .select(`project_id, projects(${PROJECT_COLUMNS})`)
      .eq("token_hash", hashToken(token))
      .maybeSingle();
    if (!data) return null;
    void this.db.from("project_tokens").update({ last_seen_at: new Date().toISOString() }).eq("token_hash", hashToken(token));
    const project = Array.isArray(data.projects) ? data.projects[0] : data.projects;
    return project ? toProject(project as ProjectRowLike) : null;
  }

  async listProjects(ownerId?: string) {
    let q = this.db.from("projects").select(PROJECT_COLUMNS).order("created_at", { ascending: false });
    if (ownerId !== undefined) q = q.eq("owner_id", ownerId);
    const { data, error } = await q;
    if (error) throw error;
    return data.map(toProject);
  }

  async getProject(id: string) {
    const { data } = await this.db.from("projects").select(PROJECT_COLUMNS).eq("id", id).maybeSingle();
    return data ? toProject(data) : null;
  }

  // -- ingest -------------------------------------------------------------------------------

  async ingest(projectId: string, events: NormalisedEvent[]): Promise<IngestResult> {
    const result: IngestResult = { inserted: 0, duplicates: 0, headlineRequests: [], undescribedPaths: [], finishedTasks: [] };
    const [map, described] = await Promise.all([this.getAreaMap(projectId), this.getFileDescriptions(projectId)]);
    const ctx = translateContext(map, described);
    const sorted = [...events].sort((a, b) => a.ts.localeCompare(b.ts));
    const sessionIds = new Map<string, string>();
    const tasks = new Map<string, TaskRow & { dirty: boolean }>();
    const rows: Record<string, unknown>[] = [];
    const continuedBy = new Map<string, string>();

    for (const e of sorted) {
      if (e.tool === "watcher" && e.kind === "edit" && (await this.agentEditedRecently(projectId, e))) {
        result.duplicates++;
        continue;
      }
      const sKey = `${e.tool}|${e.sessionId}`;
      let sessionId = sessionIds.get(sKey);
      if (!sessionId) {
        const { data, error } = await this.db
          .from("agent_sessions")
          .upsert({ project_id: projectId, tool: e.tool, external_id: e.sessionId, started_at: e.ts }, { onConflict: "project_id,tool,external_id", ignoreDuplicates: false })
          .select("id")
          .single();
        if (error) throw error;
        sessionId = data.id as string;
        sessionIds.set(sKey, sessionId);
      }
      let task: (TaskRow & { dirty: boolean }) | undefined;
      if (e.taskKey) {
        const tKey = `${sessionId}|${e.taskKey}`;
        task = tasks.get(tKey);
        if (!task) {
          const { data, error } = await this.db
            .from("tasks")
            .upsert({ project_id: projectId, session_id: sessionId, external_key: e.taskKey, tool: e.tool, started_at: e.ts }, { onConflict: "session_id,external_key", ignoreDuplicates: false })
            .select(TASK_COLUMNS)
            .single();
          if (error) throw error;
          task = { ...(data as TaskRow), dirty: false };
          tasks.set(tKey, task);
        }
        const { state, trigger, finished } = applyEvent(fullState(task.state), e, ctx);
        task.state = state;
        task.dirty = true;
        if (trigger) result.headlineRequests.push({ taskId: task.id, trigger });
        const link = await this.maybeLinkContinuation(projectId, task, ctx.areas);
        if (link) continuedBy.set(link, task.id);
        if (finished) {
          await this.writeReport({ ...templateReportFor(state, task.tool ?? e.tool, ctx), taskId: task.id, projectId, eventCount: state.eventCount }, true, state);
          if (!result.finishedTasks.includes(task.id)) result.finishedTasks.push(task.id);
        }
      }
      for (const p of e.paths) if ((e.kind === "edit" || e.kind === "read") && !described[p] && !result.undescribedPaths.includes(p)) result.undescribedPaths.push(p);
      rows.push({
        id: e.id,
        project_id: projectId,
        session_id: sessionId,
        task_id: task?.id ?? null,
        agent_id: e.agentId ?? null,
        tool: e.tool,
        kind: e.kind,
        ts: e.ts,
        paths: e.paths,
        command: e.command ?? null,
        text: e.text ?? (e.kind === "prompt" ? e.prompt : undefined) ?? null,
        tests: e.tests ?? null,
        summary: e.summary,
        success: e.success ?? null,
        source_event: e.sourceEvent,
        source_tool: e.sourceTool ?? null,
        raw: e.raw ?? null,
      });
      if (e.kind === "session_end") await this.db.from("agent_sessions").update({ ended_at: e.ts }).eq("id", sessionId);
    }

    if (rows.length > 0) {
      const { data: insertedRows, error } = await this.db.from("events").upsert(rows, { onConflict: "id", ignoreDuplicates: true }).select("id");
      if (error) throw error;
      result.inserted = insertedRows?.length ?? 0;
      result.duplicates += rows.length - result.inserted;
    }

    for (const t of tasks.values()) {
      if (!t.dirty) continue;
      await this.writeTaskState(t.id, fullState(t.state), ctx.areas);
    }
    for (const [fromId, byId] of continuedBy) {
      const { data } = await this.db.from("tasks").select("state").eq("id", fromId).maybeSingle();
      if (data) await this.db.from("tasks").update({ state: { ...fullState(data.state as Partial<TaskState>), continuedBy: byId } }).eq("id", fromId);
    }
    result.headlineRequests = [...new Map(result.headlineRequests.map((r) => [r.taskId, r])).values()];
    return result;
  }

  private async writeTaskState(taskId: string, state: TaskState, areas: readonly Area[]) {
    const risk = riskFor(state, areas);
    const { error } = await this.db
      .from("tasks")
      .update({
        state,
        prompt: state.prompt ?? null,
        headline: state.headline ?? null,
        headline_source: state.headlineSource,
        current_location: state.lastPath ?? null,
        stage: state.stage,
        risk: risk.level,
        risk_reasons: risk.reasons,
        end_reason: state.endReason ?? null,
        ended_at: state.endedAt ?? null,
        last_event_at: state.lastEventAt ?? null,
        continued_from: state.continuedFrom ?? null,
        continued_reason: state.continuedReason ?? null,
      })
      .eq("id", taskId);
    if (error) throw error;
  }

  private async agentEditedRecently(projectId: string, e: NormalisedEvent): Promise<boolean> {
    if (e.paths.length === 0) return false;
    const since = new Date(new Date(e.ts).getTime() - WATCHER_DEDUPE_MS).toISOString();
    const { data } = await this.db
      .from("events")
      .select("id")
      .eq("project_id", projectId)
      .eq("kind", "edit")
      .neq("tool", "watcher")
      .gte("ts", since)
      .overlaps("paths", e.paths)
      .limit(1);
    return (data?.length ?? 0) > 0;
  }

  private async maybeLinkContinuation(projectId: string, task: TaskRow & { state: Partial<TaskState> | null }, areas: readonly Area[]): Promise<string | null> {
    const s = fullState(task.state);
    if (s.continuityChecks >= CONTINUITY_MAX_CHECKS || task.tool === "watcher") return null;
    s.continuityChecks++;
    task.state = s;
    const since = new Date(new Date(task.started_at).getTime() - CONTINUITY_WINDOW_MS).toISOString();
    const { data } = await this.db.from("tasks").select(TASK_COLUMNS).eq("project_id", projectId).gte("ended_at", since).neq("id", task.id).limit(50);
    const candidates: EndedTask[] = (data ?? [])
      .map((r) => r as TaskRow)
      .filter((r) => fullState(r.state).endedAt)
      .map((r) => {
        const st = fullState(r.state);
        return { id: r.id, tool: r.tool ?? "claude-code", prompt: st.prompt, areaIds: areaIdsOf(st, areas), endedAt: st.endedAt!, endReason: st.endReason, continuedBy: st.continuedBy === task.id ? undefined : st.continuedBy };
      });
    if (candidates.length === 0) return null;
    const link = continuationFor(s, task.tool ?? "claude-code", task.started_at, candidates, areas);
    if (!link || (s.continuedFrom && link.taskId !== s.continuedFrom)) return null;
    s.continuedFrom = link.taskId;
    s.continuedReason = link.reason;
    task.state = s;
    return link.taskId;
  }

  // -- reads --------------------------------------------------------------------------------

  private async viewFor(t: TaskRow, sessionEnded: boolean, nowIso: string, areas: readonly Area[], described: Record<string, string>) {
    const state = fullState(t.state);
    const ctx = translateContext({ areas: [...areas] }, described);
    const from = state.continuedFrom ? await this.taskRow(state.continuedFrom) : undefined;
    const by = state.continuedBy ? await this.taskRow(state.continuedBy) : undefined;
    const report = state.endedAt ? await this.getReport(t.id) : null;
    return viewTask(
      {
        id: t.id,
        sessionId: t.session_id,
        tool: t.tool ?? "claude-code",
        externalKey: t.external_key ?? undefined,
        startedAt: t.started_at,
        state,
        sessionEnded,
        nowIso,
        continuedFrom: from ? { taskId: from.id, tool: from.tool ?? "claude-code", headline: fullState(from.state).headline, prompt: fullState(from.state).prompt } : undefined,
        continuedByTool: by?.tool ?? undefined,
        report,
      },
      ctx,
    );
  }

  private async taskRow(id: string): Promise<TaskRow | undefined> {
    const { data } = await this.db.from("tasks").select(TASK_COLUMNS).eq("id", id).maybeSingle();
    return (data as TaskRow | null) ?? undefined;
  }

  async getRoom(projectId: string): Promise<RoomState | null> {
    const project = await this.getProject(projectId);
    if (!project) return null;
    const nowIso = new Date().toISOString();
    const [map, described] = await Promise.all([this.getAreaMap(projectId), this.getFileDescriptions(projectId)]);
    const ctx = translateContext(map, described);
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: sessions, error } = await this.db
      .from("agent_sessions")
      .select("id,tool,external_id,started_at,ended_at")
      .eq("project_id", projectId)
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(12);
    if (error) throw error;

    const views: SessionView[] = [];
    for (const s of sessions) {
      const { data: task } = await this.db.from("tasks").select(TASK_COLUMNS).eq("session_id", s.id).order("started_at", { ascending: false }).limit(1).maybeSingle();
      const { data: events } = await this.db.from("events").select(EVENT_COLUMNS).eq("session_id", s.id).order("ts", { ascending: false }).limit(60);
      const recentEvents = (events ?? []).map((e) => viewEvent(toEventRow(e as EventRow), ctx));
      views.push({
        id: s.id,
        tool: s.tool,
        depth: DEPTH[s.tool as AgentTool],
        externalId: s.external_id,
        startedAt: s.started_at,
        endedAt: s.ended_at ?? undefined,
        lastEventAt: recentEvents[0]?.ts,
        task: task ? await this.viewFor(task as TaskRow, Boolean(s.ended_at), nowIso, ctx.areas, described) : null,
        recentEvents,
      });
    }
    views.sort((a, b) => (b.lastEventAt ?? b.startedAt).localeCompare(a.lastEventAt ?? a.startedAt));
    const lastCheckedAt = await this.getLastChecked(projectId);
    const recent = await this.listTasks(projectId, { since: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() });
    const open = recent.map(inboxItemFrom).filter((i) => i && !i.resolvedAt);
    const sinceIso = lastCheckedAt ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const doneSince = recent.filter((t) => t.tool !== "watcher" && t.endedAt && t.endedAt >= sinceIso);
    const weekAgo = new Date(Date.now() - WEEK_MS).toISOString();
    const week = recent.filter((t) => (t.lastEventAt ?? t.startedAt) >= weekAgo || (t.endedAt ?? "") >= weekAgo);
    const areas = map?.areas ?? [];
    // Actions per hour over the week. Capped: a very busy project still gets a truthful "at least" picture.
    const { data: weekEvents } = await this.db.from("events").select("ts,tool").eq("project_id", projectId).gte("ts", weekAgo).order("ts", { ascending: false }).limit(8000);
    return {
      project,
      sessions: views,
      areas,
      areaMapSource: map?.source,
      generatedAt: nowIso,
      inboxOpen: open.length,
      lastCheckedAt,
      sinceChecked: { done: doneSince.length, needsYou: doneSince.filter((t) => t.report && t.report.needsYou !== "nothing" && !t.report.resolvedAt).length },
      story: storyFrom(week),
      progress: areaProgress(week, areas, weekAgo),
      activity: activityFrom((weekEvents ?? []).map((e) => ({ ts: e.ts as string, tool: e.tool as AgentTool })), weekAgo),
    };
  }

  async getTask(taskId: string): Promise<TaskDetail | null> {
    const t = await this.taskRow(taskId);
    if (!t) return null;
    const [map, described] = await Promise.all([this.getAreaMap(t.project_id), this.getFileDescriptions(t.project_id)]);
    const ctx = translateContext(map, described);
    const { data: session } = await this.db.from("agent_sessions").select("ended_at").eq("id", t.session_id).maybeSingle();
    const { data: events } = await this.db.from("events").select(EVENT_COLUMNS).eq("task_id", t.id).order("ts", { ascending: false }).limit(500);
    const viewed = (events ?? []).map((e) => viewEvent(toEventRow(e as EventRow), ctx));
    const view = await this.viewFor(t, Boolean(session?.ended_at), new Date().toISOString(), ctx.areas, described);
    return { ...view, events: viewed, changes: changeLines(viewed, ctx), projectId: t.project_id, facts: reportFactsFor(fullState(t.state), t.tool ?? "claude-code", ctx.areas) };
  }

  async setHeadline(taskId: string, headline: string, source: "ai" | "template") {
    const t = await this.taskRow(taskId);
    if (!t) return;
    const state = { ...fullState(t.state), headline, headlineSource: source };
    await this.db.from("tasks").update({ state, headline, headline_source: source }).eq("id", taskId);
  }

  async getStats(projectId: string): Promise<Stats> {
    const [{ count: sessions }, { count: tasks }, { count: events }, { data: recent }, { data: calls }] = await Promise.all([
      this.db.from("agent_sessions").select("id", { count: "exact", head: true }).eq("project_id", projectId),
      this.db.from("tasks").select("id", { count: "exact", head: true }).eq("project_id", projectId),
      this.db.from("events").select("id", { count: "exact", head: true }).eq("project_id", projectId),
      this.db.from("events").select("ts,received_at").eq("project_id", projectId).order("ts", { ascending: false }).limit(500),
      this.db.from("ai_calls").select("cost_gbp").eq("project_id", projectId),
    ]);
    const { avg, p95 } = latencyStats((recent ?? []).map((r) => ({ ts: r.ts, receivedAt: r.received_at })));
    const aiCostGbp = (calls ?? []).reduce((a, c) => a + Number(c.cost_gbp ?? 0), 0);
    return { sessions: sessions ?? 0, tasks: tasks ?? 0, events: events ?? 0, avgLatencyMs: avg, p95LatencyMs: p95, aiCalls: calls?.length ?? 0, aiCostGbp: Math.round(aiCostGbp * 1e6) / 1e6 };
  }

  // -- area map, tree, descriptions, ai calls -----------------------------------------------

  async getAreaMap(projectId: string): Promise<AreaMap | null> {
    const [{ data: rows }, { data: project }] = await Promise.all([
      this.db.from("areas").select("key,name,description,path_prefixes,user_corrected,source,sensitive").eq("project_id", projectId).not("key", "is", null).order("created_at"),
      this.db.from("projects").select("area_map_source,area_map_tree_hash,area_map_generated_at").eq("id", projectId).maybeSingle(),
    ]);
    if (!rows || rows.length === 0) return null;
    return {
      areas: (rows as AreaRow[]).map((r) => ({ id: r.key, name: r.name, description: r.description ?? "", prefixes: r.path_prefixes ?? [], userCorrected: r.user_corrected, source: r.source ?? "heuristic", sensitive: r.sensitive ?? false })),
      source: (project?.area_map_source as AreaMap["source"]) ?? undefined,
      treeHash: project?.area_map_tree_hash ?? undefined,
      generatedAt: project?.area_map_generated_at ?? undefined,
    };
  }

  async saveAreaMap(projectId: string, map: AreaMap) {
    const keys = map.areas.map((a) => a.id);
    const { error } = await this.db.from("areas").upsert(
      map.areas.map((a) => ({ project_id: projectId, key: a.id, name: a.name, description: a.description, path_prefixes: a.prefixes, user_corrected: a.userCorrected, source: a.source, sensitive: a.sensitive, updated_at: new Date().toISOString() })),
      { onConflict: "project_id,key" },
    );
    if (error) throw error;
    if (keys.length > 0) await this.db.from("areas").delete().eq("project_id", projectId).not("key", "in", `(${keys.map((k) => `"${k}"`).join(",")})`);
    await this.db.from("projects").update({ area_map_source: map.source ?? null, area_map_tree_hash: map.treeHash ?? null, area_map_generated_at: map.generatedAt ?? null }).eq("id", projectId);
  }

  async getTree(projectId: string): Promise<ProjectTree | null> {
    const { data } = await this.db.from("projects").select("tree").eq("id", projectId).maybeSingle();
    return (data?.tree as ProjectTree | null) ?? null;
  }

  async saveTree(projectId: string, tree: ProjectTree) {
    await this.db.from("projects").update({ tree, tree_updated_at: new Date().toISOString() }).eq("id", projectId);
  }

  async getFileDescriptions(projectId: string): Promise<Record<string, string>> {
    const { data } = await this.db.from("file_descriptions").select("path,description").eq("project_id", projectId).limit(5000);
    return Object.fromEntries((data ?? []).map((r) => [r.path as string, r.description as string]));
  }

  async saveFileDescriptions(projectId: string, descriptions: Record<string, string>) {
    const rows = Object.entries(descriptions).map(([path, description]) => ({ project_id: projectId, path, description }));
    if (rows.length === 0) return;
    const { error } = await this.db.from("file_descriptions").upsert(rows, { onConflict: "project_id,path" });
    if (error) throw error;
  }

  async logAiCall(call: AiCallLog) {
    await this.db.from("ai_calls").insert({ project_id: call.projectId, task_id: call.taskId ?? null, purpose: call.purpose, model: call.model, input_tokens: call.inputTokens, output_tokens: call.outputTokens, cost_gbp: call.costGbp });
  }

  // -- Phase 3: reports, digest, inbox, feedback --------------------------------------------

  async listTasks(projectId: string, opts: { since: string; limit?: number }): Promise<TaskView[]> {
    const [map, described] = await Promise.all([this.getAreaMap(projectId), this.getFileDescriptions(projectId)]);
    const ctx = translateContext(map, described);
    const { data, error } = await this.db
      .from("tasks")
      .select(`${TASK_COLUMNS},agent_sessions(ended_at)`)
      .eq("project_id", projectId)
      .or(`last_event_at.gte.${opts.since},ended_at.gte.${opts.since},started_at.gte.${opts.since}`)
      .order("last_event_at", { ascending: false, nullsFirst: false })
      .limit(opts.limit ?? 200);
    if (error) throw error;
    const nowIso = new Date().toISOString();
    const views: TaskView[] = [];
    for (const row of data ?? []) {
      const r = row as unknown as TaskRow & { agent_sessions: { ended_at: string | null } | { ended_at: string | null }[] | null };
      const session = Array.isArray(r.agent_sessions) ? r.agent_sessions[0] : r.agent_sessions;
      views.push(await this.viewFor(r, Boolean(session?.ended_at), nowIso, ctx.areas, described));
    }
    return views;
  }

  async getReport(taskId: string): Promise<ReportRecord | null> {
    const { data } = await this.db.from("reports").select(REPORT_COLUMNS).eq("task_id", taskId).maybeSingle();
    return data ? toReport(data as ReportRow) : null;
  }

  async saveReport(record: Omit<ReportRecord, "createdAt" | "updatedAt"> & { resolvedAt?: string }) {
    await this.writeReport(record, false);
  }

  /**
   * Upsert the words of a card. The facts columns (touched, not_touched, evidence, risk) are
   * readable snapshots computed now; the Room recomputes them against the current map when read.
   */
  private async writeReport(record: Omit<ReportRecord, "createdAt" | "updatedAt"> & { resolvedAt?: string }, fresh: boolean, currentState?: TaskState) {
    const task = await this.taskRow(record.taskId);
    if (!task) return;
    const existing = fresh ? null : await this.getReport(record.taskId);
    const [map, described] = await Promise.all([this.getAreaMap(task.project_id), this.getFileDescriptions(task.project_id)]);
    const ctx = translateContext(map, described);
    // During ingest the row is not yet written, so the caller hands over the state it is about to save.
    const card = reportCard(record, reportFactsFor(currentState ?? fullState(task.state), task.tool ?? "claude-code", ctx.areas), ctx);
    const now = new Date().toISOString();
    const { error } = await this.db.from("reports").upsert(
      {
        task_id: record.taskId,
        project_id: task.project_id,
        headline: record.headline,
        before_after: record.beforeAfter ?? null,
        touched: card.touched.map((t) => ({ area: t.name, reason: t.reason, files: t.files })),
        not_touched: card.notTouched,
        evidence: card.evidence,
        risk: card.risk.level,
        risk_reason: card.riskReason ?? null,
        needs_you: record.needsYou,
        needs_you_detail: record.needsYouDetail ?? null,
        touched_reasons: record.touchedReasons,
        source: record.source,
        event_count: record.eventCount,
        resolved_at: fresh ? (record.resolvedAt ?? null) : (record.resolvedAt ?? existing?.resolvedAt ?? null),
        updated_at: now,
      },
      { onConflict: "task_id" },
    );
    if (error) throw error;
  }

  async setReportResolved(taskId: string, resolved: boolean) {
    const now = new Date().toISOString();
    await this.db.from("reports").update({ resolved_at: resolved ? now : null, updated_at: now }).eq("task_id", taskId);
  }

  async getLastChecked(projectId: string) {
    const { data } = await this.db.from("projects").select("last_checked_at").eq("id", projectId).maybeSingle();
    return (data?.last_checked_at as string | null) ?? undefined;
  }

  async markChecked(projectId: string, at: string) {
    await this.db.from("projects").update({ last_checked_at: at }).eq("id", projectId);
  }

  async getDigestCache(projectId: string, kind: DigestWindowKind): Promise<DigestCache | null> {
    const { data } = await this.db.from("digests").select("project_id,kind,window_start,window_end,fingerprint,body,created_at").eq("project_id", projectId).eq("kind", kind).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!data) return null;
    return { projectId: data.project_id, kind: data.kind, windowStart: data.window_start, windowEnd: data.window_end, fingerprint: data.fingerprint, body: data.body as DigestCache["body"], createdAt: data.created_at };
  }

  async saveDigestCache(cache: DigestCache) {
    await this.db.from("digests").delete().eq("project_id", cache.projectId).eq("kind", cache.kind);
    const { error } = await this.db.from("digests").insert({ project_id: cache.projectId, kind: cache.kind, window_start: cache.windowStart, window_end: cache.windowEnd, fingerprint: cache.fingerprint, body: cache.body });
    if (error) throw error;
  }

  async addFeedback(input: { eventId: string; projectId?: string; note?: string }): Promise<FeedbackRecord | null> {
    const { data: e } = await this.db.from("events").select(`${EVENT_COLUMNS},project_id`).eq("id", input.eventId).maybeSingle();
    if (!e) return null;
    const row = e as EventRow & { project_id: string };
    if (input.projectId && row.project_id !== input.projectId) return null;
    const [map, described] = await Promise.all([this.getAreaMap(row.project_id), this.getFileDescriptions(row.project_id)]);
    const plain = viewEvent(toEventRow(row), translateContext(map, described)).plain;
    const { data, error } = await this.db
      .from("translation_feedback")
      .insert({ event_id: row.id, project_id: row.project_id, task_id: row.task_id ?? null, plain, summary: row.summary, kind: row.kind, note: input.note?.slice(0, 500) ?? null })
      .select("id,created_at")
      .single();
    if (error) throw error;
    return { id: data.id, eventId: row.id, projectId: row.project_id, taskId: row.task_id ?? undefined, plain, summary: row.summary, kind: row.kind, note: input.note?.slice(0, 500), createdAt: data.created_at };
  }

  async listFeedback(projectId: string): Promise<FeedbackView[]> {
    const [map, described] = await Promise.all([this.getAreaMap(projectId), this.getFileDescriptions(projectId)]);
    const ctx = translateContext(map, described);
    const { data } = await this.db.from("translation_feedback").select(`id,event_id,task_id,plain,summary,kind,note,created_at,events(${EVENT_COLUMNS})`).eq("project_id", projectId).order("created_at", { ascending: false }).limit(500);
    return (data ?? []).map((f) => {
      const raw = Array.isArray(f.events) ? f.events[0] : f.events;
      const event = raw ? viewEvent(toEventRow(raw as unknown as EventRow), ctx) : undefined;
      return { id: f.id, eventId: f.event_id, projectId, taskId: f.task_id ?? undefined, plain: f.plain ?? "", summary: f.summary ?? "", kind: f.kind ?? "unknown", note: f.note ?? undefined, createdAt: f.created_at, event, plainNow: event?.plain };
    });
  }

  // -- Phase 4: people, plans, onboarding, testers ---------------------------------------------

  async getProfile(userId: string): Promise<Profile | null> {
    const { data } = await this.db.from("profiles").select(PROFILE_COLUMNS).eq("user_id", userId).maybeSingle();
    return data ? toProfile(data as ProfileRow) : null;
  }

  async upsertProfile(profile: Partial<Profile> & { userId: string }): Promise<Profile> {
    const row: Record<string, unknown> = { user_id: profile.userId };
    if (profile.email !== undefined) row.email = profile.email;
    if (profile.plan !== undefined) row.plan = profile.plan;
    if (profile.stripeCustomerId !== undefined) row.stripe_customer_id = profile.stripeCustomerId;
    if (profile.stripeSubscriptionId !== undefined) row.stripe_subscription_id = profile.stripeSubscriptionId;
    if (profile.subscriptionStatus !== undefined) row.subscription_status = profile.subscriptionStatus;
    if (profile.planUpdatedAt !== undefined) row.plan_updated_at = profile.planUpdatedAt;
    if (profile.lastSeenAt !== undefined) row.last_seen_at = profile.lastSeenAt;
    const { data, error } = await this.db.from("profiles").upsert(row, { onConflict: "user_id" }).select(PROFILE_COLUMNS).single();
    if (error) throw error;
    return toProfile(data as ProfileRow);
  }

  async findProfileByCustomer(stripeCustomerId: string): Promise<Profile | null> {
    const { data } = await this.db.from("profiles").select(PROFILE_COLUMNS).eq("stripe_customer_id", stripeCustomerId).maybeSingle();
    return data ? toProfile(data as ProfileRow) : null;
  }

  async listProfiles(): Promise<Profile[]> {
    const { data } = await this.db.from("profiles").select(PROFILE_COLUMNS).order("created_at", { ascending: false }).limit(500);
    return (data ?? []).map((r) => toProfile(r as ProfileRow));
  }

  async createLinkCode(ownerId: string, now = new Date().toISOString()): Promise<LinkCode> {
    const code = newLinkCode();
    const expires_at = new Date(new Date(now).getTime() + 15 * 60 * 1000).toISOString();
    const { data, error } = await this.db.from("link_codes").insert({ code, owner_id: ownerId, created_at: now, expires_at }).select("code,owner_id,created_at,expires_at,used_at,project_id").single();
    if (error) throw error;
    return toLinkCode(data as LinkCodeRow);
  }

  async consumeLinkCode(code: string, now = new Date().toISOString()): Promise<LinkCode | null> {
    // One atomic update: only an unused, unexpired code flips to used.
    const { data } = await this.db
      .from("link_codes")
      .update({ used_at: now })
      .eq("code", normaliseCode(code))
      .is("used_at", null)
      .gt("expires_at", now)
      .select("code,owner_id,created_at,expires_at,used_at,project_id")
      .maybeSingle();
    return data ? toLinkCode(data as LinkCodeRow) : null;
  }

  async getLinkCode(code: string): Promise<LinkCode | null> {
    const { data } = await this.db.from("link_codes").select("code,owner_id,created_at,expires_at,used_at,project_id").eq("code", normaliseCode(code)).maybeSingle();
    return data ? toLinkCode(data as LinkCodeRow) : null;
  }

  async attachLinkCode(code: string, projectId: string) {
    await this.db.from("link_codes").update({ project_id: projectId }).eq("code", normaliseCode(code));
  }

  async addInvite(email: string, note?: string): Promise<Invite> {
    const key = email.trim().toLowerCase();
    const { data, error } = await this.db.from("invites").upsert({ email: key, note: note ?? null }, { onConflict: "email" }).select("email,note,created_at,accepted_at").single();
    if (error) throw error;
    return { email: data.email, note: data.note ?? undefined, createdAt: data.created_at, acceptedAt: data.accepted_at ?? undefined };
  }

  async removeInvite(email: string) {
    await this.db.from("invites").delete().eq("email", email.trim().toLowerCase());
  }

  async isInvited(email: string) {
    const { data } = await this.db.from("invites").select("email").eq("email", email.trim().toLowerCase()).maybeSingle();
    return Boolean(data);
  }

  async markInviteAccepted(email: string, at: string) {
    await this.db.from("invites").update({ accepted_at: at }).eq("email", email.trim().toLowerCase()).is("accepted_at", null);
  }

  async listInvites(): Promise<Invite[]> {
    const { data } = await this.db.from("invites").select("email,note,created_at,accepted_at").order("created_at", { ascending: false });
    return (data ?? []).map((r) => ({ email: r.email, note: r.note ?? undefined, createdAt: r.created_at, acceptedAt: r.accepted_at ?? undefined }));
  }

  async addTesterNote(note: Omit<TesterNote, "id" | "createdAt">): Promise<TesterNote> {
    const { data, error } = await this.db
      .from("tester_notes")
      .insert({ user_id: note.userId ?? null, email: note.email ?? null, project_id: note.projectId ?? null, page: note.page, note: note.note, user_agent: note.userAgent ?? null })
      .select("id,created_at")
      .single();
    if (error) throw error;
    return { ...note, id: data.id, createdAt: data.created_at };
  }

  async listTesterNotes(limit = 200): Promise<TesterNote[]> {
    const { data } = await this.db.from("tester_notes").select("id,user_id,email,project_id,page,note,user_agent,created_at").order("created_at", { ascending: false }).limit(limit);
    return (data ?? []).map((r) => ({ id: r.id, userId: r.user_id ?? undefined, email: r.email ?? undefined, projectId: r.project_id ?? undefined, page: r.page, note: r.note, userAgent: r.user_agent ?? undefined, createdAt: r.created_at }));
  }

  async recordMetric(event: MetricEvent, visitorId: string, at = new Date().toISOString()) {
    await this.db.from("metrics").insert({ event, visitor_id: visitorId, at });
  }

  async metricCounts(days: number, now = new Date().toISOString()): Promise<MetricCounts> {
    const since = new Date(new Date(now).getTime() - days * 24 * 3600 * 1000).toISOString();
    const { data } = await this.db.from("metrics").select("event,visitor_id").gte("at", since).limit(100000);
    const byEvent: MetricCounts["byEvent"] = { landing_view: 0, signup_started: 0, signup_completed: 0, project_connected: 0, first_session: 0, upgrade_clicked: 0 };
    const seen = new Set<string>();
    for (const m of data ?? []) {
      const key = `${m.event}|${m.visitor_id}`;
      if (seen.has(key) || !(m.event in byEvent)) continue;
      seen.add(key);
      byEvent[m.event as MetricEvent]++;
    }
    return { byEvent, days, signupRatePct: byEvent.landing_view > 0 ? Math.round((byEvent.signup_completed / byEvent.landing_view) * 1000) / 10 : null };
  }

  async ownerActivity(ownerId: string) {
    const projects = await this.listProjects(ownerId);
    const ids = projects.map((p) => p.id);
    if (ids.length === 0) return { projects: 0, sessions: 0, tasks: 0 };
    const [{ count: sessions }, { count: tasks }, { data: last }] = await Promise.all([
      this.db.from("agent_sessions").select("id", { count: "exact", head: true }).in("project_id", ids),
      this.db.from("tasks").select("id", { count: "exact", head: true }).in("project_id", ids),
      this.db.from("events").select("ts").in("project_id", ids).order("ts", { ascending: false }).limit(1).maybeSingle(),
    ]);
    return { projects: ids.length, sessions: sessions ?? 0, tasks: tasks ?? 0, lastEventAt: (last?.ts as string | undefined) ?? undefined };
  }
}

function toReport(r: ReportRow): ReportRecord {
  return {
    taskId: r.task_id,
    projectId: r.project_id,
    headline: r.headline,
    beforeAfter: r.before_after ?? undefined,
    touchedReasons: r.touched_reasons ?? {},
    riskReason: r.risk_reason ?? undefined,
    needsYou: r.needs_you,
    needsYouDetail: r.needs_you_detail ?? undefined,
    source: r.source ?? "template",
    eventCount: r.event_count ?? 0,
    resolvedAt: r.resolved_at ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? r.created_at,
  };
}

interface ProjectRowLike {
  id: string;
  name: string;
  repo_root_hint: string | null;
  created_at: string;
  owner_id?: string | null;
}

function toProject(r: ProjectRowLike): ProjectSummary {
  return { id: r.id, name: r.name, rootHint: r.repo_root_hint ?? undefined, createdAt: r.created_at, ownerId: r.owner_id ?? null };
}

interface ProfileRow {
  user_id: string;
  email: string | null;
  plan: Profile["plan"];
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  plan_updated_at: string | null;
  created_at: string;
  last_seen_at: string | null;
}

const PROFILE_COLUMNS = "user_id,email,plan,stripe_customer_id,stripe_subscription_id,subscription_status,plan_updated_at,created_at,last_seen_at";

function toProfile(r: ProfileRow): Profile {
  return {
    userId: r.user_id,
    email: r.email ?? undefined,
    plan: r.plan ?? "free",
    stripeCustomerId: r.stripe_customer_id ?? undefined,
    stripeSubscriptionId: r.stripe_subscription_id ?? undefined,
    subscriptionStatus: r.subscription_status ?? undefined,
    planUpdatedAt: r.plan_updated_at ?? undefined,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at ?? undefined,
  };
}

interface LinkCodeRow {
  code: string;
  owner_id: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  project_id: string | null;
}

function toLinkCode(r: LinkCodeRow): LinkCode {
  return { code: r.code, ownerId: r.owner_id, createdAt: r.created_at, expiresAt: r.expires_at, usedAt: r.used_at ?? undefined, projectId: r.project_id ?? undefined };
}

function toEventRow(e: EventRow): Omit<EventView, "plain" | "areaId" | "areaName"> {
  return {
    id: e.id,
    kind: e.kind,
    tool: e.tool ?? "claude-code",
    ts: e.ts,
    receivedAt: e.received_at,
    summary: e.summary,
    paths: e.paths ?? [],
    command: e.command ?? undefined,
    text: e.text ?? undefined,
    tests: e.tests ?? undefined,
    sourceEvent: e.source_event,
    sourceTool: e.source_tool ?? undefined,
    agentId: e.agent_id ?? undefined,
    success: e.success ?? undefined,
    raw: e.raw ?? undefined,
  };
}
