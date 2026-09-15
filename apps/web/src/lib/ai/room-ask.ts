/**
 * Glasshouse answering a question about the whole project (Phase 8), from the record only: the
 * same facts the Room shows (every task this week, what each changed, its checks, what needs the
 * owner), plus the actions of one task when the question is about it. Every answer names the
 * actions it rests on (rule 3). No AI key: no answer, said plainly (lib/requests/glasshouse.ts).
 */
import { z } from "zod";
import type { EventView, RoomState, TaskDetail } from "@/lib/store/types";
import { summaryAnswer } from "@/lib/requests/answers";
import { askForJson } from "./client";

const Reply = z.object({ answer: z.string().min(1).max(1600), basedOn: z.array(z.string()).max(12).default([]), unsure: z.boolean().optional() });

const SYSTEM = `You are Glasshouse, the control room a product owner watches their AI coding agents from. The owner will never open the code. Answer their question about the project from the record you are given and nothing else.
Rules:
- Plain English. No file names, folder names, tool names of the agents' internals, or code words. Name parts of the product by the names given, and the agents as Claude Code, Codex or Cursor.
- If the record does not say, say "I can't tell from what was recorded" and set "unsure" to true. Never guess and never reassure beyond the facts.
- Stages, never percentages. Never say something is tested, finished or safe unless the record shows it.
- Short: a few sentences, the most important thing first.
- "basedOn": the ids of the recorded actions the answer rests on (up to 8), from the numbered actions if any were given; otherwise an empty list.
Reply with JSON only: {"answer":"...","basedOn":["e3"],"unsure":false}`;

export interface RoomAskAnswer {
  text: string;
  basedOn: string[];
  unsure: boolean;
}

export function roomFacts(room: RoomState, nowMs: number, focus?: TaskDetail): { user: string; byShortId: Map<string, EventView> } {
  const byShortId = new Map<string, EventView>();
  const tasks = room.sessions.filter((s) => s.task && s.tool !== "watcher").map((s) => s.task!);
  const taskLines = tasks.slice(0, 20).map((t, i) => {
    const parts = t.areas.filter((a) => a.changed.length > 0).map((a) => a.name);
    const checks = t.lastTests ? `${t.lastTests.passed ?? 0} passed, ${t.lastTests.failed ?? 0} failed` : "none run";
    const need = t.report ? `${t.report.needsYou}${t.report.needsYouDetail ? ` (${t.report.needsYouDetail})` : ""}` : "not finished";
    return `t${i + 1}: ${t.tool} · stage ${t.stage} · “${t.report?.headline ?? t.headline}” · started ${t.startedAt}${t.endedAt ? ` · ended ${t.endedAt}${t.endReason ? ` (${t.endReason})` : ""}` : ""} · changed: ${parts.join(", ") || "nothing"} · not touched: ${t.notTouched.join(", ") || "unknown"} · checks: ${checks} · needs you: ${need}${t.stuckReason ? ` · stuck: ${t.stuckReason}` : ""}`;
  });
  const helpers = (room.helpers ?? []).map((h) => `${h.name}: ${h.job}${h.placedAt ? " (in the project)" : " (not placed yet)"}, ran ${h.runs.length} time(s) this week`);
  const focusLines: string[] = [];
  if (focus) {
    const ordered = [...focus.events].reverse().filter((e) => e.kind !== "reasoning").slice(-80);
    ordered.forEach((e, i) => {
      const id = `e${i + 1}`;
      byShortId.set(id, e);
      focusLines.push(`${id}: ${e.plain}`);
    });
  }
  const user = [
    `Project: ${room.project.name}. Now: ${new Date(nowMs).toISOString()}.`,
    `In one paragraph, the Room's own summary: ${summaryAnswer(room, nowMs)}`,
    `Parts of the product: ${room.areas.map((a) => a.name).join(", ") || "not named yet"}.`,
    "Tasks this week, newest first:",
    ...(taskLines.length ? taskLines : ["(none)"]),
    helpers.length ? `Helpers grown for this project: ${helpers.join("; ")}` : "",
    focus ? `The question is about task “${focus.report?.headline ?? focus.headline}” (${focus.tool}).${focus.prompt ? ` The owner asked it: ${focus.prompt.slice(0, 800)}` : ""}${focus.closingMessage ? ` Its closing words: ${focus.closingMessage.slice(0, 800)}` : ""}` : "",
    focus ? "Its actions, oldest first:" : "",
    ...focusLines,
  ]
    .filter(Boolean)
    .join("\n");
  return { user, byShortId };
}

export async function askRoom(room: RoomState, question: string, nowMs: number, focus?: TaskDetail): Promise<RoomAskAnswer | null> {
  const { user, byShortId } = roomFacts(room, nowMs, focus);
  const reply = await askForJson({ purpose: "ask", projectId: room.project.id, taskId: focus?.id, system: SYSTEM, user: `${user}\n\nThe owner's question: ${question.slice(0, 600)}`, schema: Reply, maxTokens: 700 });
  if (!reply) return null;
  const basedOn = reply.basedOn.map((id) => byShortId.get(id.trim())?.id).filter((id): id is string => Boolean(id));
  return { text: reply.answer.trim(), basedOn, unsure: reply.unsure ?? false };
}
