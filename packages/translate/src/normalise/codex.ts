/**
 * Codex CLI hook payload -> NormalisedEvent.
 *
 * Codex copied Claude Code's hook shape (docs/hooks-codex-cursor.md): same field names for the
 * session, cwd and tool input; `turn_id` instead of `prompt_id`; tool names `exec`,
 * `shell_command`, `apply_patch`, `update_plan`. The shared mapper handles all of those.
 *
 * NOT YET OBSERVED: written from the documented shape. Replace the synthetic fixture with a real
 * recording (`glasshouse record codex <event>`) as soon as one exists.
 */
import type { NormalisedEvent } from "@glasshouse/schema";
import { type HookFlavour, type NormaliseContext, normaliseHook } from "./claude-code.js";

export const CODEX: HookFlavour = { tool: "codex", taskKeyField: "turn_id", sessionIdField: "session_id" };

export function normaliseCodex(hookEvent: string, payload: unknown, ctx: NormaliseContext): NormalisedEvent | null {
  const e = normaliseHook(CODEX, hookEvent, payload, ctx);
  if (!e) return null;
  // Rule 2: a Codex hook cannot confirm a usage limit; only the rollout's usage figures can.
  if (e.kind === "usage_limit") return { ...e, summary: "Stopped: possibly a usage limit", text: "suspected" };
  return e;
}
