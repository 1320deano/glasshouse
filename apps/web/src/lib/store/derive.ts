/**
 * How one event changes a task, and how a stored task becomes what the Room shows.
 * Pure, shared by every store implementation. Everything here comes from `@glasshouse/translate`;
 * this file only decides what to keep on the task row and what to compute at read time.
 *
 * Kept on the row: facts (stage, paths changed, errors, tests, the agent's own words).
 * Computed at read time from the current area map: plain lines, location, risk, areas touched,
 * "not touched", the stuck overlay. So a renamed area is right everywhere at once.
 */
import type { AgentTool, Area, AreaMap, NormalisedEvent, Risk, Stage } from "@glasshouse/schema";
import {
  areaForPath,
  assessRisk,
  detectStuck,
  displayStage,
  findContinuation,
  headlineTrigger,
  locationFor,
  nextTriggerState,
  nounFor,
  stageAfter,
  templateHeadline,
  translateEvent,
  type ContinuationLink,
  type EndedTask,
  type HeadlineTrigger,
  type TranslateContext,
} from "@glasshouse/translate";
import { createHash, randomBytes } from "node:crypto";
import type { AreaTouched, ChangeLine, EventView, TaskView, ViewDepth } from "./types";

export const DEPTH: Record<AgentTool, ViewDepth> = { "claude-code": "full", codex: "standard", cursor: "standard", watcher: "basic" };

/** The facts stored on a task row. Both stores persist exactly this. */
export interface TaskState {
  stage: Stage;
  resumeStage?: Stage;
  headline?: string;
  headlineSource: "template" | "ai";
  prompt?: string;
  plan?: string;
  lastPath?: string;
  lastAreaId?: string;
  lastKind?: NormalisedEvent["kind"];
  changedPaths: string[];
  touchedPaths: string[];
  installs: number;
  /** Newest first, at most three. */
  recentErrors: string[];
  lastTests?: { passed?: number; failed?: number };
  closingMessage?: string;
  endReason?: string;
  endedAt?: string;
  lastEventAt?: string;
  readsSinceEdit: number;
  usageLimitConfirmed?: boolean;
  continuedFrom?: string;
  continuedReason?: string;
  continuedBy?: string;
  /** How many events have been checked for a continuation link. */
  continuityChecks: number;
  eventCount: number;
}

export function newTaskState(): TaskState {
  return { stage: "investigating", headlineSource: "template", changedPaths: [], touchedPaths: [], installs: 0, recentErrors: [], readsSinceEdit: 0, continuityChecks: 0, eventCount: 0 };
}

const MAX_PATHS = 400;
const pushUnique = (list: string[], p: string) => (list.includes(p) || list.length >= MAX_PATHS ? list : [...list, p]);

export interface ApplyResult {
  state: TaskState;
  trigger: HeadlineTrigger | null;
  /** Area of the event's first path, for continuity and the trigger. */
  areaId?: string;
}

/** Apply one event to a task. The headline is refreshed from the template whenever the meaning changed. */
export function applyEvent(prev: TaskState, e: NormalisedEvent, ctx: TranslateContext): ApplyResult {
  const fromHelper = Boolean(e.agentId);
  const state: TaskState = { ...prev, changedPaths: [...prev.changedPaths], touchedPaths: [...prev.touchedPaths], recentErrors: [...prev.recentErrors] };
  const path = e.paths[0];
  const area = path ? areaForPath(path, ctx.areas) : undefined;

  if (e.kind === "prompt") {
    if (e.prompt) state.prompt = e.prompt;
    state.endReason = undefined;
    state.endedAt = undefined;
    state.closingMessage = undefined;
  }
  if (e.kind === "plan" && e.text) state.plan = e.text;
  if (e.kind === "edit" || e.kind === "commit") for (const p of e.paths) state.changedPaths = pushUnique(state.changedPaths, p);
  if (e.kind === "edit" || e.kind === "read" || e.kind === "commit") for (const p of e.paths) state.touchedPaths = pushUnique(state.touchedPaths, p);
  if (e.kind === "install") state.installs++;
  if (e.kind === "error") state.recentErrors = [e.text ?? e.summary, ...state.recentErrors].slice(0, 3);
  else if (e.kind === "edit" || e.kind === "test_run" || e.kind === "command") state.recentErrors = [];
  if (e.kind === "test_run" && e.tests) state.lastTests = e.tests;
  // A stop with words keeps them; a bare stop after one (Cursor sends both) does not erase them.
  if (e.kind === "stop") state.closingMessage = e.text ?? state.closingMessage ?? e.summary;
  if (e.kind === "usage_limit") state.usageLimitConfirmed = e.text === "confirmed";
  if (path && (e.kind === "edit" || e.kind === "read" || e.kind === "search" || e.kind === "error")) {
    state.lastPath = path;
    if (area) state.lastAreaId = area.id;
  }

  const endReason = e.kind === "stop" ? "stop" : e.kind === "usage_limit" ? "usage_limit" : e.kind === "session_end" ? "session_end" : undefined;
  if (endReason && !(fromHelper && e.kind === "stop")) {
    // The stop or session end that follows a usage limit is its consequence, not a new reason.
    if (prev.endReason !== "usage_limit") state.endReason = endReason;
    state.endedAt = e.ts;
  }

  // Helpers' own reads and edits are facts about the task, but they do not drive its stage.
  const stageInput = fromHelper && e.kind !== "subagent_start" ? { stage: prev.stage, resumeStage: prev.resumeStage } : stageAfter({ stage: prev.stage, resumeStage: prev.resumeStage }, e.kind);
  state.stage = stageInput.stage;
  state.resumeStage = stageInput.resumeStage;
  state.lastKind = e.kind;
  state.lastEventAt = e.ts;
  state.eventCount = prev.eventCount + 1;

  const triggerState = { stage: prev.stage, areaId: prev.lastAreaId, readsSinceEdit: prev.readsSinceEdit };
  const trigger = fromHelper ? null : headlineTrigger(triggerState, state.stage, e.kind, area?.id);
  state.readsSinceEdit = nextTriggerState(triggerState, state.stage, e.kind, area?.id).readsSinceEdit;

  if (trigger) {
    const noun = state.lastPath ? nounFor(state.lastPath, ctx).noun : undefined;
    const areaName = state.lastAreaId ? ctx.areas.find((a) => a.id === state.lastAreaId)?.name : undefined;
    state.headline = templateHeadline({
      stage: state.stage,
      prompt: state.prompt,
      areaName,
      noun,
      lastKind: e.kind,
      closingMessage: state.closingMessage,
      endReason: state.endReason,
      tests: state.lastTests,
      tool: state.usageLimitConfirmed ? "claude-code" : e.tool,
    });
    state.headlineSource = "template";
  }
  return { state, trigger, areaId: area?.id };
}

/** Everything the Room needs from a task, computed against the current area map. */
export interface ViewInput {
  id: string;
  sessionId: string;
  tool: AgentTool;
  externalKey?: string;
  startedAt: string;
  state: TaskState;
  sessionEnded: boolean;
  nowIso: string;
  continuedFrom?: { taskId: string; tool: AgentTool; headline?: string; prompt?: string } | undefined;
  continuedByTool?: AgentTool;
}

export function viewTask(input: ViewInput, ctx: TranslateContext): TaskView {
  const s = input.state;
  // The folder watcher has no agent behind it: a quiet folder is not a stuck agent.
  const verdict = input.tool === "watcher" ? { stuck: false } : detectStuck({ stage: s.stage, lastEventAt: s.lastEventAt, recentErrors: s.recentErrors, sessionEnded: input.sessionEnded }, input.nowIso);
  const risk = riskFor(s, ctx.areas);
  const areas = areasTouched(s, ctx.areas);
  const changedAreaIds = new Set(areas.filter((a) => a.changed.length > 0).map((a) => a.id));
  const headline =
    s.headline ??
    templateHeadline({ stage: s.stage, prompt: s.prompt, areaName: s.lastAreaId ? ctx.areas.find((a) => a.id === s.lastAreaId)?.name : undefined, tool: input.tool });
  return {
    id: input.id,
    sessionId: input.sessionId,
    tool: input.tool,
    externalKey: input.externalKey,
    prompt: s.prompt,
    plan: s.plan,
    headline,
    headlineSource: s.headlineSource,
    location: locationFor(s.lastPath, ctx),
    stage: displayStage(s.stage, verdict),
    storedStage: s.stage,
    stuckReason: verdict.reason,
    risk,
    endReason: s.endReason,
    usageLimitConfirmed: s.usageLimitConfirmed,
    startedAt: input.startedAt,
    endedAt: s.endedAt,
    lastEventAt: s.lastEventAt,
    eventCount: s.eventCount,
    changedPaths: s.changedPaths,
    touchedPaths: s.touchedPaths,
    areas,
    notTouched: ctx.areas.filter((a) => !changedAreaIds.has(a.id)).map((a) => a.name),
    installs: s.installs,
    lastTests: s.lastTests,
    closingMessage: s.closingMessage,
    continuedFrom: input.continuedFrom && s.continuedReason ? { ...input.continuedFrom, reason: s.continuedReason } : undefined,
    continuedBy: s.continuedBy && input.continuedByTool ? { taskId: s.continuedBy, tool: input.continuedByTool } : undefined,
  };
}

export function riskFor(s: Pick<TaskState, "changedPaths" | "installs">, areas: readonly Area[]): Risk {
  return assessRisk({ changedPaths: s.changedPaths, areas, installs: s.installs });
}

export function areasTouched(s: Pick<TaskState, "changedPaths" | "touchedPaths">, areas: readonly Area[]): AreaTouched[] {
  const out = new Map<string, AreaTouched>();
  const changed = new Set(s.changedPaths);
  for (const p of [...s.changedPaths, ...s.touchedPaths]) {
    const a = areaForPath(p, areas);
    if (!a) continue;
    const entry = out.get(a.id) ?? { id: a.id, name: a.name, description: a.description, changed: [], looked: [] };
    if (changed.has(p)) {
      if (!entry.changed.includes(p)) entry.changed.push(p);
    } else if (!entry.looked.includes(p)) entry.looked.push(p);
    out.set(a.id, entry);
  }
  return [...out.values()];
}

/** The "What it's changed so far" lines, behaviour-first where a description exists. */
export function changeLines(events: readonly EventView[], ctx: TranslateContext): ChangeLine[] {
  const byPath = new Map<string, ChangeLine>();
  for (const e of [...events].reverse()) {
    if (e.kind !== "edit") continue;
    for (const p of e.paths) {
      const { noun, area } = nounFor(p, ctx);
      const existing = byPath.get(p);
      const kind: ChangeLine["kind"] = /^(Created|Added)/.test(e.summary) ? "added" : /^(Deleted|Removed)/.test(e.summary) ? "deleted" : "changed";
      if (existing) {
        existing.times++;
        if (kind === "deleted") existing.kind = "deleted";
      } else byPath.set(p, { path: p, plain: noun, areaName: area?.name, times: 1, kind });
    }
  }
  return [...byPath.values()].map((c) => ({ ...c, plain: `${c.kind === "added" ? "Added" : c.kind === "deleted" ? "Removed" : "Changed"} ${c.plain}` }));
}

/** Turn a stored event into its view, translating against the current map. */
export function viewEvent(row: Omit<EventView, "plain" | "areaId" | "areaName">, ctx: TranslateContext): EventView {
  const t = translateEvent({ ...row, projectId: "", sessionId: "", raw: row.raw } as NormalisedEvent, ctx);
  return { ...row, plain: t.plain, areaId: t.areaId, areaName: t.areaName };
}

/** Continuity: should this fresh task be linked to an ended one in another tool? */
export function continuationFor(state: TaskState, tool: AgentTool, startedAt: string, candidates: readonly EndedTask[], areas: readonly Area[]): ContinuationLink | null {
  const areaIds = [...new Set([...state.touchedPaths, ...state.changedPaths].map((p) => areaForPath(p, areas)?.id).filter((x): x is string => Boolean(x)))];
  return findContinuation(candidates, { tool, prompt: state.prompt, areaIds, startedAt });
}

export function areaIdsOf(state: Pick<TaskState, "touchedPaths" | "changedPaths">, areas: readonly Area[]): string[] {
  return [...new Set([...state.touchedPaths, ...state.changedPaths].map((p) => areaForPath(p, areas)?.id).filter((x): x is string => Boolean(x)))];
}

export const CONTINUITY_MAX_CHECKS = 15;
/** A watcher edit within this many ms of an agent edit on the same path is the same edit. */
export const WATCHER_DEDUPE_MS = 15_000;

export function translateContext(map: AreaMap | null | undefined, fileDescriptions: Record<string, string>): TranslateContext {
  return { areas: map?.areas ?? [], fileDescriptions };
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
