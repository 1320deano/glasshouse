/**
 * The Potting Shed as one person sees it: the project's helpers with their compiled files and
 * their after-the-fact check, and what the record suggests growing next. Computed on every read,
 * nothing stored but the words (the same rule as the Room).
 */
import type { Area } from "@glasshouse/schema";
import type { Viewer } from "../auth";
import { limitsFor, type Plan, canGrowHelper } from "../plan";
import { getStore } from "../store";
import type { HelperRecord, ProjectSummary } from "../store/types";
import { compileHelper, type CompiledFile } from "./compile";
import { boxEvidenceFrom, rehearsalTasksFrom, type BoxEvidence, type RehearsalTask } from "./evidence";
import { suggestHelpers, type HelperSuggestion } from "./suggest";
import { checkHelper, type HelperCheck } from "./verify";

/** How far back the Shed reads when it looks for evidence. Two weeks: long enough to see a pattern. */
export const EVIDENCE_WINDOW_MS = 14 * 24 * 3600 * 1000;

export interface HelperView extends HelperRecord {
  files: CompiledFile[];
  check: HelperCheck;
}

export interface ShedView {
  project: ProjectSummary;
  areas: Area[];
  areaMapSource?: "ai" | "heuristic";
  helpers: HelperView[];
  suggestions: HelperSuggestion[];
  /** How many tasks the suggestions were read from, and since when. A fact for the column head. */
  evidence: { tasks: number; since: string };
  /** What the record says about each box in the builder, keyed "duty:", "stop:", "area:", "kind:". */
  boxEvidence: BoxEvidence;
  /** The most recent tasks, cut down to what a helper can be rehearsed against. */
  recent: RehearsalTask[];
  plan: Plan;
  /** Whether one more helper may be grown on this plan. */
  canGrow: boolean;
  helpersAllowed: number;
  generatedAt: string;
}

export async function shedForViewer(projectId: string, viewer: Viewer, now = new Date()): Promise<ShedView | null> {
  const store = getStore();
  const project = await store.getProject(projectId);
  if (!project) return null;
  const since = new Date(now.getTime() - Math.min(EVIDENCE_WINDOW_MS, limitsFor(viewer.plan).historyMs)).toISOString();
  const [map, helpers, tasks, runs] = await Promise.all([store.getAreaMap(projectId), store.listHelpers(projectId), store.listTasks(projectId, { since, limit: 400 }), store.helperRuns(projectId, { since })]);
  const areas = map?.areas ?? [];
  const views: HelperView[] = helpers.map((h) => ({ ...h, files: compileHelper(h, areas), check: checkHelper(h, runs, areas) }));
  return {
    project,
    areas,
    areaMapSource: map?.source,
    helpers: views,
    suggestions: suggestHelpers(tasks, areas, helpers),
    evidence: { tasks: tasks.length, since },
    boxEvidence: boxEvidenceFrom(tasks, areas),
    recent: rehearsalTasksFrom(tasks, areas),
    plan: viewer.plan,
    canGrow: canGrowHelper(viewer.plan, helpers.length),
    helpersAllowed: limitsFor(viewer.plan).helpers,
    generatedAt: now.toISOString(),
  };
}
