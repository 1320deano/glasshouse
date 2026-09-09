/**
 * Which helpers actually ran, from the record. Pure: both stores feed it their rows.
 *
 * A Claude Code sub-agent announces itself with a SubagentStart hook that names its type (the
 * helper's file name) and its agent id; the edits it makes carry the same agent id. Cursor's
 * sub-agents carry an id too. When the tool does not say which agent made which edit, the check
 * falls back to the whole task's changed files and says so (`taskWide`), never guesses.
 */
import type { AgentTool, EventKind } from "@glasshouse/schema";
import type { HelperRun } from "../store/types";

export interface RunEventRow {
  id: string;
  kind: EventKind;
  tool: AgentTool;
  ts: string;
  agentId?: string;
  taskId?: string;
  paths: string[];
  summary: string;
  raw?: unknown;
}

const TYPE_IN_SUMMARY = /\(([^()]+)\)\s*$/;

/** The helper's name from a sub-agent start event: the payload's own field first, the summary's bracket second. */
export function agentTypeOf(e: RunEventRow): string | undefined {
  const raw = e.raw as Record<string, unknown> | undefined;
  const fromRaw = raw && typeof raw === "object" ? (raw.agent_type ?? raw.subagent_type) : undefined;
  if (typeof fromRaw === "string" && fromRaw.trim()) return fromRaw.trim();
  const m = TYPE_IN_SUMMARY.exec(e.summary);
  return m?.[1]?.trim() || undefined;
}

export function helperRunsFrom(events: RunEventRow[], taskChangedPaths: (taskId: string) => string[]): HelperRun[] {
  const editsByAgent = new Map<string, Set<string>>();
  const stops = new Map<string, string>();
  for (const e of events) {
    if (e.kind === "edit" && e.agentId) {
      const set = editsByAgent.get(e.agentId) ?? new Set<string>();
      for (const p of e.paths) set.add(p);
      editsByAgent.set(e.agentId, set);
    }
    if (e.kind === "subagent_stop" && e.agentId && !stops.has(e.agentId)) stops.set(e.agentId, e.ts);
  }
  const runs: HelperRun[] = [];
  for (const e of events) {
    if (e.kind !== "subagent_start" || !e.taskId) continue;
    const agentType = agentTypeOf(e);
    if (!agentType) continue;
    const own = e.agentId ? editsByAgent.get(e.agentId) : undefined;
    runs.push({
      taskId: e.taskId,
      tool: e.tool,
      agentId: e.agentId,
      agentType,
      startedAt: e.ts,
      endedAt: e.agentId ? stops.get(e.agentId) : undefined,
      changedPaths: own ? [...own].sort() : [...taskChangedPaths(e.taskId)].sort(),
      taskWide: !own,
    });
  }
  return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
