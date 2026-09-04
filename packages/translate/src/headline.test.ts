import { describe, expect, it } from "vitest";
import { headlineTrigger, nextTriggerState, templateHeadline, type TriggerState } from "./headline.js";

describe("headlineTrigger", () => {
  it("fires on the meaning changes and nothing else", () => {
    const s: TriggerState = { stage: "building", areaId: "login", readsSinceEdit: 0 };
    expect(headlineTrigger(s, "investigating", "prompt", undefined)).toBe("new prompt");
    expect(headlineTrigger(s, "building", "error", "login")).toBe("error");
    expect(headlineTrigger(s, "done", "stop", undefined)).toBe("finished");
    expect(headlineTrigger(s, "waiting", "permission_wait", undefined)).toBe("waiting");
    expect(headlineTrigger(s, "testing", "test_run", undefined)).toBe("stage change");
    expect(headlineTrigger(s, "building", "edit", "payments")).toBe("area change");
    expect(headlineTrigger(s, "building", "edit", "login")).toBeNull();
    expect(headlineTrigger(s, "building", "read", "login")).toBeNull();
  });

  it("a run of reads followed by an edit is a new meaning", () => {
    let s: TriggerState = { stage: "building", areaId: "login", readsSinceEdit: 0 };
    for (const k of ["read", "read", "search"] as const) s = nextTriggerState(s, "building", k, "login");
    expect(s.readsSinceEdit).toBe(3);
    expect(headlineTrigger(s, "building", "edit", "login")).toBe("first edit after reading");
    expect(nextTriggerState(s, "building", "edit", "login").readsSinceEdit).toBe(0);
  });
});

describe("templateHeadline", () => {
  it("writes short owner-language headlines per stage", () => {
    expect(templateHeadline({ stage: "investigating" })).toBe("Starting up");
    expect(templateHeadline({ stage: "investigating", prompt: "x" })).toBe("Looking into your request");
    expect(templateHeadline({ stage: "investigating", areaName: "Login" })).toBe("Looking into how Login works");
    expect(templateHeadline({ stage: "investigating", areaName: "Login", noun: "the session part of Login", lastKind: "read" })).toBe("Looking at the session part of Login");
    expect(templateHeadline({ stage: "planning", areaName: "Login" })).toBe("Working out a plan for Login");
    expect(templateHeadline({ stage: "building", areaName: "Login", noun: "how logged-in users are identified", lastKind: "edit" })).toBe("Changing how logged-in users are identified");
    expect(templateHeadline({ stage: "testing", tests: { passed: 8, failed: 1 } })).toBe("Checking the work: 1 check failing");
    expect(templateHeadline({ stage: "testing", tests: { passed: 8, failed: 0 } })).toBe("Checking the work: all 8 checks passed");
    expect(templateHeadline({ stage: "waiting" })).toBe("Waiting for you");
    expect(templateHeadline({ stage: "done", closingMessage: "the session now carries the organisation id." })).toBe("The session now carries the organisation id.");
    expect(templateHeadline({ stage: "done", endReason: "usage_limit", tool: "claude-code" })).toBe("Stopped: usage limit reached");
    expect(templateHeadline({ stage: "done", endReason: "usage_limit", tool: "cursor" })).toBe("Stopped: possibly a usage limit");
  });
});
