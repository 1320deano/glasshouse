import { describe, expect, it } from "vitest";
import { answersByQuestion, askOwner, decisionFrom, handleRpc, questionFrom, type AskOwnerEnv } from "./mcp.js";

describe("the bridge's words for the Room", () => {
  it("turns a permission for a command into the record's own shape", () => {
    const q = questionFrom("Bash", { command: "pnpm test", description: "Run the checks" }, "/home/chris/demo");
    expect(q).toMatchObject({ kind: "permission", toolName: "Bash", eventKind: "test_run", summary: "Run the checks", description: "Run the checks", command: "pnpm test", paths: [] });
  });
  it("keeps the file a change is for, made relative, and never its contents", () => {
    const q = questionFrom("Write", { file_path: "/home/chris/demo/src/auth/session.ts", content: "SECRET" }, "/home/chris/demo");
    expect(q).toMatchObject({ kind: "permission", eventKind: "edit", paths: ["src/auth/session.ts"] });
    expect(JSON.stringify(q)).not.toContain("SECRET");
  });
  it("carries a multiple-choice question with its options", () => {
    const q = questionFrom("AskUserQuestion", { questions: [{ question: "Red or blue?", header: "Colour", options: [{ label: "Red" }, { label: "Blue", description: "The colour blue" }], multiSelect: false }] }, "/x");
    expect(q).toMatchObject({ kind: "choice", summary: "Asked: Red or blue?", choices: [{ question: "Red or blue?", header: "Colour", options: [{ label: "Red" }, { label: "Blue", description: "The colour blue" }] }] });
  });
});

describe("what Claude Code is told", () => {
  const input = { command: "pnpm test" };
  it("allows with the same input, denies with a reason, and denies when nobody answered", () => {
    expect(decisionFrom("Bash", input, { allow: true })).toEqual({ behavior: "allow", updatedInput: input });
    expect(decisionFrom("Bash", input, { allow: false })).toMatchObject({ behavior: "deny", message: expect.stringMatching(/owner said no/) });
    expect(decisionFrom("Bash", input, null)).toMatchObject({ behavior: "deny", message: expect.stringMatching(/did not answer/) });
  });
  it("answers a question by its exact text, forgiving spacing and a lone answer", () => {
    const q = { questions: [{ question: "Red or blue?", options: [{ label: "Red" }, { label: "Blue" }] }] };
    expect(answersByQuestion(q, { "Red or blue?": "Blue" })).toEqual({ "Red or blue?": "Blue" });
    expect(answersByQuestion(q, { "red or  blue? ": "Blue" })).toEqual({ "Red or blue?": "Blue" });
    expect(answersByQuestion(q, { whatever: "Red" })).toEqual({ "Red or blue?": "Red" });
    expect(decisionFrom("AskUserQuestion", q, { allow: true, answers: { "Red or blue?": "Blue" } })).toEqual({ behavior: "allow", updatedInput: { questions: q.questions, answers: { "Red or blue?": "Blue" } } });
  });
});

describe("the wire", () => {
  const ask = async () => ({ behavior: "allow" as const, updatedInput: {} });
  it("answers initialize, lists the one tool, and wraps a decision as text", async () => {
    const init = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, ask);
    expect(init).toMatchObject({ id: 1, result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "glasshouse" } } });
    expect(await handleRpc({ method: "notifications/initialized" }, ask)).toBeNull();
    const list = (await handleRpc({ id: 2, method: "tools/list" }, ask)) as { result: { tools: Array<{ name: string }> } };
    expect(list.result.tools.map((t) => t.name)).toEqual(["ask_owner"]);
    const call = (await handleRpc({ id: 3, method: "tools/call", params: { name: "ask_owner", arguments: { tool_name: "Bash", input: {} } } }, ask)) as { result: { content: Array<{ type: string; text: string }> } };
    expect(JSON.parse(call.result.content[0]!.text)).toEqual({ behavior: "allow", updatedInput: {} });
    expect(await handleRpc({ id: 4, method: "tools/call", params: { name: "other" } }, ask)).toMatchObject({ error: { code: -32602 } });
    expect(await handleRpc({ id: 5, method: "nope" }, ask)).toMatchObject({ error: { code: -32601 } });
  });
});

describe("asking the owner through the Room", () => {
  function room(answerAfter: number) {
    let polls = 0;
    const posted: unknown[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ question: { id: "q1" } }), { status: 200 });
      }
      polls++;
      expect(url).toContain("/api/requests/r1/questions/q1?wait=");
      const answer = polls >= answerAfter ? { allow: true } : undefined;
      return new Response(JSON.stringify({ question: { id: "q1", answer } }), { status: 200 });
    }) as typeof fetch;
    return { fetchImpl, posted, polls: () => polls };
  }
  const env = (fetchImpl: typeof fetch, answerTimeoutMs = 10_000): AskOwnerEnv => ({ server: "http://room.local", token: "t", requestId: "r1", root: "/x", answerTimeoutMs, fetchImpl, waitSeconds: 1 });

  it("posts the question, waits for the tap, and allows", async () => {
    const r = room(2);
    const decision = await askOwner({ tool_name: "Bash", input: { command: "pnpm test" } }, env(r.fetchImpl));
    expect(decision).toEqual({ behavior: "allow", updatedInput: { command: "pnpm test" } });
    expect(r.posted[0]).toMatchObject({ kind: "permission", command: "pnpm test" });
    expect(r.polls()).toBe(2);
  });
  it("says no when the owner never answers in time", async () => {
    let t = 0;
    const r = room(Number.POSITIVE_INFINITY);
    const decision = await askOwner({ tool_name: "Bash", input: {} }, { ...env(r.fetchImpl, 3), now: () => (t += 2) });
    expect(decision).toMatchObject({ behavior: "deny", message: expect.stringMatching(/did not answer/) });
  });
  it("says no when the Room cannot be reached", async () => {
    const fetchImpl = (async () => {
      throw new Error("down");
    }) as typeof fetch;
    expect(await askOwner({ tool_name: "Bash", input: {} }, env(fetchImpl))).toMatchObject({ behavior: "deny", message: expect.stringMatching(/could not be reached/) });
  });
});
