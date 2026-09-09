/**
 * Free and Pro (brief 9.1). Pure rules, so the gate is the same on every page and in every route.
 *
 *   Free: 1 project · 1 agent at a time · the live room · last 24 hours of history · no digest, inbox or Ask.
 *   Pro:  unlimited projects and agents · full history · digests · inbox · Ask.
 *
 * Upgrade triggers, in the order the brief expects them to bite: second project → history beyond a
 * day → the digest → the inbox. Each one names the fact that tripped it, never a vague "upgrade".
 */
import { activityWindow } from "@/lib/progress";
import type { RoomState, SessionView } from "@/lib/store/types";

export type Plan = "free" | "pro";

export type GatedFeature = "second_project" | "history" | "digest" | "inbox" | "ask" | "more_agents" | "helpers";

export interface PlanLimits {
  projects: number;
  /** Active tiles shown at once. */
  agentsAtOnce: number;
  /** How far back the Room and its history reach, in ms. */
  historyMs: number;
  digest: boolean;
  inbox: boolean;
  ask: boolean;
  /** Helpers grown in the Potting Shed, per project. */
  helpers: number;
}

const DAY = 24 * 3600 * 1000;

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { projects: 1, agentsAtOnce: 1, historyMs: DAY, digest: false, inbox: false, ask: false, helpers: 2 },
  pro: { projects: Number.POSITIVE_INFINITY, agentsAtOnce: Number.POSITIVE_INFINITY, historyMs: Number.POSITIVE_INFINITY, digest: true, inbox: true, ask: true, helpers: Number.POSITIVE_INFINITY },
};

export const PRO_PRICE_GBP = Number(process.env.NEXT_PUBLIC_PRO_PRICE_GBP?.trim() || "15");

/** What the owner sees when a gate closes. Owner language, one checkable reason each. */
export const UPGRADE_REASONS: Record<GatedFeature, string> = {
  second_project: "Free watches one project. Pro watches as many as you like.",
  history: "Free keeps the last 24 hours. Pro keeps everything, so you can go back to any task.",
  digest: "The digest (since you last checked, today, this week) is part of Pro.",
  inbox: "The needs-you inbox is part of Pro.",
  ask: "Asking questions about a task is part of Pro.",
  more_agents: "Free shows one agent at a time. Pro shows all of them side by side.",
  helpers: "Free grows two helpers per project. Pro grows as many as you like.",
};

export function limitsFor(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}

export function canCreateProject(plan: Plan, existing: number): boolean {
  return existing < PLAN_LIMITS[plan].projects;
}

export function canGrowHelper(plan: Plan, existing: number): boolean {
  return existing < PLAN_LIMITS[plan].helpers;
}

export function featureAllowed(plan: Plan, feature: "digest" | "inbox" | "ask"): boolean {
  return PLAN_LIMITS[plan][feature];
}

export interface GatedRoom {
  room: RoomState;
  plan: Plan;
  locked: {
    /** Active agents hidden behind the one-at-a-time rule. */
    agents: number;
    /** Sessions older than the history window, hidden. */
    history: number;
    /** Which gates closed on this view, for the upgrade line. */
    reasons: GatedFeature[];
  };
}

const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

function isActive(s: SessionView, nowMs: number): boolean {
  if (s.endedAt) return false;
  return nowMs - new Date(s.lastEventAt ?? s.startedAt).getTime() < ACTIVE_WINDOW_MS;
}

/** Apply the plan to a Room view: the free tier sees one active agent and the last 24 hours. */
export function gateRoom(room: RoomState, plan: Plan, nowIso: string): GatedRoom {
  const limits = PLAN_LIMITS[plan];
  const nowMs = new Date(nowIso).getTime();
  const reasons: GatedFeature[] = [];

  const inWindow = room.sessions.filter((s) => nowMs - new Date(s.lastEventAt ?? s.startedAt).getTime() <= limits.historyMs);
  const history = room.sessions.length - inWindow.length;
  if (history > 0) reasons.push("history");

  const active = inWindow.filter((s) => isActive(s, nowMs));
  const hiddenAgents = Math.max(0, active.length - limits.agentsAtOnce);
  let sessions = inWindow;
  if (hiddenAgents > 0) {
    reasons.push("more_agents");
    const keep = new Set(active.slice(0, limits.agentsAtOnce).map((s) => s.id));
    sessions = inWindow.filter((s) => !isActive(s, nowMs) || keep.has(s.id));
  }

  // The story, the progress rows and the activity counts reach back only as far as the plan's history window.
  const windowStart = Number.isFinite(limits.historyMs) ? new Date(nowMs - limits.historyMs).toISOString() : undefined;
  const story = windowStart ? room.story.filter((m) => m.at >= windowStart) : room.story;
  const progress = windowStart
    ? room.progress.map((p) => (p.lastTouchedAt && p.lastTouchedAt >= windowStart ? p : { ...p, stage: null, attention: undefined, running: 0, finished: 0, filesChanged: 0, checks: undefined, lastTouchedAt: undefined, tools: [] }))
    : room.progress;
  const activity = windowStart ? activityWindow(room.activity.hours, windowStart) : room.activity;

  // Inbox counts and "since you last checked" are Pro features; the free room does not tease them.
  const base: RoomState = { ...room, sessions, story, progress, activity };
  const gated: RoomState = limits.inbox ? base : { ...base, inboxOpen: 0, sinceChecked: { done: 0, needsYou: 0 } };
  return { room: gated, plan, locked: { agents: hiddenAgents, history, reasons } };
}

/** The plan a Stripe subscription status maps to. Anything not clearly paid is free. */
export function planFromSubscriptionStatus(status: string | null | undefined): Plan {
  return status === "active" || status === "trialing" || status === "past_due" ? "pro" : "free";
}
