/**
 * Helpers grown from the record: what the Potting Shed proposes, and why.
 *
 * Nothing here is generated or guessed. Every suggestion is computed from the tasks the Room has
 * seen (stuck moments, questions the owner was asked, checks that failed, sensitive parts that
 * were changed, work handed between tools, the busiest part of the app), carries the count it
 * rests on and the tasks it came from (rule 3), and pre-fills a brief the owner can change.
 *
 * With no record at all, two starters are offered and say so plainly ("not from your record").
 */
import type { Area } from "@glasshouse/schema";
import { questionIn } from "@glasshouse/translate";
import type { HelperBrief, HelperEvidence, HelperRecord, TaskView } from "../store/types";
import { emptyBrief } from "./compile";

export interface HelperSuggestion {
  /** Stable within a project, so a grown helper can be matched back to it. */
  id: string;
  kind: HelperEvidence["kind"];
  name: string;
  /** What the helper would do, in one sentence for the card. */
  summary: string;
  evidence: HelperEvidence;
  brief: HelperBrief;
  /** Set when a helper in the project was grown from this suggestion. */
  grownAs?: { id: string; name: string };
  /** True for the two starters offered when the record is empty. */
  starter?: boolean;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const TOOL_WORD: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex", cursor: "Cursor", watcher: "the folder watcher" };

/** The area a task mostly changed: the one with the most changed files. */
function mainArea(t: TaskView): TaskView["areas"][number] | undefined {
  return [...t.areas].filter((a) => a.changed.length > 0).sort((a, b) => b.changed.length - a.changed.length)[0];
}

function stopAndAskFor(areas: Area[]): string[] {
  return areas.filter((a) => a.sensitive).map((a) => `Before changing anything in ${a.name}`);
}

export function suggestHelpers(tasks: TaskView[], areas: Area[], existing: HelperRecord[] = []): HelperSuggestion[] {
  const out: HelperSuggestion[] = [];
  const byId = new Map(areas.map((a) => [a.id, a]));
  const finished = tasks.filter((t) => t.endedAt);

  // 1. Stuck: the same error three times, or nothing for minutes, in one part of the app.
  const stuck = tasks.filter((t) => t.stage === "stuck" || t.stuckReason || (t.report && /stuck/i.test(t.report.needsYouDetail ?? "")));
  const stuckByArea = new Map<string, TaskView[]>();
  for (const t of stuck) {
    const a = mainArea(t);
    const key = a?.id ?? "*";
    stuckByArea.set(key, [...(stuckByArea.get(key) ?? []), t]);
  }
  for (const [areaId, list] of stuckByArea) {
    const area = byId.get(areaId);
    const where = area ? ` in ${area.name}` : "";
    out.push({
      id: `stuck:${areaId}`,
      kind: "stuck",
      name: area ? `${area.name} checker` : "Checker",
      summary: `Runs the checks properly before anything${where} is called finished, and stops rather than repeating a failing fix.`,
      evidence: {
        kind: "stuck",
        taskIds: list.map((t) => t.id),
        text: `${plural(list.length, "task")}${where} looked stuck: ${list
          .slice(0, 2)
          .map((t) => `“${t.headline}”`)
          .join(", ")}${list.length > 2 ? ` and ${list.length - 2} more` : ""}.`,
      },
      brief: {
        ...emptyBrief(),
        job: `Before any work${where} is called finished, run the project's checks and read what failed properly. If the same error appears a second time, stop, write down exactly what it says, and ask the owner rather than trying a third way.`,
        mayTouch: area ? [area.id] : [],
        mustNotTouch: areas.filter((a) => a.sensitive && a.id !== areaId).map((a) => a.id),
        stopAndAsk: ["When the same check fails twice", ...stopAndAskFor(areas)],
        care: "careful",
        rules: list
          .map((t) => t.stuckReason)
          .filter((r): r is string => Boolean(r))
          .filter((r, i, all) => all.indexOf(r) === i)
          .slice(0, 3)
          .map((r) => ({ text: `You have been here before: “${r}”. When that happens, stop and report instead of retrying.`, evidence: { kind: "stuck" as const, taskIds: list.map((t) => t.id), text: r } })),
      },
    });
  }

  // 2. Asked: the questions the owner has had to answer. Each becomes a standing answer to fill in.
  const asked = tasks.filter((t) => (t.report && (t.report.needsYou === "decision" || t.report.needsYou === "blocked")) || t.stage === "waiting");
  const questions = new Map<string, TaskView[]>();
  for (const t of asked) {
    const q = t.report?.needsYouDetail ?? questionIn(t.closingMessage) ?? t.closingMessage;
    if (!q) continue;
    const key = q.trim().replace(/\s+/g, " ").slice(0, 200);
    questions.set(key, [...(questions.get(key) ?? []), t]);
  }
  if (questions.size > 0) {
    const all = [...questions.values()].flat();
    out.push({
      id: "asked:all",
      kind: "asked",
      name: "House rules",
      summary: `Knows the answers you have already given, so no agent asks you the same question twice.`,
      evidence: {
        kind: "asked",
        taskIds: all.map((t) => t.id),
        text: `You were asked to decide ${plural(all.length, "time")} across ${plural(questions.size, "different question")}.`,
      },
      brief: {
        ...emptyBrief(),
        job: "Carry the owner's standing answers into every task, and apply them without asking again. When something new comes up that none of them covers, stop and ask; then the answer can be added here.",
        care: "balanced",
        stopAndAsk: ["When a question comes up that none of the rules below answers"],
        rules: [...questions.entries()].slice(0, 8).map(([q, list]) => ({
          text: `Asked before: “${q}”. Your answer: (write it here)`,
          evidence: { kind: "asked" as const, taskIds: list.map((t) => t.id), text: `Asked ${plural(list.length, "time")}.` },
        })),
      },
    });
  }

  // 3. Checks: tasks that ended with failing checks.
  const failing = finished.filter((t) => (t.lastTests?.failed ?? 0) > 0);
  if (failing.length > 0) {
    out.push({
      id: "checks:all",
      kind: "checks",
      name: "Finisher",
      summary: "Never says a job is done while any check is failing, and says plainly which ones failed.",
      evidence: { kind: "checks", taskIds: failing.map((t) => t.id), text: `${plural(failing.length, "task")} finished with checks still failing.` },
      brief: {
        ...emptyBrief(),
        job: "Before a job is called finished, run every check the project has. If any fail, either fix the cause or report exactly which checks failed and why. Never describe a job as done with a failing check.",
        care: "careful",
        stopAndAsk: ["When a check fails for a reason outside the job you were given"],
        rules: [{ text: "A job with a failing check is not finished; it is 'testing' at most.", evidence: { kind: "checks", taskIds: failing.map((t) => t.id), text: `${plural(failing.length, "task")} were called finished with failures.` } }],
      },
    });
  }

  // 4. Sensitive: parts the risk badge treats as sensitive that agents changed.
  for (const area of areas.filter((a) => a.sensitive)) {
    const touched = tasks.filter((t) => t.areas.some((x) => x.id === area.id && x.changed.length > 0));
    if (touched.length === 0) continue;
    out.push({
      id: `sensitive:${area.id}`,
      kind: "sensitive",
      name: `${area.name} guard`,
      summary: `Keeps agents out of ${area.name} unless you have said yes first.`,
      evidence: { kind: "sensitive", taskIds: touched.map((t) => t.id), text: `Agents changed files in ${area.name} in ${plural(touched.length, "task")}.` },
      brief: {
        ...emptyBrief(),
        job: `Do the job you are given, but treat ${area.name} as off limits: read it if you must, never change it without the owner's say-so. If the job needs a change there, stop and explain exactly what and why.`,
        mustNotTouch: [area.id],
        stopAndAsk: [`Before changing anything in ${area.name}`],
        care: "careful",
      },
    });
  }

  // 5. Handoffs: work carried from one tool to another.
  const handed = tasks.filter((t) => t.continuedFrom);
  if (handed.length > 0) {
    const pairs = handed.map((t) => `${TOOL_WORD[t.continuedFrom!.tool] ?? t.continuedFrom!.tool} to ${TOOL_WORD[t.tool] ?? t.tool}`);
    out.push({
      id: "handoff:all",
      kind: "handoff",
      name: "Handover notes",
      summary: "Leaves a short plain-English note of where it got to, so the next tool can carry on without a restart.",
      evidence: { kind: "handoff", taskIds: handed.map((t) => t.id), text: `${plural(handed.length, "task")} carried on in a different tool (${[...new Set(pairs)].join("; ")}).` },
      brief: {
        ...emptyBrief(),
        job: "Whenever you stop for any reason (finished, out of usage, or asked to), write a short handover in plain English: what the job was, what is done, what is not, which checks passed, and the one next step. Put it where the next agent will read it first.",
        care: "balanced",
        rules: [{ text: "The next agent may be a different tool. Write for someone who has not seen this conversation.", evidence: { kind: "handoff", taskIds: handed.map((t) => t.id), text: `${plural(handed.length, "handover")} so far.` } }],
      },
    });
  }

  // 6. Busy: the part of the app with the most finished tasks.
  const counts = new Map<string, TaskView[]>();
  for (const t of finished) {
    const a = mainArea(t);
    if (a) counts.set(a.id, [...(counts.get(a.id) ?? []), t]);
  }
  const busiest = [...counts.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (busiest && busiest[1].length >= 3 && byId.get(busiest[0])) {
    const area = byId.get(busiest[0])!;
    out.push({
      id: `busy:${area.id}`,
      kind: "busy",
      name: `${area.name} specialist`,
      summary: `Knows ${area.name} well and keeps its changes inside it.`,
      evidence: { kind: "busy", taskIds: busiest[1].map((t) => t.id), text: `${plural(busiest[1].length, "finished task")} mostly changed ${area.name}, more than any other part.` },
      brief: {
        ...emptyBrief(),
        job: `Take on jobs in ${area.name}. ${area.description ? `${area.description.trim().replace(/\.$/, "")}. ` : ""}Keep changes inside it, and say so when a job would need to reach outside.`,
        mayTouch: [area.id],
        mustNotTouch: areas.filter((a) => a.sensitive && a.id !== area.id).map((a) => a.id),
        stopAndAsk: stopAndAskFor(areas.filter((a) => a.id !== area.id)),
        care: "balanced",
      },
    });
  }

  // Starters when the record has nothing to say yet.
  if (out.length === 0) {
    out.push(
      {
        id: "starter:checker",
        kind: "owner",
        name: "Checker",
        summary: "Runs the checks properly before anything is called finished.",
        evidence: { kind: "owner", taskIds: [], text: "A starter, not from your record: the Room has not seen enough yet." },
        brief: { ...emptyBrief(), job: "Before any work is called finished, run the project's checks and read what failed properly. If the same error appears a second time, stop and ask rather than trying a third way.", care: "careful", stopAndAsk: ["When the same check fails twice"] },
        starter: true,
      },
      {
        id: "starter:guard",
        kind: "owner",
        name: "Guard",
        summary: "Keeps agents out of the parts of your app you would rather they asked about first.",
        evidence: { kind: "owner", taskIds: [], text: "A starter, not from your record: the sensitive parts are named from folder names." },
        brief: { ...emptyBrief(), job: "Do the job you are given, but never change the parts marked off limits without asking first.", mustNotTouch: areas.filter((a) => a.sensitive).map((a) => a.id), stopAndAsk: stopAndAskFor(areas), care: "careful" },
        starter: true,
      },
    );
  }

  // Match what the owner has already grown.
  for (const s of out) {
    const h = existing.find((e) => e.grownFrom === s.id);
    if (h) s.grownAs = { id: h.id, name: h.name };
  }
  const order: Record<HelperEvidence["kind"], number> = { stuck: 0, asked: 1, sensitive: 2, checks: 3, handoff: 4, busy: 5, owner: 6 };
  return out.sort((a, b) => order[a.kind] - order[b.kind] || b.evidence.taskIds.length - a.evidence.taskIds.length);
}
