import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { subscribe, type RoomNotice } from "@/lib/bus";
import { MemoryStore } from "@/lib/store/memory";
import type { RequestRecord } from "@/lib/store/types";
import { POST as ingest } from "../ingest/route";
import { POST as postRequest } from "./route";
import { GET as next } from "./next/route";
import { POST as take } from "./[id]/take/route";
import { POST as status } from "./[id]/status/route";
import { POST as ask } from "./[id]/questions/route";
import { GET as getQuestion } from "./[id]/questions/[questionId]/route";
import { POST as answer } from "./[id]/answer/route";

const json = (body: unknown, token?: string) => new Request("http://x/", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const get = (url: string, token?: string) => new Request(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });
const at = (offsetSeconds: number) => new Date(Date.now() - 60_000 + offsetSeconds * 1000).toISOString();

let store: MemoryStore;
let projectId: string;
let token: string;
let notices: RoomNotice[];
let stop: () => void;
beforeEach(async () => {
  store = new MemoryStore();
  globalThis.__glasshouseStore = store;
  const created = await store.createProject({ name: "storyboard" });
  projectId = created.project.id;
  token = created.token;
  notices = [];
  stop = subscribe((n) => notices.push(n));
});
afterEach(() => {
  stop();
  globalThis.__glasshouseStore = undefined;
});

async function create(body: Record<string, unknown>): Promise<RequestRecord> {
  const res = await postRequest(json({ projectId, tool: "claude-code", text: "Fix the login bug", ...body }));
  expect(res.status).toBe(200);
  return ((await res.json()) as { request: RequestRecord }).request;
}

describe("asking from the Room", () => {
  it("queues an instruction for Claude Code with a session id chosen up front, and tells the Room", async () => {
    const r = await create({});
    expect(r.status).toBe("queued");
    expect(r.tool).toBe("claude-code");
    expect(r.externalSessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.care).toBe("ask");
    expect(notices.at(-1)).toMatchObject({ projectId, kind: "request" });
    const room = await store.getRoom(projectId);
    expect(room?.requests?.map((x) => x.id)).toEqual([r.id]);
    expect(room?.listeningAt).toBeUndefined();
  });

  it("refuses bad bodies and unknown tokens", async () => {
    expect((await postRequest(json({ projectId, tool: "robot", text: "hi" }))).status).toBe(400);
    expect((await postRequest(json({ projectId, tool: "codex", text: "" }))).status).toBe(400);
    expect((await next(get("http://x/api/requests/next", "gh_nope"))).status).toBe(401);
    expect((await take(json({}, "gh_nope"), params({ id: "x" }))).status).toBe(401);
  });

  it("hands the request to the connector once: next, take, status, and the card links up from the first action", async () => {
    const r = await create({});
    const seen = (await (await next(get("http://x/api/requests/next", token))).json()) as { request: RequestRecord | null };
    expect(seen.request?.id).toBe(r.id);
    expect((await store.getRoom(projectId))?.listeningAt).toBeDefined();

    expect((await take(json({}, token), params({ id: r.id }))).status).toBe(200);
    expect((await take(json({}, token), params({ id: r.id }))).status).toBe(409);
    expect((await (await next(get("http://x/api/requests/next", token))).json()).request).toBeNull();

    const running = await status(json({ status: "running", externalSessionId: r.externalSessionId }, token), params({ id: r.id }));
    expect(((await running.json()) as { request: RequestRecord }).request.status).toBe("running");

    // The tool's hooks arrive with the session id we chose: the request now points at the card.
    const events = [
      { id: "0b3a0d4e-1e2f-4c5d-8a9b-0c1d2e3f4a61", projectId, sessionId: r.externalSessionId, taskKey: "p1", tool: "claude-code", kind: "prompt", ts: at(0), paths: [], prompt: "Fix the login bug", summary: "Fix the login bug", sourceEvent: "UserPromptSubmit", raw: {} },
      { id: "0b3a0d4e-1e2f-4c5d-8a9b-0c1d2e3f4a62", projectId, sessionId: r.externalSessionId, taskKey: "p1", tool: "claude-code", kind: "edit", ts: at(5), paths: ["src/auth/session.ts"], summary: "Changed src/auth/session.ts", sourceEvent: "PostToolUse", sourceTool: "Edit", raw: {} },
    ];
    expect((await ingest(json({ connectorVersion: "0.2.0", events }, token))).status).toBe(200);
    const room = await store.getRoom(projectId);
    const view = room!.requests![0]!;
    expect(view.sessionId).toBe(room!.sessions[0]!.id);
    expect(view.taskId).toBe(room!.sessions[0]!.task!.id);

    const finished = await status(json({ status: "finished", result: { ok: true, closing: "Done.", exitCode: 0, costUsd: 0.12 } }, token), params({ id: r.id }));
    expect(((await finished.json()) as { request: RequestRecord }).request).toMatchObject({ status: "finished", result: { ok: true, closing: "Done." } });
    // A late "running" cannot bring a finished run back.
    const late = await status(json({ status: "running" }, token), params({ id: r.id }));
    expect(((await late.json()) as { request: RequestRecord }).request.status).toBe("finished");
  });

  it("carries a question from the tool to the owner and the answer back, in the owner's words", async () => {
    const r = await create({});
    await take(json({}, token), params({ id: r.id }));
    await status(json({ status: "running" }, token), params({ id: r.id }));
    const asked = await ask(json({ kind: "permission", toolName: "Bash", eventKind: "test_run", summary: "Ran: pnpm test", command: "pnpm test", paths: [], raw: { command: "pnpm test" } }, token), params({ id: r.id }));
    const { question } = (await asked.json()) as { question: { id: string } };
    expect(question.id).toMatch(/^[0-9a-f-]{36}$/);
    const room = await store.getRoom(projectId);
    const q = room!.requests![0]!.questions[0]!;
    expect(q.plain).toBe("Wants to run the checks");
    expect(q.answer).toBeUndefined();

    const pending = (await (await getQuestion(get("http://x/", token), params({ id: r.id, questionId: question.id }))).json()) as { question: { answer?: unknown } };
    expect(pending.question.answer).toBeUndefined();
    expect((await answer(json({ questionId: question.id, allow: true }), params({ id: r.id }))).status).toBe(200);
    const answered = (await (await getQuestion(get("http://x/?wait=5", token), params({ id: r.id, questionId: question.id }))).json()) as { question: { answer?: { allow: boolean; by?: string } } };
    expect(answered.question.answer).toMatchObject({ allow: true, by: "local" });
    // The first answer stands.
    await answer(json({ questionId: question.id, allow: false }), params({ id: r.id }));
    expect((await store.getRequest(r.id))!.questions[0]!.answer!.allow).toBe(true);
    expect((await getQuestion(get("http://x/", token), params({ id: r.id, questionId: "nope" }))).status).toBe(404);
  });

  it("puts a multiple-choice question in plain words and takes the chosen answers", async () => {
    const r = await create({});
    await take(json({}, token), params({ id: r.id }));
    const asked = await ask(json({ kind: "choice", toolName: "AskUserQuestion", summary: "Asked a question", paths: [], choices: [{ question: "Which database?", header: "Database", options: [{ label: "Postgres" }, { label: "SQLite" }] }] }, token), params({ id: r.id }));
    const { question } = (await asked.json()) as { question: { id: string } };
    expect((await store.getRoom(projectId))!.requests![0]!.questions[0]!.plain).toBe("Asks: Which database?");
    await answer(json({ questionId: question.id, allow: true, answers: { "Which database?": "Postgres" } }), params({ id: r.id }));
    expect((await store.getRequest(r.id))!.questions[0]!.answer).toMatchObject({ allow: true, answers: { "Which database?": "Postgres" } });
  });

  it("lets the owner take a queued request back, and not after it was picked up", async () => {
    const r = await create({ tool: "codex" });
    expect(r.externalSessionId).toBeUndefined();
    expect((await answer(json({ withdraw: true }), params({ id: r.id }))).status).toBe(200);
    expect((await store.getRequest(r.id))!.status).toBe("withdrawn");
    expect((await take(json({}, token), params({ id: r.id }))).status).toBe(409);
    const r2 = await create({ tool: "cursor" });
    await take(json({}, token), params({ id: r2.id }));
    expect((await answer(json({ withdraw: true }), params({ id: r2.id }))).status).toBe(409);
  });

  it("never runs something nobody was listening for: a request older than the queue limit expires", async () => {
    const old = await store.createRequest({ projectId, tool: "claude-code", text: "old", origin: { kind: "typed" }, care: "ask", status: "queued", createdAt: new Date(Date.now() - 20 * 60 * 1000).toISOString() });
    const fresh = await create({});
    const seen = (await (await next(get("http://x/api/requests/next", token))).json()) as { request: RequestRecord | null };
    expect(seen.request?.id).toBe(fresh.id);
    expect((await store.getRequest(old.id))!).toMatchObject({ status: "expired", result: { ok: false } });
  });

  it("holds the connector's poll open until a request arrives", async () => {
    const started = Date.now();
    const empty = (await (await next(get("http://x/api/requests/next?wait=1", token))).json()) as { request: RequestRecord | null };
    expect(empty.request).toBeNull();
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
    const waiting = next(get("http://x/api/requests/next?wait=5", token));
    setTimeout(() => void create({ text: "later" }), 100);
    const got = (await (await waiting).json()) as { request: RequestRecord | null };
    expect(got.request?.text).toBe("later");
  });

  it("sends a follow-up to an agent already in the Room under its own session id", async () => {
    const events = [{ id: "0b3a0d4e-1e2f-4c5d-8a9b-0c1d2e3f4a71", projectId, sessionId: "sess-abc", taskKey: "p1", tool: "codex", kind: "prompt", ts: at(0), paths: [], prompt: "Tidy the checkout", summary: "Tidy the checkout", sourceEvent: "UserPromptSubmit", raw: {} }];
    await ingest(json({ connectorVersion: "0.2.0", events }, token));
    const room = await store.getRoom(projectId);
    const session = room!.sessions[0]!;
    expect((await postRequest(json({ projectId, tool: "claude-code", text: "carry on", continues: { sessionId: session.id } }))).status).toBe(400);
    const r = await create({ tool: "codex", text: "carry on", continues: { sessionId: session.id } });
    expect(r.continues).toEqual({ sessionId: session.id, externalId: "sess-abc" });
    expect(r.externalSessionId).toBe("sess-abc");
    expect((await store.getRoom(projectId))!.requests![0]).toMatchObject({ sessionId: session.id, taskId: session.task!.id });
    expect((await postRequest(json({ projectId, tool: "codex", text: "x", continues: { sessionId: "gone" } }))).status).toBe(404);
  });

  it("answers Glasshouse on the spot from the record, with no AI", async () => {
    const events = [
      { id: "0b3a0d4e-1e2f-4c5d-8a9b-0c1d2e3f4a81", projectId, sessionId: "s9", taskKey: "p1", tool: "claude-code", kind: "prompt", ts: at(0), paths: [], prompt: "Fix the login bug", summary: "Fix the login bug", sourceEvent: "UserPromptSubmit", raw: {} },
      { id: "0b3a0d4e-1e2f-4c5d-8a9b-0c1d2e3f4a82", projectId, sessionId: "s9", taskKey: "p1", tool: "claude-code", kind: "edit", ts: at(5), paths: ["src/auth/session.ts"], summary: "Changed src/auth/session.ts", sourceEvent: "PostToolUse", sourceTool: "Edit", raw: {} },
    ];
    await ingest(json({ connectorVersion: "0.2.0", events }, token));
    const r = await create({ tool: "glasshouse", text: "Where are we?" });
    expect(r.status).toBe("answered");
    expect(r.answer?.source).toBe("template");
    expect(r.answer?.text).toMatch(/^1 agent is working\. Claude Code is building/);
    const nextUp = await create({ tool: "glasshouse", text: "what should we do next" });
    expect(nextUp.answer?.text).toMatch(/worth doing next/);
    const other = await create({ tool: "glasshouse", text: "Did it change how people log in?" });
    expect(other.answer?.unsure).toBe(true);
    expect(other.answer?.text).toMatch(/needs an AI key/);
    const room = await store.getRoom(projectId);
    expect(room!.requests!.map((x) => x.status)).toEqual(["answered", "answered", "answered"]);
  });
});
