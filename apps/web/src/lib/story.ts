/**
 * The Room's running story (Phase 5): one message per meaning change, written from the record.
 * Pure. Every line is a template over facts the task row already holds; nothing here guesses.
 * The AI never writes these (yet): when narration by AI arrives it may only reword a message
 * whose facts are listed here, never add one.
 *
 * Messages, per task:
 *   started   the instruction, or where the agent began
 *   handoff   a task that carried on from another tool
 *   waiting   the agent needs the owner (the one thing allowed to light up)
 *   stuck     detected, never declared: the same error three times, or silence
 *   finished  the report card's headline plus its verified facts
 *   limit     the agent ran out of usage
 */
import type { AgentTool } from "@glasshouse/schema";
import type { StoryMessage, TaskView } from "./store/types";

const TOOL: Record<AgentTool, string> = { "claude-code": "Claude Code", codex: "Codex", cursor: "Cursor", watcher: "The folder watcher" };

const clip = (s: string, n: number) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n - 1).replace(/[\s.,;:]+$/, "") + "…" : one;
};

function checksLine(t: TaskView): string | undefined {
  const ev = t.report?.evidence.tests;
  if (ev) {
    if (!ev.ran) return undefined;
    if (ev.failed) return `${ev.failed} of ${(ev.passed ?? 0) + ev.failed} checks failed`;
    return `All ${ev.passed ?? 0} checks passed`;
  }
  if (!t.lastTests) return undefined;
  if (t.lastTests.failed) return `${t.lastTests.failed} of ${(t.lastTests.passed ?? 0) + t.lastTests.failed} checks failed`;
  return `All ${t.lastTests.passed ?? 0} checks passed`;
}

/** What the owner might paste into the agent. Offered, never sent (rule 4). */
function suggestedReply(t: TaskView): string | undefined {
  if (t.stage === "stuck") return "You have hit the same problem several times. Stop, tell me what you have tried and what you think is wrong, and wait for me before changing anything else.";
  const failed = t.report?.evidence.tests.failed ?? t.lastTests?.failed ?? 0;
  if (failed > 0) return `${failed} check${failed === 1 ? "" : "s"} failed. Fix ${failed === 1 ? "it" : "them"} before doing anything else, then tell me in plain words what was wrong.`;
  return undefined;
}

function touchedNames(t: TaskView): string[] {
  return t.report ? t.report.touched.map((a) => a.name) : t.areas.filter((a) => a.changed.length > 0).map((a) => a.name);
}

export function storyForTask(t: TaskView): StoryMessage[] {
  if (t.tool === "watcher") return [];
  const who = TOOL[t.tool];
  const out: StoryMessage[] = [];
  const base = { taskId: t.id, tool: t.tool };

  if (t.continuedFrom) {
    const from = t.continuedFrom;
    const what = from.headline ?? (from.prompt ? `“${clip(from.prompt, 120)}”` : "the earlier task");
    out.push({ ...base, id: `${t.id}:handoff`, at: t.startedAt, kind: "handoff", text: `${who} picked up where ${TOOL[from.tool]} left off: ${what}` });
  } else {
    const text = t.prompt ? `${who} started on: “${clip(t.prompt, 160)}”` : t.location ? `${who} started looking at ${t.location}.` : `${who} started a task.`;
    out.push({ ...base, id: `${t.id}:started`, at: t.startedAt, kind: "started", text });
  }

  const at = t.lastEventAt ?? t.startedAt;
  if (!t.endedAt && t.stage === "waiting") {
    // The template headline for a waiting task is the bare "Waiting for you"; say who, and where.
    const bare = /^waiting for you\.?$/i.test(t.headline.trim());
    const text = bare ? `${who} is waiting for you in its own window${t.location ? `, in ${t.location}` : ""}.` : /^waiting/i.test(t.headline) ? `${who}: ${t.headline}` : `${who} is waiting for you. ${t.headline}`;
    out.push({ ...base, id: `${t.id}:waiting`, at, kind: "waiting", text, needsYou: "blocked" });
  }
  if (!t.endedAt && t.stage === "stuck") {
    out.push({ ...base, id: `${t.id}:stuck`, at, kind: "stuck", text: `${who} looks stuck${t.stuckReason ? `: ${t.stuckReason}` : ""}.`, suggestedReply: suggestedReply(t) });
  }

  if (t.endedAt) {
    const r = t.report;
    if (t.endReason === "usage_limit") {
      out.push({
        ...base,
        id: `${t.id}:limit`,
        at: t.endedAt,
        kind: "limit",
        text: t.usageLimitConfirmed ? `${who} stopped: it ran out of usage.` : `${who} stopped, possibly because it ran out of usage.`,
        touched: touchedNames(t),
        notTouched: r?.notTouched ?? t.notTouched,
        risk: t.risk.level,
        needsYou: r?.needsYou,
        needsYouDetail: r?.needsYouDetail,
      });
    } else {
      const carried = t.continuedBy ? ` ${TOOL[t.continuedBy.tool]} carried on from here.` : "";
      const headline = (r?.headline ?? t.headline).trim();
      const said = new RegExp(`^${who}\\b`, "i").test(headline) ? headline : `${who} finished: ${headline}`;
      out.push({
        ...base,
        id: `${t.id}:finished`,
        at: t.endedAt,
        kind: "finished",
        text: `${said}${carried}`,
        touched: touchedNames(t),
        notTouched: r?.notTouched ?? t.notTouched,
        risk: t.risk.level,
        needsYou: r?.needsYou,
        needsYouDetail: r?.needsYouDetail,
        checks: checksLine(t),
        suggestedReply: suggestedReply(t),
      });
    }
  }
  return out;
}

/** The whole story over a set of tasks, oldest first, capped to the most recent `limit` lines. */
export function storyFrom(tasks: readonly TaskView[], limit = 80): StoryMessage[] {
  const all = tasks.flatMap(storyForTask).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  return all.length > limit ? all.slice(all.length - limit) : all;
}
