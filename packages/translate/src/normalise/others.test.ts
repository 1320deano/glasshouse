import { describe, expect, it } from "vitest";
import { NormalisedEvent } from "@glasshouse/schema";
import { PROJECT_ID, STORYBOARD_ROOT, replayHooks, replayRollout } from "../fixtures.test-support.js";
import { watcherCommitEvent, watcherEditEvent } from "./watcher.js";

describe("normaliseCodex (hooks, synthetic fixture)", () => {
  const events = replayHooks("codex-hooks-synthetic.jsonl", STORYBOARD_ROOT);

  it("produces the expected kinds with turn_id as the task key", () => {
    expect(events.map((e) => e.kind)).toEqual(["session_start", "prompt", "command", "read", "edit", "test_run", "stop", "session_end"]);
    expect(events[1]?.taskKey).toBe("turn_7f3a");
    expect(events.every((e) => e.tool === "codex")).toBe(true);
    for (const e of events) NormalisedEvent.parse(e);
  });

  it("reads paths out of an apply_patch and counts from test output", () => {
    const edit = events.find((e) => e.kind === "edit")!;
    expect(edit.paths).toEqual(["src/auth/session.ts", "src/dashboard/page.tsx"]);
    const test = events.find((e) => e.kind === "test_run")!;
    expect(test.tests).toEqual({ passed: 6, failed: 0 });
    expect(test.command).toBe("bash -lc pnpm test");
  });

  it("never lets file contents or patch bodies through", () => {
    const text = JSON.stringify(events);
    expect(text).not.toContain("whole file");
    expect(text).not.toContain("organisationId?: string }\\n+");
    expect(text).not.toContain("transcript_path");
  });
});

describe("normaliseCodexRollout (synthetic rollout)", () => {
  const events = replayRollout("codex-synthetic.jsonl", STORYBOARD_ROOT);

  it("turns the log into a session with two turns", () => {
    expect(events.map((e) => e.kind)).toEqual(["session_start", "prompt", "reasoning", "command", "edit", "test_run", "stop", "prompt", "usage_limit", "stop"]);
    expect(events[0]?.taskKey).toBeUndefined();
    expect(events[1]?.taskKey).toBe("turn-1");
    expect(events[7]?.taskKey).toBe("turn-2");
    expect(events.every((e) => e.sessionId === "0199a1b2-codex-4c1d-9e2f-0a1b2c3d4e5f")).toBe(true);
    for (const e of events) NormalisedEvent.parse(e);
  });

  it("uses the log's own timestamps and the rate limit as the usage-limit truth", () => {
    expect(events[1]?.ts).toBe("2026-09-04T09:12:04.000Z");
    const limit = events.find((e) => e.kind === "usage_limit")!;
    expect(limit.text).toBe("confirmed");
    expect(limit.summary).toBe("Stopped: usage limit reached");
    expect(events.at(-1)?.summary).toBe("Interrupted (rate_limit_reached)");
  });

  it("joins a tool call with its output and reads the exit code", () => {
    const cmd = events.find((e) => e.kind === "command")!;
    expect(cmd.command).toBe("bash -lc git status --short && git diff --stat");
    expect(cmd.success).toBe(true);
    expect(events.find((e) => e.kind === "test_run")?.tests).toEqual({ passed: 6, failed: 0 });
    expect(events.find((e) => e.kind === "edit")?.paths).toEqual(["src/auth/session.ts", "src/dashboard/page.tsx"]);
    expect(events.find((e) => e.kind === "stop")?.text).toContain("organisation id");
  });

  it("drops the instructions blob and long payload strings", () => {
    const text = JSON.stringify(events);
    expect(text).not.toContain("long instructions");
  });
});

describe("normaliseCursor (synthetic fixture)", () => {
  const events = replayHooks("cursor-synthetic.jsonl", STORYBOARD_ROOT);

  it("maps Cursor's own event names", () => {
    expect(events.map((e) => e.kind)).toEqual(["session_start", "prompt", "reasoning", "read", "edit", "edit", "test_run", "error", "edit", "test_run", "stop", "stop"]);
    expect(events[1]?.taskKey).toBe("gen_0001");
    expect(events[1]?.sessionId).toBe("conv_9c2e4d");
    for (const e of events) NormalisedEvent.parse(e);
  });

  it("reads test results and exit codes from the shell output", () => {
    const runs = events.filter((e) => e.kind === "test_run");
    expect(runs[0]?.tests).toEqual({ passed: 7, failed: 1 });
    expect(runs[0]?.success).toBe(false);
    expect(runs[1]?.tests).toEqual({ passed: 8, failed: 0 });
    expect(runs[1]?.success).toBe(true);
  });

  it("strips file contents and edit bodies", () => {
    const text = JSON.stringify(events);
    expect(text).not.toContain("whole file");
    expect(text).not.toContain("Unknown location");
    expect(events.find((e) => e.kind === "edit")?.paths).toEqual(["src/storyboard/scene-builder.ts"]);
  });
});

describe("watcher events", () => {
  it("groups a day's file changes and commits into one session and task", () => {
    const edit = watcherEditEvent({ projectId: PROJECT_ID, path: "src/upload/upload.ts", change: "changed", ts: "2026-09-04T11:00:00.000Z", makeId: () => "0b3a0d4e-1e2f-4c5d-8a9b-0c1d2e3f4a5b" });
    const commit = watcherCommitEvent({ projectId: PROJECT_ID, hash: "abc1234def", message: "Handle large uploads\n\nbody", paths: ["src/upload/upload.ts"], ts: "2026-09-04T11:05:00.000Z", makeId: () => "0b3a0d4e-1e2f-4c5d-8a9b-0c1d2e3f4a5c" });
    expect(edit).toMatchObject({ tool: "watcher", kind: "edit", sessionId: "watch-2026-09-04", taskKey: "watch-2026-09-04", summary: "Changed src/upload/upload.ts" });
    expect(commit).toMatchObject({ kind: "commit", sessionId: "watch-2026-09-04", summary: "Committed: Handle large uploads", text: "Handle large uploads\n\nbody" });
    NormalisedEvent.parse(edit);
    NormalisedEvent.parse(commit);
  });
});

describe("Cursor closing words", () => {
  it("keeps the agent's response as the closing message even though the stop hook carries none", () => {
    const events = replayHooks("cursor-synthetic.jsonl", STORYBOARD_ROOT);
    const stops = events.filter((e) => e.kind === "stop");
    expect(stops[0]?.text).toBe("Every scene now gets a default location and all storyboard tests pass.");
    expect(stops[1]?.summary).toBe("Finished");
  });
});
