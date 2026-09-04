/**
 * Codex rollout log line -> NormalisedEvent.
 *
 * Codex writes every session to `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`. It is the richer
 * source (reasoning, token counts, rate limits) and needs no trust step, so the connector tails
 * it (`glasshouse watch`). Each line is `{timestamp, type, payload}`.
 *
 * Shapes follow the OBSERVED keys listed in docs/hooks-codex-cursor.md (legacy history mode,
 * CLI 0.146-0.148). Field names inside payloads that were not observed are treated as optional,
 * and anything unrecognised yields null rather than a guess.
 *
 * This is a reducer: the caller keeps one RolloutState per file and feeds lines in order.
 */
import type { NormalisedEvent } from "@glasshouse/schema";
import { classifyCommand } from "../classify.js";
import { parseTestOutput } from "../tests-output.js";
import { type NormaliseContext, patchPaths, relativePath } from "./claude-code.js";

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const clip = (s: string | undefined, n: number) => (s === undefined ? undefined : s.length > n ? s.slice(0, n) + "…" : s);

interface PendingCall {
  name: string;
  command?: string;
  changes?: string[];
}

export interface RolloutState {
  sessionId?: string;
  cwd?: string;
  taskKey?: string;
  turns: number;
  calls: Map<string, PendingCall>;
  lastAgentMessage?: string;
  usageLimitReported: boolean;
}

export function createRolloutState(): RolloutState {
  return { turns: 0, calls: new Map(), usageLimitReported: false };
}

function commandText(v: unknown): string | undefined {
  if (Array.isArray(v)) return v.map(String).join(" ");
  if (typeof v === "string") return v;
  if (isDict(v)) return commandText(v.command) ?? commandText(v.cmd);
  return undefined;
}

function parseArgs(v: unknown): Dict {
  if (isDict(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v) as unknown;
      return isDict(parsed) ? parsed : { input: v };
    } catch {
      return { input: v };
    }
  }
  return {};
}

/** Output strings are sometimes JSON `{output, metadata:{exit_code}}`, sometimes "Exit code: 0\nOutput:\n..." */
function parseOutput(v: unknown): { text: string; exitCode?: number } {
  if (isDict(v)) {
    const meta = isDict(v.metadata) ? v.metadata : {};
    return { text: str(v.output) ?? "", exitCode: typeof meta.exit_code === "number" ? meta.exit_code : undefined };
  }
  const text = str(v) ?? "";
  try {
    const parsed = JSON.parse(text) as unknown;
    if (isDict(parsed)) return parseOutput(parsed);
  } catch {
    /* plain text */
  }
  const m = /^Exit code:\s*(\d+)/i.exec(text);
  return { text, exitCode: m ? Number(m[1]) : undefined };
}

interface Draft {
  kind: NormalisedEvent["kind"];
  summary: string;
  paths?: string[];
  command?: string;
  prompt?: string;
  text?: string;
  success?: boolean;
  tests?: { passed?: number; failed?: number };
  sourceTool?: string;
  /** Event before the first prompt (session start) has no task. */
  noTask?: boolean;
}

function changesToPaths(changes: unknown, root: string): string[] {
  if (isDict(changes)) return Object.keys(changes).map((p) => relativePath(p, root));
  if (Array.isArray(changes)) return changes.map((c) => (isDict(c) ? str(c.path) : str(c))).filter((p): p is string => Boolean(p)).map((p) => relativePath(p, root));
  return [];
}

function commandDraft(command: string, output: string, exitCode: number | undefined): Draft {
  const kind = classifyCommand(command);
  const tests = kind === "test_run" ? parseTestOutput(output) : undefined;
  const success = exitCode !== undefined ? exitCode === 0 : tests?.failed !== undefined ? tests.failed === 0 : undefined;
  return { kind, summary: `Ran: ${clip(command, 120)}`, command, success, tests, sourceTool: "exec" };
}

function eventMsg(p: Dict, state: RolloutState, root: string): Draft | null {
  switch (str(p.type)) {
    case "user_message": {
      const prompt = str(p.message) ?? "";
      state.turns++;
      state.taskKey = `turn-${state.turns}`;
      return { kind: "prompt", summary: clip(prompt.replace(/\s+/g, " ").trim(), 160) || "New prompt", prompt };
    }
    case "task_started":
      return null;
    case "agent_message":
      state.lastAgentMessage = str(p.message);
      return null;
    case "agent_reasoning": {
      const text = str(p.text);
      return text ? { kind: "reasoning", summary: `Reasoning: ${clip(text.replace(/\s+/g, " ").trim(), 120)}`, text: clip(text, 600) } : null;
    }
    case "task_complete": {
      const message = (str(p.last_agent_message) ?? state.lastAgentMessage ?? "").replace(/\s+/g, " ").trim();
      state.lastAgentMessage = undefined;
      return { kind: "stop", summary: clip(message, 160) || "Finished", text: clip(message, 1000) };
    }
    case "turn_aborted": {
      const reason = str(p.reason) ?? "";
      return { kind: "stop", summary: `Interrupted${reason ? ` (${reason})` : ""}`, text: "interrupted" };
    }
    case "token_count": {
      const limits = isDict(p.rate_limits) ? p.rate_limits : undefined;
      if (!limits || state.usageLimitReported) return null;
      const windows = [limits.primary, limits.secondary].filter(isDict);
      const exhausted = windows.some((w) => typeof w.used_percent === "number" && w.used_percent >= 100);
      const reached = typeof limits.rate_limit_reached_type === "string" || typeof p.rate_limit_reached_type === "string";
      if (!exhausted && !reached) return null;
      state.usageLimitReported = true;
      return { kind: "usage_limit", summary: "Stopped: usage limit reached", success: false, text: "confirmed" };
    }
    case "exec_command_begin": {
      const id = str(p.call_id);
      const command = commandText(p.command);
      if (id && command) state.calls.set(id, { name: "exec", command });
      return null;
    }
    case "exec_command_end": {
      const id = str(p.call_id);
      const pending = id ? state.calls.get(id) : undefined;
      if (id) state.calls.delete(id);
      const command = pending?.command ?? commandText(p.command);
      if (!command) return null;
      const output = `${str(p.stdout) ?? ""}\n${str(p.stderr) ?? ""}\n${str(p.aggregated_output) ?? ""}`;
      return commandDraft(command, output, typeof p.exit_code === "number" ? p.exit_code : undefined);
    }
    case "patch_apply_begin": {
      const id = str(p.call_id);
      const changes = changesToPaths(p.changes, root);
      if (id) state.calls.set(id, { name: "apply_patch", changes });
      return null;
    }
    case "patch_apply_end": {
      const id = str(p.call_id);
      const pending = id ? state.calls.get(id) : undefined;
      if (id) state.calls.delete(id);
      let paths = pending?.changes ?? changesToPaths(p.changes, root);
      if (paths.length === 0 && typeof p.stdout === "string") {
        paths = p.stdout
          .split(/\r?\n/)
          .map((l) => /^[AMD]\s+(.+)$/.exec(l)?.[1])
          .filter((x): x is string => Boolean(x))
          .map((x) => relativePath(x, root));
      }
      const success = typeof p.success === "boolean" ? p.success : undefined;
      return { kind: "edit", summary: `Changed ${paths.join(", ") || "files"}`, paths, success, sourceTool: "apply_patch" };
    }
    case "web_search_end":
      return { kind: "web", summary: `Searched the web for "${clip(str(p.query), 100) ?? ""}"`, sourceTool: "web_search" };
    case "mcp_tool_call_end": {
      const inv = isDict(p.invocation) ? p.invocation : {};
      const server = (str(inv.server) ?? "a").replace(/[-_]+/g, " ");
      const tool = (str(inv.tool) ?? "tool").replace(/[-_]+/g, " ");
      return { kind: "unknown", summary: `Used the ${server} plug-in (${tool})`, sourceTool: `mcp__${str(inv.server) ?? ""}__${str(inv.tool) ?? ""}` };
    }
    default:
      return null;
  }
}

function responseItem(p: Dict, state: RolloutState, root: string): Draft | null {
  switch (str(p.type)) {
    case "function_call": {
      const name = str(p.name) ?? "";
      const id = str(p.call_id);
      const args = parseArgs(p.arguments);
      if (/^(shell|exec|container\.exec|local_shell|shell_command)$/.test(name)) {
        const command = commandText(args.command) ?? commandText(args.cmd) ?? str(args.input);
        if (id && command) state.calls.set(id, { name, command });
        return null;
      }
      if (name === "update_plan") {
        const steps = Array.isArray(args.plan) ? args.plan.map((s) => (isDict(s) ? `${s.status === "completed" ? "[x]" : "[ ]"} ${str(s.step) ?? ""}` : "")).filter(Boolean) : [];
        return { kind: "plan", summary: "Updated the plan", text: clip(steps.join("\n"), 1500) || undefined, sourceTool: name };
      }
      const mcp = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(name);
      if (mcp) return { kind: "unknown", summary: `Used the ${mcp[1]!.replace(/[-_]+/g, " ")} plug-in (${mcp[2]!.replace(/[-_]+/g, " ")})`, sourceTool: name };
      return null;
    }
    case "custom_tool_call": {
      const name = str(p.name) ?? "";
      const id = str(p.call_id);
      const input = str(p.input) ?? "";
      if (name === "apply_patch") {
        // Emitted once the result is known (patch_apply_end or the call output), so the edit is not counted twice.
        const { paths } = patchPaths(input, root);
        if (id) state.calls.set(id, { name, changes: paths });
        return null;
      }
      if (/^(exec|shell_command|shell)$/.test(name)) {
        if (id) state.calls.set(id, { name, command: input });
        return null;
      }
      return null; // e.g. `wait`
    }
    case "local_shell_call": {
      const action = isDict(p.action) ? p.action : {};
      const command = commandText(action.command);
      if (!command) return null;
      return commandDraft(command, "", undefined);
    }
    case "function_call_output":
    case "custom_tool_call_output": {
      const id = str(p.call_id);
      const pending = id ? state.calls.get(id) : undefined;
      if (!pending) return null;
      state.calls.delete(id!);
      if (pending.name === "apply_patch") {
        const paths = pending.changes ?? [];
        const out = str(p.output) ?? "";
        return { kind: "edit", summary: `Changed ${paths.join(", ") || "files"}`, paths, success: /^Success/i.test(out) ? true : /error|fail/i.test(out) ? false : undefined, sourceTool: "apply_patch" };
      }
      if (!pending.command) return null;
      const { text, exitCode } = parseOutput(p.output);
      return commandDraft(pending.command, text, exitCode);
    }
    case "reasoning": {
      const summary = Array.isArray(p.summary) ? p.summary.map((s) => (isDict(s) ? str(s.text) : str(s))).find(Boolean) : undefined;
      return summary ? { kind: "reasoning", summary: `Reasoning: ${clip(summary.replace(/\s+/g, " ").trim(), 120)}`, text: clip(summary, 600) } : null;
    }
    default:
      return null;
  }
}

/** Strip anything that must not leave the machine before it is kept as `raw`. */
function stripLine(line: Dict): Dict {
  const payload = isDict(line.payload) ? { ...line.payload } : line.payload;
  if (isDict(payload)) {
    for (const key of ["output", "stdout", "stderr", "aggregated_output", "text", "message", "input", "arguments", "base_instructions", "last_agent_message"]) {
      if (typeof payload[key] === "string" && (payload[key] as string).length > 600) payload[key] = (payload[key] as string).slice(0, 600) + "…";
    }
    if (payload.type === "message" || payload.type === "session_meta") delete payload.content;
    delete payload.base_instructions;
    delete payload.encrypted_content;
  }
  return { ...line, payload };
}

/** Feed one parsed JSONL line. Returns the event it means, or null. Mutates `state`. */
export function normaliseCodexRollout(line: unknown, state: RolloutState, ctx: NormaliseContext): NormalisedEvent | null {
  if (!isDict(line)) return null;
  const type = str(line.type);
  const p = isDict(line.payload) ? line.payload : {};
  const root = ctx.projectRoot;
  let draft: Draft | null = null;

  if (type === "session_meta") {
    state.sessionId = str(p.id) ?? str(p.session_id) ?? state.sessionId;
    state.cwd = str(p.cwd) ?? state.cwd;
    draft = { kind: "session_start", summary: `Session started (Codex${str(p.cli_version) ? ` ${p.cli_version}` : ""})`, noTask: true };
  } else if (type === "event_msg") {
    draft = eventMsg(p, state, root);
  } else if (type === "response_item") {
    draft = responseItem(p, state, root);
  }
  if (!draft || !state.sessionId) return null;

  const makeId = ctx.makeId ?? (() => globalThis.crypto.randomUUID());
  const stamp = str(line.timestamp);
  const ts = stamp && !Number.isNaN(Date.parse(stamp)) ? new Date(stamp).toISOString() : (ctx.now ?? (() => new Date().toISOString()))();
  return {
    id: makeId(),
    projectId: ctx.projectId,
    sessionId: state.sessionId,
    taskKey: draft.noTask ? undefined : state.taskKey,
    tool: "codex",
    kind: draft.kind,
    ts,
    paths: draft.paths ?? [],
    command: draft.command,
    prompt: draft.prompt,
    text: draft.text,
    tests: draft.tests,
    summary: draft.summary,
    success: draft.success,
    sourceEvent: `rollout:${type}${str(p.type) ? `/${p.type}` : ""}`,
    sourceTool: draft.sourceTool ?? str(p.name),
    raw: stripLine(line),
  };
}
