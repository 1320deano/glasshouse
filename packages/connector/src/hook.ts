/**
 * `glasshouse hook <tool> <event>`: the passive listener each agent calls.
 * Reads one JSON payload from stdin, turns it into a normalised event, spools it, and sends
 * whatever is waiting. Must never block or alter the agent: the CLI always exits 0.
 */
import { normaliseClaudeCode, normaliseCodex, normaliseCursor } from "@glasshouse/translate";
import type { NormalisedEvent } from "@glasshouse/schema";
import { findProject, type LinkedProject, log } from "./config.js";
import { flushSpool, spoolEvent } from "./spool.js";

export interface HookDeps {
  projects: LinkedProject[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type HookOutcome =
  | { status: "sent"; sent: number }
  | { status: "spooled"; waiting: number }
  | { status: "ignored" }
  | { status: "skipped"; reason: string };

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => typeof v === "object" && v !== null && !Array.isArray(v);

/** Where the agent is working: `cwd` for Claude Code and Codex, `workspace_roots[0]` for Cursor. */
export function payloadCwd(payload: unknown): string | undefined {
  if (!isDict(payload)) return undefined;
  if (typeof payload.cwd === "string") return payload.cwd;
  if (Array.isArray(payload.workspace_roots) && typeof payload.workspace_roots[0] === "string") return payload.workspace_roots[0];
  return undefined;
}

export function normaliseFor(tool: string, hookEvent: string, payload: unknown, project: LinkedProject): NormalisedEvent | null | "unsupported" {
  const ctx = { projectId: project.projectId, projectRoot: project.root };
  switch (tool) {
    case "claude-code":
      return normaliseClaudeCode(hookEvent, payload, ctx);
    case "codex":
      return normaliseCodex(hookEvent, payload, ctx);
    case "cursor":
      return normaliseCursor(hookEvent, payload, ctx);
    default:
      return "unsupported";
  }
}

export async function runHook(tool: string, hookEvent: string, input: string, deps: HookDeps): Promise<HookOutcome> {
  let payload: unknown;
  try {
    payload = JSON.parse(input);
  } catch {
    return { status: "skipped", reason: "stdin was not JSON" };
  }
  const cwd = payloadCwd(payload);
  if (!cwd) return { status: "skipped", reason: "no cwd in payload" };

  const project = findProject(deps.projects, cwd);
  if (!project) return { status: "skipped", reason: "folder not linked" };

  const event = normaliseFor(tool, hookEvent, payload, project);
  if (event === "unsupported") return { status: "skipped", reason: `${tool} is not supported yet` };
  if (event) await spoolEvent(event);

  const flushed = await flushSpool({ projects: deps.projects, fetchImpl: deps.fetchImpl, timeoutMs: deps.timeoutMs });
  if (!event) return { status: "ignored" };
  if (flushed.failed > 0) {
    await log(`spooled ${hookEvent}: room unreachable (${flushed.failed} waiting)`);
    return { status: "spooled", waiting: flushed.failed };
  }
  return { status: "sent", sent: flushed.sent };
}

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}
