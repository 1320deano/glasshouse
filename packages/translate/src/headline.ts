/**
 * The headline with two speeds. The ticker carries every action; the headline changes only
 * when the meaning changes. This module decides *when* (the trigger) and writes the
 * template headline used immediately. The AI headline, when configured, replaces it later.
 */
import type { EventKind, Stage } from "@glasshouse/schema";

export interface HeadlineFacts {
  stage: Stage;
  prompt?: string;
  /** Current area name, from the last path touched. */
  areaName?: string;
  /** Noun for the last file touched, when known. */
  noun?: string;
  /** Last event kind applied. */
  lastKind?: EventKind;
  /** Agent's closing message for finished tasks. */
  closingMessage?: string;
  endReason?: string;
  tests?: { passed?: number; failed?: number };
  tool?: string;
}

export type HeadlineTrigger = "new prompt" | "stage change" | "area change" | "first edit after reading" | "error" | "finished" | "waiting";

export interface TriggerState {
  stage: Stage;
  areaId?: string;
  readsSinceEdit: number;
}

/** Why the headline should be regenerated now, or null to leave it alone. */
export function headlineTrigger(prev: TriggerState, nextStage: Stage, kind: EventKind, areaId: string | undefined): HeadlineTrigger | null {
  if (kind === "prompt") return "new prompt";
  if (kind === "error") return "error";
  if (kind === "stop" || kind === "usage_limit" || kind === "session_end") return "finished";
  if (nextStage === "waiting" && prev.stage !== "waiting") return "waiting";
  if (nextStage !== prev.stage) return "stage change";
  if (kind === "edit" && prev.readsSinceEdit >= 3) return "first edit after reading";
  if (areaId && prev.areaId && areaId !== prev.areaId && (kind === "edit" || kind === "read")) return "area change";
  return null;
}

/** Update the counters the trigger relies on. */
export function nextTriggerState(prev: TriggerState, nextStage: Stage, kind: EventKind, areaId: string | undefined): TriggerState {
  const reads = kind === "read" || kind === "search" ? prev.readsSinceEdit + 1 : kind === "edit" ? 0 : prev.readsSinceEdit;
  return { stage: nextStage, areaId: areaId ?? prev.areaId, readsSinceEdit: reads };
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).replace(/[\s.,;:]+$/, "") + "…" : s);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The zero-cost headline. Short, owner language, present tense. */
export function templateHeadline(f: HeadlineFacts): string {
  const where = f.areaName ? f.areaName : undefined;
  switch (f.stage) {
    case "investigating":
      if (f.noun && f.lastKind === "read") return cap(`Looking at ${f.noun}`);
      return where ? `Looking into how ${where} works` : f.prompt ? "Looking into your request" : "Starting up";
    case "planning":
      return where ? `Working out a plan for ${where}` : "Working out a plan";
    case "building":
      if (f.noun && (f.lastKind === "edit" || f.lastKind === "read")) return cap(`Changing ${f.noun}`);
      return where ? `Making changes in ${where}` : "Making changes";
    case "testing":
      if (f.tests && f.tests.failed !== undefined && f.tests.failed > 0) return `Checking the work: ${f.tests.failed} check${f.tests.failed === 1 ? "" : "s"} failing`;
      if (f.tests && f.tests.passed !== undefined) return `Checking the work: all ${f.tests.passed} checks passed`;
      return where ? `Checking the work in ${where}` : "Checking the work";
    case "waiting":
      return f.endReason ? "Finished and waiting for your next instruction" : "Waiting for you";
    case "stuck":
      return where ? `Stuck in ${where}` : "Stuck";
    case "done": {
      if (f.endReason === "usage_limit") return f.tool === "claude-code" ? "Stopped: usage limit reached" : "Stopped: possibly a usage limit";
      const msg = (f.closingMessage ?? "").replace(/\s+/g, " ").trim();
      return msg ? cap(clip(msg, 90)) : "Finished";
    }
    default:
      return "Working";
  }
}
