/**
 * Supabase store. Same behaviour as MemoryStore against the tables in supabase/migrations.
 * Uses the service-role key: this code only ever runs on the server.
 *
 * NOT YET VERIFIED against a live project (none linked at time of writing). `pnpm smoke:supabase`
 * runs the same fixture replay as the memory tests against the real database once it exists.
 */
import type { NormalisedEvent, Stage } from "@glasshouse/schema";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { applyEvent, hashToken, latencyStats, newToken } from "./derive";
import type { EventView, IngestResult, ProjectSummary, RoomState, SessionView, Stats, Store, TaskView } from "./types";

interface TaskRow {
  id: string;
  session_id: string;
  external_key: string | null;
  prompt: string | null;
  headline: string | null;
  current_location: string | null;
  stage: Stage;
  end_reason: string | null;
  started_at: string;
  ended_at: string | null;
  last_event_at: string | null;
}

export class SupabaseStore implements Store {
  readonly mode = "supabase" as const;
  private readonly db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async createProject(input: { name: string; rootHint?: string }) {
    const { data, error } = await this.db
      .from("projects")
      .insert({ name: input.name, repo_root_hint: input.rootHint ?? null })
      .select("id,name,repo_root_hint,created_at")
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
      .select("project_id, projects(id,name,repo_root_hint,created_at)")
      .eq("token_hash", hashToken(token))
      .maybeSingle();
    if (!data) return null;
    void this.db.from("project_tokens").update({ last_seen_at: new Date().toISOString() }).eq("token_hash", hashToken(token));
    const project = Array.isArray(data.projects) ? data.projects[0] : data.projects;
    return project ? toProject(project as ProjectRowLike) : null;
  }

  async listProjects() {
    const { data, error } = await this.db.from("projects").select("id,name,repo_root_hint,created_at").order("created_at", { ascending: false });
    if (error) throw error;
    return data.map(toProject);
  }

  async getProject(id: string) {
    const { data } = await this.db.from("projects").select("id,name,repo_root_hint,created_at").eq("id", id).maybeSingle();
    return data ? toProject(data) : null;
  }

  async ingest(projectId: string, events: NormalisedEvent[]): Promise<IngestResult> {
    const sorted = [...events].sort((a, b) => a.ts.localeCompare(b.ts));
    const sessionIds = new Map<string, string>();
    const tasks = new Map<string, TaskRow & { dirty: boolean }>();
    const rows: Record<string, unknown>[] = [];

    for (const e of sorted) {
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
            .upsert({ project_id: projectId, session_id: sessionId, external_key: e.taskKey, started_at: e.ts }, { onConflict: "session_id,external_key", ignoreDuplicates: false })
            .select("id,session_id,external_key,prompt,headline,current_location,stage,end_reason,started_at,ended_at,last_event_at")
            .single();
          if (error) throw error;
          task = { ...(data as TaskRow), dirty: false };
          tasks.set(tKey, task);
        }
        const patch = applyEvent(
          { stage: task.stage, headline: task.headline ?? undefined, location: task.current_location ?? undefined, endedAt: task.ended_at ?? undefined, endReason: task.end_reason ?? undefined },
          e,
        );
        task.headline = patch.headline ?? null;
        task.current_location = patch.location ?? null;
        task.stage = patch.stage;
        task.end_reason = patch.endReason ?? null;
        task.ended_at = patch.endedAt ?? null;
        task.last_event_at = patch.lastEventAt;
        if (patch.prompt !== undefined) task.prompt = patch.prompt;
        task.dirty = true;
      }
      rows.push({
        id: e.id,
        project_id: projectId,
        session_id: sessionId,
        task_id: task?.id ?? null,
        agent_id: e.agentId ?? null,
        kind: e.kind,
        ts: e.ts,
        paths: e.paths,
        command: e.command ?? null,
        summary: e.summary,
        success: e.success ?? null,
        source_event: e.sourceEvent,
        source_tool: e.sourceTool ?? null,
        raw: e.raw ?? null,
      });
      if (e.kind === "session_end") await this.db.from("agent_sessions").update({ ended_at: e.ts }).eq("id", sessionId);
    }

    const { data: insertedRows, error } = await this.db.from("events").upsert(rows, { onConflict: "id", ignoreDuplicates: true }).select("id");
    if (error) throw error;
    const inserted = insertedRows?.length ?? 0;

    for (const t of tasks.values()) {
      if (!t.dirty) continue;
      const { error: updateError } = await this.db
        .from("tasks")
        .update({
          prompt: t.prompt,
          headline: t.headline,
          current_location: t.current_location,
          stage: t.stage,
          end_reason: t.end_reason,
          ended_at: t.ended_at,
          last_event_at: t.last_event_at,
        })
        .eq("id", t.id);
      if (updateError) throw updateError;
    }
    return { inserted, duplicates: rows.length - inserted };
  }

  async getRoom(projectId: string): Promise<RoomState | null> {
    const project = await this.getProject(projectId);
    if (!project) return null;
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
      const { data: task } = await this.db
        .from("tasks")
        .select("id,session_id,external_key,prompt,headline,current_location,stage,end_reason,started_at,ended_at,last_event_at")
        .eq("session_id", s.id)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: events } = await this.db
        .from("events")
        .select("id,kind,ts,received_at,summary,paths,command,source_event,source_tool,agent_id,success,raw,task_id")
        .eq("session_id", s.id)
        .order("ts", { ascending: false })
        .limit(40);
      const { count } = task
        ? await this.db.from("events").select("id", { count: "exact", head: true }).eq("task_id", task.id)
        : { count: 0 };
      const recentEvents: EventView[] = (events ?? []).map((e) => ({
        id: e.id,
        kind: e.kind,
        ts: e.ts,
        receivedAt: e.received_at,
        summary: e.summary,
        paths: e.paths ?? [],
        command: e.command ?? undefined,
        sourceEvent: e.source_event,
        sourceTool: e.source_tool ?? undefined,
        agentId: e.agent_id ?? undefined,
        success: e.success ?? undefined,
        raw: e.raw ?? undefined,
      }));
      views.push({
        id: s.id,
        tool: s.tool,
        externalId: s.external_id,
        startedAt: s.started_at,
        endedAt: s.ended_at ?? undefined,
        lastEventAt: recentEvents[0]?.ts,
        task: task ? toTaskView(task as TaskRow, count ?? 0) : null,
        recentEvents,
      });
    }
    views.sort((a, b) => (b.lastEventAt ?? b.startedAt).localeCompare(a.lastEventAt ?? a.startedAt));
    return { project, sessions: views, generatedAt: new Date().toISOString() };
  }

  async getStats(projectId: string): Promise<Stats> {
    const [{ count: sessions }, { count: tasks }, { count: events }, { data: recent }] = await Promise.all([
      this.db.from("agent_sessions").select("id", { count: "exact", head: true }).eq("project_id", projectId),
      this.db.from("tasks").select("id", { count: "exact", head: true }).eq("project_id", projectId),
      this.db.from("events").select("id", { count: "exact", head: true }).eq("project_id", projectId),
      this.db.from("events").select("ts,received_at").eq("project_id", projectId).order("ts", { ascending: false }).limit(500),
    ]);
    const { avg, p95 } = latencyStats((recent ?? []).map((r) => ({ ts: r.ts, receivedAt: r.received_at })));
    return { sessions: sessions ?? 0, tasks: tasks ?? 0, events: events ?? 0, avgLatencyMs: avg, p95LatencyMs: p95 };
  }
}

interface ProjectRowLike {
  id: string;
  name: string;
  repo_root_hint: string | null;
  created_at: string;
}

function toProject(r: ProjectRowLike): ProjectSummary {
  return { id: r.id, name: r.name, rootHint: r.repo_root_hint ?? undefined, createdAt: r.created_at };
}

function toTaskView(t: TaskRow, eventCount: number): TaskView {
  return {
    id: t.id,
    externalKey: t.external_key ?? undefined,
    prompt: t.prompt ?? undefined,
    headline: t.headline ?? undefined,
    location: t.current_location ?? undefined,
    stage: t.stage,
    endReason: t.end_reason ?? undefined,
    startedAt: t.started_at,
    endedAt: t.ended_at ?? undefined,
    lastEventAt: t.last_event_at ?? undefined,
    eventCount,
  };
}
