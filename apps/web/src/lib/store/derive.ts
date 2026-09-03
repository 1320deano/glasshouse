/**
 * How one event changes a task. Pure, shared by every store implementation.
 *
 * Phase 1 rules (Phase 2 replaces them with the real state machine and the area map):
 * - The headline follows "meaningful" events only; reads and searches go to the ticker.
 * - Stage comes from the last event kind. Stages, never percentages.
 * - Location is the last path touched.
 */
import type { EventKind, NormalisedEvent, Stage } from "@glasshouse/schema";
import { createHash, randomBytes } from "node:crypto";

const HEADLINE_KINDS: ReadonlySet<EventKind> = new Set<EventKind>([
  "prompt",
  "edit",
  "command",
  "test_run",
  "install",
  "commit",
  "error",
  "stop",
  "usage_limit",
  "permission_wait",
  "idle",
  "subagent_start",
]);

export function stageAfter(current: Stage, kind: EventKind): Stage {
  switch (kind) {
    case "prompt":
      return "investigating";
    case "read":
    case "search":
    case "web":
      return current === "building" || current === "testing" ? current : "investigating";
    case "plan":
      return "planning";
    case "edit":
    case "install":
    case "commit":
      return "building";
    case "test_run":
      return "testing";
    case "permission_wait":
      return "waiting";
    case "permission_denied":
      return current === "waiting" ? "investigating" : current;
    case "idle":
    case "stop":
    case "session_end":
    case "usage_limit":
      return "done";
    default:
      return current;
  }
}

export function endReasonFor(kind: EventKind): string | undefined {
  switch (kind) {
    case "stop":
      return "stop";
    case "usage_limit":
      return "usage_limit";
    case "session_end":
      return "session_end";
    default:
      return undefined;
  }
}

export interface TaskPatch {
  headline?: string;
  location?: string;
  stage: Stage;
  endReason?: string;
  endedAt?: string;
  prompt?: string;
  lastEventAt: string;
}

export function applyEvent(current: { stage: Stage; headline?: string; location?: string; endedAt?: string; endReason?: string }, e: NormalisedEvent): TaskPatch {
  const fromHelper = Boolean(e.agentId);
  const changesHeadline = HEADLINE_KINDS.has(e.kind) && (!fromHelper || e.kind === "subagent_start");
  const endReason = endReasonFor(e.kind);
  const restarted = e.kind === "prompt";
  const patch: TaskPatch = {
    headline: changesHeadline ? e.summary : current.headline,
    location: e.paths[0] ?? current.location,
    stage: stageAfter(current.stage, e.kind),
    endReason: restarted ? undefined : (endReason ?? current.endReason),
    endedAt: restarted ? undefined : endReason ? e.ts : current.endedAt,
    lastEventAt: e.ts,
  };
  if (restarted && e.prompt) patch.prompt = e.prompt;
  return patch;
}

/** Tokens are shown once and stored hashed. */
export function newToken(): string {
  return "gh_" + randomBytes(24).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function latencyStats(pairs: Array<{ ts: string; receivedAt: string }>): { avg: number | null; p95: number | null } {
  const ms = pairs
    .map((p) => new Date(p.receivedAt).getTime() - new Date(p.ts).getTime())
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);
  if (ms.length === 0) return { avg: null, p95: null };
  const avg = Math.round(ms.reduce((a, b) => a + b, 0) / ms.length);
  const p95 = ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))] ?? null;
  return { avg, p95 };
}
