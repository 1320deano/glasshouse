import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type NormalisedEvent, RecordedHook } from "@glasshouse/schema";
import { buildHeuristicAreaMap, normaliseClaudeCode } from "@glasshouse/translate";
import { planChangeFrom } from "./billing";
import { demoFrames } from "./demo";
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
    };
    const free = gateRoom(room, "free", now);
    expect(free.room.sessions.map((s) => s.id)).toEqual(["a", "d"]);
    expect(free.locked).toEqual({ agents: 1, history: 1, reasons: ["history", "more_agents"] });
    expect(free.room.inboxOpen).toBe(0);
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

  it("replays the fixtures into frames the mock tile can play, with the credit switch in the middle", async () => {
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
