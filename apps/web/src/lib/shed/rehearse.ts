/**
 * Try it on last week: what this helper would have done on the tasks that actually happened.
 *
 * A person who will never open the code cannot judge a set of rules by reading them. They can
 * judge "on Tuesday's task it would have refused to call it finished, because two checks were
 * failing". Every line here is a rule of the helper held against a fact the record holds for
 * that task: the parts it changed, the checks that failed, the error it repeated, the things it
 * installed, the question it asked. No line is generated, and a task where nothing would have
 * changed is counted, not narrated (rule 2).
 *
 * Pure: the browser runs it on every tick, over the compact task list the page arrived with.
 */
import type { Area } from "@glasshouse/schema";
import { type Choices, STOP_OPTIONS } from "./build";
import type { RehearsalTask } from "./evidence";

export interface RehearsalLine {
  taskId: string;
  headline: string;
  at: string;
  /** What the helper would have done on this task, one sentence per rule that would have fired. */
  would: string[];
}

export interface Rehearsal {
  lines: RehearsalLine[];
  /** Tasks it was tried on where none of its rules would have fired. */
  quiet: number;
  total: number;
}

const TOOL: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex", cursor: "Cursor", watcher: "the folder watcher" };
const list = (items: string[]) => (items.length <= 1 ? items.join("") : items.length === 2 ? `${items[0]} and ${items[1]}` : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

export function rehearse(c: Choices, tasks: RehearsalTask[], areas: Area[]): Rehearsal {
  const byId = new Map(areas.map((a) => [a.id, a.name]));
  const names = (ids: string[]) => ids.map((id) => byId.get(id)).filter((n): n is string => Boolean(n));
  const forbidden = new Set(c.mustNotTouch.filter((id) => !c.mayTouch.includes(id)));
  const allowed = new Set(c.mayTouch);
  const duties = new Set(c.duties);
  const stops = new Set(c.stops);
  const knows = c.knows.filter((r) => r.text.trim()).length;
  const lines: RehearsalLine[] = [];
  let quiet = 0;

  for (const t of tasks) {
    const would: string[] = [];

    const hitForbidden = names(t.changedAreas.filter((id) => forbidden.has(id)));
    if (hitForbidden.length) would.push(`Would have stopped before changing ${list(hitForbidden)} and asked you first.`);

    if (allowed.size > 0) {
      const outside = names(t.changedAreas.filter((id) => !allowed.has(id) && !forbidden.has(id)));
      const elsewhere = t.changedElsewhere > 0 ? ["parts of the project the map does not name"] : [];
      const strayed = [...outside, ...elsewhere];
      if (strayed.length) would.push(duties.has("stay-inside") ? `Would have said the job reaches outside ${list(names(c.mayTouch))} (it changed ${list(strayed)}) and asked before going on.` : `Would have said so when the job reached outside ${list(names(c.mayTouch))} into ${list(strayed)}.`);
    }

    if (t.failed > 0 && (duties.has("no-done-while-failing") || duties.has("run-checks"))) {
      would.push(t.live ? `Would not let this be called finished while ${t.failed} check${t.failed === 1 ? " is" : "s are"} failing.` : `Would not have called it finished: ${t.failed} check${t.failed === 1 ? " was" : "s were"} still failing.`);
    }

    // Only the repeating kind of stuck: a helper can stop retrying, it cannot fill a silence.
    if (t.stuckReason && /same error/i.test(t.stuckReason) && (duties.has("stop-on-repeat") || stops.has("When the same check fails twice"))) {
      would.push("Would have stopped at the second time the same error came up and reported it, instead of trying a third way.");
    }

    if (t.installs > 0 && stops.has(STOP_OPTIONS[1]!)) {
      would.push(`Would have asked you before adding ${t.installs === 1 ? "something new" : `${t.installs} new things`} to the project.`);
    }

    if (t.asked && duties.has("apply-answers")) {
      would.push(knows > 0 ? `Was asked “${t.asked}”. It would have checked your standing answers first and asked you only if none covers it.` : `Was asked “${t.asked}”. Write the answer under “Things it should already know” and it will not ask again.`);
    }

    if (t.continuedFrom && duties.has("handover-note")) {
      would.push(`Would have left a handover note for ${TOOL[t.tool] ?? t.tool} to pick up from ${TOOL[t.continuedFrom] ?? t.continuedFrom}.`);
    }

    if (would.length) lines.push({ taskId: t.id, headline: t.headline, at: t.at, would });
    else quiet++;
  }
  return { lines, quiet, total: tasks.length };
}
