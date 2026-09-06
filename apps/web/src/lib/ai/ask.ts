/**
 * The Ask box: a question about one task, answered only from what was recorded for it (its
 * events, the diff it carried, the area map). Every answer names the actions it rests on, so
 * the technical detail behind it is one click away (rule 3). No AI key: no answer, said plainly.
 */
import { diffFromEvents } from "@glasshouse/translate";
import { z } from "zod";
import { getStore } from "@/lib/store";
import type { EventView, TaskDetail } from "@/lib/store/types";
import { aiEnabled, askForJson } from "./client";

const Reply = z.object({ answer: z.string().min(1).max(1600), basedOn: z.array(z.string()).max(12).default([]), unsure: z.boolean().optional() });

const SYSTEM = `You answer one question from a product owner about one task an AI coding agent did in their app. The owner will never open the code.
Answer only from the record you are given: the instruction, the agent's actions (each with a short id), the parts of the product touched, the checks run, and the diff of what changed.
Rules:
- Plain English. No file names, folder names, tool names or code words in the answer. Name parts of the product by the names given.
- If the record does not say, say "I can't tell from what was recorded" and set "unsure" to true. Never guess and never reassure beyond the facts.
- Stages, never percentages. Never say something is tested, finished or safe unless the record shows it.
- "basedOn": the ids of the actions the answer rests on (up to 8).
Reply with JSON only: {"answer":"...","basedOn":["e3","e7"],"unsure":false}`;

export interface AskAnswer {
  answer: string | null;
  /** The recorded actions the answer rests on. */
  basedOn: EventView[];
  unsure: boolean;
  /** Why there is no answer, when there is none. */
  reason?: string;
}

export function askFacts(task: TaskDetail, question: string): { user: string; byShortId: Map<string, EventView> } {
  const ordered = [...task.events].reverse().filter((e) => e.kind !== "reasoning");
  const byShortId = new Map<string, EventView>();
  const lines = ordered.slice(-120).map((e, i) => {
    const id = `e${i + 1}`;
    byShortId.set(id, e);
    return `${id}: ${e.plain}`;
  });
  const diff = diffFromEvents(task.events, 10000);
  const r = task.report;
  const user = [
    task.prompt ? `The owner asked the agent: ${task.prompt.slice(0, 1200)}` : "No instruction was captured.",
    task.closingMessage ? `The agent's closing words: ${task.closingMessage.slice(0, 1000)}` : "",
    `Stage: ${task.stage}${task.endReason ? ` (ended: ${task.endReason})` : ""}`,
    task.areas.length > 0 ? `Parts of the product: ${task.areas.map((a) => `${a.name} (${a.changed.length > 0 ? `changed ${a.changed.join(", ")}` : `only looked at ${a.looked.join(", ")}`})`).join("; ")}` : "No part of the product touched.",
    task.notTouched.length > 0 ? `Parts verifiably not touched: ${task.notTouched.join(", ")}` : "",
    task.lastTests ? `Last checks: ${task.lastTests.passed ?? 0} passed, ${task.lastTests.failed ?? 0} failed` : "No checks were run.",
    r ? `Report card: ${r.headline}${r.beforeAfter ? ` ${r.beforeAfter}` : ""} Needs you: ${r.needsYou}${r.needsYouDetail ? ` (${r.needsYouDetail})` : ""}.` : "",
    `Risk: ${task.risk.level} (${task.risk.reasons.join("; ")})`,
    "Actions, oldest first:",
    ...lines,
    diff.text ? `\nThe diff of what changed${diff.truncated ? " (cut for length)" : ""}:\n${diff.text}` : "\nNo diff was recorded for this task.",
    `\nThe owner's question: ${question.slice(0, 600)}`,
  ]
    .filter(Boolean)
    .join("\n");
  return { user, byShortId };
}

export async function askAboutTask(taskId: string, question: string): Promise<AskAnswer | null> {
  const store = getStore();
  const task = await store.getTask(taskId);
  if (!task) return null;
  if (!aiEnabled()) return { answer: null, basedOn: [], unsure: true, reason: "Ask needs an AI key. Add ANTHROPIC_API_KEY to the Room's settings; until then the report card and the card's details are the answer." };
  const { user, byShortId } = askFacts(task, question);
  const reply = await askForJson({ purpose: "ask", projectId: task.projectId, taskId, system: SYSTEM, user, schema: Reply, maxTokens: 800 });
  if (!reply) return { answer: null, basedOn: [], unsure: true, reason: "The AI did not answer this time. Try again in a moment." };
  const basedOn = reply.basedOn.map((id) => byShortId.get(id.trim())).filter((e): e is EventView => Boolean(e));
  return { answer: reply.answer.trim(), basedOn, unsure: reply.unsure ?? false };
}
