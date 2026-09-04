/**
 * The one door to the Claude API. Every call goes through `askForJson`, which logs the call
 * (tokens and cost) to `ai_calls` so the real cost per project is always known.
 *
 * AI is optional: with no ANTHROPIC_API_KEY the Room runs entirely on templates.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { getStore } from "@/lib/store";
import type { AiCallLog } from "@/lib/store/types";

export const AI_MODEL = process.env.GLASSHOUSE_AI_MODEL ?? "claude-opus-5";

/** USD per million tokens (input, output). Anthropic list prices at time of writing. */
const PRICES_USD: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};
const USD_TO_GBP = Number(process.env.GLASSHOUSE_USD_GBP ?? "0.78");

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) && process.env.GLASSHOUSE_AI !== "off";
}

let client: Anthropic | undefined;
function getClient(): Anthropic {
  return (client ??= new Anthropic());
}

export function costGbp(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES_USD[model] ?? PRICES_USD["claude-opus-5"]!;
  return ((inputTokens * p.input + outputTokens * p.output) / 1_000_000) * USD_TO_GBP;
}

/** Pull the first JSON object out of a reply, with or without code fences. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(candidate.slice(start, end + 1));
}

export interface AskOptions<T> {
  purpose: AiCallLog["purpose"];
  projectId: string;
  taskId?: string;
  system: string;
  user: string;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}

/**
 * One call, one JSON answer validated against `schema`, or null when anything goes wrong.
 * Never throws: the Room must keep working without AI. Refusal fallbacks are on, so a policy
 * decline is retried server-side on a fallback model inside the same call.
 */
export async function askForJson<T>(opts: AskOptions<T>): Promise<T | null> {
  if (!aiEnabled()) return null;
  try {
    const response = await getClient().beta.messages.create({
      model: AI_MODEL,
      max_tokens: opts.maxTokens ?? 2048,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort ?? "low" },
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    });
    const usage = response.usage;
    await getStore()
      .logAiCall({
        projectId: opts.projectId,
        taskId: opts.taskId,
        purpose: opts.purpose,
        model: response.model,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        costGbp: costGbp(response.model, usage.input_tokens, usage.output_tokens),
      })
      .catch(() => undefined);
    if (response.stop_reason === "refusal") return null;
    const text = response.content
      .filter((b): b is Extract<(typeof response.content)[number], { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const parsed = opts.schema.safeParse(extractJson(text));
    if (!parsed.success) {
      console.warn(`[glasshouse] ${opts.purpose}: reply did not match the expected shape`, parsed.error.issues.slice(0, 3));
      return null;
    }
    return parsed.data;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) console.error("[glasshouse] AI: the API key was rejected");
    else if (err instanceof Anthropic.RateLimitError) console.warn("[glasshouse] AI: rate limited, will try again later");
    else if (err instanceof Anthropic.APIError) console.error(`[glasshouse] AI error ${err.status}: ${err.message}`);
    else console.error("[glasshouse] AI call failed:", err);
    return null;
  }
}

/** Anything that looks like a file path or a code identifier does not belong in owner language. */
export function looksTechnical(s: string): boolean {
  return /[\\/]|\.(ts|tsx|js|jsx|py|rb|go|rs|java|cs|php|sql|css|scss|json|ya?ml|toml|md)\b|[a-z]+[A-Z][a-z]+[A-Z]|\b[a-z]+_[a-z]+_[a-z]+\b|`/.test(s);
}
