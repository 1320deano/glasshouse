import type { AgentTool, RiskLevel, Stage } from "@glasshouse/schema";
import type { NeedsYou } from "@glasshouse/translate";
import type { TaskView, ViewDepth } from "@/lib/store/types";

export const TOOL_NAMES: Record<AgentTool, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  watcher: "Folder watcher",
};

/**
 * One muted hue per tool, used only for the 7px dot on a tile. Never for text, never for a fill:
 * these say "which agent", they are not part of the palette.
 */
export const TOOL_COLOURS: Record<AgentTool, string> = {
  "claude-code": "#c2410c",
  codex: "#0f766e",
  cursor: "#6d28d9",
  watcher: "#64748b",
};

export const DEPTH_LABELS: Record<ViewDepth, string | null> = {
  full: null,
  standard: "standard view",
  basic: "basic view",
};

export const STAGE_TEXT: Record<Stage, string> = {
  investigating: "Investigating",
  planning: "Planning",
  building: "Building",
  testing: "Testing",
  done: "Done",
  stuck: "Stuck",
  waiting: "Waiting for you",
};

export const RISK_TEXT: Record<RiskLevel, string> = { low: "Low risk", medium: "Medium risk", high: "High risk" };

export const NEEDS_YOU_TEXT: Record<NeedsYou, string> = {
  nothing: "Needs you: nothing",
  review: "Review recommended",
  decision: "Decision needed",
  blocked: "Blocked",
};

export function ago(iso: string | undefined, now: number): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function latencyOf(e: { ts: string; receivedAt: string }): string {
  const ms = new Date(e.receivedAt).getTime() - new Date(e.ts).getTime();
  return Number.isFinite(ms) && ms >= 0 ? `${ms} ms` : "";
}

/** What the card's status pill says. "waiting" is the one status allowed to light up. */
export type StatusClass = "working" | "waiting" | "done" | "stuck" | "limit";

export function statusOf(task: TaskView | null): { text: string; cls: StatusClass; detail?: string } {
  if (!task) return { text: "Starting", cls: "working" };
  if (task.stage === "done" && task.endReason === "usage_limit") return { text: task.usageLimitConfirmed ? "Stopped: usage limit" : "Stopped: possibly a usage limit", cls: "limit" };
  switch (task.stage) {
    case "waiting":
      return { text: "Waiting for you", cls: "waiting" };
    case "done":
      return { text: task.endedAt ? "Finished" : "Done for now", cls: "done" };
    case "stuck":
      return { text: "Looks stuck", cls: "stuck", detail: task.stuckReason };
    default:
      return { text: STAGE_TEXT[task.stage], cls: "working" };
  }
}

export function clip(s: string, n: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n - 1).replace(/[\s.,;:]+$/, "") + "…" : one;
}

export function clock(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** "Today", "Yesterday", or the weekday, for dividers in the story. */
export function dayLabel(iso: string, now: number): string {
  const d = new Date(iso);
  const today = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { day: "numeric", month: "long" });
}
