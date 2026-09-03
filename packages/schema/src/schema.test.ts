import { describe, expect, it } from "vitest";
import { EventBatch, NormalisedEvent } from "./index";

const base = {
  id: "0b3a0d4e-1e2f-4c5d-8a9b-0c1d2e3f4a5b",
  projectId: "1b3a0d4e-1e2f-4c5d-8a9b-0c1d2e3f4a5b",
  sessionId: "sess_1",
  tool: "claude-code",
  kind: "read",
  ts: "2026-09-03T21:00:00.000Z",
  paths: ["auth/session.py"],
  summary: "Read auth/session.py",
  sourceEvent: "PostToolUse",
  sourceTool: "Read",
  raw: { anything: true },
};

describe("NormalisedEvent", () => {
  it("accepts a well-formed event", () => {
    expect(NormalisedEvent.parse(base).kind).toBe("read");
  });

  it("rejects an unknown kind", () => {
    expect(() => NormalisedEvent.parse({ ...base, kind: "percent_done" })).toThrow();
  });

  it("defaults paths to an empty list", () => {
    const { paths: _omit, ...withoutPaths } = base;
    expect(NormalisedEvent.parse(withoutPaths).paths).toEqual([]);
  });

  it("batches require at least one event", () => {
    expect(() => EventBatch.parse({ connectorVersion: "0.0.0", events: [] })).toThrow();
  });
});
