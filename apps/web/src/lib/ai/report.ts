/**
 * The AI report card: one strong call per finished task, over the task's events and the diff of
 * the files it changed (the only time a diff is sent, per the privacy model). The template card
 * is already saved by the time this runs; this only improves the words. The facts (touched,
 * not touched, evidence, risk) are never taken from the AI: `mergeAiReport` keeps them in charge.
 */
import { NEEDS_YOU, diffFromEvents, mergeAiReport, type ReportText } from "@glasshouse/translate";
import { z } from "zod";
import { publish } from "@/lib/bus";
import { getStore } from "@/lib/store";
import type { TaskDetail } from "@/lib/store/types";
import { askForJson, looksTechnical } from "./client";

const Reply = z.object({
  headline: z.string().min(3).max(160),
  beforeAfter: z.string().max(600).optional(),
  touched: z.array(z.object({ area: z.string().min(1), reason: z.string().min(1).max(240) })).max(20).optional(),
  riskReason: z.string().max(240).optional(),
  needsYou: z.enum(NEEDS_YOU).optional(),
  needsYouDetail: z.string().max(400).optional(),
});

const SYSTEM = `You write the report card for one finished task by an AI coding agent, for the product owner, who will never open the code.
You are given the facts: what was asked, what the agent said at the end, which parts of the product were changed (with the files behind them), the checks it ran, and the diff of what changed.
Write, in plain English with no file names, folder names, tool names or code words:
- "headline": one sentence, behaviour not code ("Storyboard scenes without a location now get a default one"). At most 18 words. If the task did not finish, say so plainly.
- "beforeAfter": two sentences: "Previously … Now …". Only what the diff and facts support. Leave it out if you cannot tell.
- "touched": for each part listed under "Parts changed", the reason it was changed in one short sentence. Use the part's name exactly. Do not add parts.
- "riskReason": one line saying why the risk level given is what it is, in owner language.
- "needsYou": "nothing", "review", "decision" or "blocked". "decision" when the agent asked the owner a question or left a real choice open; "blocked" when it could not finish; "review" when something deserves a look before trusting it. Never lower the level given under "Needs you at least".
- "needsYouDetail": the specific question or thing to look at, one or two sentences. Omit when needsYou is "nothing".
Never claim tests passed, files were untouched, or anything else the facts do not say. Stages, never percentages.
Reply with JSON only.`;

export function reportFacts(task: TaskDetail): string {
  const areas = task.areas.filter((a) => a.changed.length > 0).map((a) => `- ${a.name}: ${a.changed.join(", ")}`);
  const looked = task.areas.filter((a) => a.changed.length === 0).map((a) => a.name);
  const diff = diffFromEvents(task.events);
  const lines = task.events
    .filter((e) => e.kind !== "reasoning" && e.kind !== "read" && e.kind !== "search")
    .slice(0, 60)
    .map((e) => `- ${e.plain}`)
    .reverse();
  const r = task.report;
  return [
    task.prompt ? `The owner asked: ${task.prompt.slice(0, 1200)}` : "No instruction was captured.",
    task.closingMessage ? `The agent's closing words: ${task.closingMessage.slice(0, 1200)}` : "The agent left no closing words.",
    `How it ended: ${task.endReason === "usage_limit" ? (task.usageLimitConfirmed ? "stopped by a usage limit" : "stopped, possibly by a usage limit") : task.endReason === "session_end" ? "the session was closed" : "the agent finished its turn"}`,
    areas.length > 0 ? `Parts changed (files behind each, for your eyes only):\n${areas.join("\n")}` : "Parts changed: none. No file was changed.",
    looked.length > 0 ? `Parts only looked at, not changed: ${looked.join(", ")}` : "",
    task.notTouched.length > 0 ? `Parts verifiably not touched: ${task.notTouched.join(", ")}` : "",
    r ? `Checks: ${r.evidence.tests.ran ? `${r.evidence.tests.runs} run(s), last result ${r.evidence.tests.passed ?? 0} passed, ${r.evidence.tests.failed ?? 0} failed` : "none were run"}` : "",
    r && r.evidence.newDependencies.length > 0 ? `New tools added to the project: ${r.evidence.newDependencies.join(", ")}` : r && r.evidence.installs > 0 ? `Tools were added to the project (${r.evidence.installs} install command(s))` : "",
    r && (r.evidence.secretsTouched.length > 0 || r.evidence.settingsTouched.length > 0 || r.evidence.databaseTouched.length > 0) ? `Sensitive files changed: ${[...r.evidence.secretsTouched, ...r.evidence.settingsTouched, ...r.evidence.databaseTouched].join(", ")}` : "",
    r && r.evidence.errors > 0 ? `Errors during the task: ${r.evidence.errors}` : "",
    `Risk level (from facts): ${task.risk.level}. Reasons: ${task.risk.reasons.join("; ")}`,
    r ? `Needs you at least: ${r.needsYou}${r.needsYouDetail ? ` (${r.needsYouDetail})` : ""}` : "",
    "What the agent did, oldest first:",
    ...lines,
    diff.text ? `\nThe diff of what changed (${diff.files} file(s)${diff.withoutPatch > 0 ? `, ${diff.withoutPatch} edit(s) carried no patch` : ""}${diff.truncated ? ", cut for length" : ""}):\n${diff.text}` : "\nNo diff was available for this task (the tool did not carry one).",
  ]
    .filter(Boolean)
    .join("\n");
}

const inFlight = new Set<string>();

/** Write the AI card for a finished task. Skips when AI is off, already done, or busy. */
export async function writeReportWithAI(taskId: string): Promise<ReportText | null> {
  if (inFlight.has(taskId)) return null;
  inFlight.add(taskId);
  try {
    const store = getStore();
    const [task, existing] = await Promise.all([store.getTask(taskId), store.getReport(taskId)]);
    if (!task || !existing || !task.endedAt) return null;
    if (existing.source === "ai" && existing.eventCount >= task.eventCount) return null;
    const reply = await askForJson({ purpose: "report", projectId: task.projectId, taskId, system: SYSTEM, user: reportFacts(task), schema: Reply, maxTokens: 1500, effort: "medium" });
    if (!reply) return null;
    if (looksTechnical(reply.headline)) reply.headline = existing.headline;
    const map = await store.getAreaMap(task.projectId);
    const described = await store.getFileDescriptions(task.projectId);
    const ctx = { areas: map?.areas ?? [], fileDescriptions: described };
    const merged = mergeAiReport(existing, reply, task.facts, ctx);
    await store.saveReport({ ...merged, taskId, projectId: task.projectId, eventCount: task.eventCount, resolvedAt: existing.resolvedAt });
    publish({ projectId: task.projectId, at: new Date().toISOString(), inserted: 0 });
    return merged;
  } finally {
    inFlight.delete(taskId);
  }
}
