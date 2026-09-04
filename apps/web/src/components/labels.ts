import type { AgentTool, RiskLevel, Stage } from "@glasshouse/schema";
import type { ViewDepth } from "@/lib/store/types";

export const TOOL_NAMES: Record<AgentTool, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  watcher: "Folder watcher",
};

export const TOOL_COLOURS: Record<AgentTool, string> = {
  "claude-code": "#d9a066",
  codex: "#8be9a8",
  cursor: "#c7b6ff",
  watcher: "#8b91a1",
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
