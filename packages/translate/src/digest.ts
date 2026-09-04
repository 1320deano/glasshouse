/**
 * The digest (brief 5.2): what all the agents did collectively over a window. Pure.
 *
 * Every section is a list of facts from the tasks in the window: done, still going, needs you,
 * new in your app, tools used. The AI (when configured) only adds a short summary on top; it
 * never adds an item the facts do not contain.
 */
import type { AgentTool, Area, RiskLevel, Stage } from "@glasshouse/schema";
import { areaForPath } from "./areas.js";
import type { NeedsYou } from "./report.js";

export type DigestWindowKind = "since-checked" | "today" | "week";

export interface DigestWindow {
  kind: DigestWindowKind;
  start: string;
  end: string;
}

/** What the digest needs to know about one task. Built by the store from its task view. */
export interface DigestTask {
  id: string;
  tool: AgentTool;
  headline: string;
  stage: Stage;
  startedAt: string;
  endedAt?: string;
  lastEventAt?: string;
  endReason?: string;
  usageLimitConfirmed?: boolean;
  risk: RiskLevel;
  location?: string;
  changedPaths: readonly string[];
  createdPaths: readonly string[];
  installed: readonly string[];
  report?: { headline: string; needsYou: NeedsYou; needsYouDetail?: string; resolved: boolean };
  continuedFrom?: { tool: AgentTool; endReason?: string; usageLimitConfirmed?: boolean };
}

export interface DigestDone {
  taskId: string;
  tool: AgentTool;
  headline: string;
  risk: RiskLevel;
  needsYou: NeedsYou;
  endedAt: string;
  endReason?: string;
  /** "Continued from Claude Code after its usage limit" */
  note?: string;
}

export interface DigestGoing {
  taskId: string;
  tool: AgentTool;
  headline: string;
  stage: Stage;
  location?: string;
  lastEventAt?: string;
}

export interface DigestNeed {
  taskId: string;
  tool: AgentTool;
  status: NeedsYou;
  detail?: string;
  headline: string;
  /** Live: the tile is waiting or stuck right now. Report: a finished task's card flagged it. */
  from: "live" | "report";
}

export interface DigestNewInApp {
  /** Parts of the app that were not on the map at the previous digest. */
  areas: string[];
  dependencies: string[];
  filesCreated: number;
  /** Parts of the app that gained new files. */
  areasWithNewFiles: string[];
}

export interface DigestTool {
  tool: AgentTool;
  tasks: number;
  /** "2 tasks picked up after Claude Code ran out of credits" */
  note?: string;
}

export interface Digest {
  window: DigestWindow;
  done: DigestDone[];
  stillGoing: DigestGoing[];
  needsYou: DigestNeed[];
  newInApp: DigestNewInApp;
  toolsUsed: DigestTool[];
  /** A fingerprint of the facts, so an AI summary can be reused while nothing changed. */
  fingerprint: string;
  /** The map at the time, so the next digest can say which parts are new. */
  areaIds: string[];
  /** Written by the AI when configured. */
  summary?: string;
  summarySource?: "ai";
  generatedAt: string;
}

export const TOOL_WORDS: Record<AgentTool, string> = { "claude-code": "Claude Code", codex: "Codex", cursor: "Cursor", watcher: "Folder watcher" };
const TOOL_ORDER: Record<AgentTool, number> = { "claude-code": 0, codex: 1, cursor: 2, watcher: 3 };

const ACTIVE_MS = 30 * 60 * 1000;
const within = (iso: string | undefined, start: string, end: string) => Boolean(iso && iso >= start && iso <= end);

/** The window's start and end for a kind, given the clock and when the owner last checked. */
export function digestWindow(kind: DigestWindowKind, nowIso: string, lastCheckedAt?: string): DigestWindow {
  const now = new Date(nowIso);
  if (kind === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { kind, start: start.toISOString(), end: nowIso };
  }
  if (kind === "week") return { kind, start: new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString(), end: nowIso };
  const fallback = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  return { kind, start: lastCheckedAt && lastCheckedAt < nowIso ? lastCheckedAt : fallback, end: nowIso };
}

function continuationNote(t: DigestTask): string | undefined {
  if (!t.continuedFrom) return undefined;
  const from = TOOL_WORDS[t.continuedFrom.tool];
  if (t.continuedFrom.endReason === "usage_limit") return `Continued from ${from} after ${t.continuedFrom.usageLimitConfirmed === false ? "what looked like " : ""}its usage limit`;
  return `Continued from ${from}`;
}

function fingerprintOf(parts: string[]): string {
  let h = 0;
  for (const ch of parts.join("|")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

export function buildDigest(tasks: readonly DigestTask[], areas: readonly Area[], window: DigestWindow, opts: { previousAreaIds?: readonly string[]; nowIso?: string } = {}): Digest {
  const nowIso = opts.nowIso ?? window.end;
  const nowMs = new Date(nowIso).getTime();

  const done = tasks
    .filter((t) => t.tool !== "watcher" && within(t.endedAt, window.start, window.end))
    .sort((a, b) => b.endedAt!.localeCompare(a.endedAt!))
    .map((t): DigestDone => ({
      taskId: t.id,
      tool: t.tool,
      headline: t.report?.headline ?? t.headline,
      risk: t.risk,
      needsYou: t.report?.needsYou ?? "nothing",
      endedAt: t.endedAt!,
      endReason: t.endReason,
      note: continuationNote(t),
    }));

  const stillGoing = tasks
    .filter((t) => t.tool !== "watcher" && !t.endedAt && nowMs - new Date(t.lastEventAt ?? t.startedAt).getTime() < ACTIVE_MS)
    .sort((a, b) => (b.lastEventAt ?? b.startedAt).localeCompare(a.lastEventAt ?? a.startedAt))
    .map((t): DigestGoing => ({ taskId: t.id, tool: t.tool, headline: t.headline, stage: t.stage, location: t.location, lastEventAt: t.lastEventAt }));

  const needsYou: DigestNeed[] = [];
  for (const t of tasks) {
    if (t.tool === "watcher") continue;
    if (!t.endedAt && (t.stage === "waiting" || t.stage === "stuck") && nowMs - new Date(t.lastEventAt ?? t.startedAt).getTime() < ACTIVE_MS) {
      needsYou.push({ taskId: t.id, tool: t.tool, status: t.stage === "waiting" ? "decision" : "blocked", detail: t.stage === "waiting" ? "Waiting for you right now." : "Looks stuck right now.", headline: t.headline, from: "live" });
    } else if (t.report && t.report.needsYou !== "nothing" && !t.report.resolved && within(t.endedAt, window.start, window.end)) {
      needsYou.push({ taskId: t.id, tool: t.tool, status: t.report.needsYou, detail: t.report.needsYouDetail, headline: t.report.headline, from: "report" });
    }
  }
  const needOrder: Record<NeedsYou, number> = { blocked: 0, decision: 1, review: 2, nothing: 3 };
  needsYou.sort((a, b) => needOrder[a.status] - needOrder[b.status]);

  const inWindow = tasks.filter((t) => within(t.endedAt, window.start, window.end) || (!t.endedAt && within(t.lastEventAt ?? t.startedAt, window.start, window.end)));
  const previous = opts.previousAreaIds ? new Set(opts.previousAreaIds) : undefined;
  const dependencies = [...new Set(inWindow.flatMap((t) => t.installed))];
  const created = [...new Set(inWindow.flatMap((t) => t.createdPaths))];
  const areasWithNewFiles = [...new Set(created.map((p) => areaForPath(p, areas)?.name).filter((n): n is string => Boolean(n)))];
  const newInApp: DigestNewInApp = {
    areas: previous ? areas.filter((a) => !previous.has(a.id)).map((a) => a.name) : [],
    dependencies,
    filesCreated: created.length,
    areasWithNewFiles,
  };

  const byTool = new Map<AgentTool, { tasks: number; continued: number; afterLimit: number }>();
  for (const t of inWindow) {
    if (t.tool === "watcher") continue;
    const entry = byTool.get(t.tool) ?? { tasks: 0, continued: 0, afterLimit: 0 };
    entry.tasks++;
    if (t.continuedFrom) {
      entry.continued++;
      if (t.continuedFrom.endReason === "usage_limit") entry.afterLimit++;
    }
    byTool.set(t.tool, entry);
  }
  const toolsUsed = [...byTool.entries()]
    .sort((a, b) => b[1].tasks - a[1].tasks || TOOL_ORDER[a[0]] - TOOL_ORDER[b[0]])
    .map(([tool, c]): DigestTool => {
      const fromLimit = inWindow.find((t) => t.tool === tool && t.continuedFrom?.endReason === "usage_limit")?.continuedFrom?.tool;
      const note =
        c.afterLimit > 0 && fromLimit
          ? `${c.afterLimit} task${c.afterLimit === 1 ? "" : "s"} picked up after ${TOOL_WORDS[fromLimit]} ran out of credits`
          : c.continued > 0
            ? `${c.continued} task${c.continued === 1 ? "" : "s"} continued from another tool`
            : undefined;
      return { tool, tasks: c.tasks, note };
    });

  const fingerprint = fingerprintOf([
    window.kind,
    ...done.map((d) => `${d.taskId}:${d.endedAt}:${d.needsYou}:${d.headline}`),
    ...stillGoing.map((g) => `${g.taskId}:${g.stage}`),
    ...needsYou.map((n) => `${n.taskId}:${n.status}`),
    ...newInApp.areas,
    ...dependencies,
    String(newInApp.filesCreated),
  ]);

  return { window, done, stillGoing, needsYou, newInApp, toolsUsed, fingerprint, areaIds: areas.map((a) => a.id), generatedAt: nowIso };
}

/** One line per section, for the tile-sized "since you last checked" strip and for tests. */
export function digestCounts(d: Digest): { done: number; stillGoing: number; needsYou: number } {
  return { done: d.done.length, stillGoing: d.stillGoing.length, needsYou: d.needsYou.length };
}
