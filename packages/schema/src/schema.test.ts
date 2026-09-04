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

describe("Phase 2 shapes", () => {
  it("area maps default the optional flags", async () => {
    const { AreaMap, ProjectTree } = await import("./index");
    const map = AreaMap.parse({ areas: [{ id: "a1", name: "Login", prefixes: ["auth"] }] });
    expect(map.areas[0]).toMatchObject({ userCorrected: false, source: "heuristic", sensitive: false, description: "" });
    const tree = ProjectTree.parse({ paths: ["package.json"], scannedAt: "2026-09-04T00:00:00.000Z" });
    expect(tree).toMatchObject({ truncated: false, manifests: [] });
  });

  it("events may carry parsed test counts and short text, never long text", () => {
    expect(NormalisedEvent.parse({ ...base, kind: "test_run", tests: { passed: 3, failed: 1 } }).tests).toEqual({ passed: 3, failed: 1 });
    expect(() => NormalisedEvent.parse({ ...base, text: "x".repeat(5000) })).toThrow();
  });
});
