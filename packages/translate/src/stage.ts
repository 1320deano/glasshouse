/**
 * The stage state machine. Stages, never percentages.
 *
 *   Investigating (reads, searches) -> Planning (plan mode, todo writes) -> Building (edits)
 *   -> Testing (test commands) -> Done (stop). Waiting for you: permission or idle prompt.
 *
 * Stuck is detected, never declared: the same error three times, or nothing for N minutes.
 * It is an overlay computed at read time, so the stored stage stays honest.
 */
import type { EventKind, Stage } from "@glasshouse/schema";

export interface StageState {
  stage: Stage;
  /** The stage to go back to after "waiting for you". */
  resumeStage?: Stage;
}

const WORKING: ReadonlySet<Stage> = new Set<Stage>(["investigating", "planning", "building", "testing"]);

function next(current: Stage, kind: EventKind): Stage {
  switch (kind) {
    case "prompt":
      return "investigating";
    case "read":
    case "search":
    case "web":
      // A read while building or testing is part of that work; it does not send the tile backwards.
      return current === "building" || current === "testing" ? current : "investigating";
    case "reasoning":
      return current;
    case "plan":
      // Todo bookkeeping in the middle of building is not a return to planning.
      return current === "building" || current === "testing" ? current : "planning";
    case "edit":
    case "install":
    case "commit":
      return "building";
    case "test_run":
      return "testing";
    case "stop":
    case "session_end":
    case "usage_limit":
      return "done";
    case "error":
      return current;
    default:
      return current;
  }
}

/** Apply one event kind to the stage state. Pure. */
export function stageAfter(state: StageState, kind: EventKind): StageState {
  if (kind === "permission_wait") {
    return { stage: "waiting", resumeStage: state.stage === "waiting" ? state.resumeStage : state.stage };
  }
  if (kind === "idle") {
    // The agent finished its turn and is waiting for the next instruction.
    return { stage: "waiting", resumeStage: "done" };
  }
  if (kind === "permission_denied") {
    return { stage: state.resumeStage ?? "investigating" };
  }
  const base = state.stage === "waiting" ? (state.resumeStage ?? "investigating") : state.stage;
  if (kind === "subagent_start" || kind === "subagent_stop" || kind === "session_start" || kind === "unknown") return { stage: base };
  return { stage: next(base, kind) };
}

export interface StuckInput {
  stage: Stage;
  /** ISO time of the last event on the task. */
  lastEventAt?: string;
  /** The last few error messages on the task, newest first. */
  recentErrors: readonly string[];
  /** True when the session has ended; a finished session is never stuck. */
  sessionEnded?: boolean;
}

export interface StuckVerdict {
  stuck: boolean;
  /** Owner language, and a checkable fact: which rule fired. */
  reason?: string;
}

export const DEFAULT_IDLE_MS = 5 * 60 * 1000;
const SAME_ERROR_TIMES = 3;

/** Strip numbers, paths and ids so "attempt 2 of ENOENT foo.ts" equals "attempt 3 of ENOENT bar.ts". */
export function errorSignature(message: string): string {
  return message
    .toLowerCase()
    .replace(/[a-z]:\\[^\s]+|\/[^\s]+/g, "<path>")
    .replace(/\b[0-9a-f]{8,}\b/g, "<id>")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/** Stuck is a fact: the same error three times in a row, or a working stage with nothing happening. */
export function detectStuck(input: StuckInput, nowIso: string, idleMs = DEFAULT_IDLE_MS): StuckVerdict {
  if (input.sessionEnded || !WORKING.has(input.stage)) return { stuck: false };
  const sigs = input.recentErrors.slice(0, SAME_ERROR_TIMES).map(errorSignature);
  if (sigs.length >= SAME_ERROR_TIMES && sigs.every((s) => s === sigs[0])) {
    return { stuck: true, reason: "The same error has happened three times in a row" };
  }
  if (input.lastEventAt) {
    const quiet = new Date(nowIso).getTime() - new Date(input.lastEventAt).getTime();
    if (quiet >= idleMs) {
      const mins = Math.floor(quiet / 60000);
      return { stuck: true, reason: `Nothing has happened for ${mins} minute${mins === 1 ? "" : "s"}` };
    }
  }
  return { stuck: false };
}

/** The stage to show: the stored stage, with the stuck overlay applied. */
export function displayStage(stored: Stage, verdict: StuckVerdict): Stage {
  return verdict.stuck ? "stuck" : stored;
}

export const STAGE_LABELS: Record<Stage, string> = {
  investigating: "Investigating",
  planning: "Planning",
  building: "Building",
  testing: "Testing",
  done: "Done",
  stuck: "Stuck",
  waiting: "Waiting for you",
};
