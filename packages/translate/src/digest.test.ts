import { describe, expect, it } from "vitest";
import { buildDigest, digestCounts, digestWindow, type DigestTask } from "./digest.js";
import { storyboardAreas } from "./fixtures.test-support.js";

const areas = storyboardAreas();
const NOW = "2026-09-04T12:00:00.000Z";

function task(over: Partial<DigestTask> & { id: string }): DigestTask {
  return {
    tool: "claude-code",
    headline: "Working",
    stage: "done",
    startedAt: "2026-09-04T09:00:00.000Z",
    risk: "low",
    changedPaths: [],
    createdPaths: [],
    installed: [],
    ...over,
  };
}

const tasks: DigestTask[] = [
  task({ id: "claude-1", tool: "claude-code", headline: "Stopped: usage limit reached", endedAt: "2026-09-04T09:05:00.000Z", endReason: "usage_limit", usageLimitConfirmed: true, risk: "high", changedPaths: ["src/auth/session.ts"], report: { headline: "Stopped before finishing: usage limit reached", needsYou: "blocked", needsYouDetail: "Claude Code hit its usage limit before finishing.", resolved: false } }),
  task({ id: "codex-1", tool: "codex", headline: "Done", endedAt: "2026-09-04T09:20:00.000Z", endReason: "stop", risk: "high", changedPaths: ["src/auth/session.ts", "src/dashboard/page.tsx"], createdPaths: ["src/dashboard/org-switcher.tsx"], installed: ["zod"], report: { headline: "Dashboards now know which organisation you are in", needsYou: "review", needsYouDetail: "High risk: changes login.", resolved: false }, continuedFrom: { tool: "claude-code", endReason: "usage_limit", usageLimitConfirmed: true } }),
  task({ id: "cursor-1", tool: "cursor", headline: "Every scene now gets a default location", endedAt: "2026-09-04T10:00:00.000Z", endReason: "stop", changedPaths: ["src/storyboard/scenes.ts"], report: { headline: "Every scene now gets a default location", needsYou: "nothing", resolved: false } }),
  task({ id: "old-1", tool: "claude-code", headline: "Old", endedAt: "2026-09-03T10:00:00.000Z", endReason: "stop", report: { headline: "Old work", needsYou: "review", resolved: false } }),
  task({ id: "live-1", tool: "claude-code", headline: "Changing how invoices are totalled", stage: "building", location: "Payments → invoices", lastEventAt: "2026-09-04T11:55:00.000Z", changedPaths: ["src/payments/invoices.ts"] }),
  task({ id: "live-2", tool: "codex", headline: "Waiting for you", stage: "waiting", lastEventAt: "2026-09-04T11:58:00.000Z" }),
  task({ id: "stale-1", tool: "claude-code", headline: "Went quiet hours ago", stage: "building", lastEventAt: "2026-09-04T06:00:00.000Z" }),
  task({ id: "watcher-1", tool: "watcher", headline: "Saved a checkpoint", stage: "building", lastEventAt: "2026-09-04T11:50:00.000Z", changedPaths: ["src/upload/upload.ts"] }),
];

describe("digestWindow", () => {
  it("is since the last check, or the last day when there was none", () => {
    expect(digestWindow("since-checked", NOW, "2026-09-04T08:00:00.000Z")).toEqual({ kind: "since-checked", start: "2026-09-04T08:00:00.000Z", end: NOW });
    expect(digestWindow("since-checked", NOW)).toEqual({ kind: "since-checked", start: "2026-09-03T12:00:00.000Z", end: NOW });
    expect(digestWindow("week", NOW).start).toBe("2026-08-28T12:00:00.000Z");
    expect(digestWindow("today", NOW).end).toBe(NOW);
  });
});

describe("buildDigest", () => {
  const window = { kind: "since-checked" as const, start: "2026-09-04T08:00:00.000Z", end: NOW };
  const digest = buildDigest(tasks, areas, window, { previousAreaIds: areas.filter((a) => a.name !== "Dashboard").map((a) => a.id) });

  it("lists what finished in the window, newest first, with the continuity note", () => {
    expect(digest.done.map((d) => [d.taskId, d.headline, d.needsYou, d.note])).toEqual([
      ["cursor-1", "Every scene now gets a default location", "nothing", undefined],
      ["codex-1", "Dashboards now know which organisation you are in", "review", "Continued from Claude Code after its usage limit"],
      ["claude-1", "Stopped before finishing: usage limit reached", "blocked", undefined],
    ]);
  });

  it("shows what is still going right now, and not the folder watcher or a task that went quiet", () => {
    expect(digest.stillGoing.map((g) => [g.taskId, g.stage, g.location])).toEqual([
      ["live-2", "waiting", undefined],
      ["live-1", "building", "Payments → invoices"],
    ]);
  });

  it("puts everything that needs you in one list, blockers first, live tiles included", () => {
    expect(digest.needsYou.map((n) => [n.taskId, n.status, n.from])).toEqual([
      ["claude-1", "blocked", "report"],
      ["live-2", "decision", "live"],
      ["codex-1", "review", "report"],
    ]);
    expect(digest.needsYou.find((n) => n.taskId === "live-2")?.detail).toBe("Waiting for you right now.");
  });

  it("reports what is new in the app from facts: new parts, new tools, new files", () => {
    expect(digest.newInApp).toEqual({ areas: ["Dashboard"], dependencies: ["zod"], filesCreated: 1, areasWithNewFiles: ["Dashboard"] });
  });

  it("counts tasks per tool and says when one picked up after another ran out of credits", () => {
    expect(digest.toolsUsed).toEqual([
      { tool: "claude-code", tasks: 2, note: undefined },
      { tool: "codex", tasks: 2, note: "1 task picked up after Claude Code ran out of credits" },
      { tool: "cursor", tasks: 1, note: undefined },
    ]);
  });

  it("has stable counts and a fingerprint that changes only when the facts change", () => {
    expect(digestCounts(digest)).toEqual({ done: 3, stillGoing: 2, needsYou: 3 });
    const same = buildDigest(tasks, areas, window, { previousAreaIds: areas.filter((a) => a.name !== "Dashboard").map((a) => a.id) });
    expect(same.fingerprint).toBe(digest.fingerprint);
    const resolved = tasks.map((t) => (t.id === "codex-1" && t.report ? { ...t, report: { ...t.report, resolved: true } } : t));
    expect(buildDigest(resolved, areas, window).fingerprint).not.toBe(digest.fingerprint);
  });

  it("an older window includes the older report and its open flag", () => {
    const week = buildDigest(tasks, areas, digestWindow("week", NOW));
    expect(week.done.map((d) => d.taskId)).toContain("old-1");
    expect(week.needsYou.map((n) => n.taskId)).toContain("old-1");
    expect(week.newInApp.areas).toEqual([]);
  });
});
