/**
 * `glasshouse mcp`: the bridge that lets a Claude Code run started from the Room put its
 * questions to the owner in the Room instead of a terminal nobody is watching.
 *
 * Claude Code starts this as an MCP server (stdio) and names its one tool with
 * `--permission-prompt-tool mcp__glasshouse__ask_owner`. Whenever the run needs a permission it
 * cannot grant itself (a command, an install, anything outside the folder) or asks the owner a
 * multiple-choice question, Claude Code calls the tool with the tool name and input. The tool
 * posts the question to the Room, waits for the owner's tap, and answers in the shape Claude Code
 * expects: {"behavior":"allow","updatedInput":...} or {"behavior":"deny","message":"..."}.
 *
 * The protocol is JSON-RPC 2.0, one JSON object per line, on stdin and stdout. Nothing else may
 * ever be written to stdout. The Room's address, the project token and the request id arrive in
 * the environment Claude Code was told to give this process.
 */
import { mapToolUse, stripPayload } from "@glasshouse/translate";
import { createInterface } from "node:readline";
import { CONNECTOR_VERSION, log } from "./config.js";

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => typeof v === "object" && v !== null && !Array.isArray(v);

export interface AskOwnerEnv {
  server: string;
  token: string;
  requestId: string;
  root: string;
  /** How long to wait for the owner before saying no. */
  answerTimeoutMs: number;
  fetchImpl?: typeof fetch;
  /** Long-poll length per ask, in seconds. */
  waitSeconds?: number;
  /** Total deadline check (tests). */
  now?: () => number;
}

export interface Decision {
  behavior: "allow" | "deny";
  updatedInput?: unknown;
  message?: string;
}

export const ASK_OWNER_TOOL = "ask_owner";
export const PERMISSION_TOOL_NAME = `mcp__glasshouse__${ASK_OWNER_TOOL}`;

/** The question as the Room stores it, from what Claude Code handed us. Pure. */
export function questionFrom(toolName: string, input: Dict, root: string): Dict {
  if (toolName === "AskUserQuestion") {
    const questions = Array.isArray(input.questions) ? input.questions : [];
    return {
      kind: "choice",
      toolName,
      summary: `Asked: ${questions.map((q) => (isDict(q) && typeof q.question === "string" ? q.question : "")).filter(Boolean).join(" / ") || "a question"}`.slice(0, 400),
      paths: [],
      choices: questions
        .filter(isDict)
        .slice(0, 4)
        .map((q) => ({
          question: String(q.question ?? "").slice(0, 600),
          header: typeof q.header === "string" ? q.header.slice(0, 60) : undefined,
          multiSelect: q.multiSelect === true,
          options: (Array.isArray(q.options) ? q.options : [])
            .filter(isDict)
            .slice(0, 8)
            .map((o) => ({ label: String(o.label ?? "").slice(0, 200), description: typeof o.description === "string" ? o.description.slice(0, 600) : undefined })),
        })),
      raw: stripPayload({ tool_name: toolName, tool_input: input }).tool_input,
    };
  }
  const mapped = mapToolUse(toolName, input, undefined, root);
  return {
    kind: "permission",
    toolName,
    eventKind: mapped.kind,
    description: typeof input.description === "string" ? input.description.slice(0, 400) : undefined,
    summary: mapped.summary.slice(0, 400),
    paths: (mapped.paths ?? []).slice(0, 50),
    command: mapped.command?.slice(0, 2000),
    raw: stripPayload({ tool_name: toolName, tool_input: input }).tool_input,
  };
}

/** What Claude Code is told, from the owner's answer. Pure. */
export function decisionFrom(toolName: string, input: Dict, answer: { allow: boolean; answers?: Record<string, string> } | null): Decision {
  if (!answer) return { behavior: "deny", message: "The owner did not answer in Glasshouse in time. Do not retry this action; carry on without it, or stop and say plainly what you needed." };
  if (!answer.allow) return { behavior: "deny", message: "The owner said no from Glasshouse. Do not retry this action; find another way, or stop and say plainly why you needed it." };
  if (toolName === "AskUserQuestion") return { behavior: "allow", updatedInput: { questions: input.questions, answers: answersByQuestion(input, answer.answers ?? {}) } };
  return { behavior: "allow", updatedInput: input };
}

/**
 * Claude Code wants each answer keyed by the question's exact text. The Room sends it that way;
 * this also forgives a key that differs only in spacing or case, and a single answer to a single
 * question whatever it was keyed by.
 */
export function answersByQuestion(input: Dict, given: Record<string, string>): Record<string, string> {
  const questions = (Array.isArray(input.questions) ? input.questions : []).filter(isDict).map((q) => String(q.question ?? ""));
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const out: Record<string, string> = {};
  const values = Object.values(given);
  for (const q of questions) {
    const exact = given[q];
    const loose = Object.entries(given).find(([k]) => norm(k) === norm(q))?.[1];
    const only = questions.length === 1 && values.length === 1 ? values[0] : undefined;
    const picked = exact ?? loose ?? only;
    if (picked !== undefined) out[q] = picked;
  }
  return out;
}

async function postQuestion(env: AskOwnerEnv, question: Dict): Promise<string | null> {
  const fetchImpl = env.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`${env.server}/api/requests/${env.requestId}/questions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.token}` },
      body: JSON.stringify(question),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { question?: { id?: string } };
    return body.question?.id ?? null;
  } catch {
    return null;
  }
}

async function waitForAnswer(env: AskOwnerEnv, questionId: string): Promise<{ allow: boolean; answers?: Record<string, string> } | null> {
  const fetchImpl = env.fetchImpl ?? fetch;
  const now = env.now ?? Date.now;
  const deadline = now() + env.answerTimeoutMs;
  const wait = env.waitSeconds ?? 20;
  while (now() < deadline) {
    try {
      const res = await fetchImpl(`${env.server}/api/requests/${env.requestId}/questions/${questionId}?wait=${wait}`, { headers: { authorization: `Bearer ${env.token}` } });
      if (res.status === 404) return null;
      if (res.ok) {
        const body = (await res.json()) as { question?: { answer?: { allow: boolean; answers?: Record<string, string> } } };
        if (body.question?.answer) return body.question.answer;
        continue;
      }
    } catch {
      /* the Room is away for a moment; ask again after a pause */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

/** Put one question to the owner and wait for the tap. Never throws. */
export async function askOwner(args: unknown, env: AskOwnerEnv): Promise<Decision> {
  const a = isDict(args) ? args : {};
  const toolName = typeof a.tool_name === "string" ? a.tool_name : "unknown";
  const input = isDict(a.input) ? a.input : {};
  const questionId = await postQuestion(env, questionFrom(toolName, input, env.root));
  if (!questionId) {
    await log(`mcp: could not put a question to the Room for request ${env.requestId}`);
    return { behavior: "deny", message: "Glasshouse could not be reached to ask the owner. Do not retry this action; carry on without it, or stop and say plainly what you needed." };
  }
  const answer = await waitForAnswer(env, questionId);
  return decisionFrom(toolName, input, answer);
}

interface RpcRequest {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: unknown;
}

/** One JSON-RPC message in, at most one out. Pure apart from `ask`. */
export async function handleRpc(msg: RpcRequest, ask: (args: unknown) => Promise<Decision>): Promise<Dict | null> {
  const id = msg.id;
  const reply = (result: unknown) => (id === undefined ? null : { jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string) => (id === undefined ? null : { jsonrpc: "2.0", id, error: { code, message } });
  const params = isDict(msg.params) ? msg.params : {};
  switch (msg.method) {
    case "initialize":
      return reply({ protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "glasshouse", version: CONNECTOR_VERSION } });
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return reply({});
    case "tools/list":
      return reply({
        tools: [
          {
            name: ASK_OWNER_TOOL,
            description: "Puts a permission request or a multiple-choice question to the project's owner in Glasshouse and waits for their answer.",
            inputSchema: {
              type: "object",
              properties: { tool_name: { type: "string" }, input: { type: "object" }, tool_use_id: { type: "string" } },
              required: ["tool_name", "input"],
            },
          },
        ],
      });
    case "tools/call": {
      if (params.name !== ASK_OWNER_TOOL) return fail(-32602, `unknown tool ${String(params.name)}`);
      const decision = await ask(params.arguments);
      return reply({ content: [{ type: "text", text: JSON.stringify(decision) }] });
    }
    default:
      return msg.method?.startsWith("notifications/") ? null : fail(-32601, `unknown method ${String(msg.method)}`);
  }
}

export function envFromProcess(env: NodeJS.ProcessEnv): AskOwnerEnv | null {
  const server = env.GLASSHOUSE_SERVER?.replace(/\/+$/, "");
  const token = env.GLASSHOUSE_TOKEN;
  const requestId = env.GLASSHOUSE_REQUEST_ID;
  const root = env.GLASSHOUSE_ROOT ?? process.cwd();
  if (!server || !token || !requestId) return null;
  const timeout = Number(env.GLASSHOUSE_ANSWER_TIMEOUT_MS ?? "");
  return { server, token, requestId, root, answerTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 30 * 60 * 1000 };
}

/** Serve until stdin closes. */
export async function serveMcp(env: AskOwnerEnv, stdin: NodeJS.ReadableStream = process.stdin, stdout: NodeJS.WritableStream = process.stdout): Promise<void> {
  const rl = createInterface({ input: stdin, crlfDelay: Number.POSITIVE_INFINITY });
  const ask = (args: unknown) => askOwner(args, env);
  const pending: Promise<void>[] = [];
  for await (const line of rl) {
    const text = line.trim();
    if (!text) continue;
    let msg: RpcRequest;
    try {
      msg = JSON.parse(text) as RpcRequest;
    } catch {
      continue;
    }
    // Each call is answered as its owner answers; a second question must not wait on the first.
    pending.push(
      handleRpc(msg, ask)
        .then((out) => {
          if (out) stdout.write(JSON.stringify(out) + "\n");
        })
        .catch((err) => log(`mcp: ${String(err)}`)),
    );
  }
  await Promise.allSettled(pending);
}
