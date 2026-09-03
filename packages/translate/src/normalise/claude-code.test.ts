import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NormalisedEvent, RecordedHook } from "@glasshouse/schema";
import { normaliseClaudeCode, relativePath, stripPayload } from "./claude-code.js";

const fixture = join(__dirname, "../../../../fixtures/sessions/claude-code-basic.jsonl");
const projectRoot = "C:\\Users\\chris\\Downloads\\monitorappidea";
const projectId = "11111111-1111-4111-8111-111111111111";

function replay() {
  let n = 0;
  const ctx = {
    projectId,
    projectRoot,
    makeId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    now: () => "2026-09-03T21:30:00.000Z",
  };
  return readFileSync(fixture, "utf8")
    .trim()
    .split("\n")
    .map((l) => RecordedHook.parse(JSON.parse(l)))
    .map((r) => normaliseClaudeCode(r.hookEvent, r.payload, ctx))
    .filter((e): e is NormalisedEvent => e !== null);
}

describe("normaliseClaudeCode on the recorded session", () => {
  const events = replay();

  it("produces the expected sequence of kinds", () => {
    expect(events.map((e) => e.kind)).toEqual([
      "session_start",
      "prompt",
      "read",
      "search",
      "command",
      "edit",
      "test_run",
      "stop",
      "session_end",
    ]);
  });

  it("every event validates against the schema", () => {
    for (const e of events) expect(() => NormalisedEvent.parse(e)).not.toThrow();
  });

  it("carries the prompt id as the task key from the prompt onwards", () => {
    const [start, ...rest] = events;
    expect(start?.taskKey).toBeUndefined();
    expect(new Set(rest.map((e) => e.taskKey)).size).toBe(1);
  });

  it("makes paths relative with forward slashes", () => {
    const read = events.find((e) => e.kind === "read");
    expect(read?.paths).toEqual(["package.json"]);
    const edit = events.find((e) => e.kind === "edit");
    expect(edit?.paths).toEqual(["scratch/hello.txt"]);
    expect(edit?.summary).toBe("Created scratch/hello.txt");
  });

  it("uses the agent's own description as the command summary", () => {
    const cmd = events.find((e) => e.kind === "command");
    expect(cmd?.summary).toBe("Show pnpm version");
    expect(cmd?.command).toBe("pnpm --version");
  });

  it("never lets file contents through", () => {
    const text = JSON.stringify(events);
    // The recorded Read returned the whole of package.json; the Write carried the new file's text.
    expect(text).not.toContain('"packageManager"');
    expect(text).not.toContain('"content":');
    expect(text).not.toContain("transcript_path");
    const write = events.find((e) => e.sourceTool === "Write")?.raw as { tool_input: Record<string, unknown> };
    expect(write.tool_input).toEqual({ file_path: "C:\\Users\\chris\\Downloads\\monitorappidea\\scratch\\hello.txt" });
  });

  it("keeps the closing message on the stop event", () => {
    expect(events.at(-2)?.summary).toBe("done");
  });
});

describe("relativePath", () => {
  it("handles Windows paths and case-insensitive roots", () => {
    expect(relativePath("c:\\users\\chris\\downloads\\monitorappidea\\apps\\web\\page.tsx", projectRoot)).toBe("apps/web/page.tsx");
  });
  it("shortens paths outside the root", () => {
    expect(relativePath("C:\\Users\\chris\\.claude\\settings.json", projectRoot)).toBe("…/.claude/settings.json");
  });
});

describe("stripPayload", () => {
  it("drops diffs for secret files but keeps them for normal files", () => {
    const base = { tool_name: "Edit", tool_response: { structuredPatch: [1] } };
    expect(stripPayload({ ...base, tool_input: { file_path: "C:/x/.env" } }).tool_response).toEqual({});
    expect(stripPayload({ ...base, tool_input: { file_path: "C:/x/app.ts" } }).tool_response).toEqual({ structuredPatch: [1] });
  });
  it("truncates command output", () => {
    const out = stripPayload({ tool_name: "Bash", tool_response: { stdout: "x".repeat(2000) } });
    expect((out.tool_response as { stdout: string }).stdout.length).toBeLessThan(600);
  });
});
