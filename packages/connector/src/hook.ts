/**
 * `glasshouse hook <tool> <event>`: the passive listener each agent calls.
 * Reads one JSON payload from stdin, turns it into a normalised event, spools it, and sends
 * whatever is waiting. Must never block or alter the agent: the CLI always exits 0.
 */
import { normaliseClaudeCode } from "@glasshouse/translate";
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

export async function runHook(tool: string, hookEvent: string, input: string, deps: HookDeps): Promise<HookOutcome> {
  let payload: unknown;
  try {
    payload = JSON.parse(input);
  } catch {
    return { status: "skipped", reason: "stdin was not JSON" };
  }
  const cwd = payload && typeof payload === "object" && "cwd" in payload && typeof payload.cwd === "string" ? payload.cwd : undefined;
  if (!cwd) return { status: "skipped", reason: "no cwd in payload" };

  const project = findProject(deps.projects, cwd);
  if (!project) return { status: "skipped", reason: "folder not linked" };
  if (tool !== "claude-code") return { status: "skipped", reason: `${tool} is not supported yet` };

  const event = normaliseClaudeCode(hookEvent, payload, { projectId: project.projectId, projectRoot: project.root });
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
