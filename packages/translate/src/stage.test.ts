import { describe, expect, it } from "vitest";
import type { EventKind } from "@glasshouse/schema";
import { detectStuck, displayStage, errorSignature, stageAfter, type StageState } from "./stage.js";

function run(kinds: EventKind[]): string[] {
  let s: StageState = { stage: "investigating" };
  return kinds.map((k) => {
    s = stageAfter(s, k);
    return s.stage;
  });
}

describe("stageAfter", () => {
  it("walks investigating -> planning -> building -> testing -> done", () => {
    expect(run(["prompt", "read", "search", "plan", "edit", "read", "test_run", "edit", "test_run", "stop"])).toEqual([
      "investigating",
      "investigating",
      "investigating",
      "planning",
      "building",
      "building",
      "testing",
      "building",
      "testing",
      "done",
    ]);
  });

  it("todo bookkeeping mid-build does not go back to planning", () => {
    expect(run(["prompt", "edit", "plan"])).toEqual(["investigating", "building", "building"]);
  });

  it("waiting for you resumes where it left off", () => {
    expect(run(["prompt", "edit", "permission_wait", "command"])).toEqual(["investigating", "building", "waiting", "building"]);
    expect(run(["prompt", "edit", "permission_wait", "permission_denied"])).toEqual(["investigating", "building", "waiting", "building"]);
    expect(run(["prompt", "edit", "stop", "idle"])).toEqual(["investigating", "building", "done", "waiting"]);
  });

  it("errors and helpers do not move the stage; a usage limit ends it", () => {
    expect(run(["prompt", "edit", "error", "subagent_start", "subagent_stop", "usage_limit"])).toEqual(["investigating", "building", "building", "building", "building", "done"]);
  });
});

describe("detectStuck", () => {
  const now = "2026-09-04T09:10:00.000Z";
  it("fires on the same error three times", () => {
    const v = detectStuck({ stage: "building", lastEventAt: now, recentErrors: ["ENOENT: open 'a/b.ts' (attempt 1)", "ENOENT: open 'a/c.ts' (attempt 2)", "ENOENT: open 'a/d.ts' (attempt 3)"] }, now);
    expect(v).toEqual({ stuck: true, reason: "The same error has happened three times in a row" });
    expect(displayStage("building", v)).toBe("stuck");
  });
  it("does not fire on three different errors", () => {
    expect(detectStuck({ stage: "building", lastEventAt: now, recentErrors: ["a failed", "b failed", "c failed"] }, now).stuck).toBe(false);
  });
  it("fires when nothing has happened for five minutes while working", () => {
    expect(detectStuck({ stage: "testing", lastEventAt: "2026-09-04T09:04:00.000Z", recentErrors: [] }, now)).toEqual({ stuck: true, reason: "Nothing has happened for 6 minutes" });
    expect(detectStuck({ stage: "testing", lastEventAt: "2026-09-04T09:08:00.000Z", recentErrors: [] }, now).stuck).toBe(false);
  });
  it("never fires when done, waiting, or the session has ended", () => {
    expect(detectStuck({ stage: "done", lastEventAt: "2026-09-04T08:00:00.000Z", recentErrors: [] }, now).stuck).toBe(false);
    expect(detectStuck({ stage: "waiting", lastEventAt: "2026-09-04T08:00:00.000Z", recentErrors: [] }, now).stuck).toBe(false);
    expect(detectStuck({ stage: "building", lastEventAt: "2026-09-04T08:00:00.000Z", recentErrors: [], sessionEnded: true }, now).stuck).toBe(false);
  });
  it("error signatures ignore paths, ids and numbers", () => {
    expect(errorSignature("ENOENT: open '/a/b.ts' id 0123456789ab try 2")).toBe(errorSignature("ENOENT: open '/x/y.ts' id fedcba987654 try 3"));
  });
});
