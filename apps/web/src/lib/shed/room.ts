/**
 * Helpers as the Room sees them (Phase 7): the loop closed. A helper grown in the Shed and placed
 * in the project shows up in Glasshouse the moment it runs, with the fact of whether it kept to
 * its patch, and the story says so in the same breath as everything else. Pure; both stores
 * feed it their rows.
 */
import type { Area } from "@glasshouse/schema";
import type { HelperRecord, HelperRun, RoomHelper, RoomHelperRun, StoryMessage } from "../store/types";
import { DUTIES } from "./build";
import { judgeRun, runsFor } from "./verify";

const TOOL: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex", cursor: "Cursor", watcher: "The folder watcher" };

/** The first ticked sentence's box label, or the owner's own first line: one line for a row. */
export function jobLine(brief: HelperRecord["brief"]): string {
  const first = brief.job.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const duty = DUTIES.find((d) => d.sentence === first);
  return duty ? duty.label : first.replace(/\s+/g, " ").slice(0, 120);
}

export function roomHelpersFrom(helpers: HelperRecord[], runs: HelperRun[], areas: Area[]): RoomHelper[] {
  return helpers.map((h) => ({
    id: h.id,
    name: h.name,
    slug: h.slug,
    tools: h.brief.tools,
    job: jobLine(h.brief),
    placedAt: h.placedAt,
    runs: runsFor(h, runs).map((r): RoomHelperRun => {
      const v = judgeRun(h, r, areas);
      return { taskId: r.taskId, at: r.startedAt, endedAt: r.endedAt, tool: r.tool, verdict: v.verdict, outside: v.outside };
    }),
  }));
}

/** One line for a helper's row, from its runs: a count and a fact, never a mood. */
export function helperLine(h: Pick<RoomHelper, "runs" | "placedAt">): { text: string; tone?: "positive" | "attention" | "critical" } {
  const n = h.runs.length;
  if (n === 0) return { text: h.placedAt ? "In your project. Not run yet this week." : "Not placed in your project yet." };
  const strayed = h.runs.filter((r) => r.verdict === "strayed");
  const unclear = h.runs.filter((r) => r.verdict === "unclear").length;
  const times = n === 1 ? "once" : `${n} times`;
  if (strayed.length) return { text: `Ran ${times}; went outside its patch ${strayed.length === 1 ? "once" : `${strayed.length} times`} (${[...new Set(strayed.flatMap((r) => r.outside))].join(", ")}).`, tone: "critical" };
  if (unclear) return { text: `Ran ${times}; ${n - unclear} kept to its patch, ${unclear} could not be told apart from the rest of the task.`, tone: "attention" };
  return { text: `Ran ${times}; kept to its patch every time.`, tone: "positive" };
}

/** The story's lines for helpers: one when a run starts, one with its verdict when it ends. */
export function helperStory(helpers: RoomHelper[]): StoryMessage[] {
  const out: StoryMessage[] = [];
  for (const h of helpers) {
    for (const r of h.runs) {
      const base = { taskId: r.taskId, tool: r.tool, helper: { id: h.id, name: h.name } };
      out.push({ ...base, id: `${r.taskId}:helper:${h.id}:${r.at}`, at: r.at, kind: "helper-started", text: `${TOOL[r.tool] ?? r.tool} handed part of this task to your helper ${h.name}.` });
      if (!r.endedAt) continue;
      const text =
        r.verdict === "kept"
          ? `Your helper ${h.name} finished and kept to its patch.`
          : r.verdict === "strayed"
            ? `Your helper ${h.name} finished but changed ${r.outside.join(", ")}, outside its patch.`
            : `Your helper ${h.name} finished. Whether it kept to its patch is unclear: the task changed ${r.outside.join(", ")} and ${TOOL[r.tool] ?? r.tool} did not say which agent did.`;
      out.push({ ...base, id: `${r.taskId}:helper:${h.id}:${r.endedAt}:done`, at: r.endedAt, kind: "helper-finished", text, helper: { ...base.helper, verdict: r.verdict, outside: r.outside } });
    }
  }
  return out;
}
