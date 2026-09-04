/**
 * The "I'd have missed that" moment (brief section 3): the first time the Room shows something the
 * owner did not ask for and would not have seen. Pure, computed from the Room state, so it can be
 * shown the moment it happens and never claims more than the record holds.
 */
import type { RoomState, TaskView } from "./store/types";

export interface Moment {
  taskId: string;
  tool: TaskView["tool"];
  /** One line, the fact. */
  fact: string;
  /** One line, why it matters. */
  why: string;
  kind: "sensitive" | "cross-area" | "secrets" | "dependencies";
}

const TOOL: Record<TaskView["tool"], string> = { "claude-code": "Claude Code", codex: "Codex", cursor: "Cursor", watcher: "The folder watcher" };
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).replace(/[\s.,;:]+$/, "") + "…" : s);

export function momentFor(task: TaskView): Moment | null {
  if (task.tool === "watcher") return null;
  const who = TOOL[task.tool];
  const changed = task.areas.filter((a) => a.changed.length > 0);
  const asked = task.prompt ? ` You asked: “${clip(task.prompt.replace(/\s+/g, " ").trim(), 90)}”.` : "";
  const secrets = task.risk.reasons.find((r) => /secrets file/.test(r));
  if (secrets) return { taskId: task.id, tool: task.tool, kind: "secrets", fact: `${who} changed a secrets file.${asked}`, why: "Secrets files hold passwords and keys. A change there is worth a look before anything ships." };
  const sensitive = changed.find((a) => task.risk.reasons.includes(`Changes ${a.name}`));
  if (sensitive) return { taskId: task.id, tool: task.tool, kind: "sensitive", fact: `${who} changed ${sensitive.name}.${asked}`, why: `${sensitive.name} is a part of your app everyone relies on. This is the kind of change that goes unnoticed until someone cannot get in.` };
  if (changed.length >= 2) return { taskId: task.id, tool: task.tool, kind: "cross-area", fact: `${who} changed ${changed.length} parts of your app in one go: ${changed.map((a) => a.name).join(", ")}.${asked}`, why: "A task that reaches into several parts at once is where one fix quietly breaks another." };
  if (task.installs > 0) return { taskId: task.id, tool: task.tool, kind: "dependencies", fact: `${who} added ${task.installs === 1 ? "a new tool" : `${task.installs} new tools`} to your project.${asked}`, why: "New tools are code from strangers running inside your app. Worth knowing when they arrive." };
  return null;
}

/** The first such moment in the Room: the earliest task that has one. */
export function firstMoment(room: Pick<RoomState, "sessions">): Moment | null {
  const oldestFirst = [...room.sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (const s of oldestFirst) {
    if (!s.task) continue;
    const m = momentFor(s.task);
    if (m) return m;
  }
  return null;
}
