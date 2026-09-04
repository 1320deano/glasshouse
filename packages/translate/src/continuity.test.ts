import { describe, expect, it } from "vitest";
import { findContinuation, promptOverlap } from "./continuity.js";

const ended = {
  id: "t1",
  tool: "claude-code",
  prompt: "The dashboard needs to know which organisation a user is in. Change the login session so it carries the organisation id.",
  areaIds: ["login", "dashboard"],
  endedAt: "2026-09-04T08:59:02.000Z",
  endReason: "usage_limit",
};

describe("findContinuation", () => {
  it("links a Codex task that picks up after a Claude Code usage limit in the same area", () => {
    const link = findContinuation([ended], { tool: "codex", prompt: "Continue the login session change so the dashboard knows the organisation", areaIds: ["login"], startedAt: "2026-09-04T09:12:04.000Z" });
    expect(link?.taskId).toBe("t1");
    expect(link?.reason).toBe("Claude Code hit its usage limit; same part of the app as the Claude Code task; the instructions match");
  });

  it("does not link the same tool, an old task, or one already continued", () => {
    const fresh = { tool: "codex", prompt: ended.prompt, areaIds: ["login"], startedAt: "2026-09-04T09:12:04.000Z" };
    expect(findContinuation([{ ...ended, tool: "codex" }], fresh)).toBeNull();
    expect(findContinuation([{ ...ended, endedAt: "2026-09-03T20:00:00.000Z" }], fresh)).toBeNull();
    expect(findContinuation([{ ...ended, continuedBy: "t9" }], fresh)).toBeNull();
  });

  it("needs real evidence when the earlier task simply stopped", () => {
    const stopped = { ...ended, endReason: "stop" };
    expect(findContinuation([stopped], { tool: "cursor", prompt: "Fix the storyboard scene bug", areaIds: ["storyboard"], startedAt: "2026-09-04T10:00:03.000Z" })).toBeNull();
    expect(findContinuation([stopped], { tool: "cursor", prompt: "Carry on with the login session organisation id change", areaIds: ["login"], startedAt: "2026-09-04T09:30:00.000Z" })?.reason).toBe("Same part of the app as the Claude Code task; the instructions match");
  });

  it("prefers the most likely candidate", () => {
    const other = { ...ended, id: "t2", prompt: "Tidy the README", areaIds: ["docs"], endReason: "stop" };
    expect(findContinuation([other, ended], { tool: "codex", prompt: "continue login organisation id", areaIds: ["login"], startedAt: "2026-09-04T09:12:04.000Z" })?.taskId).toBe("t1");
  });

  it("prompt overlap ignores filler words", () => {
    expect(promptOverlap("please make the login page faster", "the login page should be faster please")).toBeGreaterThan(0.5);
    expect(promptOverlap("please do this", "the thing")).toBe(0);
  });
});
