/**
 * The AI headline: regenerated only on a meaning change (the trigger comes from the store),
 * debounced so a task rarely costs more than a handful of calls. The template headline is
 * already on the tile by the time this runs; this only replaces it with a better sentence.
 */
import { z } from "zod";
import { publish } from "@/lib/bus";
import { getStore } from "@/lib/store";
import type { TaskDetail } from "@/lib/store/types";
import { askForJson, looksTechnical } from "./client";

const Reply = z.object({ headline: z.string().min(3).max(140) });

const SYSTEM = `You write the one-line headline on a control-room tile that tells a product owner what an AI coding agent is doing right now.
Rules:
- One sentence, at most 12 words, present tense, plain English. No file names, folder names, tool names or code words.
- Say what is being done to the product and which part ("Changing how signed-in users are remembered").
- Stages, never percentages. Never claim something is finished, tested or safe unless the facts below say so.
- If the agent is waiting for the user, say so. If it stopped because of a usage limit, say so.
Reply with JSON only: {"headline":"..."}`;

export const MIN_GAP_MS = 20_000;
export const MAX_PER_TASK = 12;

const recent = new Map<string, { lastAt: number; count: number; inFlight: boolean }>();

export function headlineFacts(task: TaskDetail): string {
  const lines = task.events
    .filter((e) => e.kind !== "reasoning")
    .slice(0, 14)
    .map((e) => `- ${e.plain}`)
    .reverse();
  const areas = task.areas.map((a) => `${a.name}${a.changed.length ? " (changed)" : " (looked at)"}`).join(", ");
  return [
    task.prompt ? `The owner asked: ${task.prompt.slice(0, 600)}` : "",
    `Stage now: ${task.stage}${task.stuckReason ? ` (${task.stuckReason})` : ""}`,
    task.endReason === "usage_limit" ? `Stopped: ${task.usageLimitConfirmed ? "usage limit reached" : "possibly a usage limit"}` : "",
    areas ? `Parts of the product touched: ${areas}` : "No files touched yet",
    task.lastTests ? `Last checks: ${task.lastTests.passed ?? 0} passed, ${task.lastTests.failed ?? 0} failed` : "",
    task.closingMessage ? `The agent's closing words: ${task.closingMessage.slice(0, 400)}` : "",
    "Latest actions, oldest first:",
    ...lines,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Called after ingest for each task whose meaning changed. Fire and forget. */
export async function requestHeadline(taskId: string, trigger: string): Promise<void> {
  const entry = recent.get(taskId) ?? { lastAt: 0, count: 0, inFlight: false };
  const now = Date.now();
  // Endings always get a headline; anything else is debounced.
  const urgent = trigger === "finished" || trigger === "waiting" || trigger === "new prompt";
  if (entry.inFlight || entry.count >= MAX_PER_TASK || (!urgent && now - entry.lastAt < MIN_GAP_MS)) return;
  entry.inFlight = true;
  recent.set(taskId, entry);
  try {
    const store = getStore();
    const task = await store.getTask(taskId);
    if (!task) return;
    const reply = await askForJson({ purpose: "headline", projectId: task.projectId, taskId, system: SYSTEM, user: headlineFacts(task), schema: Reply, maxTokens: 200 });
    entry.lastAt = Date.now();
    entry.count++;
    if (!reply) return;
    const headline = reply.headline.trim().replace(/\s+/g, " ").replace(/[.]+$/, "");
    if (looksTechnical(headline) || headline.split(" ").length > 16) return;
    await store.setHeadline(taskId, headline, "ai");
    publish({ projectId: task.projectId, at: new Date().toISOString(), inserted: 0 });
  } finally {
    entry.inFlight = false;
  }
}
