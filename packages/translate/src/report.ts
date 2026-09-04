/**
 * The report card for a finished task (brief 5.1). Pure.
 *
 * Two layers, kept apart on purpose:
 * - Facts, computed here from the task's own record against the current area map: which parts
 *   were touched (from the changed-files list), which were NOT touched (same list, never
 *   guessed), the evidence (checks run, tools added, secrets or settings touched), the risk.
 *   Recomputed every time the card is read, so a renamed part is right everywhere at once.
 * - Words, which the template writes at zero cost the moment the task ends and the AI may
 *   improve later: the headline, before/after, the reason each touched part was touched, the
 *   one-line risk reason and the "needs you" question. The AI never decides the facts, and
 *   `mergeAiReport` throws away anything it says about a part it did not actually change.
 */
import type { AgentTool, Area, Risk, Stage } from "@glasshouse/schema";
import { areaForPath } from "./areas.js";
import { sensitiveFiles } from "./risk.js";
import { nounFor, type TranslateContext } from "./templates.js";

export const NEEDS_YOU = ["nothing", "review", "decision", "blocked"] as const;
export type NeedsYou = (typeof NEEDS_YOU)[number];

export const NEEDS_YOU_LABELS: Record<NeedsYou, string> = {
  nothing: "Nothing needed",
  review: "Review recommended",
  decision: "Decision needed",
  blocked: "Blocked",
};

/** Everything the card is computed from. All of it is a recorded fact about the task. */
export interface ReportFacts {
  tool: AgentTool;
  prompt?: string;
  closingMessage?: string;
  endReason?: string;
  usageLimitConfirmed?: boolean;
  /** The stage the task was in when it ended (before it became "done"). */
  stageAtEnd?: Stage;
  changedPaths: readonly string[];
  touchedPaths: readonly string[];
  createdPaths: readonly string[];
  installs: number;
  /** Package names from install commands, when they could be read. */
  installed: readonly string[];
  testRuns: number;
  lastTests?: { passed?: number; failed?: number };
  /** Errors still unresolved when the task ended (newest first). */
  recentErrors: readonly string[];
  errorCount: number;
  commits: number;
  eventCount: number;
  risk: Risk;
}

/** The words on the card. Written by the template first, improved by the AI when configured. */
export interface ReportText {
  /** One sentence, behaviour not code. */
  headline: string;
  /** "Previously … Now …". Only the AI writes this; the template leaves it out rather than guess. */
  beforeAfter?: string;
  /** Reason per touched area id. Any id that is not in the changed-files list is dropped. */
  touchedReasons: Record<string, string>;
  /** One line. Defaults to the fact-based risk reasons. */
  riskReason?: string;
  needsYou: NeedsYou;
  /** The specific question or blocker. */
  needsYouDetail?: string;
  source: "template" | "ai";
}

export interface TouchedArea {
  id: string;
  name: string;
  description: string;
  /** The changed files behind the claim (technical detail). */
  files: string[];
  reason: string;
}

export interface ReportEvidence {
  tests: { ran: boolean; runs: number; passed?: number; failed?: number };
  newDependencies: string[];
  installs: number;
  /** Secrets, settings or database-layout files that were changed. */
  secretsTouched: string[];
  settingsTouched: string[];
  databaseTouched: string[];
  filesChanged: number;
  filesCreated: number;
  commits: number;
  errors: number;
}

/** The card as shown: the words plus the facts, computed against the current area map. */
export interface ReportCard extends ReportText {
  touched: TouchedArea[];
  /** Parts of the app with no changed file. Verified from the changed-files list, never guessed. */
  notTouched: string[];
  /** Changed files that fall outside every known part. */
  outsideAnyPart: string[];
  evidence: ReportEvidence;
  risk: Risk;
  finished: boolean;
  endReason?: string;
}

const order: Record<NeedsYou, number> = { nothing: 0, review: 1, decision: 2, blocked: 3 };
export const higherNeed = (a: NeedsYou, b: NeedsYou): NeedsYou => (order[a] >= order[b] ? a : b);

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).replace(/[\s.,;:]+$/, "") + "…" : s);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const oneLine = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const list = (items: readonly string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/** The parts of the app the task changed, from the changed-files list only. */
export function touchedAreas(facts: Pick<ReportFacts, "changedPaths">, ctx: TranslateContext): TouchedArea[] {
  const out = new Map<string, TouchedArea>();
  for (const p of facts.changedPaths) {
    const a = areaForPath(p, ctx.areas);
    if (!a) continue;
    const entry = out.get(a.id) ?? { id: a.id, name: a.name, description: a.description, files: [], reason: "" };
    if (!entry.files.includes(p)) entry.files.push(p);
    out.set(a.id, entry);
  }
  for (const t of out.values()) {
    const nouns = [...new Set(t.files.map((f) => nounFor(f, ctx).noun))].slice(0, 3);
    const more = t.files.length > 3 ? ` and ${t.files.length - 3} more` : "";
    t.reason = cap(`changed ${list(nouns)}${more}`);
  }
  return [...out.values()];
}

export function notTouchedAreas(facts: Pick<ReportFacts, "changedPaths">, areas: readonly Area[]): string[] {
  const changed = new Set(facts.changedPaths.map((p) => areaForPath(p, areas)?.id).filter(Boolean));
  return areas.filter((a) => !changed.has(a.id)).map((a) => a.name);
}

export function reportEvidence(facts: ReportFacts): ReportEvidence {
  const files = sensitiveFiles(facts.changedPaths);
  return {
    tests: { ran: facts.testRuns > 0, runs: facts.testRuns, passed: facts.lastTests?.passed, failed: facts.lastTests?.failed },
    newDependencies: [...facts.installed],
    installs: facts.installs,
    secretsTouched: files.secrets,
    settingsTouched: files.settings,
    databaseTouched: files.database,
    filesChanged: new Set(facts.changedPaths).size,
    filesCreated: new Set(facts.createdPaths).size,
    commits: facts.commits,
    errors: facts.errorCount,
  };
}

const QUESTION_WORDS = /\b(should i|should we|would you|do you want|do you prefer|which (one|of|would)|let me know|confirm|your call|up to you|shall i|want me to)\b/i;

/** The sentence in the agent's closing words that asks the owner something, if there is one. */
export function questionIn(message: string | undefined): string | undefined {
  const text = oneLine(message);
  if (!text) return undefined;
  const sentences = text.split(/(?<=[.?!])\s+/);
  const asked = sentences.find((s) => s.includes("?") && QUESTION_WORDS.test(s)) ?? sentences.find((s) => s.endsWith("?"));
  return asked ? clip(asked, 240) : undefined;
}

/**
 * The lowest "needs you" status the facts allow. The AI may raise it (and phrase the question);
 * it may never lower it. Every branch here is something the owner could check on the tile.
 */
export function needsYouFloor(facts: ReportFacts): { status: NeedsYou; detail?: string } {
  if (facts.endReason === "usage_limit") {
    const who = facts.tool === "claude-code" ? "Claude Code" : facts.tool === "codex" ? "Codex" : facts.tool === "cursor" ? "Cursor" : "The agent";
    return {
      status: "blocked",
      detail: `${who} ${facts.usageLimitConfirmed ? "hit its usage limit" : "seems to have hit a usage limit"} before finishing. Pick the task up in another tool, or wait for the limit to reset.`,
    };
  }
  if (facts.recentErrors.length > 0) return { status: "blocked", detail: `It ended with an error still unresolved: ${clip(oneLine(facts.recentErrors[0]), 160)}` };
  const failed = facts.lastTests?.failed ?? 0;
  const question = questionIn(facts.closingMessage);
  if (question) return { status: "decision", detail: question };
  if (failed > 0) return { status: "review", detail: `${failed} check${failed === 1 ? "" : "s"} still failing when it stopped.` };
  if (facts.risk.level === "high") return { status: "review", detail: `High risk: ${facts.risk.reasons.join("; ").toLowerCase()}.` };
  return { status: "nothing" };
}

/** The zero-cost headline for a finished task. Behaviour first where the facts allow it. */
export function templateReportHeadline(facts: ReportFacts, ctx: TranslateContext): string {
  if (facts.endReason === "usage_limit") return facts.usageLimitConfirmed || facts.tool === "claude-code" ? "Stopped before finishing: usage limit reached" : "Stopped before finishing: possibly a usage limit";
  if (facts.closingMessage === "interrupted") return "Stopped early: interrupted";
  const msg = oneLine(facts.closingMessage);
  if (msg) return cap(clip(msg, 110));
  const areas = touchedAreas(facts, ctx).map((a) => a.name);
  if (facts.changedPaths.length === 0) return "Looked around without changing anything";
  if (areas.length > 0) return `Changed ${list(areas)}`;
  return `Changed ${facts.changedPaths.length} file${facts.changedPaths.length === 1 ? "" : "s"}`;
}

/**
 * The whole card's words from the template. Never guesses: before/after is left out, and the
 * per-part reasons are not stored (reportCard recomputes them on read, so a renamed part or a
 * new file description is right everywhere at once). Only the AI's reasons are kept.
 */
export function templateReportText(facts: ReportFacts, ctx: TranslateContext): ReportText {
  const floor = needsYouFloor(facts);
  return {
    headline: templateReportHeadline(facts, ctx),
    beforeAfter: undefined,
    touchedReasons: {},
    riskReason: facts.risk.reasons.join("; "),
    needsYou: floor.status,
    needsYouDetail: floor.detail,
    source: "template",
  };
}

/** What the AI is allowed to contribute. Validated by the caller before it gets here. */
export interface AiReportReply {
  headline: string;
  beforeAfter?: string;
  touched?: Array<{ area: string; reason: string }>;
  riskReason?: string;
  needsYou?: NeedsYou;
  needsYouDetail?: string;
}

/**
 * Lay the AI's words over the template's, keeping the facts in charge: reasons only for parts
 * that really changed, "needs you" never lower than the floor, the template's detail kept when
 * the AI raised nothing.
 */
export function mergeAiReport(template: ReportText, ai: AiReportReply, facts: ReportFacts, ctx: TranslateContext): ReportText {
  const touched = touchedAreas(facts, ctx);
  const byKey = new Map<string, string>();
  for (const t of touched) {
    byKey.set(t.id.toLowerCase(), t.id);
    byKey.set(t.name.toLowerCase(), t.id);
  }
  const touchedReasons = { ...template.touchedReasons };
  for (const t of ai.touched ?? []) {
    const id = byKey.get(t.area.trim().toLowerCase());
    const reason = oneLine(t.reason);
    if (id && reason) touchedReasons[id] = cap(clip(reason, 200));
  }
  const floor = needsYouFloor(facts);
  const aiStatus = ai.needsYou && NEEDS_YOU.includes(ai.needsYou) ? ai.needsYou : "nothing";
  const needsYou = higherNeed(floor.status, aiStatus);
  const aiDetail = oneLine(ai.needsYouDetail);
  const needsYouDetail = needsYou === "nothing" ? undefined : needsYou === aiStatus && aiDetail ? clip(aiDetail, 300) : (floor.detail ?? (aiDetail ? clip(aiDetail, 300) : undefined));
  const headline = oneLine(ai.headline);
  const beforeAfter = oneLine(ai.beforeAfter);
  return {
    headline: headline ? cap(clip(headline.replace(/[.]+$/, ""), 140)) : template.headline,
    beforeAfter: beforeAfter ? clip(beforeAfter, 500) : undefined,
    touchedReasons,
    riskReason: oneLine(ai.riskReason) ? clip(oneLine(ai.riskReason), 200) : template.riskReason,
    needsYou,
    needsYouDetail,
    source: "ai",
  };
}

/** The card as shown: words plus facts, against the current area map. */
export function reportCard(text: ReportText, facts: ReportFacts, ctx: TranslateContext): ReportCard {
  const touched = touchedAreas(facts, ctx).map((t) => ({ ...t, reason: text.touchedReasons[t.id] ?? t.reason }));
  return {
    ...text,
    riskReason: text.riskReason ?? facts.risk.reasons.join("; "),
    touched,
    notTouched: notTouchedAreas(facts, ctx.areas),
    outsideAnyPart: [...new Set(facts.changedPaths)].filter((p) => !areaForPath(p, ctx.areas)),
    evidence: reportEvidence(facts),
    risk: facts.risk,
    finished: Boolean(facts.endReason),
    endReason: facts.endReason,
  };
}

// -- the diff behind the card -----------------------------------------------------------------

/** One hunk as Claude Code records it on an Edit or Write response. */
interface StructuredHunk {
  oldStart?: number;
  oldLines?: number;
  newStart?: number;
  newLines?: number;
  lines?: unknown[];
}

const isDict = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The structured patch on a stored edit event's raw payload, if the source kept one. */
export function patchFromRaw(raw: unknown): StructuredHunk[] | undefined {
  if (!isDict(raw)) return undefined;
  const resp = raw.tool_response;
  if (!isDict(resp) || !Array.isArray(resp.structuredPatch)) return undefined;
  return resp.structuredPatch.filter(isDict) as StructuredHunk[];
}

export interface DiffText {
  text: string;
  /** Files with at least one hunk. */
  files: number;
  /** Edits that carried no patch (other tools, new files, secret files). */
  withoutPatch: number;
  truncated: boolean;
}

/**
 * The diff of what the task changed, rebuilt from the patches carried on its edit events.
 * Sent only for the report card (privacy model), never stored on its own. Budgeted so a large
 * task still fits in one call; the card says when it was cut.
 */
export function diffFromEvents(events: ReadonlyArray<{ kind: string; paths: readonly string[]; raw?: unknown; ts: string }>, budget = 14000): DiffText {
  const chunks: string[] = [];
  let used = 0;
  let files = 0;
  let withoutPatch = 0;
  let truncated = false;
  const ordered = [...events].filter((e) => e.kind === "edit").sort((a, b) => a.ts.localeCompare(b.ts));
  for (const e of ordered) {
    const hunks = patchFromRaw(e.raw);
    if (!hunks || hunks.length === 0) {
      withoutPatch++;
      continue;
    }
    const lines = [`--- ${e.paths[0] ?? "a file"}`];
    for (const h of hunks) {
      lines.push(`@@ -${h.oldStart ?? 0},${h.oldLines ?? 0} +${h.newStart ?? 0},${h.newLines ?? 0} @@`);
      for (const l of h.lines ?? []) if (typeof l === "string") lines.push(l);
    }
    const chunk = lines.join("\n");
    if (used + chunk.length > budget) {
      const room = budget - used;
      if (room > 200) chunks.push(chunk.slice(0, room) + "\n…[cut]");
      truncated = true;
      files++;
      break;
    }
    chunks.push(chunk);
    used += chunk.length + 1;
    files++;
  }
  return { text: chunks.join("\n"), files, withoutPatch, truncated };
}
