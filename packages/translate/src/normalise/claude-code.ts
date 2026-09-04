/**
 * Claude Code hook payload -> NormalisedEvent. Codex hooks share the same shape (different tool
 * names and ids), so the mapping is written once as `normaliseHook` and parametrised per tool.
 *
 * Pure: no I/O, no clock, no randomness unless injected. Shapes are the OBSERVED ones from
 * docs/hooks-claude-code.md. Privacy rules from docs/phase-0-findings.md are enforced here,
 * so nothing above this layer ever sees file contents.
 */
import type { AgentTool, EventKind, NormalisedEvent } from "@glasshouse/schema";
import { classifyCommand } from "../classify.js";
import { parseTestOutput } from "../tests-output.js";

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
const PLAN_KEEP = 1500;

export function toSlashes(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Make a path relative to the project root, forward slashes. Paths outside the root keep a short tail. */
export function relativePath(filePath: string, projectRoot: string): string {
  const f = toSlashes(filePath);
  if (!/^([a-z]:)?\//i.test(f) && !f.startsWith("~")) return f.replace(/^\.\//, "");
  const root = toSlashes(projectRoot).replace(/\/+$/, "");
  const lower = (s: string) => s.toLowerCase();
  if (lower(f).startsWith(lower(root) + "/")) return f.slice(root.length + 1);
  if (lower(f) === lower(root)) return ".";
  const parts = f.split("/").filter(Boolean);
  return "…/" + parts.slice(-2).join("/");
}

const isSecretPath = (p: string) => SECRET_PATH.test(p);

const clip = (s: string | undefined, n: number) => (s === undefined ? undefined : s.length > n ? s.slice(0, n) + "…" : s);

/** Keep the start and the end of long output: the summary line of a test run is at the end. */
export function clipOutput(s: string, keep = OUTPUT_KEEP): string {
  if (s.length <= keep) return s;
  const half = Math.floor(keep / 2);
  return `${s.slice(0, half)}\n…[${s.length - keep} characters left out]…\n${s.slice(-half)}`;
}

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
    if (typeof input.input === "string" && /apply_patch/i.test(tool ?? "")) input.input = clip(patchSummary(input.input), 300);
    if (tool === "Agent" || tool === "Task") input.prompt = clip(str(input.prompt), TEXT_KEEP);
    if (Array.isArray(input.todos)) input.todos = input.todos.slice(0, 20).map((t) => (isDict(t) ? { content: clip(str(t.content), 120), status: t.status } : t));
    if (typeof input.plan === "string") input.plan = clip(input.plan, PLAN_KEEP);
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
    if (typeof resp.stdout === "string") resp.stdout = clipOutput(resp.stdout);
    if (typeof resp.stderr === "string") resp.stderr = clipOutput(resp.stderr);
    if (typeof resp.output === "string") resp.output = clipOutput(resp.output);
    const p = input ? str(input.file_path) : undefined;
    if (p && isSecretPath(p)) delete resp.structuredPatch;
    if (Array.isArray(resp.filenames) && resp.filenames.length > 20) resp.filenames = resp.filenames.slice(0, 20);
    out.tool_response = resp;
  }
  if (typeof out.last_assistant_message === "string") out.last_assistant_message = clip(out.last_assistant_message, 1000);
  if (typeof out.output === "string") out.output = clipOutput(out.output);
  return out;
}

/** The file list from a Codex `apply_patch` body, without the content lines. */
export function patchSummary(patch: string): string {
  return patch
    .split(/\r?\n/)
    .filter((l) => /^\*\*\* (Add|Update|Delete|Move to) File:/.test(l))
    .join("\n");
}

export function patchPaths(patch: string, root: string): { paths: string[]; created: boolean; deleted: boolean } {
  const paths: string[] = [];
  let created = false;
  let deleted = false;
  for (const line of patch.split(/\r?\n/)) {
    const m = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);
    if (!m) continue;
    paths.push(relativePath(m[2]!.trim(), root));
    if (m[1] === "Add") created = true;
    if (m[1] === "Delete") deleted = true;
  }
  return { paths, created, deleted };
}

export interface Mapped {
  kind: EventKind;
  summary: string;
  paths?: string[];
  command?: string;
  prompt?: string;
  success?: boolean;
  text?: string;
  tests?: { passed?: number; failed?: number };
}

function todoText(input: Dict): string | undefined {
  if (Array.isArray(input.todos)) {
    const lines = input.todos.map((t) => (isDict(t) ? `${t.status === "completed" ? "[x]" : "[ ]"} ${str(t.content) ?? ""}` : "")).filter(Boolean);
    return clip(lines.join("\n"), PLAN_KEEP);
  }
  if (typeof input.plan === "string") return clip(input.plan, PLAN_KEEP);
  return undefined;
}

export function commandEvent(command: string, description: string | undefined, resp: Dict | undefined): Mapped {
  const kind = classifyCommand(command);
  const interrupted = resp && resp.interrupted === true;
  const output = resp ? `${str(resp.stdout) ?? ""}\n${str(resp.stderr) ?? ""}\n${str(resp.output) ?? ""}` : "";
  const tests = kind === "test_run" ? parseTestOutput(output) : undefined;
  const exit = resp && typeof resp.exit_code === "number" ? resp.exit_code : undefined;
  const success = interrupted ? false : exit !== undefined ? exit === 0 : tests && tests.failed !== undefined ? tests.failed === 0 : undefined;
  return { kind, summary: description ?? `Ran: ${clip(command, 120)}`, command, success, tests };
}

export function mapToolUse(tool: string, input: Dict, resp: Dict | undefined, root: string): Mapped {
  input = { ...input };
  const filePath = str(input.file_path) ?? str(input.target_file) ?? str(input.filePath);
  const rel = filePath ? relativePath(filePath, root) : undefined;
  switch (tool) {
    case "Read":
    case "read_file":
    case "ReadFile":
      return { kind: "read", summary: `Read ${rel ?? "a file"}`, paths: rel ? [rel] : [] };
    case "list_dir":
    case "ListDir": {
      const scope = str(input.path) ?? str(input.target_directory) ?? str(input.relative_workspace_path);
      const rel2 = scope ? relativePath(scope, root) : undefined;
      return { kind: "search", summary: `Looked around ${rel2 ?? "the project"}`, paths: rel2 ? [rel2] : [] };
    }
    case "Glob":
    case "Grep":
    case "grep_search":
    case "codebase_search":
    case "file_search":
    case "glob_file_search":
    case "SemanticSearch": {
      const query = str(input.query) ?? str(input.glob_pattern);
      if (query && !str(input.pattern)) input = { ...input, pattern: query };
      const pattern = str(input.pattern) ?? "";
      const scope = str(input.path) ? relativePath(str(input.path)!, root) : undefined;
      return { kind: "search", summary: `Searched for "${pattern}"${scope ? ` in ${scope}` : ""}`, paths: scope ? [scope] : [], text: pattern || undefined };
    }
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
    case "edit_file":
    case "search_replace":
    case "write_file":
    case "StrReplace":
      return { kind: "edit", summary: `Changed ${rel ?? "a file"}`, paths: rel ? [rel] : [] };
    case "Write": {
      const created = resp && str(resp.type) === "create";
      return { kind: "edit", summary: `${created ? "Created" : "Changed"} ${rel ?? "a file"}`, paths: rel ? [rel] : [] };
    }
    case "apply_patch": {
      const patch = str(input.input) ?? str(input.patch) ?? "";
      const { paths, created, deleted } = patchPaths(patch, root);
      const verb = deleted && paths.length === 1 ? "Deleted" : created && paths.length === 1 ? "Created" : "Changed";
      return { kind: "edit", summary: `${verb} ${paths.join(", ") || "files"}`, paths };
    }
    case "Bash":
    case "exec":
    case "shell":
    case "shell_command":
    case "run_terminal_cmd":
    case "Shell":
    case "Terminal": {
      const raw = input.command ?? input.cmd;
      const command = Array.isArray(raw) ? raw.map(String).join(" ") : (str(raw) ?? str(input.input) ?? "");
      return commandEvent(command, str(input.description), resp);
    }
    case "WebFetch":
    case "web_fetch":
    case "read_url":
    case "fetch":
      return { kind: "web", summary: `Looked at ${clip(str(input.url), 120) ?? "a web page"}` };
    case "WebSearch":
    case "web_search":
      return { kind: "web", summary: `Searched the web for "${clip(str(input.query), 100) ?? ""}"` };
    case "TodoWrite":
    case "EnterPlanMode":
    case "ExitPlanMode":
    case "update_plan":
      return { kind: "plan", summary: "Updated the plan", text: todoText(input) };
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
    case "PreCompact":
    case "PostCompact":
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
        text: clip(str(p.error), 400),
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
      const message = str(p.last_assistant_message)?.replace(/\s+/g, " ").trim();
      const last = clip(message, TEXT_KEEP);
      return { kind: "stop", summary: last || "Finished", text: clip(message, 1000) };
    }
    case "Interrupt":
      return { kind: "stop", summary: "Interrupted", text: "interrupted" };
    case "StopFailure": {
      const text = JSON.stringify(p).toLowerCase();
      const limit = /rate.?limit|usage.?limit|quota|billing/.test(text);
      return limit
        ? { kind: "usage_limit", summary: "Stopped: usage limit reached", success: false, text: "confirmed" }
        : { kind: "error", summary: "Stopped because of an error", success: false, text: clip(str(p.error) ?? str(p.message), 400) };
    }
    case "SessionEnd":
      return { kind: "session_end", summary: `Session ended${str(p.reason) ? ` (${p.reason})` : ""}` };
    default:
      return null;
  }
}

export interface HookFlavour {
  tool: AgentTool;
  /** Which payload field carries the task/turn id. */
  taskKeyField: string;
  sessionIdField: string;
}

export const CLAUDE_CODE: HookFlavour = { tool: "claude-code", taskKeyField: "prompt_id", sessionIdField: "session_id" };

/** Returns null for hook events that carry no product meaning (PreToolUse, compaction, ...). */
export function normaliseHook(flavour: HookFlavour, hookEvent: string, payload: unknown, ctx: NormaliseContext): NormalisedEvent | null {
  if (!isDict(payload)) return null;
  const sessionId = str(payload[flavour.sessionIdField]);
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
    taskKey: str(payload[flavour.taskKeyField]),
    tool: flavour.tool,
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
    raw: stripPayload(payload),
  };
}

export function normaliseClaudeCode(hookEvent: string, payload: unknown, ctx: NormaliseContext): NormalisedEvent | null {
  return normaliseHook(CLAUDE_CODE, hookEvent, payload, ctx);
}
