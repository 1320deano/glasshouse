/** What the browser may send when it grows or changes a helper. Words only; everything else is computed. */
import { z } from "zod";

export const HelperRuleInput = z.object({
  text: z.string().trim().min(1).max(400),
  evidence: z
    .object({
      kind: z.enum(["asked", "stuck", "checks", "sensitive", "handoff", "busy", "owner"]),
      taskIds: z.array(z.string()).max(50),
      text: z.string().max(400),
    })
    .optional(),
});

export const HelperBriefInput = z.object({
  job: z.string().trim().min(3).max(3000),
  mayTouch: z.array(z.string().min(1).max(120)).max(60).default([]),
  mustNotTouch: z.array(z.string().min(1).max(120)).max(60).default([]),
  stopAndAsk: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  care: z.enum(["careful", "balanced", "quick"]).default("balanced"),
  rules: z.array(HelperRuleInput).max(30).default([]),
  tools: z.array(z.enum(["claude-code", "codex", "cursor"])).min(1).max(3),
});

export const HelperInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  brief: HelperBriefInput,
  grownFrom: z.string().max(120).default("owner"),
});
export type HelperInput = z.infer<typeof HelperInput>;
