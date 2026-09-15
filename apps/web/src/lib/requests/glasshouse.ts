/**
 * The Glasshouse agent (Phase 8): what happens when the owner tags Glasshouse in the chat. The
 * three set questions are answered from the record on the spot, with no AI. Anything else goes to
 * the AI with the same facts, when the plan allows it and there is a key; otherwise the answer
 * says plainly what it can and cannot do. Never a guess.
 */
import { aiEnabled } from "@/lib/ai/client";
import { askRoom } from "@/lib/ai/room-ask";
import { UPGRADE_REASONS, featureAllowed, gateRoom, type Plan } from "@/lib/plan";
import { getStore } from "@/lib/store";
import type { RequestRecord } from "@/lib/store/types";
import { intentOf, templateAnswer } from "./answers";

export type GlasshouseAnswer = NonNullable<RequestRecord["answer"]>;

const ON_MY_OWN = "On my own I can answer “Where are we?”, “What should we do next?” and “How is each agent getting on?” from the record.";

export async function answerGlasshouse(opts: { projectId: string; question: string; focusTaskId?: string; plan: Plan; now?: string }): Promise<GlasshouseAnswer | null> {
  const store = getStore();
  const raw = await store.getRoom(opts.projectId);
  if (!raw) return null;
  const nowIso = opts.now ?? new Date().toISOString();
  const nowMs = new Date(nowIso).getTime();
  const { room } = gateRoom(raw, opts.plan, nowIso);
  const intent = intentOf(opts.question);
  if (intent !== "other") return { text: templateAnswer(room, intent, nowMs), basedOn: [], unsure: false, source: "template" };
  if (!featureAllowed(opts.plan, "ask")) return { text: `${UPGRADE_REASONS.ask} ${ON_MY_OWN}`, basedOn: [], unsure: true, source: "template" };
  if (!aiEnabled()) return { text: `${ON_MY_OWN} Anything else needs an AI key in the Room's settings (ANTHROPIC_API_KEY); until then, the report cards and the cards' details are the answer.`, basedOn: [], unsure: true, source: "template" };
  const focus = opts.focusTaskId ? await store.getTask(opts.focusTaskId) : null;
  const reply = await askRoom(room, opts.question, nowMs, focus && focus.projectId === opts.projectId ? focus : undefined);
  if (!reply) return { text: "The AI did not answer this time. Try again in a moment.", basedOn: [], unsure: true, source: "template" };
  return { text: reply.text, basedOn: reply.basedOn, unsure: reply.unsure, source: "ai" };
}
