/**
 * The Shed's one AI call: turn an owner's rough sentence into a clearer job, a name, and a first
 * guess at the boundaries, choosing only from the parts of the app the map actually has. Optional:
 * with no key the Shed works from the owner's words as typed. The AI may propose; the owner decides.
 */
import type { Area } from "@glasshouse/schema";
import { z } from "zod";
import { aiEnabled, askForJson, looksTechnical } from "./client";

const Reply = z.object({
  name: z.string().min(2).max(60),
  job: z.string().min(10).max(900),
  mayTouch: z.array(z.string()).max(12).default([]),
  mustNotTouch: z.array(z.string()).max(12).default([]),
  stopAndAsk: z.array(z.string().max(160)).max(6).default([]),
  care: z.enum(["careful", "balanced", "quick"]).default("balanced"),
});
export type HelperDraft = z.infer<typeof Reply>;

const SYSTEM = `You help a product owner who will never open the code describe a helper (a sub-agent) for the AI coding agents working on their app.
You are given the owner's rough words and the list of parts of their app, each with an id and a plain name.
Write back:
- "name": two or three plain words naming the helper by its job (e.g. "Checkout checker"). No code words.
- "job": the job in one to three plain sentences addressed to the helper ("Before any work in Checkout is called finished, ..."). No file names, folder names, tool names or code words. Do not promise outcomes.
- "mayTouch": ids of the parts the helper's job clearly lives in (often one; may be empty).
- "mustNotTouch": ids of parts the helper should never change. Include every part marked sensitive unless the job is plainly about it.
- "stopAndAsk": up to four moments when it must stop and ask the owner, each a short plain phrase starting "Before" or "When".
- "care": "careful" for anything touching money, sign-in or data; "quick" only for small cosmetic jobs; otherwise "balanced".
Use only ids from the list. Never invent a part. Reply with JSON only.`;

export async function draftHelper(projectId: string, words: string, areas: Area[]): Promise<HelperDraft | null> {
  if (!aiEnabled()) return null;
  const parts = areas.length ? areas.map((a) => `- ${a.id}: ${a.name}${a.sensitive ? " (sensitive)" : ""}${a.description ? ` — ${a.description}` : ""}`).join("\n") : "- (no parts mapped yet)";
  const user = `Parts of the app:\n${parts}\n\nThe owner's words: ${words.slice(0, 1200)}`;
  const reply = await askForJson({ purpose: "helper", projectId, system: SYSTEM, user, schema: Reply, maxTokens: 700 });
  if (!reply) return null;
  const ids = new Set(areas.map((a) => a.id));
  return {
    ...reply,
    name: looksTechnical(reply.name) ? reply.name.replace(/[`_/\\]/g, " ").trim() : reply.name,
    mayTouch: reply.mayTouch.filter((id) => ids.has(id)),
    mustNotTouch: reply.mustNotTouch.filter((id) => ids.has(id) && !reply.mayTouch.includes(id)),
  };
}
