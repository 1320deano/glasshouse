/**
 * Claude Code hook payload -> NormalisedEvent.
 *
 * Pure: no I/O, no clock, no randomness unless injected. Shapes are the OBSERVED ones from
 * docs/hooks-claude-code.md. Privacy rules from docs/phase-0-findings.md are enforced here,
 * so nothing above this layer ever sees file contents.
 */
import type { EventKind, NormalisedEvent } from "@glasshouse/schema";
import { classifyCommand } from "../classify.js";

export interface NormaliseContext {
  projectId: string;
  /** Absolute project root; paths are made relative to it. */
  projectRoot: string;
  makeId?: () => string;
  /** Hook time. Defaults to now. */
  now?: () => string;
}

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

const SECRET_PATH = /(^|\/)\.env(\.|$)|\.pem$|\.key$|id_rsa|id_ed25519|(^|\/)secrets?(\/|$)|credentials/i;
const OUTPUT_KEEP = 500;
const TEXT_KEEP = 160;

export function toSlashes(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Make a path relative to the project root, forward slashes. Paths outside the root keep a short tail. */
export function relativePath(filePath: string, projectRoot: string): string {
  const f = toSlashes(filePath);
  const root = toSlashes(projectRoot).replace(/\/+$/, "");
  const lower = (s: string) => s.toLowerCase();
  if (lower(f).startsWith(lower(root) + "/")) return f.slice(root.length + 1);
  if (lower(f) === lower(root)) return ".";
  const parts = f.split("/").filter(Boolean);
  return "…/" + parts.slice(-2).join("/");
}

const isSecretPath = (p: string) => SECRET_PATH.test(p);

const clip = (s: string | undefined, n: number) => (s === undefined ? undefined : s.length > n ? s.slice(0, n) + "…" : s);

/**
 * Remove everything that must never leave the machine: file contents, diffs of secret files,
 * long outputs, transcript paths. Returns a new object; the input is untouched.
 */
export function stripPayload(payload: Dict): Dict {
  const out: Dict = { ...payload };
  delete out.transcript_path;
  const tool = str(payload.tool_name);
  const input = isDict(payload.tool_input) ? { ...payload.tool_input } : undefined;
  const resp = isDict(payload.tool_response) ? { ...payload.tool_response } : undefined;

  if (input) {
    delete input.content;
    delete input.old_string;
    delete input.new_string;
    if (Array.isArray(input.edits)) input.edits = { count: input.edits.length };
    if (tool === "Agent" || tool === "Task") input.prompt = clip(str(input.prompt), TEXT_KEEP);
    out.tool_input = input;
  }
  if (resp) {
    if (isDict(resp.file)) {
      const file = { ...resp.file };
      delete file.content;
      resp.file = file;
    }
    delete resp.content;
    delete resp.originalFile;
    if (typeof resp.stdout === "string") resp.stdout = clip(resp.stdout, OUTPUT_KEEP);
    if (typeof resp.stderr === "string") resp.stderr = clip(resp.stderr, OUTPUT_KEEP);
    const p = input ? str(input.file_path) : undefined;
    if (p && isSecretPath(p)) delete resp.structuredPatch;
    if (Array.isArray(resp.filenames) && resp.filenames.length > 20) resp.filenames = resp.filenames.slice(0, 20);
    out.tool_response = resp;
  }
  if (typeof out.last_assistant_message === "string") out.last_assistant_message = clip(out.last_assistant_message, 1000);
  return out;
}

interface Mapped {
  kind: EventKind;
  summary: string;
  paths?: string[];
  command?: string;
  prompt?: string;
  success?: boolean;
}

function mapToolUse(tool: string, input: Dict, resp: Dict | undefined, root: string): Mapped {
  const filePath = str(input.file_path);
  const rel = filePath ? relativePath(filePath, root) : undefined;
  switch (tool) {
    case "Read":
      return { kind: "read", summary: `Read ${rel ?? "a file"}`, paths: rel ? [rel] : [] };
    case "Glob":
    case "Grep": {
      const pattern = str(input.pattern) ?? "";
      const scope = str(input.path) ? relativePath(str(input.path)!, root) : undefined;
      return { kind: "search", summary: `Searched for "${pattern}"${scope ? ` in ${scope}` : ""}`, paths: scope ? [scope] : [] };
    }
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return { kind: "edit", summary: `Changed ${rel ?? "a file"}`, paths: rel ? [rel] : [] };
    case "Write": {
      const created = resp && str(resp.type) === "create";
      return { kind: "edit", summary: `${created ? "Created" : "Changed"} ${rel ?? "a file"}`, paths: rel ? [rel] : [] };
    }
    case "Bash": {
      const command = str(input.command) ?? "";
      const description = str(input.description);
      const kind = classifyCommand(command);
      const interrupted = resp && resp.interrupted === true;
      return {
        kind,
        summary: description ?? `Ran: ${clip(command, 120)}`,
        command,
        success: interrupted ? false : undefined,
      };
    }
    case "WebFetch":
      return { kind: "web", summary: `Looked at ${clip(str(input.url), 120) ?? "a web page"}` };
    case "WebSearch":
      return { kind: "web", summary: `Searched the web for "${clip(str(input.query), 100) ?? ""}"` };
    case "TodoWrite":
    case "EnterPlanMode":
    case "ExitPlanMode":
      return { kind: "plan", summary: "Updated the plan" };
    case "Agent":
    case "Task":
      return { kind: "subagent_start", summary: `Started a helper: ${clip(str(input.description), 100) ?? "unnamed"}` };
    default: {
      // Plug-in tools arrive as mcp__<server>__<tool>; say which plug-in, in words.
      const mcp = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(tool);
      if (mcp) return { kind: "unknown", summary: `Used the ${mcp[1]!.replace(/[-_]+/g, " ")} plug-in (${mcp[2]!.replace(/[-_]+/g, " ")})` };
      return { kind: "unknown", summary: `Used ${tool}` };
    }
  }
}

function mapHook(hookEvent: string, p: Dict, root: string): Mapped | null {
  switch (hookEvent) {
    case "SessionStart":
      return { kind: "session_start", summary: `Session started${str(p.source) ? ` (${p.source})` : ""}` };
    case "UserPromptSubmit": {
      const prompt = str(p.prompt) ?? "";
      return { kind: "prompt", summary: clip(prompt.replace(/\s+/g, " ").trim(), TEXT_KEEP) || "New prompt", prompt };
    }
    case "PreToolUse":
      return null;
    case "PostToolUse": {
      const tool = str(p.tool_name) ?? "unknown";
      const input = isDict(p.tool_input) ? p.tool_input : {};
      const resp = isDict(p.tool_response) ? p.tool_response : undefined;
      return mapToolUse(tool, input, resp, root);
    }
    case "PostToolUseFailure": {
      const tool = str(p.tool_name) ?? "A tool";
      const error = clip(str(p.error), 120);
      const input = isDict(p.tool_input) ? p.tool_input : {};
      const rel = str(input.file_path) ? relativePath(str(input.file_path)!, root) : undefined;
      return {
        kind: "error",
        summary: `${tool} failed${error ? `: ${error}` : ""}`,
        paths: rel ? [rel] : [],
        command: str(input.command),
        success: false,
      };
    }
    case "PermissionRequest":
      return { kind: "permission_wait", summary: `Waiting for your permission${str(p.tool_name) ? ` to use ${p.tool_name}` : ""}` };
    case "PermissionDenied":
      return { kind: "permission_denied", summary: "You declined a permission" };
    case "Notification": {
      const type = str(p.notification_type);
      if (type === "permission_prompt") return { kind: "permission_wait", summary: clip(str(p.message), TEXT_KEEP) ?? "Waiting for your permission" };
      if (type === "idle_prompt") return { kind: "idle", summary: "Waiting for your next prompt" };
      return null;
    }
    case "SubagentStart":
      return { kind: "subagent_start", summary: `Started a helper${str(p.agent_type) ? ` (${p.agent_type})` : ""}` };
    case "SubagentStop":
      return { kind: "subagent_stop", summary: `Helper finished${str(p.agent_type) ? ` (${p.agent_type})` : ""}` };
    case "Stop": {
      const last = clip(str(p.last_assistant_message)?.replace(/\s+/g, " ").trim(), TEXT_KEEP);
      return { kind: "stop", summary: last || "Finished" };
    }
    case "StopFailure": {
      const text = JSON.stringify(p).toLowerCase();
      const limit = /rate.?limit|usage.?limit|quota|billing/.test(text);
      return limit
        ? { kind: "usage_limit", summary: "Stopped: usage limit reached", success: false }
        : { kind: "error", summary: "Stopped because of an error", success: false };
    }
    case "SessionEnd":
      return { kind: "session_end", summary: `Session ended${str(p.reason) ? ` (${p.reason})` : ""}` };
    default:
      return null;
  }
}

/** Returns null for hook events that carry no product meaning (PreToolUse, compaction, ...). */
export function normaliseClaudeCode(hookEvent: string, payload: unknown, ctx: NormaliseContext): NormalisedEvent | null {
  if (!isDict(payload)) return null;
  const sessionId = str(payload.session_id);
  if (!sessionId) return null;
  const mapped = mapHook(hookEvent, payload, ctx.projectRoot);
  if (!mapped) return null;
  const makeId = ctx.makeId ?? (() => globalThis.crypto.randomUUID());
  const now = ctx.now ?? (() => new Date().toISOString());
  return {
    id: makeId(),
    projectId: ctx.projectId,
    sessionId,
    agentId: str(payload.agent_id),
    taskKey: str(payload.prompt_id),
    tool: "claude-code",
    kind: mapped.kind,
    ts: now(),
    paths: mapped.paths ?? [],
    command: mapped.command,
    prompt: mapped.prompt,
    summary: mapped.summary,
    success: mapped.success,
    sourceEvent: hookEvent,
    sourceTool: str(payload.tool_name),
    raw: stripPayload(payload),
  };
}
