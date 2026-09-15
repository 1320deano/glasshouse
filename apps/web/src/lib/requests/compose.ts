/**
 * The chat's address book (Phase 8): who a message can be for, how "@" finds them, and the words
 * around the box. Pure, so the page's behaviour can be tested without a browser.
 *
 * A message is for one of: Glasshouse (a question, answered from the record), an agent already
 * in the Room (a follow-up), or a new agent of one of the three tools. Nothing is sent to an
 * agent unless the owner named it: with no name, the words are a question to Glasshouse.
 */
import type { AgentTool } from "@glasshouse/schema";
import type { RequestCare, RequestTool, RequestView, RoomState, SessionView } from "../store/types";
import { ago } from "./answers";
import { followUpFor } from "./suggest";

export type StartableTool = Exclude<RequestTool, "glasshouse">;

export type Target =
  | { kind: "glasshouse"; taskId?: string; label?: string }
  | { kind: "new"; tool: StartableTool }
  | { kind: "session"; sessionId: string; tool: StartableTool; label: string; live: boolean; taskId?: string; reachable: boolean; reason?: string };

export interface MentionOption {
  id: string;
  label: string;
  hint: string;
  tool?: AgentTool;
  target: Target;
}

export const TOOL_WORDS: Record<StartableTool, string> = { "claude-code": "Claude Code", codex: "Codex", cursor: "Cursor" };
export const STARTABLE: StartableTool[] = ["claude-code", "codex", "cursor"];
const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

const clip = (s: string, n: number) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n - 1).replace(/[\s.,;:]+$/, "") + "…" : one;
};

function isLive(s: SessionView, nowMs: number): boolean {
  if (s.endedAt) return false;
  return nowMs - new Date(s.lastEventAt ?? s.startedAt).getTime() < ACTIVE_WINDOW_MS;
}

/** The target for an agent already in the Room, with whether words from here can reach it. */
export function targetForSession(s: SessionView, requests: readonly RequestView[], nowMs: number): Target | null {
  if (s.tool === "watcher") return null;
  const live = isLive(s, nowMs);
  const reach = followUpFor(s, requests, nowMs);
  const headline = s.task ? clip(s.task.report?.headline ?? s.task.headline, 48) : "starting";
  return { kind: "session", sessionId: s.id, tool: s.tool, label: `${TOOL_WORDS[s.tool]} · ${headline}`, live, taskId: s.task?.id, reachable: reach.ok, reason: reach.ok ? undefined : reach.reason };
}

/** Everyone "@" can find, in the order they are offered: Glasshouse, live agents, today's finished agents, a new agent per tool. */
export function mentionOptions(room: Pick<RoomState, "sessions" | "requests">, nowMs: number): MentionOption[] {
  const requests = room.requests ?? [];
  const out: MentionOption[] = [{ id: "glasshouse", label: "Glasshouse", hint: "Ask about the project. Answered from the record.", target: { kind: "glasshouse" } }];
  const sessions = room.sessions.filter((s) => s.tool !== "watcher" && s.task).sort((a, b) => (b.lastEventAt ?? b.startedAt).localeCompare(a.lastEventAt ?? a.startedAt));
  const today = new Date(nowMs);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  for (const s of sessions) {
    const target = targetForSession(s, requests, nowMs);
    if (!target || target.kind !== "session") continue;
    const when = new Date(s.task?.endedAt ?? s.lastEventAt ?? s.startedAt).getTime();
    if (!target.live && when < startOfToday) continue;
    const hint = target.live ? (target.reachable ? "Working now. Your words reach it when its current step ends." : "Working in its own window. Words from here cannot reach it; they are copied for you to paste.") : `Finished ${ago(s.task?.endedAt ?? s.lastEventAt ?? s.startedAt, nowMs)}. Picks up where it left off, with what it did still in mind.`;
    out.push({ id: `session:${s.id}`, label: target.label, hint, tool: s.tool, target });
  }
  for (const tool of STARTABLE) out.push({ id: `new:${tool}`, label: `New ${TOOL_WORDS[tool]}`, hint: "Starts a fresh agent on your computer, in this project's folder.", tool, target: { kind: "new", tool } });
  return out;
}

/** The "@name" being typed at the caret, if any: "@" at the start or after a space, then up to 40 characters on one line. */
export function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before.charAt(at - 1))) return null;
  const query = before.slice(at + 1);
  if (query.length > 40 || /\n/.test(query)) return null;
  return { start: at, query };
}

export function filterOptions(options: readonly MentionOption[], query: string): MentionOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...options];
  return options.filter((o) => o.label.toLowerCase().includes(q));
}

/** The text with the "@name" taken out, its place tidied. */
export function withoutMention(text: string, mention: { start: number; query: string }): string {
  const end = mention.start + 1 + mention.query.length;
  const head = text.slice(0, mention.start).replace(/\s+$/, "");
  const tail = text.slice(end).replace(/^\s+/, "");
  return head && tail ? `${head} ${tail}` : head || tail;
}

export function targetLabel(t: Target | null): string {
  if (!t || t.kind === "glasshouse") return t?.taskId && t.label ? `Glasshouse, about ${t.label}` : "Glasshouse";
  if (t.kind === "new") return `${TOOL_WORDS[t.tool]} (new)`;
  return t.label;
}

export function placeholderFor(t: Target | null, hasAgents: boolean): string {
  if (!t || t.kind === "glasshouse") return hasAgents ? "Ask Glasshouse: where are we? Or type @ to talk to an agent." : "Type @ to start Claude Code, Codex or Cursor here, or ask Glasshouse where things stand.";
  if (t.kind === "new") return `Tell ${TOOL_WORDS[t.tool]} what you want. It starts on your computer, in this project.`;
  if (!t.reachable) return "Write what you would say. It is copied for you to paste into the agent's own window.";
  return t.live ? "Say something to this agent. It hears it when its current step ends." : "Say what to do next. It picks up where it left off.";
}

export const CARE_WORDS: Record<RequestCare, string> = { ask: "Asks before commands", free: "Runs commands freely" };

/** What each setting means for each tool, in the owner's words. Facts about the tools, not promises. */
export function careHint(tool: StartableTool, care: RequestCare): string {
  if (care === "free") {
    if (tool === "claude-code") return "Claude Code may change files and run any command without asking. Nothing will wait for you.";
    if (tool === "codex") return "Codex may change files and run any command outside its sandbox without asking. Nothing will wait for you.";
    return "Cursor may change files and run any command without asking. Nothing will wait for you.";
  }
  if (tool === "claude-code") return "Claude Code may change files. Anything else (a command, an install) is put to you here first, and waits for your answer.";
  if (tool === "codex") return "Codex works inside a sandbox: it may change files in the project and run commands there, and cannot reach the network. It cannot ask you from here.";
  return "Cursor may change files. Commands it is not already allowed to run are not run. It cannot ask you from here.";
}
