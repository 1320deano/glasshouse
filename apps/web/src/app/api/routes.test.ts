import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/store/memory";
import { GET as getAreas, PATCH as patchAreas } from "./areas/[projectId]/route";
import { POST as postTree } from "./projects/tree/route";
import { GET as getTask } from "./task/[taskId]/route";
import { POST as ingest } from "./ingest/route";
import { GET as getReport } from "./report/[taskId]/route";
import { GET as getInbox, POST as postInbox } from "./inbox/[projectId]/route";
import { GET as getDigest, POST as postDigest } from "./digest/[projectId]/route";
import { POST as postAsk } from "./ask/route";
import { POST as postFeedback } from "./feedback/route";
import { GET as getFeedback } from "./feedback/[projectId]/route";

const TREE = { paths: ["package.json", "src/auth/session.ts", "src/auth/login.ts", "src/payments/stripe.ts", "src/storyboard/scenes.ts"], scannedAt: "2026-09-04T09:00:00.000Z" };
const json = (body: unknown, token?: string) => new Request("http://x/", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const patch = (body: unknown) => new Request("http://x/", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

let store: MemoryStore;
let projectId: string;
let token: string;
beforeEach(async () => {
  store = new MemoryStore();
  globalThis.__glasshouseStore = store;
  const created = await store.createProject({ name: "storyboard" });
  projectId = created.project.id;
  token = created.token;
});
afterEach(() => {
  globalThis.__glasshouseStore = undefined;
});

describe("POST /api/projects/tree", () => {
  it("needs a project token and builds a heuristic map straight away", async () => {
    expect((await postTree(json(TREE))).status).toBe(401);
    const res = await postTree(json(TREE, token));
    expect(await res.json()).toEqual({ areas: 4, refreshed: true, source: "heuristic", aiPending: false, files: 5 });
    const map = await store.getAreaMap(projectId);
    expect(map?.areas.map((a) => a.name)).toEqual(["Login", "Payments", "Storyboard", "Project setup"]);
    // the same tree again changes nothing
    expect((await (await postTree(json(TREE, token))).json()).refreshed).toBe(false);
    // a materially different tree refreshes, keeping ids for areas that still exist
    const bigger = { ...TREE, paths: [...TREE.paths, "src/search/index.ts", "src/search/rank.ts"] };
    expect((await (await postTree(json(bigger, token))).json()).refreshed).toBe(true);
    expect((await store.getAreaMap(projectId))?.areas.map((a) => a.name)).toContain("Search");
  });
});

describe("GET/PATCH /api/areas/[projectId]", () => {
  it("renames and merges, and corrections survive a refresh", async () => {
    await postTree(json(TREE, token));
    const before = (await (await getAreas(new Request("http://x/"), params({ projectId }))).json()) as { map: { areas: Array<{ id: string; name: string }> } };
    const login = before.map.areas.find((a) => a.name === "Login")!;
    const payments = before.map.areas.find((a) => a.name === "Payments")!;

    const renamed = (await (await patchAreas(patch({ action: "rename", id: login.id, name: "Signing in", description: "Where people log in" }), params({ projectId }))).json()) as { map: { areas: Array<{ id: string; name: string; userCorrected: boolean }> } };
    expect(renamed.map.areas.find((a) => a.id === login.id)).toMatchObject({ name: "Signing in", userCorrected: true });

    const merged = (await (await patchAreas(patch({ action: "merge", from: payments.id, into: login.id }), params({ projectId }))).json()) as { map: { areas: Array<{ id: string; name: string; prefixes: string[] }> } };
    expect(merged.map.areas.find((a) => a.id === payments.id)).toBeUndefined();
    expect(merged.map.areas.find((a) => a.id === login.id)?.prefixes.sort()).toEqual(["src/auth", "src/payments"]);

    const refreshed = (await (await patchAreas(patch({ action: "refresh" }), params({ projectId }))).json()) as { map: { areas: Array<{ id: string; name: string; prefixes: string[] }> }; source: string };
    expect(refreshed.source).toBe("heuristic");
    expect(refreshed.map.areas.find((a) => a.id === login.id)?.name).toBe("Signing in");
    expect(refreshed.map.areas.find((a) => a.name === "Payments")).toBeUndefined();

    expect((await patchAreas(patch({ action: "explode" }), params({ projectId }))).status).toBe(400);
  });
});

describe("GET /api/task/[taskId]", () => {
  it("returns the expanded view for a task after ingest, translated with the map", async () => {
    await postTree(json(TREE, token));
    const events = [
      { id: "0b3a0d4e-1e2f-4c5d-8a9b-0c1d2e3f4a51", projectId, sessionId: "s1", taskKey: "p1", tool: "claude-code", kind: "prompt", ts: "2026-09-04T09:00:00.000Z", paths: [], prompt: "fix the login bug", summary: "fix the login bug", sourceEvent: "UserPromptSubmit", raw: {} },
      { id: "0b3a0d4e-1e2f-4c5d-8a9b-0c1d2e3f4a52", projectId, sessionId: "s1", taskKey: "p1", tool: "claude-code", kind: "edit", ts: "2026-09-04T09:00:05.000Z", paths: ["src/auth/session.ts"], summary: "Changed src/auth/session.ts", sourceEvent: "PostToolUse", sourceTool: "Edit", raw: { tool_name: "Edit" } },
    ];
    const res = await ingest(json({ connectorVersion: "0.2.0", events }, token));
    expect(await res.json()).toEqual({ inserted: 2, duplicates: 0 });
    const room = await store.getRoom(projectId);
    const task = room!.sessions[0]!.task!;
    expect(task.location).toBe("Login → session");
    expect(task.risk.level).toBe("high");

    expect((await getTask(new Request("http://x/"), params({ taskId: "nope" }))).status).toBe(404);
    const detail = (await (await getTask(new Request("http://x/"), params({ taskId: task.id }))).json()) as { events: Array<{ plain: string; raw: unknown }>; changes: Array<{ plain: string }>; notTouched: string[] };
    expect(detail.events.map((e) => e.plain)).toEqual(["Changing the session part of Login", "You asked: “fix the login bug”"]);
    expect(detail.events[0]?.raw).toEqual({ tool_name: "Edit" });
    expect(detail.changes).toEqual([expect.objectContaining({ plain: "Changed the session part of Login" })]);
    expect(detail.notTouched).toEqual(["Payments", "Storyboard", "Project setup"]);
  });
});

describe("Phase 3 routes", () => {
  async function finishedTask() {
    await postTree(json(TREE, token));
    const events = [
      { id: "0b3a0d4e-1e2f-4c5d-8a9b-0c1d2e3f4a61", projectId, sessionId: "s1", taskKey: "p1", tool: "claude-code", kind: "prompt", ts: "2026-09-04T09:00:00.000Z", paths: [], prompt: "fix the login bug", summary: "fix the login bug", sourceEvent: "UserPromptSubmit", raw: {} },
      { id: "0b3a0d4e-1e2f-4c5d-8a9b-0c1d2e3f4a62", projectId, sessionId: "s1", taskKey: "p1", tool: "claude-code", kind: "edit", ts: "2026-09-04T09:00:05.000Z", paths: ["src/auth/session.ts"], summary: "Changed src/auth/session.ts", sourceEvent: "PostToolUse", sourceTool: "Edit", raw: { tool_name: "Edit" } },
      { id: "0b3a0d4e-1e2f-4c5d-8a9b-0c1d2e3f4a63", projectId, sessionId: "s1", taskKey: "p1", tool: "claude-code", kind: "stop", ts: "2026-09-04T09:00:09.000Z", paths: [], summary: "Done. Should I also update the mobile app?", text: "Done. Should I also update the mobile app?", sourceEvent: "Stop", raw: {} },
    ];
    await ingest(json({ connectorVersion: "0.2.0", events }, token));
    const room = await store.getRoom(projectId);
    return room!.sessions[0]!.task!;
  }

  it("serves the report card, the inbox with clearing, and the digest", async () => {
    const task = await finishedTask();
    expect((await getReport(new Request("http://x/"), params({ taskId: "nope" }))).status).toBe(404);
    const report = (await (await getReport(new Request("http://x/"), params({ taskId: task.id }))).json()) as { report: { needsYou: string; needsYouDetail: string; notTouched: string[]; touched: Array<{ name: string }> } };
    expect(report.report.needsYou).toBe("decision");
    expect(report.report.needsYouDetail).toBe("Should I also update the mobile app?");
    expect(report.report.touched.map((t) => t.name)).toEqual(["Login"]);
    expect(report.report.notTouched).toEqual(["Payments", "Storyboard", "Project setup"]);

    let inbox = (await (await getInbox(new Request("http://x/"), params({ projectId }))).json()) as { open: Array<{ taskId: string; status: string }>; cleared: unknown[] };
    expect(inbox.open).toEqual([expect.objectContaining({ taskId: task.id, status: "decision" })]);
    expect((await postInbox(json({ taskId: task.id, action: "clear" }), params({ projectId }))).status).toBe(200);
    inbox = (await (await getInbox(new Request("http://x/"), params({ projectId }))).json()) as typeof inbox;
    expect(inbox.open).toEqual([]);
    expect(inbox.cleared).toHaveLength(1);
    expect((await postInbox(json({ taskId: "nope", action: "clear" }), params({ projectId }))).status).toBe(404);

    expect((await getDigest(new Request("http://x/?window=yesterday"), params({ projectId }))).status).toBe(400);
    const digest = (await (await getDigest(new Request("http://x/?window=week"), params({ projectId }))).json()) as { digest: { done: Array<{ taskId: string }>; needsYou: unknown[] }; lastCheckedAt?: string };
    expect(digest.digest.done.map((d) => d.taskId)).toEqual([task.id]);
    expect(digest.digest.needsYou).toEqual([]); // cleared above
    expect(digest.lastCheckedAt).toBeUndefined();
    const marked = (await (await postDigest(new Request("http://x/", { method: "POST" }), params({ projectId }))).json()) as { lastCheckedAt: string };
    expect(marked.lastCheckedAt).toBeDefined();
    expect(await store.getLastChecked(projectId)).toBe(marked.lastCheckedAt);
  });

  it("answers Ask honestly without a key, and records a thumbs-down", async () => {
    const task = await finishedTask();
    expect((await postAsk(json({ taskId: task.id, question: "?" }))).status).toBe(400);
    expect((await postAsk(json({ taskId: "nope", question: "Did it change login?" }))).status).toBe(404);
    const asked = (await (await postAsk(json({ taskId: task.id, question: "Did it change login?" }))).json()) as { answer: string | null; reason?: string };
    expect(asked.answer).toBeNull();
    expect(asked.reason).toContain("AI key");

    const detail = await store.getTask(task.id);
    const edit = detail!.events.find((e) => e.kind === "edit")!;
    expect((await postFeedback(json({ eventId: "nope", projectId }))).status).toBe(404);
    expect((await postFeedback(json({ eventId: edit.id, projectId, note: "wrong part" }))).status).toBe(200);
    const list = (await (await getFeedback(new Request("http://x/"), params({ projectId }))).json()) as { items: Array<{ plain: string; note?: string }>; events: number; rate: number };
    expect(list.items).toEqual([expect.objectContaining({ plain: "Changing the session part of Login", note: "wrong part" })]);
    expect(list.events).toBe(3);
    expect(list.rate).toBeGreaterThan(0);
  });
});

describe("Phase 4 routes (local mode)", () => {
  it("links a project to the local owner, lists it, and hands out codes only when the plan has room", async () => {
    const { GET: mine } = await import("./projects/mine/route");
    const { POST: linkCode } = await import("./projects/link-code/route");
    const { GET: codeStatus } = await import("./projects/link-code/[code]/route");
    const { POST: link } = await import("./projects/link/route");

    let list = (await (await mine()).json()) as { projects: Array<{ name: string; ownerId?: string }>; plan: string; local: boolean };
    expect(list).toMatchObject({ plan: "pro", local: true });
    expect(list.projects.map((p) => p.ownerId)).toEqual(["local"]);

    const issued = (await (await linkCode()).json()) as { code: string };
    expect(issued.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const status = (await (await codeStatus(new Request("http://x/"), params({ code: issued.code }))).json()) as { used: boolean; project: unknown };
    expect(status).toMatchObject({ used: false, project: null });

    // Local mode needs no code, but if one is given it is consumed and attached.
    const linked = (await (await link(json({ name: "second", rootHint: "/tmp/second", code: issued.code }))).json()) as { projectId: string };
    expect(linked.projectId).toBeDefined();
    const after = (await (await codeStatus(new Request("http://x/"), params({ code: issued.code }))).json()) as { used: boolean; project: { name: string } | null };
    expect(after.used).toBe(true);
    expect(after.project?.name).toBe("second");
    list = (await (await mine()).json()) as typeof list;
    expect(list.projects.map((p) => p.name).sort()).toEqual(["second", "storyboard"]);

    // Preview the free tier: one project only.
    process.env.GLASSHOUSE_PLAN = "free";
    try {
      expect((await linkCode()).status).toBe(402);
    } finally {
      delete process.env.GLASSHOUSE_PLAN;
    }
  });

  it("gates the room, digest, inbox and Ask on the free tier and lets Pro through", async () => {
    const { GET: getRoom } = await import("./room/[projectId]/route");
    const { GET: getDigest } = await import("./digest/[projectId]/route");
    const { GET: getInbox } = await import("./inbox/[projectId]/route");
    const { POST: postAsk } = await import("./ask/route");
    await postTree(json(TREE, token));
    const events = [
      { id: "0b3a0d4e-1e2f-4c5d-8a9b-0c1d2e3f4a71", projectId, sessionId: "s1", taskKey: "p1", tool: "claude-code", kind: "prompt", ts: "2026-09-04T09:00:00.000Z", paths: [], prompt: "fix login", summary: "fix login", sourceEvent: "UserPromptSubmit", raw: {} },
      { id: "0b3a0d4e-1e2f-4c5d-8a9b-0c1d2e3f4a72", projectId, sessionId: "s1", taskKey: "p1", tool: "claude-code", kind: "stop", ts: "2026-09-04T09:00:09.000Z", paths: [], summary: "Done", sourceEvent: "Stop", raw: {} },
    ];
    await ingest(json({ connectorVersion: "0.2.0", events }, token));
    const pro = (await (await getRoom(new Request("http://x/"), params({ projectId }))).json()) as { plan: string; locked: { reasons: string[] }; room: { sessions: unknown[] } };
    expect(pro.plan).toBe("pro");
    expect(pro.locked.reasons).toEqual([]);
    expect((await getDigest(new Request("http://x/?window=week"), params({ projectId }))).status).toBe(200);

    process.env.GLASSHOUSE_PLAN = "free";
    try {
      const free = (await (await getRoom(new Request("http://x/"), params({ projectId }))).json()) as { plan: string; room: { inboxOpen: number } };
      expect(free.plan).toBe("free");
      expect(free.room.inboxOpen).toBe(0);
      expect((await getDigest(new Request("http://x/?window=week"), params({ projectId }))).status).toBe(402);
      expect((await getInbox(new Request("http://x/"), params({ projectId }))).status).toBe(402);
      const task = (await store.getRoom(projectId))!.sessions[0]!.task!;
      const ask = await postAsk(json({ taskId: task.id, question: "Did it change login?" }));
      expect(ask.status).toBe(402);
      expect(((await ask.json()) as { upgrade: string }).upgrade).toBe("ask");
    } finally {
      delete process.env.GLASSHOUSE_PLAN;
    }
  });

  it("records metrics and tester notes, and the admin dashboard adds up", async () => {
    const { POST: metric } = await import("./metrics/route");
    const { POST: note } = await import("./notes/route");
    const { GET: admin, POST: adminAct } = await import("./admin/route");
    expect((await metric(json({ event: "landing_view", visitorId: "visitor-1" }))).status).toBe(200);
    expect((await metric(json({ event: "nope", visitorId: "visitor-1" }))).status).toBe(400);
    expect((await note(json({ note: "The Codex tile is blank", page: "/room/x", projectId }))).status).toBe(200);
    await adminAct(json({ action: "invite", email: "tester@example.com", note: "friend" }));
    const data = (await (await admin(new Request("http://x/?days=7"))).json()) as { metrics: { byEvent: { landing_view: number } }; notes: Array<{ note: string }>; invites: Array<{ email: string }>; summary: { testers: number } };
    expect(data.metrics.byEvent.landing_view).toBe(1);
    expect(data.notes[0]?.note).toBe("The Codex tile is blank");
    expect(data.invites.map((i) => i.email)).toEqual(["tester@example.com"]);
    await adminAct(json({ action: "uninvite", email: "tester@example.com" }));
    expect(((await (await admin(new Request("http://x/"))).json()) as { invites: unknown[] }).invites).toEqual([]);
  });

  it("the test-account sign-in stays shut unless the switch is on and the request is from this computer", async () => {
    const { GET: devSignIn } = await import("./auth/dev/route");
    const go = (host: string) => devSignIn(new Request(`http://${host}/api/auth/dev`));
    const before = { on: process.env.GLASSHOUSE_DEV_LOGIN, email: process.env.GLASSHOUSE_DEV_EMAIL, password: process.env.GLASSHOUSE_DEV_PASSWORD };
    try {
      delete process.env.GLASSHOUSE_DEV_LOGIN;
      expect((await go("localhost")).headers.get("location")).toBe("http://localhost/signin");
      process.env.GLASSHOUSE_DEV_LOGIN = "1";
      process.env.GLASSHOUSE_DEV_EMAIL = "dev@example.test";
      process.env.GLASSHOUSE_DEV_PASSWORD = "secret";
      // switched on, but asked for from somewhere that is not this computer
      expect((await go("glasshouse.app")).headers.get("location")).toBe("http://glasshouse.app/signin");
      // switched on and local, but this Room is the on-your-own-computer one: no sign-in exists
      expect((await go("localhost")).headers.get("location")).toBe("http://localhost/");
    } finally {
      if (before.on === undefined) delete process.env.GLASSHOUSE_DEV_LOGIN;
      else process.env.GLASSHOUSE_DEV_LOGIN = before.on;
      if (before.email === undefined) delete process.env.GLASSHOUSE_DEV_EMAIL;
      else process.env.GLASSHOUSE_DEV_EMAIL = before.email;
      if (before.password === undefined) delete process.env.GLASSHOUSE_DEV_PASSWORD;
      else process.env.GLASSHOUSE_DEV_PASSWORD = before.password;
    }
  });

  it("sign-in, checkout and portal say plainly why they do nothing in local mode", async () => {
    const { POST: signin } = await import("./auth/signin/route");
    const { POST: checkout } = await import("./billing/checkout/route");
    const { POST: webhook } = await import("./billing/webhook/route");
    expect((await signin(json({ email: "chris@example.com" }))).status).toBe(400);
    const res = await checkout(new Request("http://x/", { method: "POST" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("your own computer");
    expect((await webhook(new Request("http://x/", { method: "POST", body: "{}" }))).status).toBe(503);
  });
});
