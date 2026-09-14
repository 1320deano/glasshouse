import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type NormalisedEvent, RecordedHook } from "@glasshouse/schema";
import { buildHeuristicAreaMap, normaliseClaudeCode } from "@glasshouse/translate";
import { rememberProfile } from "./auth";
import { planChangeFrom } from "./billing";
import { DEMO_CHAPTERS, demoFrames, demoSuggestions, terminalLine } from "./demo";
import { firstMoment } from "./moment";
import { UPGRADE_REASONS, canCreateProject, featureAllowed, gateRoom, planFromSubscriptionStatus } from "./plan";
import { MemoryStore, normaliseCode } from "./store/memory";
import type { RoomState, SessionView } from "./store/types";

const fixtures = join(__dirname, "../../../../fixtures");
const STORYBOARD = "/home/chris/apps/storyboard";
const TREE = ["package.json", "src/auth/session.ts", "src/auth/login.ts", "src/dashboard/page.tsx", "src/storyboard/scenes.ts", "src/payments/stripe.ts", "src/upload/upload.ts"];

function replay(file: string, projectId: string, startAt: string): NormalisedEvent[] {
  let n = 0;
  let t = Date.parse(startAt);
  return readFileSync(join(fixtures, "sessions", file), "utf8")
    .trim()
    .split("\n")
    .map((l) => RecordedHook.parse(JSON.parse(l)))
    .map((r) => normaliseClaudeCode(r.hookEvent, r.payload, { projectId, projectRoot: STORYBOARD, makeId: () => `aaaa0000-0000-4000-8000-${String(++n).padStart(12, "0")}`, now: () => new Date((t += 1000)).toISOString() }))
    .filter((e): e is NormalisedEvent => e !== null);
}

afterEach(() => {
  delete process.env.GLASSHOUSE_PLAN;
});

describe("plans", () => {
  it("free is one project, one agent, a day of history and no digest, inbox or Ask", () => {
    expect(canCreateProject("free", 0)).toBe(true);
    expect(canCreateProject("free", 1)).toBe(false);
    expect(canCreateProject("pro", 40)).toBe(true);
    expect(featureAllowed("free", "digest")).toBe(false);
    expect(featureAllowed("pro", "inbox")).toBe(true);
    expect(Object.values(UPGRADE_REASONS).every((r) => r.length > 20 && !/upgrade now/i.test(r))).toBe(true);
    expect(planFromSubscriptionStatus("active")).toBe("pro");
    expect(planFromSubscriptionStatus("past_due")).toBe("pro");
    expect(planFromSubscriptionStatus("canceled")).toBe("free");
    expect(planFromSubscriptionStatus(undefined)).toBe("free");
  });

  it("gates the Room: the free tier sees one active agent and the last 24 hours, and no inbox counts", () => {
    const now = "2026-09-04T12:00:00.000Z";
    const session = (id: string, tool: SessionView["tool"], lastEventAt: string, ended = false): SessionView => ({ id, tool, depth: "full", externalId: id, startedAt: lastEventAt, lastEventAt, endedAt: ended ? lastEventAt : undefined, task: null, recentEvents: [] });
    const room: RoomState = {
      project: { id: "p", name: "p", createdAt: now },
      sessions: [session("a", "claude-code", "2026-09-04T11:55:00.000Z"), session("b", "codex", "2026-09-04T11:50:00.000Z"), session("c", "cursor", "2026-09-03T09:00:00.000Z", true), session("d", "claude-code", "2026-09-04T08:00:00.000Z", true)],
      areas: [],
      generatedAt: now,
      inboxOpen: 3,
      sinceChecked: { done: 2, needsYou: 1 },
      story: [
        { id: "old", at: "2026-09-02T10:00:00.000Z", kind: "finished", taskId: "t0", tool: "cursor", text: "Old" },
        { id: "new", at: "2026-09-04T11:00:00.000Z", kind: "started", taskId: "t1", tool: "claude-code", text: "New" },
      ],
      progress: [
        { id: "auth", name: "Sign-in", sensitive: true, stage: "done", running: 0, finished: 1, filesChanged: 2, lastTouchedAt: "2026-09-02T10:00:00.000Z", tools: ["cursor"] },
        { id: "dash", name: "Dashboard", sensitive: false, stage: "building", running: 1, finished: 0, filesChanged: 1, lastTouchedAt: "2026-09-04T11:55:00.000Z", tools: ["claude-code"] },
      ],
      activity: { since: "2026-08-28T12:00:00.000Z", hours: { "2026-09-02T10:00:00.000Z": { cursor: 5 }, "2026-09-04T11:00:00.000Z": { "claude-code": 3, codex: 1 } }, total: 9, byTool: { "claude-code": 3, codex: 1, cursor: 5, watcher: 0 } },
    };
    const free = gateRoom(room, "free", now);
    expect(free.room.sessions.map((s) => s.id)).toEqual(["a", "d"]);
    expect(free.locked).toEqual({ agents: 1, history: 1, reasons: ["history", "more_agents"] });
    expect(free.room.inboxOpen).toBe(0);
    // The story, progress and activity stop at the free tier's 24-hour line too.
    expect(free.room.story.map((m) => m.id)).toEqual(["new"]);
    expect(free.room.progress.find((p) => p.id === "auth")?.stage).toBeNull();
    expect(free.room.progress.find((p) => p.id === "dash")?.stage).toBe("building");
    expect(free.room.activity.total).toBe(4);
    expect(free.room.activity.byTool.cursor).toBe(0);
    expect(gateRoom(room, "pro", now).room.activity.total).toBe(9);
    const pro = gateRoom(room, "pro", now);
    expect(pro.room.sessions).toHaveLength(4);
    expect(pro.locked).toEqual({ agents: 0, history: 0, reasons: [] });
    expect(pro.room.inboxOpen).toBe(3);
  });
});

describe("link codes and ownership", () => {
  it("issues a one-time code that expires, and projects belong to the person who used it", async () => {
    const store = new MemoryStore({ now: () => "2026-09-04T10:00:00.000Z" });
    const code = await store.createLinkCode("user-1");
    expect(code.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(normaliseCode(code.code.toLowerCase().replace("-", " "))).toBe(code.code);
    expect(await store.consumeLinkCode("ZZZZ-ZZZZ")).toBeNull();
    const used = await store.consumeLinkCode(code.code);
    expect(used?.ownerId).toBe("user-1");
    expect(await store.consumeLinkCode(code.code)).toBeNull(); // one use only
    const late = await store.createLinkCode("user-2");
    expect(await store.consumeLinkCode(late.code, "2026-09-04T10:20:00.000Z")).toBeNull(); // 15 minutes

    const { project } = await store.createProject({ name: "mine", ownerId: "user-1" });
    await store.attachLinkCode(code.code, project.id);
    expect((await store.getLinkCode(code.code))?.projectId).toBe(project.id);
    await store.createProject({ name: "theirs", ownerId: "user-2" });
    expect((await store.listProjects("user-1")).map((p) => p.name)).toEqual(["mine"]);
    expect((await store.listProjects()).length).toBe(2);
  });

  it("keeps profiles, invites, notes and metrics", async () => {
    const store = new MemoryStore({ now: () => "2026-09-04T10:00:00.000Z" });
    expect(await store.getProfile("u")).toBeNull();
    const p = await store.upsertProfile({ userId: "u", email: "chris@example.com" });
    expect(p.plan).toBe("free");
    await store.upsertProfile({ userId: "u", plan: "pro", stripeCustomerId: "cus_1" });
    expect((await store.findProfileByCustomer("cus_1"))?.plan).toBe("pro");
    expect((await store.getProfile("u"))?.email).toBe("chris@example.com");

    await store.addInvite("Tester@Example.com", "friend");
    expect(await store.isInvited("tester@example.com")).toBe(true);
    await store.markInviteAccepted("tester@example.com", "2026-09-04T11:00:00.000Z");
    expect((await store.listInvites())[0]?.acceptedAt).toBeDefined();
    await store.removeInvite("tester@example.com");
    expect(await store.isInvited("tester@example.com")).toBe(false);

    await store.addTesterNote({ userId: "u", page: "/room/p", note: "The Codex tile is blank" });
    expect((await store.listTesterNotes())[0]?.note).toBe("The Codex tile is blank");

    await store.recordMetric("landing_view", "v1");
    await store.recordMetric("landing_view", "v1"); // same visitor, counted once
    await store.recordMetric("landing_view", "v2");
    await store.recordMetric("signup_completed", "v2");
    expect(await store.metricCounts(7)).toMatchObject({ byEvent: expect.objectContaining({ landing_view: 2, signup_completed: 1 }), signupRatePct: 50 });
  });
});

describe("the moment and the demo", () => {
  it("finds the first thing the owner would have missed: a change to Login they did not ask for", async () => {
    const store = new MemoryStore({ now: () => "2026-09-04T09:10:00.000Z" });
    const { project } = await store.createProject({ name: "storyboard" });
    await store.saveAreaMap(project.id, buildHeuristicAreaMap({ paths: TREE }));
    await store.ingest(project.id, replay("claude-code-usage-limit-synthetic.jsonl", project.id, "2026-09-04T09:00:00.000Z"));
    const moment = firstMoment((await store.getRoom(project.id))!);
    expect(moment).toMatchObject({ kind: "sensitive", tool: "claude-code" });
    expect(moment?.fact).toBe("Claude Code changed Login. You asked: “The dashboard needs to know which organisation a user is in. Change the login session so…”.");
    expect(moment?.why).toContain("Login is a part of your app everyone relies on");
  });

  it("replays the fixtures into frames the demo can play, with the credit switch in the middle", async () => {
    const frames = await demoFrames();
    expect(frames.length).toBeGreaterThan(10);
    expect(frames.every((f) => f.tiles.every((t) => t.stage !== "stuck"))).toBe(true);
    const limit = frames.findIndex((f) => f.tiles[0]?.endReason === "usage_limit");
    expect(limit).toBeGreaterThan(0);
    expect(frames[limit]?.tiles[0]?.headline).toBe("Stopped before finishing: usage limit reached");
    const codex = frames.find((f) => f.tiles.length === 2 && f.tiles[1]?.continuedFrom);
    expect(codex?.tiles[1]?.continuedFrom).toContain("Continuing from Claude Code");
    const last = frames[frames.length - 1]!;
    expect(last.tiles[1]?.card?.notTouched).toContain("Payments");
    expect(last.tiles[1]?.card?.needsYou).toBe("review");
    expect(last.tiles[1]?.card?.checks).toBe("All 6 checks passed");
  });

  it("cuts the demo into the brief's five chapters, each turned by a recorded event, in order", async () => {
    const frames = await demoFrames();
    const order = [...new Set(frames.map((f) => f.chapter))];
    expect(order).toEqual(DEMO_CHAPTERS.map((c) => c.id));
    // The second chapter starts on the first change, the third on the limit, the fourth when Codex
    // appears, the fifth when Codex stops.
    const first = (id: string) => frames.findIndex((f) => f.chapter === id);
    expect(frames[first("login")]?.tiles[0]?.stage).toBe("building");
    expect(frames[first("login")]?.tiles[0]?.risk).toBe("high");
    expect(frames[first("limit")]?.tiles[0]?.endReason).toBe("usage_limit");
    expect(frames[first("handoff")]?.terminal).toBe("$ codex\n> ready");
    expect(frames[first("report")]?.tiles[1]?.card?.headline).toContain("All 6 tests pass");
  });

  it("carries the Room's own story, the moment, and what the card knows, frame by frame", async () => {
    const frames = await demoFrames();
    // No frame claims "not touched" before anything has changed (rule 2).
    for (const f of frames) for (const t of f.tiles) if (t.touched.length === 0) expect(t.notTouched).toEqual([]);
    // The moment appears on the frame of the first change to Login and stays.
    const momentAt = frames.findIndex((f) => f.moment);
    expect(momentAt).toBe(frames.findIndex((f) => f.chapter === "login"));
    expect(frames[momentAt]?.moment?.fact).toContain("Claude Code changed Login");
    expect(frames.slice(momentAt).every((f) => f.moment)).toBe(true);
    // The story is the real template's lines, with the same badges the Room shows.
    const last = frames[frames.length - 1]!;
    expect(last.story.map((m) => m.kind)).toEqual(["started", "limit", "handoff", "finished"]);
    expect(last.story[1]?.badge).toEqual({ text: "Stopped", tone: "critical" });
    expect(last.story[3]?.badge).toEqual({ text: "Review recommended", tone: "info" });
    expect(last.story[3]?.checks).toBe("All 6 checks passed");
    expect(last.story[3]?.notTouched).toContain("Payments");
  });

  it("writes the terminal from the recorded event, not from a caption", () => {
    const base = { id: "e1", projectId: "p", sessionId: "s", tool: "claude-code" as const, ts: "2026-09-04T09:00:00.000Z", sourceEvent: "PostToolUse", raw: {} };
    expect(terminalLine({ ...base, kind: "prompt", summary: "Prompt", prompt: "Fix the login", paths: [] })).toBe("> Fix the login");
    expect(terminalLine({ ...base, kind: "edit", summary: "Changed src/auth/session.ts", paths: ["src/auth/session.ts"] })).toBe("⏺ Update(src/auth/session.ts)\n  ⎿  Changed src/auth/session.ts");
    expect(terminalLine({ ...base, kind: "test_run", summary: "pnpm test", command: "pnpm test", tests: { passed: 6, failed: 1 }, paths: [] })).toBe("⏺ Bash(pnpm test)\n  ⎿  Tests  1 failed, 6 passed");
    expect(terminalLine({ ...base, tool: "codex", kind: "session_start", summary: "Session started", paths: [] })).toBe("$ codex\n> ready");
  });

  it("proposes the helpers the Shed would grow from the demo's own record, with their evidence", async () => {
    const s = await demoSuggestions();
    const ids = s.map((x) => x.id);
    expect(ids).toContain("sensitive:area-src-auth");
    expect(ids).toContain("handoff:all");
    // A stop for a usage limit is not a question the owner was asked, so no house rules from it.
    expect(ids).not.toContain("asked:all");
    expect(s.find((x) => x.id === "handoff:all")?.evidence).toBe("1 task carried on in a different tool (Claude Code to Codex).");
    expect(s.find((x) => x.kind === "sensitive")?.evidence).toBe("Agents changed files in Login in 2 tasks.");
    expect(s.every((x) => x.tasks > 0)).toBe(true);
  });
});

describe("billing", () => {
  it("reads what a Stripe event means without talking to Stripe", () => {
    expect(planChangeFrom({ type: "checkout.session.completed", data: { object: { client_reference_id: "u1", customer: "cus_1", subscription: "sub_1" } } })).toEqual({ userId: "u1", customerId: "cus_1", subscriptionId: "sub_1", status: "active" });
    expect(planChangeFrom({ type: "customer.subscription.deleted", data: { object: { id: "sub_1", customer: "cus_1", metadata: { userId: "u1" } } } })).toEqual({ userId: "u1", customerId: "cus_1", subscriptionId: "sub_1", status: "canceled" });
    expect(planChangeFrom({ type: "customer.subscription.updated", data: { object: { id: "sub_1", customer: "cus_1", status: "past_due", metadata: {} } } })).toEqual({ userId: undefined, customerId: "cus_1", subscriptionId: "sub_1", status: "past_due" });
    expect(planChangeFrom({ type: "invoice.paid", data: { object: {} } })).toBeNull();
  });
});

describe("the profile row never stands between a person and the door", () => {
  afterEach(() => {
    globalThis.__glasshouseStore = undefined;
  });

  it("writes the row when the database is there", async () => {
    const store = new MemoryStore();
    globalThis.__glasshouseStore = store;
    const written = await rememberProfile("person-1", "chris@example.com");
    expect(written?.email).toBe("chris@example.com");
    expect((await store.getProfile("person-1"))?.email).toBe("chris@example.com");
  });

  /**
   * A hosted project whose migrations have not been applied has no `profiles` table, so the write
   * fails. It used to throw out of the sign-up and sign-in routes, and Next.js answered the form
   * with an error page instead of an answer — which is what put "Unexpected token ... is not valid
   * JSON" in front of the owner every time they pressed Get started. The write is bookkeeping: by
   * the time it runs the person is already signed in, so a failure is logged and stepped over.
   */
  it("steps over a database that cannot take the row, and falls back to Free", async () => {
    const store = new MemoryStore();
    store.upsertProfile = () => Promise.reject(new Error('relation "public.profiles" does not exist'));
    store.getProfile = () => Promise.reject(new Error('relation "public.profiles" does not exist'));
    globalThis.__glasshouseStore = store;
    await expect(rememberProfile("person-2", "chris@example.com")).resolves.toBeNull();
  });
});
