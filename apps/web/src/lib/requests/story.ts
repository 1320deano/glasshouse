/**
 * What the Room says under the owner's own message (Phase 8): one line per stage of a request,
 * from the stored status and nothing else. Stages, never a percentage (rule 1); every line is a
 * fact the record holds (rule 2). Pure.
 */
import type { RequestQuestion, RequestTool, RequestView } from "../store/types";

export const REQUEST_TOOL_NAMES: Record<RequestTool, string> = { "claude-code": "Claude Code", codex: "Codex", cursor: "Cursor", glasshouse: "Glasshouse" };

/** The connector asks again at least this often while it listens; older than this and it is not listening. */
export const LISTENING_FRESH_MS = 45 * 1000;

/** Is the owner's connector asking for requests right now? */
export function isListening(listeningAt: string | undefined, nowMs: number): boolean {
  return Boolean(listeningAt) && nowMs - new Date(listeningAt!).getTime() < LISTENING_FRESH_MS;
}

export interface RequestLine {
  /** The pill on the owner's message. */
  badge: string;
  tone: "neutral" | "info" | "attention" | "critical" | "positive";
  /** The line underneath, when there is something to say. */
  text?: string;
  /** Words the owner can copy to fix it themselves (a command to run). */
  command?: string;
}

const WATCH = "glasshouse watch";

export function requestLine(r: RequestView, opts: { listening: boolean }): RequestLine {
  const who = REQUEST_TOOL_NAMES[r.tool];
  switch (r.status) {
    case "answered":
      return { badge: "Answered", tone: "neutral" };
    case "queued":
      return opts.listening
        ? { badge: "Sent", tone: "info", text: "Sent to your computer. Waiting for it to be picked up." }
        : { badge: "Not picked up", tone: "attention", text: `Your computer is not listening. In the project folder, run the command below and this will be picked up.`, command: WATCH };
    case "taken":
      return { badge: "Starting", tone: "info", text: `Your computer is starting ${who}.` };
    case "running":
      return { badge: "Started", tone: "positive", text: r.sessionId ? `${who} is on it.` : `${who} has started; its first action will show here in a moment.` };
    case "finished":
      return { badge: "Finished", tone: "positive" };
    case "failed":
      return { badge: r.result?.command ? "Failed" : "Could not start", tone: "critical", text: r.result?.reason ?? `${who} could not do it.` };
    case "expired":
      return { badge: "Not run", tone: "critical", text: "Nobody was listening on your computer in time, so it was never started. Run the command below in the project folder and send it again.", command: WATCH };
    case "withdrawn":
      return { badge: "Taken back", tone: "neutral", text: "You took this back before it was picked up." };
  }
}

/** Questions the run is still waiting on: the one thing allowed to light up. */
export function openQuestions(r: Pick<RequestView, "questions" | "status">): Array<RequestQuestion & { plain: string }> {
  if (r.status !== "running" && r.status !== "taken") return [];
  return r.questions.filter((q) => !q.answer);
}

/** How the owner's message is headed: "To Claude Code", "To Claude Code (follow-up)", "To Glasshouse". */
export function addressLine(r: Pick<RequestView, "tool" | "continues" | "origin">): string {
  const who = REQUEST_TOOL_NAMES[r.tool];
  if (r.tool === "glasshouse") return `To ${who}`;
  return r.continues ? `To ${who} (follow-up)` : `To ${who} (new)`;
}
