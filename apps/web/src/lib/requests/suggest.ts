/**
 * Ready-made lines for the Room's chat (Phase 8): what the owner could ask an agent for next,
 * computed from the record and nothing else. Every line rests on a fact a task row already holds
 * (it got stuck, its checks failed, it asked a question, it ran out of usage, it finished, no
 * checks were run, a helper is in place) and says which (`because`, rule 3). The words are fixed
 * templates over those facts, never generated, and the owner can change them before sending.
 *
 * Pure. Both the page and the Glasshouse agent's "what next" answer use it.
 */
import type { AgentTool } from "@glasshouse/schema";
import type { RequestTool, RequestView, RoomHelper, RoomState, SessionView, TaskView } from "../store/types";

export type SuggestionKind = "stuck" | "checks" | "decision" | "limit" | "review" | "carry-on" | "no-checks" | "helper" | "glasshouse";

export interface RequestSuggestion {
  /** Stable within a project, so a sent request can say which line it came from. */
  id: string;
  kind: SuggestionKind;
  /** The chip. */
  label: string;
  /** The words that go in the box, exactly. */
  text: string;
  tool: RequestTool;
  /** The task the line was computed from. */
  taskId?: string;
  /** That task's headline, so two chips with the same label can be told apart. */
  headline?: string;
  /** Send it to this agent rather than starting a new one, when that can be done. */
  session?: { id: string; externalId: string; tool: AgentTool; live: boolean };
  /** The fact underneath, one line. */
  because: string;
}

const TOOL: Record<AgentTool, string> = { "claude-code": "Claude Code", codex: "Codex", cursor: "Cursor", watcher: "the folder watcher" };
const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

const clip = (s: string, n: number) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n - 1).replace(/[\s.,;:]+$/, "") + "…" : one;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The parts a task changed, in the owner's words, or a fallback. */
function partsOf(t: TaskView): string {
  const names = t.report ? t.report.touched.map((a) => a.name) : t.areas.filter((a) => a.changed.length > 0).map((a) => a.name);
  return names.length > 0 ? names.join(", ") : "the part of the app it was working in";
}

function failedChecks(t: TaskView): number {
  return t.report?.evidence.tests.failed ?? t.lastTests?.failed ?? 0;
}

function checksRan(t: TaskView): boolean {
  if (t.report) return t.report.evidence.tests.ran;
  return Boolean(t.lastTests);
}

function isLive(s: SessionView, nowMs: number): boolean {
  if (s.endedAt) return false;
  return nowMs - new Date(s.lastEventAt ?? s.startedAt).getTime() < ACTIVE_WINDOW_MS;
}

/** The three questions Glasshouse can always answer on its own, from the record. */
export const GLASSHOUSE_QUESTIONS: RequestSuggestion[] = [
  { id: "glasshouse:summary", kind: "glasshouse", label: "Where are we?", text: "Where are we?", tool: "glasshouse", because: "Answered from the record: what is running, waiting, stuck and finished." },
  { id: "glasshouse:next", kind: "glasshouse", label: "What next?", text: "What should we do next?", tool: "glasshouse", because: "Answered from the record: the moments below that are worth acting on." },
  { id: "glasshouse:agents", kind: "glasshouse", label: "How is each agent doing?", text: "How is each agent getting on?", tool: "glasshouse", because: "Answered from the record: one line per agent." },
];

/** Lines for one task, most urgent first. A watcher task, or a task that never started, offers nothing. */
export function suggestForSession(s: SessionView, nowMs: number, helpers: readonly RoomHelper[] = []): RequestSuggestion[] {
  const t = s.task;
  if (!t || t.tool === "watcher") return [];
  const live = isLive(s, nowMs);
  const session = { id: s.id, externalId: s.externalId, tool: s.tool, live };
  const who = TOOL[t.tool];
  const tool: RequestTool = t.tool;
  const out: RequestSuggestion[] = [];
  const headline = clip(t.report?.headline ?? t.headline, 90);
  const base = { taskId: t.id, session, headline };

  if (t.stage === "stuck" && !t.endedAt) {
    const reason = t.stuckReason ? ` (${clip(t.stuckReason, 100)})` : "";
    out.push({
      ...base,
      id: `stuck:${t.id}`,
      kind: "stuck",
      label: "Unstick it",
      tool,
      text: `You look stuck${reason}. Stop retrying. Tell me in plain words what you have tried and what you think is wrong, then fix the cause rather than the symptom, and run the checks before you say it is done.`,
      because: t.stuckReason ? `Detected from the record: ${t.stuckReason}.` : "Detected from the record: the same error came back, or nothing has happened for minutes.",
    });
  }

  const failed = failedChecks(t);
  if (failed > 0) {
    out.push({
      ...base,
      id: `checks:${t.id}`,
      kind: "checks",
      label: "Fix the failing checks",
      tool,
      text: `${plural(failed, "check")} failed after the work on ${partsOf(t)}. Make ${failed === 1 ? "it" : "them"} pass without changing what the work was for, then tell me in plain words what was wrong.`,
      because: `${plural(failed, "check")} failed the last time this task ran them.`,
    });
  }

  const need = t.report?.needsYou;
  if (t.endedAt && (need === "decision" || need === "blocked") && t.endReason !== "usage_limit") {
    const q = t.report?.needsYouDetail ? clip(t.report.needsYouDetail, 160) : undefined;
    out.push({
      ...base,
      id: `decision:${t.id}`,
      kind: "decision",
      label: "Answer its question",
      tool,
      text: q ? `About your question “${q}”: my answer is ` : `About the question you asked when you stopped: my answer is `,
      because: q ? `${who} asked: “${q}”` : `${who} stopped and needs a decision from you.`,
    });
  }

  if (t.endedAt && t.endReason === "usage_limit") {
    const other: RequestTool = t.tool === "claude-code" ? "codex" : "claude-code";
    out.push({
      id: `limit:${t.id}`,
      taskId: t.id,
      headline,
      kind: "limit",
      label: `Pick it up with ${TOOL[other]}`,
      tool: other,
      text: `${who} ran out of usage while working on “${headline}”. It had touched ${partsOf(t)}. Pick up where it left off: check what is done, finish what is not, and run the checks before you say it is done.`,
      because: t.usageLimitConfirmed ? `${who} stopped because it ran out of usage.` : `${who} stopped, possibly because it ran out of usage.`,
    });
  }

  if (t.endedAt && need === "review" && failed === 0) {
    out.push({
      ...base,
      id: `review:${t.id}`,
      kind: "review",
      label: "Check it over",
      tool,
      text: `Go back over the work you finished on ${partsOf(t)} (“${headline}”). Read it again, run the checks, and tell me in plain words anything you would change and why.`,
      because: t.report?.needsYouDetail ? `The report card says: ${clip(t.report.needsYouDetail, 120)}` : "The report card recommends a review.",
    });
  }

  if (t.endedAt && t.endReason !== "usage_limit" && failed === 0 && !checksRan(t) && t.changedPaths.length > 0) {
    out.push({
      ...base,
      id: `no-checks:${t.id}`,
      kind: "no-checks",
      label: "Write checks for it",
      tool,
      text: `Write checks for what you just built in ${partsOf(t)} (“${headline}”), run them, and tell me which passed and which did not.`,
      because: `No checks were run during this task, and it changed ${plural(t.changedPaths.length, "file")}.`,
    });
  }

  if (t.endedAt && t.endReason !== "usage_limit" && failed === 0 && !(need === "decision" || need === "blocked")) {
    out.push({
      ...base,
      id: `carry-on:${t.id}`,
      kind: "carry-on",
      label: "Carry on from here",
      tool,
      text: `Carry on from “${headline}”. Check what is done, finish anything left undone, and run the checks before you say it is done.`,
      because: `${who} finished this task${t.endedAt ? "" : ""}.`,
    });
  }

  if (live && out.length === 0) {
    out.push({
      ...base,
      id: `explain:${t.id}`,
      kind: "carry-on",
      label: "Explain so far",
      tool,
      text: "Before you go on: tell me in plain words what you have changed so far and what is left to do.",
      because: `${who} is working right now.`,
    });
  }

  // Helpers placed in the project: Claude Code takes them by name in the instruction.
  if (t.tool === "claude-code") {
    for (const h of helpers.filter((x) => x.placedAt && x.tools.includes("claude-code")).slice(0, 2)) {
      out.push({
        ...base,
        id: `helper:${h.id}:${t.id}`,
        kind: "helper",
        label: `Run ${h.name}`,
        tool,
        text: `Use the ${h.slug} helper on ${t.endedAt ? `the work just finished on ${partsOf(t)}` : "what you are doing now"}: ${h.job}`,
        because: `${h.name} is in your project (placed ${h.placedAt!.slice(0, 10)}).`,
      });
    }
  }
  return out;
}

const URGENCY: Record<SuggestionKind, number> = { stuck: 0, checks: 1, decision: 2, limit: 3, review: 4, "carry-on": 5, "no-checks": 6, helper: 7, glasshouse: 8 };

/**
 * The lines for the whole Room: live agents first, then what finished today, most urgent first,
 * capped. With a focus (the owner tapped an agent) only that agent's lines are offered.
 */
export function suggestRequests(room: Pick<RoomState, "sessions" | "helpers">, nowMs: number, focus?: { sessionId?: string; taskId?: string }, limit = 4): RequestSuggestion[] {
  const helpers = room.helpers ?? [];
  const sessions = focus ? room.sessions.filter((s) => s.id === focus.sessionId || (focus.taskId && s.task?.id === focus.taskId)) : room.sessions;
  const today = new Date(nowMs);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const all = sessions
    .filter((s) => focus || isLive(s, nowMs) || new Date(s.task?.endedAt ?? s.lastEventAt ?? s.startedAt).getTime() >= startOfToday)
    .flatMap((s) => suggestForSession(s, nowMs, helpers));
  all.sort((a, b) => URGENCY[a.kind] - URGENCY[b.kind]);
  // One line per kind per task is already the case; keep one per task at the top so four agents get a chip each.
  const seen = new Set<string>();
  const first = all.filter((s) => {
    const key = s.taskId ?? s.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const rest = all.filter((s) => !first.includes(s));
  const chosen = [...first, ...rest].slice(0, limit);
  // Two chips with the same words (two finished tasks, say) each name their task.
  const labels = new Map<string, number>();
  for (const s of chosen) labels.set(s.label, (labels.get(s.label) ?? 0) + 1);
  return chosen.map((s) => ((labels.get(s.label) ?? 0) > 1 && s.headline ? { ...s, label: `${s.label}: “${clip(s.headline, 26)}”` } : s));
}

/**
 * Can words be sent to this agent from the Room? Yes when the Room started it (its process is
 * ours) or when it has ended (the tool can pick its session up again). An agent working in its
 * own window is out of reach: the owner copies the words for it instead.
 */
export function followUpFor(s: SessionView, requests: readonly RequestView[], nowMs: number): { ok: true; live: boolean } | { ok: false; reason: string } {
  const live = isLive(s, nowMs);
  if (!live) return { ok: true, live: false };
  const ours = requests.some((r) => r.sessionId === s.id && (r.status === "running" || r.status === "taken"));
  if (ours) return { ok: true, live: true };
  return { ok: false, reason: `${TOOL[s.tool]} is working in its own window, so words from here cannot reach it. Copy them and paste them there.` };
}
