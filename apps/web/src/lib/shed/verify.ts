/**
 * Checked afterwards: did a helper keep to its patch? Computed from the record, never declared.
 *
 * A run "kept" when none of its changed files falls in a part it must never touch, and (when it
 * has a patch) every changed file falls inside the patch. When the tool did not say which agent
 * made which edit, the whole task's changes stand in: if they are all clean the helper's must be
 * too (kept); if not, we cannot tell and say so ("unclear"), never accuse.
 */
import type { Area } from "@glasshouse/schema";
import { areaForPath } from "@glasshouse/translate";
import type { HelperRecord, HelperRun } from "../store/types";

export interface RunVerdict {
  run: HelperRun;
  verdict: "kept" | "strayed" | "unclear";
  /** Parts of the app it changed that it should not have (owner names). */
  outside: string[];
}

export interface HelperCheck {
  helperId: string;
  runs: number;
  kept: number;
  strayed: number;
  unclear: number;
  lastRunAt?: string;
  verdicts: RunVerdict[];
  /** One line for the card: a fact with its count. */
  line: string;
}

export function runsFor(helper: Pick<HelperRecord, "slug">, runs: HelperRun[]): HelperRun[] {
  const slug = helper.slug.toLowerCase();
  return runs.filter((r) => r.agentType.toLowerCase() === slug);
}

export function judgeRun(helper: Pick<HelperRecord, "brief">, run: HelperRun, areas: Area[]): RunVerdict {
  const forbidden = new Set(helper.brief.mustNotTouch);
  const allowed = new Set(helper.brief.mayTouch);
  const outside = new Set<string>();
  for (const p of run.changedPaths) {
    const area = areaForPath(p, areas);
    if (!area) {
      if (allowed.size > 0) outside.add("somewhere outside its patch");
      continue;
    }
    if (forbidden.has(area.id) || (allowed.size > 0 && !allowed.has(area.id))) outside.add(area.name);
  }
  if (outside.size === 0) return { run, verdict: "kept", outside: [] };
  return { run, verdict: run.taskWide ? "unclear" : "strayed", outside: [...outside] };
}

export function checkHelper(helper: Pick<HelperRecord, "id" | "slug" | "brief">, runs: HelperRun[], areas: Area[]): HelperCheck {
  const mine = runsFor(helper, runs);
  const verdicts = mine.map((r) => judgeRun(helper, r, areas));
  const kept = verdicts.filter((v) => v.verdict === "kept").length;
  const strayed = verdicts.filter((v) => v.verdict === "strayed").length;
  const unclear = verdicts.filter((v) => v.verdict === "unclear").length;
  let line: string;
  if (mine.length === 0) line = "Not run yet. Once it has, this line says whether it kept to its patch.";
  else if (strayed === 0 && unclear === 0) line = `Ran ${mine.length === 1 ? "once" : `${mine.length} times`}; kept to its patch every time.`;
  else if (strayed > 0) line = `Ran ${mine.length === 1 ? "once" : `${mine.length} times`}; went outside its patch ${strayed === 1 ? "once" : `${strayed} times`} (${[...new Set(verdicts.filter((v) => v.verdict === "strayed").flatMap((v) => v.outside))].join(", ")}).`;
  else line = `Ran ${mine.length === 1 ? "once" : `${mine.length} times`}; ${kept} kept to its patch, ${unclear} could not be told apart from the rest of the task.`;
  return { helperId: helper.id, runs: mine.length, kept, strayed, unclear, lastRunAt: mine[0]?.startedAt, verdicts, line };
}
