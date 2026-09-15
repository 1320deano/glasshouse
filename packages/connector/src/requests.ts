/**
 * Taking requests from the Room (Phase 8): the connector asks the Room for the next thing the
 * owner wants run, claims it, starts the tool in the linked folder through the tool's own
 * non-interactive mode, and reports what happened. The tool's hooks then tell the Room what it is
 * doing exactly as they do for a run started in a terminal, so the Room needs nothing new to show it.
 *
 *   Claude Code   claude -p, the session id chosen by the Room so its card is linked from the first
 *                 action; --resume for a follow-up; questions go to the owner through `glasshouse mcp`.
 *   Codex         codex exec (resume for a follow-up), thread id read from its JSON output.
 *   Cursor        agent -p (--resume for a follow-up), session id read from its JSON output.
 *
 * Rule 4 still holds on the agents' side: nothing here blocks or alters a run. It starts one the
 * owner asked for, and answers the questions the owner answers. A follow-up to a session whose run
 * is still going waits for that run to end, because two runs of one session would trample it.
 */
import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CONNECTOR_VERSION, homeDir, log, type LinkedProject } from "./config.js";
import { PERMISSION_TOOL_NAME } from "./mcp.js";

export type RequestTool = "claude-code" | "codex" | "cursor";

/** The request as the Room hands it over. */
export interface RoomRequest {
  id: string;
  tool: RequestTool | "glasshouse";
  text: string;
  care: "ask" | "free";
  continues?: { sessionId: string; externalId: string };
  externalSessionId?: string;
}

export interface RequestResult {
  ok: boolean;
  reason?: string;
  closing?: string;
  exitCode?: number;
  command?: string;
  stderr?: string;
  costUsd?: number;
  durationMs?: number;
  turns?: number;
}

export interface Launch {
  cmd: string;
  args: string[];
  /** Given to the tool on stdin, then stdin is closed. */
  stdin?: string;
  env?: Record<string, string>;
  /** Files written for the run, removed afterwards. */
  files?: Array<{ path: string; body: string }>;
}

export interface RequestDeps {
  projects: LinkedProject[];
  /** Absolute path of the built connector, for the MCP bridge Claude Code starts. */
  cliPath: string;
  fetchImpl?: typeof fetch;
  spawnImpl?: typeof nodeSpawn;
  out?: (line: string) => void;
  /** Long-poll length when asking the Room, in seconds. */
  waitSeconds?: number;
  /** A run longer than this is stopped and reported. */
  maxRunMs?: number;
  /** Where the MCP config files go. Defaults to ~/.glasshouse/runs. */
  runDir?: string;
  nodePath?: string;
}

const TOOL_NAME: Record<RequestTool, string> = { "claude-code": "Claude Code", codex: "Codex", cursor: "Cursor" };
/** How long a question in the Room waits for the owner before the run is told no. */
export const ANSWER_TIMEOUT_MS = Number(process.env.GLASSHOUSE_ANSWER_TIMEOUT_MS ?? "") > 0 ? Number(process.env.GLASSHOUSE_ANSWER_TIMEOUT_MS) : 30 * 60 * 1000;
const CLOSING_KEEP = 2000;
const STDERR_KEEP = 1500;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);
const tail = (s: string, n: number) => (s.length > n ? "…" + s.slice(-n) : s);

/** The exact command for a request. Pure, so the tests can read it. */
export function launchFor(request: RoomRequest, project: LinkedProject, opts: { cliPath: string; nodePath: string; runDir: string }): Launch {
  const follow = request.continues?.externalId;
  switch (request.tool) {
    case "claude-code": {
      const args = ["-p", "--output-format", "json"];
      if (follow) args.push("--resume", follow);
      else if (request.externalSessionId) args.push("--session-id", request.externalSessionId);
      const files: Launch["files"] = [];
      // Claude Code gives an MCP tool a minute by default and then retries; the owner may take longer
      // to tap Allow, so the bridge's call is allowed to wait as long as the owner is allowed to.
      const env: Record<string, string> = { MCP_TOOL_TIMEOUT: String(ANSWER_TIMEOUT_MS + 60_000) };
      if (request.care === "free") {
        args.push("--permission-mode", "bypassPermissions", "--dangerously-skip-permissions");
      } else {
        // Files may be changed; anything else is put to the owner in the Room through `glasshouse mcp`.
        const mcpPath = join(opts.runDir, `${request.id}.mcp.json`);
        const mcp = {
          mcpServers: {
            glasshouse: {
              type: "stdio",
              command: opts.nodePath,
              args: [opts.cliPath, "mcp"],
              env: { GLASSHOUSE_SERVER: project.server, GLASSHOUSE_TOKEN: project.token, GLASSHOUSE_REQUEST_ID: request.id, GLASSHOUSE_ROOT: project.root, GLASSHOUSE_ANSWER_TIMEOUT_MS: String(ANSWER_TIMEOUT_MS) },
            },
          },
        };
        files.push({ path: mcpPath, body: JSON.stringify(mcp) });
        args.push("--permission-mode", "acceptEdits", "--permission-prompt-tool", PERMISSION_TOOL_NAME, "--mcp-config", mcpPath);
      }
      return { cmd: "claude", args, stdin: request.text, env, files };
    }
    case "codex": {
      const args = ["exec", "-C", project.root, "--skip-git-repo-check", "--json"];
      if (request.care === "free") args.push("--dangerously-bypass-approvals-and-sandbox");
      else args.push("--sandbox", "workspace-write");
      if (follow) args.push("resume", follow);
      args.push("-");
      return { cmd: "codex", args, stdin: request.text };
    }
    case "cursor": {
      const args = ["-p", "--output-format", "stream-json", "--workspace", project.root, "--trust"];
      if (request.care === "free") args.push("--force");
      if (follow) args.push("--resume", follow);
      args.push(request.text);
      return { cmd: "cursor-agent", args, stdin: undefined };
    }
    default:
      throw new Error(`cannot start ${request.tool}`);
  }
}

/** What the tool printed, read for the facts the Room keeps. Pure. */
export function parseOutput(tool: RequestTool, stdout: string): { sessionId?: string; closing?: string; ok?: boolean; costUsd?: number; durationMs?: number; turns?: number; error?: string } {
  const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith("{"));
  const objs = lines.flatMap((l) => {
    try {
      return [JSON.parse(l) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
  if (tool === "claude-code") {
    // --output-format json: one object, possibly pretty-printed over many lines.
    let obj = objs.find((o) => o.type === "result");
    if (!obj) {
      try {
        const start = stdout.indexOf("{");
        obj = start >= 0 ? (JSON.parse(stdout.slice(start)) as Record<string, unknown>) : undefined;
      } catch {
        obj = undefined;
      }
    }
    if (!obj) return {};
    const result = typeof obj.result === "string" ? obj.result : undefined;
    const isError = obj.is_error === true;
    return {
      sessionId: typeof obj.session_id === "string" ? obj.session_id : undefined,
      closing: result ? clip(result, CLOSING_KEEP) : undefined,
      ok: !isError,
      error: isError ? clip(result ?? String(obj.subtype ?? "error"), 600) : undefined,
      costUsd: typeof obj.total_cost_usd === "number" ? obj.total_cost_usd : undefined,
      durationMs: typeof obj.duration_ms === "number" ? obj.duration_ms : undefined,
      turns: typeof obj.num_turns === "number" ? obj.num_turns : undefined,
    };
  }
  if (tool === "codex") {
    const started = objs.find((o) => o.type === "thread.started");
    const messages = objs.filter((o) => o.type === "item.completed" && typeof o.item === "object" && o.item !== null && (o.item as Record<string, unknown>).type === "agent_message");
    const last = messages.at(-1)?.item as Record<string, unknown> | undefined;
    const failed = objs.find((o) => o.type === "turn.failed" || o.type === "error");
    const errText = failed ? (typeof failed.message === "string" ? failed.message : typeof failed.error === "object" && failed.error !== null ? String((failed.error as Record<string, unknown>).message ?? "") : "") : "";
    return {
      sessionId: typeof started?.thread_id === "string" ? started.thread_id : undefined,
      closing: typeof last?.text === "string" ? clip(last.text, CLOSING_KEEP) : undefined,
      ok: failed ? false : objs.some((o) => o.type === "turn.completed") ? true : undefined,
      error: failed ? clip(errText || "Codex reported an error", 600) : undefined,
    };
  }
  const init = objs.find((o) => o.type === "system" && o.subtype === "init");
  const result = objs.find((o) => o.type === "result");
  const text = typeof result?.result === "string" ? result.result : undefined;
  return {
    sessionId: typeof result?.session_id === "string" ? result.session_id : typeof init?.session_id === "string" ? init.session_id : undefined,
    closing: text ? clip(text, CLOSING_KEEP) : undefined,
    ok: result ? result.is_error !== true : undefined,
    error: result?.is_error === true ? clip(text ?? "Cursor reported an error", 600) : undefined,
    durationMs: typeof result?.duration_ms === "number" ? result.duration_ms : undefined,
  };
}

/** Plain words for why a run could not happen. */
export function reasonFor(tool: RequestTool, kind: "missing" | "spawn" | "exit" | "timeout" | "stopped" | "error", detail?: string): string {
  const who = TOOL_NAME[tool];
  switch (kind) {
    case "missing":
      return `${who} is not installed on this computer, or your computer cannot find it. Install it, or open a new terminal so the path is picked up, then send this again.`;
    case "spawn":
      return `${who} could not be started${detail ? `: ${detail}` : ""}.`;
    case "exit":
      return `${who} stopped with an error${detail ? `: ${detail}` : ""}.`;
    case "timeout":
      return `${who} was still running after ${detail ?? "a long time"}, so it was stopped.`;
    case "stopped":
      return `The connector on your computer was stopped while ${who} was running, so the run was ended.`;
    case "error":
      return `${who} reported a problem${detail ? `: ${detail}` : ""}.`;
  }
}

async function post(deps: RequestDeps, project: LinkedProject, path: string, body: unknown): Promise<{ ok: boolean; status: number; body?: Record<string, unknown> }> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`${project.server.replace(/\/+$/, "")}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${project.token}` },
      body: JSON.stringify(body ?? {}),
    });
    const parsed = (await res.json().catch(() => undefined)) as Record<string, unknown> | undefined;
    return { ok: res.ok, status: res.status, body: parsed };
  } catch {
    return { ok: false, status: 0 };
  }
}

async function report(deps: RequestDeps, project: LinkedProject, id: string, status: "running" | "finished" | "failed", extra: { externalSessionId?: string; result?: RequestResult } = {}) {
  const res = await post(deps, project, `/api/requests/${id}/status`, { status, ...extra });
  if (!res.ok) await log(`requests: could not report ${status} for ${id} (${res.status || "no connection"})`);
}

/** Runs one request to the end and reports. Never throws. */
export async function runRequest(request: RoomRequest, project: LinkedProject, deps: RequestDeps, children: Set<ChildProcess>): Promise<RequestResult> {
  const out = deps.out ?? (() => undefined);
  const spawnImpl = deps.spawnImpl ?? nodeSpawn;
  const tool = request.tool as RequestTool;
  const runDir = deps.runDir ?? join(homeDir(), "runs");
  const launch = launchFor(request, project, { cliPath: deps.cliPath, nodePath: deps.nodePath ?? process.execPath, runDir });
  const shown = `${launch.cmd} ${launch.args.filter((a) => a !== request.text).join(" ")}`;
  for (const f of launch.files ?? []) {
    await mkdir(runDir, { recursive: true });
    await writeFile(f.path, f.body, "utf8");
  }
  const startedAt = Date.now();
  const finish = async (result: RequestResult) => {
    for (const f of launch.files ?? []) await unlink(f.path).catch(() => undefined);
    await report(deps, project, request.id, result.ok ? "finished" : "failed", { result });
    return result;
  };

  return new Promise<RequestResult>((resolve) => {
    let child: ChildProcess;
    try {
      child = spawnImpl(launch.cmd, launch.args, { cwd: project.root, env: { ...process.env, ...launch.env }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true, shell: process.platform === "win32" });
    } catch (err) {
      void finish({ ok: false, reason: reasonFor(tool, "spawn", String(err)), command: shown }).then(resolve);
      return;
    }
    children.add(child);
    let stdout = "";
    let stderr = "";
    let reportedSession = request.externalSessionId;
    let settled = false;
    const settle = (result: RequestResult) => {
      if (settled) return;
      settled = true;
      children.delete(child);
      clearTimeout(timer);
      void finish(result).then(resolve);
    };
    const timer = setTimeout(
      () => {
        child.kill("SIGTERM");
        settle({ ok: false, reason: reasonFor(tool, "timeout", `${Math.round((deps.maxRunMs ?? DEFAULT_MAX_RUN_MS) / 60000)} minutes`), command: shown, stderr: tail(stderr, STDERR_KEEP), durationMs: Date.now() - startedAt });
      },
      deps.maxRunMs ?? DEFAULT_MAX_RUN_MS,
    );
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (!reportedSession) {
        const sid = parseOutput(tool, stdout).sessionId;
        if (sid) {
          reportedSession = sid;
          void report(deps, project, request.id, "running", { externalSessionId: sid });
        }
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = tail(stderr + chunk.toString("utf8"), 20000);
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      settle({ ok: false, reason: err.code === "ENOENT" ? reasonFor(tool, "missing") : reasonFor(tool, "spawn", err.message), command: shown });
    });
    child.on("close", (code) => {
      const parsed = parseOutput(tool, stdout);
      const durationMs = parsed.durationMs ?? Date.now() - startedAt;
      const base = { command: shown, exitCode: code ?? undefined, stderr: tail(stderr, STDERR_KEEP) || undefined, closing: parsed.closing, costUsd: parsed.costUsd, durationMs, turns: parsed.turns };
      if (stopping.has(child)) settle({ ...base, ok: false, reason: reasonFor(tool, "stopped") });
      else if (parsed.ok === false) settle({ ...base, ok: false, reason: reasonFor(tool, "error", parsed.error) });
      else if (code !== 0) settle({ ...base, ok: false, reason: reasonFor(tool, "exit", tail(stderr.trim(), 200) || (code === null ? "it was stopped" : `code ${code}`)) });
      else settle({ ...base, ok: true });
    });
    if (launch.stdin !== undefined) child.stdin?.end(launch.stdin);
    else child.stdin?.end();
    out(`${TOOL_NAME[tool]} started for the Room: “${clip(request.text.replace(/\s+/g, " "), 80)}”`);
    void report(deps, project, request.id, "running", reportedSession ? { externalSessionId: reportedSession } : {});
  });
}

const DEFAULT_MAX_RUN_MS = 2 * 60 * 60 * 1000;
const stopping = new WeakSet<ChildProcess>();

export interface RequestListener {
  stop(): Promise<void>;
  /** Runs going right now. */
  running(): number;
}

/** Ask each linked project's Room for requests, forever, and run what comes. */
export function startRequestListener(deps: RequestDeps): RequestListener {
  const out = deps.out ?? (() => undefined);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const wait = deps.waitSeconds ?? 20;
  const children = new Set<ChildProcess>();
  const controller = new AbortController();
  /** A follow-up waits for the run of the same session to end. */
  const bySession = new Map<string, Promise<unknown>>();
  let stopped = false;
  const sleep = (ms: number) => new Promise<void>((r) => {
    const t = setTimeout(r, ms);
    controller.signal.addEventListener("abort", () => {
      clearTimeout(t);
      r();
    });
  });

  async function loop(project: LinkedProject) {
    let warnedAuth = false;
    while (!stopped) {
      let res: Response;
      try {
        res = await fetchImpl(`${project.server.replace(/\/+$/, "")}/api/requests/next?wait=${wait}`, { headers: { authorization: `Bearer ${project.token}` }, signal: controller.signal });
      } catch {
        if (stopped) return;
        await sleep(3000);
        continue;
      }
      if (res.status === 401) {
        if (!warnedAuth) out(`${project.name}: the Room no longer knows this folder's token; run \`glasshouse connect\` again. Trying again every minute.`);
        warnedAuth = true;
        await sleep(60000);
        continue;
      }
      if (res.status === 404) {
        // A Room from before Phase 8: nothing to take. Check again now and then in case it is updated.
        await sleep(60000);
        continue;
      }
      if (!res.ok) {
        await sleep(5000);
        continue;
      }
      const body = (await res.json().catch(() => ({}))) as { request?: RoomRequest | null };
      const request = body.request;
      if (!request || request.tool === "glasshouse") continue;
      const taken = await post(deps, project, `/api/requests/${request.id}/take`, {});
      if (!taken.ok) continue;
      const key = request.continues?.externalId ?? request.externalSessionId;
      const previous = key ? bySession.get(key) : undefined;
      const run = (async () => {
        if (previous) {
          out(`${TOOL_NAME[request.tool as RequestTool]}: waiting for its current run to end before the follow-up.`);
          await previous.catch(() => undefined);
        }
        const result = await runRequest(request, project, deps, children);
        out(result.ok ? `${TOOL_NAME[request.tool as RequestTool]} finished the Room's request.` : `${TOOL_NAME[request.tool as RequestTool]} could not finish the Room's request: ${result.reason}`);
      })();
      if (key) {
        bySession.set(key, run);
        void run.finally(() => {
          if (bySession.get(key) === run) bySession.delete(key);
        });
      }
    }
  }

  const loops = deps.projects.map((p) => loop(p).catch((err) => log(`requests: listener for ${p.name} stopped: ${String(err)}`)));

  return {
    running: () => children.size,
    async stop() {
      stopped = true;
      controller.abort();
      for (const child of children) {
        stopping.add(child);
        child.kill("SIGTERM");
      }
      await Promise.allSettled(loops);
      const deadline = Date.now() + 5000;
      while (children.size > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
    },
  };
}

export const REQUESTS_VERSION = CONNECTOR_VERSION;
