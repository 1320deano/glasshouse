/**
 * Cursor hook payload -> NormalisedEvent.
 *
 * Cursor's hooks (docs/hooks-codex-cursor.md) use `conversation_id` for the session and
 * `generation_id` for the turn, camelCase event names, and dedicated events for file edits and
 * shell runs. Reads carry the whole file and shell runs the whole output: both are stripped here.
 *
 * NOT YET OBSERVED: written from the documented shape. Replace the synthetic fixture with a real
 * recording as soon as one exists.
 */
import type { NormalisedEvent } from "@glasshouse/schema";
import { classifyCommand } from "../classify.js";
import { parseTestOutput } from "../tests-output.js";
import { type Mapped, type NormaliseContext, clipOutput, mapToolUse, relativePath } from "./claude-code.js";

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const clip = (s: string | undefined, n: number) => (s === undefined ? undefined : s.length > n ? s.slice(0, n) + "…" : s);

function mapCursor(hookEvent: string, p: Dict, root: string): Mapped | null {
  const filePath = str(p.file_path) ?? str(p.path);
  const rel = filePath ? relativePath(filePath, root) : undefined;
  switch (hookEvent) {
    case "sessionStart":
      return { kind: "session_start", summary: `Session started${str(p.source) ? ` (${p.source})` : ""}` };
    case "sessionEnd":
      return { kind: "session_end", summary: `Session ended${str(p.reason) ? ` (${p.reason})` : ""}` };
    case "beforeSubmitPrompt": {
      const prompt = str(p.prompt) ?? str(p.text) ?? "";
      return { kind: "prompt", summary: clip(prompt.replace(/\s+/g, " ").trim(), 160) || "New prompt", prompt };
    }
    case "beforeReadFile":
      return { kind: "read", summary: `Read ${rel ?? "a file"}`, paths: rel ? [rel] : [] };
    case "afterFileEdit":
      return { kind: "edit", summary: `Changed ${rel ?? "a file"}`, paths: rel ? [rel] : [] };
    case "afterShellExecution": {
      const command = str(p.command) ?? "";
      const kind = classifyCommand(command);
      const output = str(p.output) ?? "";
      const tests = kind === "test_run" ? parseTestOutput(output) : undefined;
      const exit = typeof p.exit_code === "number" ? p.exit_code : undefined;
      const success = exit !== undefined ? exit === 0 : tests?.failed !== undefined ? tests.failed === 0 : undefined;
      return { kind, summary: `Ran: ${clip(command, 120)}`, command, success, tests };
    }
    case "afterMCPExecution": {
      const tool = str(p.tool_name) ?? "a plug-in";
      const mcp = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(tool);
      return { kind: "unknown", summary: mcp ? `Used the ${mcp[1]!.replace(/[-_]+/g, " ")} plug-in (${mcp[2]!.replace(/[-_]+/g, " ")})` : `Used the ${tool.replace(/[-_]+/g, " ")} plug-in` };
    }
    case "postToolUse": {
      const tool = str(p.tool_name) ?? "unknown";
      const input = isDict(p.tool_input) ? p.tool_input : {};
      const resp = isDict(p.tool_output) ? p.tool_output : isDict(p.tool_response) ? p.tool_response : undefined;
      return mapToolUse(tool, input, resp, root);
    }
    case "postToolUseFailure": {
      const tool = str(p.tool_name) ?? "A tool";
      const error = str(p.error) ?? str(p.error_message) ?? str(p.failure_type);
      const input = isDict(p.tool_input) ? p.tool_input : {};
      const r = str(input.file_path) ? relativePath(str(input.file_path)!, root) : undefined;
      return { kind: "error", summary: `${tool} failed${error ? `: ${clip(error, 120)}` : ""}`, paths: r ? [r] : [], command: str(input.command), success: false, text: clip(error, 400) };
    }
    case "afterAgentThought": {
      const text = str(p.text) ?? "";
      return text ? { kind: "reasoning", summary: `Reasoning: ${clip(text.replace(/\s+/g, " ").trim(), 120)}`, text: clip(text, 600) } : null;
    }
    case "subagentStart":
      return { kind: "subagent_start", summary: `Started a helper${str(p.description) ? `: ${clip(str(p.description), 100)}` : str(p.subagent_type) ? ` (${p.subagent_type})` : ""}` };
    case "subagentStop": {
      const files = Array.isArray(p.modified_files) ? p.modified_files.map((f) => relativePath(String(f), root)) : [];
      return { kind: "subagent_stop", summary: "Helper finished", paths: files };
    }
    case "stop": {
      const status = str(p.status);
      const message = str(p.error_message) ?? "";
      if (status === "error") {
        if (/rate.?limit|usage.?limit|quota|billing|credits?/i.test(message)) return { kind: "usage_limit", summary: "Stopped: possibly a usage limit", success: false, text: "suspected" };
        return { kind: "error", summary: `Stopped because of an error${message ? `: ${clip(message, 120)}` : ""}`, success: false, text: clip(message, 400) };
      }
      if (status === "aborted") return { kind: "stop", summary: "Interrupted", text: "interrupted" };
      return { kind: "stop", summary: "Finished" };
    }
    case "afterAgentResponse": {
      // The agent's closing words. Cursor's own `stop` follows without a message, so this is the
      // turn end as far as the Room is concerned; the later stop keeps the message (see derive.ts).
      const text = (str(p.text) ?? "").replace(/\s+/g, " ").trim();
      return text ? { kind: "stop", summary: clip(text, 160)!, text: clip(text, 1000) } : null;
    }
    case "beforeShellExecution":
    case "beforeMCPExecution":
    case "preToolUse":
    case "preCompact":
    default:
      return null;
  }
}

/** Cursor reads carry the whole file and shell runs the whole output. Neither may leave the machine. */
export function stripCursorPayload(p: Dict): Dict {
  const out: Dict = { ...p };
  delete out.content;
  delete out.transcript_path;
  delete out.attachments;
  if (Array.isArray(out.edits)) out.edits = { count: out.edits.length };
  if (typeof out.output === "string") out.output = clipOutput(out.output);
  if (typeof out.text === "string" && out.text.length > 600) out.text = out.text.slice(0, 600) + "…";
  if (isDict(out.tool_input)) {
    const input = { ...out.tool_input };
    delete input.content;
    delete input.old_string;
    delete input.new_string;
    delete input.code_edit;
    out.tool_input = input;
  }
  if (isDict(out.tool_output)) {
    const o = { ...out.tool_output };
    delete o.content;
    if (typeof o.output === "string") o.output = clipOutput(o.output);
    out.tool_output = o;
  }
  return out;
}

export function normaliseCursor(hookEvent: string, payload: unknown, ctx: NormaliseContext): NormalisedEvent | null {
  if (!isDict(payload)) return null;
  const sessionId = str(payload.conversation_id) ?? str(payload.session_id);
  if (!sessionId) return null;
  const mapped = mapCursor(hookEvent, payload, ctx.projectRoot);
  if (!mapped) return null;
  const makeId = ctx.makeId ?? (() => globalThis.crypto.randomUUID());
  const now = ctx.now ?? (() => new Date().toISOString());
  return {
    id: makeId(),
    projectId: ctx.projectId,
    sessionId,
    agentId: str(payload.subagent_id),
    taskKey: str(payload.generation_id),
    tool: "cursor",
    kind: mapped.kind,
    ts: now(),
    paths: mapped.paths ?? [],
    command: mapped.command,
    prompt: mapped.prompt,
    text: mapped.text,
    tests: mapped.tests,
    summary: mapped.summary,
    success: mapped.success,
    sourceEvent: hookEvent,
    sourceTool: str(payload.tool_name),
    raw: stripCursorPayload(payload),
  };
}
