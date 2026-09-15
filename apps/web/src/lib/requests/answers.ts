/**
 * What Glasshouse says when it is asked (Phase 8): the three questions it can answer on its own,
 * every word computed from the Room state. "Where are we?" is what is running, waiting, stuck and
 * finished; "What next?" is the ready-made lines with the facts behind them; "How is each agent
 * doing?" is one line per agent. Nothing here is generated; a question these do not cover goes
 * to the AI with the same facts (lib/ai/room-ask.ts), and without a key says so.
 *
 * Pure. Stages, never percentages (rule 1).
 */
import type { AgentTool } from "@glasshouse/schema";
import type { RoomState, SessionView, TaskView } from "../store/types";
import { openQuestions } from "./story";
import { suggestRequests } from "./suggest";

export type Intent = "summary" | "next" | "agents" | "other";

const TOOL: Record<AgentTool, string> = { "claude-code": "Claude Code", codex: "Codex", cursor: "Cursor", watcher: "The folder watcher" };
const STAGE: Record<TaskView["stage"], string> = { investigating: "looking around", planning: "planning", building: "building", testing: "testing", done: "done", stuck: "stuck", waiting: "waiting for you" };
const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

const clip = (s: string, n: number) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n - 1).replace(/[\s.,;:]+$/, "") + "…" : one;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

export function ago(iso: string | undefined, nowMs: number): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${plural(h, "hour")} ago`;
  return `${plural(Math.round(h / 24), "day")} ago`;
}

/** Which of the three set questions this is, if any. Word matching on the owner's own text; anything else is "other". */
export function intentOf(question: string): Intent {
  const s = question.toLowerCase().replace(/[^\w\s'?]/g, " ").replace(/\s+/g, " ").trim();
  if (/\b(what('s| is| should (we|i) do| do (we|i) do)? next|next steps?|what now|what should (we|i)|priorit(y|ies)|worth doing)\b/.test(s)) return "next";
  if (/\b(each agent|every agent|all (the |of the )?agents|agents? (doing|getting on|up to)|how (is|are) (the )?(agents?|claude|codex|cursor))\b/.test(s)) return "agents";
  if (/\b(where are we|where we are|summary|summarise|summarize|overview|progress|status|what('s| is) (happening|going on)|how('s| is) it going|catch me up|update me|so far)\b/.test(s)) return "summary";
  return "other";
}

function isLive(s: SessionView, nowMs: number): boolean {
  if (s.endedAt || !s.task || s.tool === "watcher") return false;
  return nowMs - new Date(s.lastEventAt ?? s.startedAt).getTime() < ACTIVE_WINDOW_MS;
}

function isToday(iso: string | undefined, nowMs: number): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date(nowMs);
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function checksWords(t: TaskView): string | undefined {
  const ev = t.report?.evidence.tests;
  const passed = ev ? ev.passed : t.lastTests?.passed;
  const failed = ev ? ev.failed : t.lastTests?.failed;
  if (ev ? !ev.ran : !t.lastTests) return undefined;
  if (failed) return `${failed} of ${(passed ?? 0) + failed} checks failed`;
  return `all ${passed ?? 0} checks passed`;
}

function partsWords(t: TaskView): string | undefined {
  const names = t.report ? t.report.touched.map((a) => a.name) : t.areas.filter((a) => a.changed.length > 0).map((a) => a.name);
  return names.length > 0 ? list(names) : undefined;
}

function liveLine(s: SessionView, nowMs: number): string {
  const t = s.task!;
  const where = t.location ? ` in ${t.location}` : "";
  const last = s.recentEvents[0];
  const doing = t.stage === "waiting" ? "is waiting for you" : t.stage === "stuck" ? `looks stuck${t.stuckReason ? ` (${clip(t.stuckReason, 80)})` : ""}` : `is ${STAGE[t.stage]}${where}`;
  return `${TOOL[s.tool]} ${doing}: “${clip(t.headline, 90)}”${last ? `, last seen ${ago(last.ts, nowMs)}` : ""}.`;
}

function finishedLine(s: SessionView, nowMs: number): string {
  const t = s.task!;
  const facts = [partsWords(t), checksWords(t)].filter(Boolean).join("; ");
  const need = t.report?.needsYou && t.report.needsYou !== "nothing" ? (t.report.needsYou === "review" ? "review recommended" : t.report.needsYou === "decision" ? "a decision is needed" : "blocked") : undefined;
  const ended = t.endReason === "usage_limit" ? "stopped, out of usage," : "finished";
  return `${TOOL[s.tool]} ${ended} “${clip(t.report?.headline ?? t.headline, 90)}” ${ago(t.endedAt, nowMs)}${facts ? ` (${facts})` : ""}${need ? `. ${need.charAt(0).toUpperCase()}${need.slice(1)}` : ""}.`;
}

/** "Where are we?": what is running, waiting, stuck, asking, finished today, and needing the owner. */
export function summaryAnswer(room: Pick<RoomState, "sessions" | "requests" | "progress">, nowMs: number): string {
  const live = room.sessions.filter((s) => isLive(s, nowMs));
  const finishedToday = room.sessions.filter((s) => s.task && s.tool !== "watcher" && !isLive(s, nowMs) && s.task.endedAt && isToday(s.task.endedAt, nowMs));
  const out: string[] = [];

  if (live.length === 0) out.push("Nothing is running right now.");
  else out.push(`${plural(live.length, "agent is", "agents are")} working. ${live.map((s) => liveLine(s, nowMs)).join(" ")}`);

  const asking = (room.requests ?? []).flatMap((r) => openQuestions(r).map((q) => `${TOOL[r.tool === "glasshouse" ? "claude-code" : r.tool]} ${q.plain.charAt(0).toLowerCase()}${q.plain.slice(1)}`));
  if (asking.length > 0) out.push(`Waiting on your answer: ${asking.join("; ")}.`);

  if (finishedToday.length > 0) out.push(`Finished today: ${plural(finishedToday.length, "task")}. ${finishedToday.slice(0, 4).map((s) => finishedLine(s, nowMs)).join(" ")}${finishedToday.length > 4 ? ` And ${finishedToday.length - 4} more.` : ""}`);

  const needs = room.sessions.map((s) => s.task).filter((t): t is TaskView => Boolean(t && t.report && t.report.needsYou !== "nothing" && !t.report.resolvedAt));
  const decisions = needs.filter((t) => t.report!.needsYou === "decision" || t.report!.needsYou === "blocked");
  const reviews = needs.filter((t) => t.report!.needsYou === "review");
  if (decisions.length > 0 || reviews.length > 0) {
    const parts: string[] = [];
    if (decisions.length > 0) parts.push(`${plural(decisions.length, "decision")} (${decisions.slice(0, 2).map((t) => `“${clip(t.report!.needsYouDetail ?? t.report!.headline, 90)}”`).join("; ")})`);
    if (reviews.length > 0) parts.push(`${plural(reviews.length, "review")} (${reviews.slice(0, 2).map((t) => `“${clip(t.report!.headline, 70)}”`).join("; ")})`);
    out.push(`Needs you: ${parts.join(" and ")}.`);
  }

  const touched = room.progress.filter((p) => p.lastTouchedAt).sort((a, b) => (b.lastTouchedAt ?? "").localeCompare(a.lastTouchedAt ?? ""));
  if (touched.length > 0) out.push(`This week the agents touched ${list(touched.slice(0, 5).map((p) => p.name))}${touched.length > 5 ? ` and ${touched.length - 5} more parts` : ""}.`);

  if (live.length === 0 && finishedToday.length === 0) {
    const last = [...room.sessions].filter((s) => s.tool !== "watcher").sort((a, b) => (b.lastEventAt ?? b.startedAt).localeCompare(a.lastEventAt ?? a.startedAt))[0];
    if (last?.task) out.push(`The last thing that happened was ${ago(last.lastEventAt ?? last.startedAt, nowMs)}: ${TOOL[last.tool]} on “${clip(last.task.report?.headline ?? last.task.headline, 90)}”.`);
    else out.push("Nothing has happened yet. Start an agent, or name one here and say what you want.");
  }
  return out.join(" ");
}

/** "What next?": the ready-made lines, with the fact behind each. Never invented: with nothing to act on, it says so. */
export function nextAnswer(room: Pick<RoomState, "sessions" | "helpers">, nowMs: number): string {
  const lines = suggestRequests(room, nowMs, undefined, 3);
  if (lines.length === 0) {
    return "Nothing in the record is asking for action: nothing is stuck, no checks are failing and nothing is waiting on you. The next thing is whatever you want built. Name a tool here and say it in your own words.";
  }
  const numbered = lines.map((s, i) => `${i + 1}. ${s.label}: ${s.because}`);
  return `From the record, ${lines.length === 1 ? "one thing is" : `${lines.length} things are`} worth doing next. ${numbered.join(" ")} Tap one of the lines under the box to send it, or change the words first.`;
}

/** "How is each agent doing?": one line per agent, live ones first, then today's finished ones. */
export function agentsAnswer(room: Pick<RoomState, "sessions">, nowMs: number): string {
  const live = room.sessions.filter((s) => isLive(s, nowMs));
  const finishedToday = room.sessions.filter((s) => s.task && s.tool !== "watcher" && !isLive(s, nowMs) && s.task.endedAt && isToday(s.task.endedAt, nowMs));
  if (live.length === 0 && finishedToday.length === 0) return "No agent has run today. When one starts, its line will be here.";
  return [...live.map((s) => liveLine(s, nowMs)), ...finishedToday.map((s) => finishedLine(s, nowMs))].join(" ");
}

export function templateAnswer(room: Pick<RoomState, "sessions" | "requests" | "progress" | "helpers">, intent: Exclude<Intent, "other">, nowMs: number): string {
  switch (intent) {
    case "summary":
      return summaryAnswer(room, nowMs);
    case "next":
      return nextAnswer(room, nowMs);
    case "agents":
      return agentsAnswer(room, nowMs);
  }
}
