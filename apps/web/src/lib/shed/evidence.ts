/**
 * What the record says about each box in the builder.
 *
 * Every other agent builder starts from a blank box. This one has watched the project, so each
 * thing the owner can tick carries the count of times it actually mattered: "Runs the checks
 * before anything is called finished" sits beside "3 tasks were called finished with checks still
 * failing", with the tasks behind it one tap away. Nothing here is generated: every entry is a
 * count over the same task rows the Room shows (rules 2 and 3).
 *
 * Keys:
 *   duty:<id>     a box under "What it does"
 *   stop:<text>   a box under "When it must stop and ask you"
 *   area:<id>     a part of the app, under "Where it may work"
 *   kind:<id>     a tile on the get-started card
 *
 * Also here: the compact list of recent tasks a helper can be rehearsed against (`rehearse.ts`).
 */
import type { AgentTool, Area } from "@glasshouse/schema";
import { questionIn } from "@glasshouse/translate";
import type { HelperEvidence, TaskView } from "../store/types";

export type BoxEvidence = Record<string, HelperEvidence>;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (items: string[]) => (items.length <= 1 ? items.join("") : items.length === 2 ? `${items[0]} and ${items[1]}` : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

function ev(kind: HelperEvidence["kind"], tasks: TaskView[], text: string): HelperEvidence {
  return { kind, taskIds: tasks.map((t) => t.id), text };
}

/** The part a task mostly changed: the one with the most changed files. */
function mainArea(t: TaskView): TaskView["areas"][number] | undefined {
  return [...t.areas].filter((a) => a.changed.length > 0).sort((a, b) => b.changed.length - a.changed.length)[0];
}

export function boxEvidenceFrom(tasks: TaskView[], areas: Area[]): BoxEvidence {
  const out: BoxEvidence = {};
  const real = tasks.filter((t) => t.tool !== "watcher");
  const finished = real.filter((t) => t.endedAt);

  const stuck = real.filter((t) => t.stage === "stuck" || Boolean(t.stuckReason));
  const failing = finished.filter((t) => (t.lastTests?.failed ?? 0) > 0);
  const asked = real.filter((t) => (t.report && (t.report.needsYou === "decision" || t.report.needsYou === "blocked")) || t.stage === "waiting");
  const handed = real.filter((t) => t.continuedFrom);
  const installed = real.filter((t) => t.installs > 0);
  const spread = real.filter((t) => t.areas.filter((a) => a.changed.length > 0).length >= 3);

  const changedIn = new Map<string, TaskView[]>();
  for (const t of real) for (const a of t.areas) if (a.changed.length > 0) changedIn.set(a.id, [...(changedIn.get(a.id) ?? []), t]);
  const sensitive = areas.filter((a) => a.sensitive);
  const sensitiveChanged = [...new Map(sensitive.flatMap((a) => changedIn.get(a.id) ?? []).map((t) => [t.id, t])).values()];
  const sensitiveNames = sensitive.filter((a) => (changedIn.get(a.id) ?? []).length > 0).map((a) => a.name);

  if (failing.length) {
    const e = ev("checks", failing, `${plural(failing.length, "task")} in your project ${failing.length === 1 ? "was" : "were"} called finished with checks still failing.`);
    out["duty:run-checks"] = e;
    out["duty:no-done-while-failing"] = e;
  }
  if (stuck.length) {
    const e = ev("stuck", stuck, `${plural(stuck.length, "task")} looked stuck: the same error again and again, or a long silence.`);
    out["duty:stop-on-repeat"] = e;
    out["stop:When the same check fails twice"] = e;
  }
  if (asked.length) {
    const questions = new Set(asked.map((t) => (t.report?.needsYouDetail ?? questionIn(t.closingMessage) ?? t.closingMessage ?? "").trim()).filter(Boolean));
    const e = ev("asked", asked, `You were asked to decide ${plural(asked.length, "time")}${questions.size > 1 ? ` across ${plural(questions.size, "different question")}` : ""}.`);
    out["duty:apply-answers"] = e;
    out["duty:ask-when-new"] = e;
  }
  if (handed.length) out["duty:handover-note"] = ev("handoff", handed, `${plural(handed.length, "task")} carried on in a different tool from the one that started it.`);
  if (sensitiveChanged.length) out["duty:ask-before-off-limits"] = ev("sensitive", sensitiveChanged, `Agents changed ${list(sensitiveNames)} in ${plural(sensitiveChanged.length, "task")}.`);
  if (spread.length) out["duty:stay-inside"] = ev("busy", spread, `${plural(spread.length, "task")} changed three or more parts of your app at once.`);
  if (installed.length) out["stop:Before installing anything new"] = ev("owner", installed, `${plural(installed.length, "task")} added something new to the project.`);

  for (const a of areas) {
    const t = changedIn.get(a.id) ?? [];
    if (t.length === 0) continue;
    out[`area:${a.id}`] = ev("busy", t, `Changed in ${plural(t.length, "task")}.`);
    if (a.sensitive) out[`stop:Before changing anything in ${a.name}`] = ev("sensitive", t, `Agents changed ${a.name} in ${plural(t.length, "task")}.`);
  }

  // The tiles.
  const checkerTasks = [...new Map([...stuck, ...failing].map((t) => [t.id, t])).values()];
  if (checkerTasks.length) {
    const bits = [stuck.length ? `${plural(stuck.length, "stuck moment")}` : "", failing.length ? `${plural(failing.length, "task")} finished with failing checks` : ""].filter(Boolean);
    out["kind:checker"] = ev("stuck", checkerTasks, `${list(bits)} in your project.`);
  }
  if (sensitiveChanged.length) out["kind:guard"] = ev("sensitive", sensitiveChanged, `${list(sensitiveNames)} changed in ${plural(sensitiveChanged.length, "task")}.`);
  if (asked.length) out["kind:rules"] = ev("asked", asked, `You were asked to decide ${plural(asked.length, "time")}.`);
  if (handed.length) out["kind:handover"] = ev("handoff", handed, `${plural(handed.length, "handover")} between tools.`);
  const counts = new Map<string, TaskView[]>();
  for (const t of finished) {
    const a = mainArea(t);
    if (a) counts.set(a.id, [...(counts.get(a.id) ?? []), t]);
  }
  const busiest = [...counts.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const busyArea = busiest && areas.find((a) => a.id === busiest[0]);
  if (busiest && busyArea && busiest[1].length >= 2) out["kind:specialist"] = ev("busy", busiest[1], `${busyArea.name} is the busiest part: ${plural(busiest[1].length, "finished task")}.`);

  return out;
}

/** One recent task, cut down to the facts a helper's rules can be replayed against. */
export interface RehearsalTask {
  id: string;
  headline: string;
  tool: AgentTool;
  /** When it ended, or its last action. */
  at: string;
  live: boolean;
  /** Ids of the parts it changed files in. */
  changedAreas: string[];
  /** Number of parts it changed files in that the map does not name. */
  changedElsewhere: number;
  failed: number;
  passed: number;
  stuckReason?: string;
  installs: number;
  /** The question the owner was asked, if any. */
  asked?: string;
  continuedFrom?: AgentTool;
}

export function rehearsalTasksFrom(tasks: TaskView[], areas: Area[], limit = 12): RehearsalTask[] {
  const known = new Set(areas.map((a) => a.id));
  return tasks
    .filter((t) => t.tool !== "watcher")
    .sort((a, b) => (b.endedAt ?? b.lastEventAt ?? b.startedAt).localeCompare(a.endedAt ?? a.lastEventAt ?? a.startedAt))
    .slice(0, limit)
    .map((t) => {
      const changed = t.areas.filter((a) => a.changed.length > 0);
      return {
        id: t.id,
        // A bare status ("Waiting for you") names nothing; the instruction does.
        headline: t.report?.headline ?? (/^(waiting|stuck|looks stuck)/i.test(t.headline.trim()) && t.prompt ? t.prompt.replace(/\s+/g, " ").trim().slice(0, 120) : t.headline),
        tool: t.tool,
        at: t.endedAt ?? t.lastEventAt ?? t.startedAt,
        live: !t.endedAt,
        changedAreas: changed.filter((a) => known.has(a.id)).map((a) => a.id),
        changedElsewhere: changed.filter((a) => !known.has(a.id)).length,
        failed: t.lastTests?.failed ?? 0,
        passed: t.lastTests?.passed ?? 0,
        stuckReason: t.stuckReason,
        installs: t.installs,
        asked: t.report && (t.report.needsYou === "decision" || t.report.needsYou === "blocked") ? (t.report.needsYouDetail ?? undefined) : undefined,
        continuedFrom: t.continuedFrom?.tool,
      };
    });
}
