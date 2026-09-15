import { EventEmitter } from "node:events";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LinkedProject } from "./config.js";
import { launchFor, parseOutput, reasonFor, runRequest, startRequestListener, type RoomRequest } from "./requests.js";

const project: LinkedProject = { projectId: "p1", name: "demo", root: "/home/chris/demo", server: "http://room.local", token: "gh_test", linkedAt: "2026-09-14T00:00:00.000Z" };
const base: RoomRequest = { id: "r1", tool: "claude-code", text: "Fix the login bug", care: "ask" };

let runDir: string;
beforeAll(async () => {
  runDir = await mkdtemp(join(tmpdir(), "glasshouse-runs-"));
});
afterAll(async () => {
  await rm(runDir, { recursive: true, force: true });
});

describe("the command for a request", () => {
  const opts = { cliPath: "/opt/glasshouse/cli.js", nodePath: "/usr/bin/node", runDir: "/tmp/runs" };

  it("starts Claude Code under the Room's session id, edits allowed, questions through the bridge", () => {
    const l = launchFor({ ...base, externalSessionId: "sess-1" }, project, opts);
    expect(l.cmd).toBe("claude");
    expect(l.args).toEqual(["-p", "--output-format", "json", "--session-id", "sess-1", "--permission-mode", "acceptEdits", "--permission-prompt-tool", "mcp__glasshouse__ask_owner", "--mcp-config", join(opts.runDir, "r1.mcp.json")]);
    expect(l.stdin).toBe("Fix the login bug");
    expect(l.env?.MCP_TOOL_TIMEOUT).toBeDefined();
    const mcp = JSON.parse(l.files![0]!.body) as { mcpServers: { glasshouse: { command: string; args: string[]; env: Record<string, string> } } };
    expect(mcp.mcpServers.glasshouse.command).toBe("/usr/bin/node");
    expect(mcp.mcpServers.glasshouse.args).toEqual(["/opt/glasshouse/cli.js", "mcp"]);
    expect(mcp.mcpServers.glasshouse.env).toMatchObject({ GLASSHOUSE_SERVER: "http://room.local", GLASSHOUSE_TOKEN: "gh_test", GLASSHOUSE_REQUEST_ID: "r1", GLASSHOUSE_ROOT: "/home/chris/demo" });
  });

  it("resumes a session for a follow-up, and skips every check when the owner said so", () => {
    const l = launchFor({ ...base, care: "free", continues: { sessionId: "room-s", externalId: "sess-9" } }, project, opts);
    expect(l.args).toEqual(["-p", "--output-format", "json", "--resume", "sess-9", "--permission-mode", "bypassPermissions", "--dangerously-skip-permissions"]);
    expect(l.files).toEqual([]);
  });

  it("runs Codex in its sandbox from stdin, resuming its thread for a follow-up", () => {
    expect(launchFor({ ...base, tool: "codex" }, project, opts)).toMatchObject({ cmd: "codex", args: ["exec", "-C", "/home/chris/demo", "--skip-git-repo-check", "--json", "--sandbox", "workspace-write", "-"], stdin: "Fix the login bug" });
    expect(launchFor({ ...base, tool: "codex", care: "free", continues: { sessionId: "s", externalId: "thread-1" } }, project, opts).args).toEqual(["exec", "-C", "/home/chris/demo", "--skip-git-repo-check", "--json", "--dangerously-bypass-approvals-and-sandbox", "resume", "thread-1", "-"]);
  });

  it("runs Cursor's agent in the folder, forcing commands only when the owner said so", () => {
    expect(launchFor({ ...base, tool: "cursor" }, project, opts)).toMatchObject({ cmd: "cursor-agent", args: ["-p", "--output-format", "stream-json", "--workspace", "/home/chris/demo", "--trust", "Fix the login bug"] });
    expect(launchFor({ ...base, tool: "cursor", care: "free", continues: { sessionId: "s", externalId: "chat-1" } }, project, opts).args).toContain("--force");
    expect(launchFor({ ...base, tool: "cursor", continues: { sessionId: "s", externalId: "chat-1" } }, project, opts).args).toContain("--resume");
  });
});

describe("what the tools print", () => {
  it("reads Claude Code's result object", () => {
    const out = JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "Done: 42", session_id: "sess-1", total_cost_usd: 0.12, duration_ms: 4000, num_turns: 3 });
    expect(parseOutput("claude-code", out)).toEqual({ sessionId: "sess-1", closing: "Done: 42", ok: true, error: undefined, costUsd: 0.12, durationMs: 4000, turns: 3 });
    expect(parseOutput("claude-code", JSON.stringify({ type: "result", is_error: true, result: "Not logged in" }))).toMatchObject({ ok: false, error: "Not logged in" });
    expect(parseOutput("claude-code", "")).toEqual({});
  });
  it("reads Codex's thread id, closing message and outcome from its JSON lines", () => {
    const lines = [
      { type: "thread.started", thread_id: "thread-7" },
      { type: "item.completed", item: { id: "i1", type: "agent_message", text: "All done." } },
      { type: "turn.completed", usage: { input_tokens: 1 } },
    ].map((o) => JSON.stringify(o)).join("\n");
    expect(parseOutput("codex", lines)).toEqual({ sessionId: "thread-7", closing: "All done.", ok: true, error: undefined });
    expect(parseOutput("codex", JSON.stringify({ type: "turn.failed", error: { message: "boom" } }))).toMatchObject({ ok: false, error: "boom" });
  });
  it("reads Cursor's session id and result", () => {
    const lines = [JSON.stringify({ type: "system", subtype: "init", session_id: "chat-3" }), JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "ok", session_id: "chat-3", duration_ms: 10 })].join("\n");
    expect(parseOutput("cursor", lines)).toEqual({ sessionId: "chat-3", closing: "ok", ok: true, error: undefined, durationMs: 10 });
  });
  it("says why in the owner's words", () => {
    expect(reasonFor("codex", "missing")).toMatch(/^Codex is not installed on this computer/);
    expect(reasonFor("claude-code", "timeout", "120 minutes")).toBe("Claude Code was still running after 120 minutes, so it was stopped.");
  });
});

/** A child process that behaves as the tests say, with the stdio streams a real one has. */
class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  killed = false;
  kill() {
    this.killed = true;
    this.emit("close", null);
    return true;
  }
}

function fakeRoom() {
  const calls: Array<{ path: string; body: unknown }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const path = url.replace("http://room.local", "");
    calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("running a request", () => {
  it("reports running, then finished with the facts from the process, and tidies its files", async () => {
    const room = fakeRoom();
    let child: FakeChild | undefined;
    const spawnImpl = ((cmd: string, args: string[]) => {
      expect(cmd).toBe("claude");
      expect(args).toContain("--session-id");
      child = new FakeChild();
      return child;
    }) as never;
    const done = runRequest({ ...base, externalSessionId: "sess-1" }, project, { projects: [project], cliPath: "/cli.js", fetchImpl: room.fetchImpl, spawnImpl, runDir }, new Set());
    await new Promise((r) => setTimeout(r, 20));
    expect((await readdir(runDir)).some((f) => f === "r1.mcp.json")).toBe(true);
    let stdinText = "";
    child!.stdin.on("data", (c: Buffer) => (stdinText += c.toString()));
    await new Promise((r) => setTimeout(r, 5));
    expect(stdinText).toBe("Fix the login bug");
    child!.stdout.write(JSON.stringify({ type: "result", is_error: false, result: "Fixed it.", session_id: "sess-1", total_cost_usd: 0.2, num_turns: 4 }));
    child!.emit("close", 0);
    const result = await done;
    expect(result).toMatchObject({ ok: true, closing: "Fixed it.", exitCode: 0, costUsd: 0.2, turns: 4 });
    expect(result.command).toBe("claude -p --output-format json --session-id sess-1 --permission-mode acceptEdits --permission-prompt-tool mcp__glasshouse__ask_owner --mcp-config " + join(runDir, "r1.mcp.json"));
    expect(room.calls.map((c) => c.path)).toEqual(["/api/requests/r1/status", "/api/requests/r1/status"]);
    expect(room.calls[0]!.body).toEqual({ status: "running", externalSessionId: "sess-1" });
    expect(room.calls[1]!.body).toMatchObject({ status: "finished", result: { ok: true } });
    expect((await readdir(runDir)).some((f) => f === "r1.mcp.json")).toBe(false);
  });

  it("says plainly when the tool is not installed", async () => {
    const room = fakeRoom();
    const spawnImpl = (() => {
      const c = new FakeChild();
      setTimeout(() => c.emit("error", Object.assign(new Error("spawn codex ENOENT"), { code: "ENOENT" })), 5);
      return c;
    }) as never;
    const result = await runRequest({ ...base, id: "r2", tool: "codex" }, project, { projects: [project], cliPath: "/cli.js", fetchImpl: room.fetchImpl, spawnImpl, runDir }, new Set());
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/^Codex is not installed/) });
    expect(room.calls.at(-1)!.body).toMatchObject({ status: "failed", result: { ok: false } });
  });

  it("reports Codex's thread id as soon as it appears, and a bad exit as failed", async () => {
    const room = fakeRoom();
    let child: FakeChild | undefined;
    const spawnImpl = (() => (child = new FakeChild())) as never;
    const done = runRequest({ ...base, id: "r3", tool: "codex" }, project, { projects: [project], cliPath: "/cli.js", fetchImpl: room.fetchImpl, spawnImpl, runDir }, new Set());
    await new Promise((r) => setTimeout(r, 10));
    child!.stdout.write(JSON.stringify({ type: "thread.started", thread_id: "t-1" }) + "\n");
    await new Promise((r) => setTimeout(r, 10));
    child!.stderr.write("something broke");
    child!.emit("close", 2);
    const result = await done;
    expect(result).toMatchObject({ ok: false, exitCode: 2, reason: "Codex stopped with an error: something broke.", stderr: "something broke" });
    expect(room.calls.some((c) => c.path === "/api/requests/r3/status" && (c.body as { externalSessionId?: string }).externalSessionId === "t-1")).toBe(true);
  });
});

describe("listening for requests", () => {
  it("asks, takes, runs, and waits for a session's run before its follow-up", async () => {
    const queue: RoomRequest[] = [
      { id: "a", tool: "claude-code", text: "first", care: "ask", externalSessionId: "s1" },
      { id: "b", tool: "claude-code", text: "follow-up", care: "ask", continues: { sessionId: "room", externalId: "s1" } },
    ];
    const calls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const path = String(input).replace("http://room.local", "");
      calls.push(`${init?.method ?? "GET"} ${path}`);
      if (path.startsWith("/api/requests/next")) {
        const r = queue.shift() ?? null;
        if (!r) await new Promise((res) => setTimeout(res, 30));
        return new Response(JSON.stringify({ request: r }), { status: 200 });
      }
      return new Response(JSON.stringify({ request: {} }), { status: 200 });
    }) as typeof fetch;
    const children: FakeChild[] = [];
    const spawnImpl = (() => {
      const c = new FakeChild();
      children.push(c);
      return c;
    }) as never;
    const listener = startRequestListener({ projects: [project], cliPath: "/cli.js", fetchImpl, spawnImpl, runDir, waitSeconds: 1 });
    await new Promise((r) => setTimeout(r, 60));
    expect(calls.filter((c) => c.endsWith("/take"))).toEqual(["POST /api/requests/a/take", "POST /api/requests/b/take"]);
    // The follow-up must not start while the first run of that session is still going.
    expect(children).toHaveLength(1);
    children[0]!.stdout.write(JSON.stringify({ type: "result", is_error: false, result: "done", session_id: "s1" }));
    children[0]!.emit("close", 0);
    await new Promise((r) => setTimeout(r, 30));
    expect(children).toHaveLength(2);
    await listener.stop();
    expect(children[1]!.killed).toBe(true);
  });
});
