/**
 * Phase 3 in the local store: the report card written the moment a task ends, the inbox,
 * "since you last checked", the digest and translation feedback. Replays the recorded fixtures.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type NormalisedEvent, RecordedHook } from "@glasshouse/schema";
import { buildHeuristicAreaMap, normaliseClaudeCode, normaliseCodex, normaliseCursor } from "@glasshouse/translate";
import { digestFor } from "@/lib/ai/digest";
import { askAboutTask } from "@/lib/ai/ask";
import { reportFacts } from "@/lib/ai/report";
import { MemoryStore } from "./memory";

const fixtures = join(__dirname, "../../../../../fixtures");
const STORYBOARD = "/home/chris/apps/storyboard";
const STORYBOARD_TREE = ["package.json", "README.md", "src/auth/session.ts", "src/auth/login.ts", "src/dashboard/page.tsx", "src/storyboard/scene-builder.ts", "src/storyboard/scenes.ts", "src/payments/stripe.ts", "src/upload/upload.ts"];

function replay(file: string, projectId: string, root: string, startAt: string, prefix = "0000"): NormalisedEvent[] {
  let n = 0;
  let t = Date.parse(startAt);
  return readFileSync(join(fixtures, "sessions", file), "utf8")
    .trim()
    .split("\n")
    .map((l) => RecordedHook.parse(JSON.parse(l)))
    .map((r) => {
      const ctx = { projectId, projectRoot: root, makeId: () => `${prefix}0000-0000-4000-8000-${String(++n).padStart(12, "0")}`, now: () => new Date((t += 1000)).toISOString() };
      if (r.tool === "codex") return normaliseCodex(r.hookEvent, r.payload, ctx);
      if (r.tool === "cursor") return normaliseCursor(r.hookEvent, r.payload, ctx);
      return normaliseClaudeCode(r.hookEvent, r.payload, ctx);
    })
    .filter((e): e is NormalisedEvent => e !== null);
}

const NOW = "2026-09-04T10:02:00.000Z";

async function setup() {
  const store = new MemoryStore({ now: () => NOW });
  globalThis.__glasshouseStore = store;
  const { project } = await store.createProject({ name: "storyboard" });
  await store.saveAreaMap(project.id, buildHeuristicAreaMap({ paths: STORYBOARD_TREE }));
  return { store, project };
}

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});
afterEach(() => {
  globalThis.__glasshouseStore = undefined;
});

describe("the report card on task finish", () => {
  it("is written from the record the moment Claude Code stops on a usage limit, and flags Blocked", async () => {
    const { store, project } = await setup();
    const result = await store.ingest(project.id, replay("claude-code-usage-limit-synthetic.jsonl", project.id, STORYBOARD, "2026-09-04T08:58:00.000Z", "aaaa"));
    expect(result.finishedTasks).toHaveLength(1);
    const taskId = result.finishedTasks[0]!;
    const record = (await store.getReport(taskId))!;
    expect(record.source).toBe("template");
    expect(record.headline).toBe("Stopped before finishing: usage limit reached");
    expect(record.needsYou).toBe("blocked");
    expect(record.needsYouDetail).toContain("Claude Code hit its usage limit");

    const room = await store.getRoom(project.id);
    const task = room!.sessions[0]!.task!;
    const card = task.report!;
    expect(card.touched.map((t) => [t.name, t.files])).toEqual([["Login", ["src/auth/session.ts"]]]);
    expect(card.notTouched).toEqual(["Storyboard", "Dashboard", "Payments", "Uploads and files", "Project setup"]);
    expect(card.evidence.tests.ran).toBe(false);
    expect(card.risk).toEqual({ level: "high", reasons: ["Changes Login"] });
    expect(card.finished).toBe(true);
    expect(room!.inboxOpen).toBe(1);
    expect(room!.sinceChecked).toEqual({ done: 1, needsYou: 1 });
  });

  it("is written once per ending: a Codex stop followed by a session end makes one card, and the card follows a renamed part", async () => {
    const { store, project } = await setup();
    const events = replay("codex-hooks-synthetic.jsonl", project.id, STORYBOARD, "2026-09-04T09:12:00.000Z", "bbbb");
    const result = await store.ingest(project.id, events);
    expect(result.finishedTasks).toHaveLength(1);
    const detail = (await store.getTask(result.finishedTasks[0]!))!;
    expect(detail.report?.headline).toBe("The session now always carries the organisation id, and the dashboard reads it directly. All 6 tests pass.");
    expect(detail.report?.needsYou).toBe("review");
    expect(detail.report?.evidence.tests).toEqual({ ran: true, runs: 1, passed: 6, failed: 0 });
    expect(detail.facts.changedPaths).toEqual(["src/auth/session.ts", "src/dashboard/page.tsx"]);

    // Facts are computed at read time: rename Login and the card says the new name everywhere.
    const map = (await store.getAreaMap(project.id))!;
    const login = map.areas.find((a) => a.name === "Login")!;
    await store.saveAreaMap(project.id, { ...map, areas: map.areas.map((a) => (a.id === login.id ? { ...a, name: "Signing in", userCorrected: true } : a)) });
    const renamed = (await store.getTask(detail.id))!.report!;
    expect(renamed.touched.map((t) => t.name)).toEqual(["Signing in", "Dashboard"]);
    expect(renamed.touched[0]?.reason).toBe("Changed the session part of Signing in");
  });

  it("keeps the AI's words when saved, and the facts stay in charge", async () => {
    const { store, project } = await setup();
    const result = await store.ingest(project.id, replay("codex-hooks-synthetic.jsonl", project.id, STORYBOARD, "2026-09-04T09:12:00.000Z", "bbbb"));
    const taskId = result.finishedTasks[0]!;
    const existing = (await store.getReport(taskId))!;
    await store.saveReport({ ...existing, headline: "Dashboards now know which organisation you are in", beforeAfter: "Previously the dashboard could not tell. Now it can.", touchedReasons: { ...existing.touchedReasons, "area-src-payments": "invoices per organisation" }, source: "ai" });
    const card = (await store.getTask(taskId))!.report!;
    expect(card.headline).toBe("Dashboards now know which organisation you are in");
    expect(card.source).toBe("ai");
    expect(card.notTouched).toContain("Payments");
    expect(card.touched.map((t) => t.name)).toEqual(["Login", "Dashboard"]);
    // What the AI would be sent: the facts, the actions and the diff, never file contents.
    const detail = (await store.getTask(taskId))!;
    const prompt = reportFacts(detail);
    expect(prompt).toContain("Parts verifiably not touched: Storyboard, Payments");
    expect(prompt).toContain("Needs you at least: review");
    expect(prompt).toContain("No diff was available");
  });

  it("carries the Claude Code diff to the AI, but nothing from secret files", async () => {
    const { store, project } = await setup();
    const result = await store.ingest(project.id, replay("claude-code-usage-limit-synthetic.jsonl", project.id, STORYBOARD, "2026-09-04T08:58:00.000Z", "aaaa"));
    const detail = (await store.getTask(result.finishedTasks[0]!))!;
    const prompt = reportFacts(detail);
    expect(prompt).toContain("The diff of what changed (1 file(s))");
    expect(prompt).toContain("--- src/auth/session.ts");
  });
});

describe("the inbox and clearing", () => {
  it("lists flagged cards until cleared, and a cleared card leaves the Room's count", async () => {
    const { store, project } = await setup();
    await store.ingest(project.id, replay("claude-code-usage-limit-synthetic.jsonl", project.id, STORYBOARD, "2026-09-04T08:58:00.000Z", "aaaa"));
    await store.ingest(project.id, replay("cursor-synthetic.jsonl", project.id, STORYBOARD, "2026-09-04T10:00:00.000Z", "cccc"));
    const tasks = await store.listTasks(project.id, { since: "2026-09-04T00:00:00.000Z" });
    expect(tasks.map((t) => [t.tool, t.report?.needsYou])).toEqual([
      ["cursor", "nothing"],
      ["claude-code", "blocked"],
    ]);
    const blocked = tasks.find((t) => t.tool === "claude-code")!;
    expect((await store.getRoom(project.id))!.inboxOpen).toBe(1);
    await store.setReportResolved(blocked.id, true);
    expect((await store.getReport(blocked.id))?.resolvedAt).toBe(NOW);
    expect((await store.getRoom(project.id))!.inboxOpen).toBe(0);
    await store.setReportResolved(blocked.id, false);
    expect((await store.getRoom(project.id))!.inboxOpen).toBe(1);
  });
});

describe("since you last checked and the digest", () => {
  it("builds the digest from the record, remembers the check, and reuses nothing it cannot verify", async () => {
    const { store, project } = await setup();
    await store.ingest(project.id, replay("claude-code-usage-limit-synthetic.jsonl", project.id, STORYBOARD, "2026-09-04T08:58:00.000Z", "aaaa"));
    await store.ingest(project.id, replay("codex-hooks-synthetic.jsonl", project.id, STORYBOARD, "2026-09-04T09:12:00.000Z", "bbbb"));
    const digest = (await digestFor(project.id, "since-checked", NOW))!;
    expect(digest.window.start).toBe("2026-09-03T10:02:00.000Z"); // no check yet: the last 24 hours
    expect(digest.done.map((d) => [d.tool, d.headline, d.needsYou, d.note])).toEqual([
      ["codex", "The session now always carries the organisation id, and the dashboard reads it directly. All 6 tests pass.", "review", "Continued from Claude Code after its usage limit"],
      ["claude-code", "Stopped before finishing: usage limit reached", "blocked", undefined],
    ]);
    expect(digest.needsYou.map((n) => n.status)).toEqual(["blocked", "review"]);
    expect(digest.toolsUsed).toEqual([
      { tool: "claude-code", tasks: 1, note: undefined },
      { tool: "codex", tasks: 1, note: "1 task picked up after Claude Code ran out of credits" },
    ]);
    expect(digest.summary).toBeUndefined(); // no AI key: no summary, no invention
    expect((await store.getDigestCache(project.id, "since-checked"))?.fingerprint).toBe(digest.fingerprint);

    await store.markChecked(project.id, "2026-09-04T09:05:00.000Z"); // after Claude Code ended, before Codex
    const later = (await digestFor(project.id, "since-checked", NOW))!;
    expect(later.window.start).toBe("2026-09-04T09:05:00.000Z");
    expect(later.done.map((d) => d.tool)).toEqual(["codex"]);
    expect((await store.getRoom(project.id))!.sinceChecked).toEqual({ done: 1, needsYou: 1 });
    expect((await digestFor(project.id, "week", NOW))!.done).toHaveLength(2);
  });
});

describe("the Ask box and translation feedback", () => {
  it("says plainly that Ask needs an AI key, and stores a thumbs-down with the raw action", async () => {
    const { store, project } = await setup();
    const result = await store.ingest(project.id, replay("codex-hooks-synthetic.jsonl", project.id, STORYBOARD, "2026-09-04T09:12:00.000Z", "bbbb"));
    const taskId = result.finishedTasks[0]!;
    const answer = (await askAboutTask(taskId, "Did it change how people log in?"))!;
    expect(answer.answer).toBeNull();
    expect(answer.reason).toContain("Ask needs an AI key");
    expect(await askAboutTask("nope", "anything")).toBeNull();

    const detail = (await store.getTask(taskId))!;
    const edit = detail.events.find((e) => e.kind === "edit")!;
    const record = (await store.addFeedback({ eventId: edit.id, note: "It changed more than the session" }))!;
    expect(record).toMatchObject({ eventId: edit.id, projectId: project.id, taskId, plain: "Changing the session part of Login", kind: "edit" });
    expect(await store.addFeedback({ eventId: "missing" })).toBeNull();
    const list = await store.listFeedback(project.id);
    expect(list).toHaveLength(1);
    expect(list[0]?.event?.raw).toBeDefined();
    expect(list[0]?.summary).toBe(edit.summary);
  });
});
