import { describe, expect, it } from "vitest";
import type { Area } from "@glasshouse/schema";
import { activityFrom, activityWindow, areaProgress, hourKey, hourTotal, stepIndex } from "./progress";
import { storyForTask, storyFrom } from "./story";
import type { TaskView } from "./store/types";

const AREAS: Area[] = [
  { id: "auth", name: "Sign-in", description: "", prefixes: ["src/auth"], userCorrected: false, source: "heuristic", sensitive: true },
  { id: "dash", name: "Dashboard", description: "", prefixes: ["src/dashboard"], userCorrected: false, source: "heuristic", sensitive: false },
  { id: "pay", name: "Payments", description: "", prefixes: ["src/payments"], userCorrected: false, source: "heuristic", sensitive: true },
];

function task(over: Partial<TaskView> & { id: string }): TaskView {
  return {
    sessionId: `s-${over.id}`,
    tool: "claude-code",
    headline: "Building the dashboard",
    headlineSource: "template",
    stage: "building",
    storedStage: "building",
    risk: { level: "low", reasons: ["Nothing sensitive"] },
    startedAt: "2026-09-04T10:00:00.000Z",
    lastEventAt: "2026-09-04T10:20:00.000Z",
    eventCount: 12,
    changedPaths: [],
    touchedPaths: [],
    areas: [],
    notTouched: [],
    installs: 0,
    createdPaths: [],
    installed: [],
    ...over,
  };
}

describe("the story: one message per meaning change, from the record", () => {
  it("a running task is one 'started' line carrying the owner's own words", () => {
    const m = storyForTask(task({ id: "a", prompt: "Make the dashboard load faster for big teams." }));
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ kind: "started", tool: "claude-code", at: "2026-09-04T10:00:00.000Z" });
    expect(m[0]!.text).toBe("Claude Code started on: “Make the dashboard load faster for big teams.”");
  });

  it("waiting and stuck are their own lines, and stuck offers words to paste, never sends them", () => {
    const waiting = storyForTask(task({ id: "w", stage: "waiting", storedStage: "building", headline: "Waiting for you to approve adding a tool" }));
    expect(waiting.map((m) => m.kind)).toEqual(["started", "waiting"]);
    expect(waiting[1]!.text).toBe("Claude Code: Waiting for you to approve adding a tool");
    expect(waiting[1]!.needsYou).toBe("blocked");
    const bare = storyForTask(task({ id: "b", stage: "waiting", storedStage: "building", headline: "Waiting for you", location: "Login → tokens" }));
    expect(bare[1]!.text).toBe("Claude Code is waiting for you in its own window, in Login → tokens.");

    const stuck = storyForTask(task({ id: "s", tool: "cursor", stage: "stuck", storedStage: "testing", stuckReason: "the same error three times" }));
    expect(stuck[1]).toMatchObject({ kind: "stuck", text: "Cursor looks stuck: the same error three times." });
    expect(stuck[1]!.suggestedReply).toMatch(/wait for me/);
  });

  it("a finished task carries its verified facts: touched, not touched, checks, needs-you", () => {
    const t = task({
      id: "f",
      tool: "codex",
      stage: "done",
      storedStage: "done",
      endedAt: "2026-09-04T10:30:00.000Z",
      changedPaths: ["src/payments/stripe.ts"],
      areas: [{ id: "pay", name: "Payments", description: "", changed: ["src/payments/stripe.ts"], looked: [] }],
      notTouched: ["Sign-in", "Dashboard"],
      lastTests: { passed: 24, failed: 0 },
      risk: { level: "high", reasons: ["Changes Payments"] },
    });
    const m = storyForTask(t);
    expect(m.map((x) => x.kind)).toEqual(["started", "finished"]);
    expect(m[1]).toMatchObject({ at: "2026-09-04T10:30:00.000Z", touched: ["Payments"], notTouched: ["Sign-in", "Dashboard"], checks: "All 24 checks passed", risk: "high" });
    expect(m[1]!.suggestedReply).toBeUndefined();

    const failing = storyForTask(task({ ...t, id: "g", lastTests: { passed: 22, failed: 2 } }));
    expect(failing[1]!.checks).toBe("2 of 24 checks failed");
    expect(failing[1]!.suggestedReply).toMatch(/2 checks failed/);
  });

  it("a usage limit and a hand-off read as what they are", () => {
    const limit = storyForTask(task({ id: "l", endedAt: "2026-09-04T10:30:00.000Z", endReason: "usage_limit", usageLimitConfirmed: true, stage: "done", storedStage: "building", continuedBy: { taskId: "h", tool: "codex" } }));
    expect(limit[1]).toMatchObject({ kind: "limit", text: "Claude Code stopped: it ran out of usage." });
    const handoff = storyForTask(task({ id: "h", tool: "codex", startedAt: "2026-09-04T10:31:00.000Z", continuedFrom: { taskId: "l", tool: "claude-code", headline: "Building the dashboard", reason: "same words" } }));
    expect(handoff[0]).toMatchObject({ kind: "handoff", text: "Codex picked up where Claude Code left off: Building the dashboard" });
  });

  it("the folder watcher has no story; the story is oldest first and capped", () => {
    expect(storyForTask(task({ id: "v", tool: "watcher" }))).toEqual([]);
    const all = storyFrom([task({ id: "b", startedAt: "2026-09-04T11:00:00.000Z" }), task({ id: "a", startedAt: "2026-09-04T09:00:00.000Z" })]);
    expect(all.map((m) => m.taskId)).toEqual(["a", "b"]);
    expect(storyFrom([task({ id: "b", startedAt: "2026-09-04T11:00:00.000Z" }), task({ id: "a", startedAt: "2026-09-04T09:00:00.000Z" })], 1).map((m) => m.taskId)).toEqual(["b"]);
  });
});

describe("progress: stages reached per part of the app, never percentages", () => {
  const since = "2026-08-28T12:00:00.000Z";

  it("touched parts come first with the furthest stage; untouched parts follow with no stage", () => {
    const rows = areaProgress(
      [
        task({ id: "a", changedPaths: ["src/dashboard/page.tsx"], touchedPaths: ["src/dashboard/page.tsx", "src/auth/login.ts"], stage: "testing", storedStage: "testing", lastTests: { passed: 5, failed: 1 } }),
        task({ id: "b", tool: "codex", changedPaths: ["src/auth/login.ts", "src/auth/tokens.ts"], touchedPaths: ["src/auth/login.ts", "src/auth/tokens.ts"], stage: "done", storedStage: "done", endedAt: "2026-09-04T09:00:00.000Z", lastEventAt: "2026-09-04T09:00:00.000Z", lastTests: { passed: 9, failed: 0 } }),
      ],
      AREAS,
      since,
    );
    expect(rows.map((r) => r.id)).toEqual(["dash", "auth", "pay"]);
    const dash = rows[0]!;
    expect(dash).toMatchObject({ stage: "testing", running: 1, finished: 0, filesChanged: 1, checks: { passed: 5, failed: 1 }, tools: ["claude-code"] });
    const auth = rows[1]!;
    // Task a only looked at Sign-in, so it counts as running there but its test counts do not attach.
    expect(auth).toMatchObject({ stage: "done", running: 1, finished: 1, filesChanged: 2, checks: { passed: 9, failed: 0 } });
    expect(auth.tools).toEqual(["claude-code", "codex"]);
    expect(rows[2]).toMatchObject({ id: "pay", stage: null, running: 0, finished: 0, filesChanged: 0 });
    expect(rows[2]!.lastTouchedAt).toBeUndefined();
  });

  it("waiting and stuck are overlays on the stored stage, and the watcher counts files but not tasks", () => {
    const rows = areaProgress(
      [
        task({ id: "w", changedPaths: ["src/payments/stripe.ts"], stage: "waiting", storedStage: "building" }),
        task({ id: "v", tool: "watcher", changedPaths: ["src/payments/invoices.ts"] }),
      ],
      AREAS,
      since,
    );
    const pay = rows.find((r) => r.id === "pay")!;
    expect(pay).toMatchObject({ stage: "building", attention: "waiting", running: 1, filesChanged: 2, tools: ["claude-code"] });
    expect(stepIndex("waiting", "testing")).toBe(3);
    expect(stepIndex(null)).toBe(-1);
  });

  it("tasks outside the window are ignored", () => {
    const rows = areaProgress([task({ id: "old", changedPaths: ["src/auth/login.ts"], startedAt: "2026-08-01T00:00:00.000Z", lastEventAt: "2026-08-01T01:00:00.000Z" })], AREAS, since);
    expect(rows.every((r) => r.stage === null)).toBe(true);
  });
});

describe("activity: actions per hour and per tool, re-cuttable to a shorter window", () => {
  it("buckets by UTC hour and counts per tool", () => {
    const view = activityFrom(
      [
        { ts: "2026-09-04T10:05:00.000Z", tool: "claude-code" },
        { ts: "2026-09-04T10:55:00.000Z", tool: "claude-code" },
        { ts: "2026-09-04T10:59:59.000Z", tool: "codex" },
        { ts: "2026-09-04T11:00:00.000Z", tool: "cursor" },
        { ts: "2026-08-01T11:00:00.000Z", tool: "cursor" },
      ],
      "2026-08-28T12:00:00.000Z",
    );
    expect(hourKey("2026-09-04T10:59:59.000Z")).toBe("2026-09-04T10:00:00.000Z");
    expect(view.total).toBe(4);
    expect(view.byTool).toEqual({ "claude-code": 2, codex: 1, cursor: 1, watcher: 0 });
    expect(view.hours["2026-09-04T10:00:00.000Z"]).toEqual({ "claude-code": 2, codex: 1 });
    expect(hourTotal(view.hours["2026-09-04T10:00:00.000Z"])).toBe(3);
    const cut = activityWindow(view.hours, "2026-09-04T11:00:00.000Z");
    expect(cut.total).toBe(1);
    expect(cut.byTool.cursor).toBe(1);
    expect(Object.keys(cut.hours)).toEqual(["2026-09-04T11:00:00.000Z"]);
  });
});
