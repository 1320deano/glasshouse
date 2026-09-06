/**
 * The progress column (Phase 5): how far each part of the app has got, as stages, and how busy
 * the agents have been, as counts. Pure. Every number is a count of recorded actions or files;
 * every bar is a stage reached. Nothing here is a percentage (rule 1).
 */
import type { AgentTool, Area, Stage } from "@glasshouse/schema";
import { areaForPath } from "@glasshouse/translate";
import type { ActivityView, AreaProgress, TaskView } from "./store/types";

/** The order of the bar's segments. "stuck" and "waiting" are overlays, not steps. */
export const PROGRESS_STEPS: readonly Stage[] = ["investigating", "planning", "building", "testing", "done"];

export function stepIndex(stage: Stage | null | undefined, stored?: Stage): number {
  const s = stage === "stuck" || stage === "waiting" ? (stored ?? "investigating") : stage;
  return s ? PROGRESS_STEPS.indexOf(s) : -1;
}

const ALL_TOOLS: AgentTool[] = ["claude-code", "codex", "cursor", "watcher"];

/** One row per area, touched parts first (most recent first), untouched parts after. */
export function areaProgress(tasks: readonly TaskView[], areas: readonly Area[], sinceIso: string): AreaProgress[] {
  const rows = new Map<string, AreaProgress>();
  for (const a of areas) rows.set(a.id, { id: a.id, name: a.name, sensitive: a.sensitive, stage: null, running: 0, finished: 0, filesChanged: 0, tools: [] });

  const inWindow = tasks.filter((t) => (t.lastEventAt ?? t.startedAt) >= sinceIso || (t.endedAt ?? "") >= sinceIso);
  // Most recent first, so the first test counts we see for an area are the latest.
  const ordered = [...inWindow].sort((a, b) => (b.lastEventAt ?? b.startedAt).localeCompare(a.lastEventAt ?? a.startedAt));
  const changedIn = new Map<string, Set<string>>();

  for (const t of ordered) {
    const touchedIds = new Set<string>();
    const changedIds = new Set<string>();
    for (const p of t.changedPaths) {
      const a = areaForPath(p, areas);
      if (!a) continue;
      touchedIds.add(a.id);
      changedIds.add(a.id);
      const set = changedIn.get(a.id) ?? new Set<string>();
      set.add(p);
      changedIn.set(a.id, set);
    }
    for (const p of t.touchedPaths) {
      const a = areaForPath(p, areas);
      if (a) touchedIds.add(a.id);
    }
    if (t.tool === "watcher") continue;
    for (const id of touchedIds) {
      const row = rows.get(id);
      if (!row) continue;
      const live = !t.endedAt;
      if (live) row.running++;
      else row.finished++;
      if (!row.tools.includes(t.tool)) row.tools.push(t.tool);
      const at = t.lastEventAt ?? t.startedAt;
      if (!row.lastTouchedAt || at > row.lastTouchedAt) row.lastTouchedAt = at;
      if (!row.checks && t.lastTests && changedIds.has(id)) row.checks = t.lastTests;
      // The furthest stage reached: a live task's own stage, or "done" once a task touching it finished.
      const candidate: Stage = live ? (t.stage === "stuck" || t.stage === "waiting" ? t.storedStage : t.stage) : "done";
      if (stepIndex(candidate) > stepIndex(row.stage)) row.stage = candidate;
      if (live && t.stage === "waiting") row.attention = "waiting";
      else if (live && t.stage === "stuck" && row.attention !== "waiting") row.attention = "stuck";
    }
  }
  for (const [id, set] of changedIn) {
    const row = rows.get(id);
    if (row) row.filesChanged = set.size;
  }
  const list = [...rows.values()];
  // Touched parts first, the ones that need the owner before the rest, then most recent, then by name.
  const attention = (r: AreaProgress) => (r.attention === "waiting" ? 2 : r.attention === "stuck" ? 1 : 0);
  list.sort((a, b) => {
    if (Boolean(a.lastTouchedAt) !== Boolean(b.lastTouchedAt)) return a.lastTouchedAt ? -1 : 1;
    if (attention(a) !== attention(b)) return attention(b) - attention(a);
    if (a.lastTouchedAt && b.lastTouchedAt && a.lastTouchedAt !== b.lastTouchedAt) return b.lastTouchedAt.localeCompare(a.lastTouchedAt);
    return a.name.localeCompare(b.name);
  });
  return list;
}

/** Truncate an ISO timestamp to its UTC hour. */
export function hourKey(iso: string): string {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours())).toISOString();
}

/** Actions per hour and per tool over the window, from event rows. */
export function activityFrom(rows: ReadonlyArray<{ ts: string; tool: AgentTool }>, sinceIso: string): ActivityView {
  const hours: ActivityView["hours"] = {};
  for (const r of rows) {
    if (r.ts < sinceIso) continue;
    const k = hourKey(r.ts);
    const slot = hours[k] ?? (hours[k] = {});
    slot[r.tool] = (slot[r.tool] ?? 0) + 1;
  }
  return activityWindow(hours, sinceIso);
}

/** Rebuild the totals from a set of hour buckets: used when a plan cuts the window short. */
export function activityWindow(hours: ActivityView["hours"], sinceIso: string): ActivityView {
  const byTool = Object.fromEntries(ALL_TOOLS.map((t) => [t, 0])) as Record<AgentTool, number>;
  let total = 0;
  for (const [h, slot] of Object.entries(hours)) {
    if (h < sinceIso) continue;
    for (const t of ALL_TOOLS) {
      const n = slot[t] ?? 0;
      byTool[t] += n;
      total += n;
    }
  }
  const kept = Object.fromEntries(Object.entries(hours).filter(([h]) => h >= sinceIso));
  return { since: sinceIso, hours: kept, total, byTool };
}

/** Count of every tool's actions in one hour bucket. */
export function hourTotal(slot: Partial<Record<AgentTool, number>> | undefined): number {
  if (!slot) return 0;
  let n = 0;
  for (const t of ALL_TOOLS) n += slot[t] ?? 0;
  return n;
}

export const WEEK_MS = 7 * 24 * 3600 * 1000;
