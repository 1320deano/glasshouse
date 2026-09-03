import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RecordedHook } from "./index";

const sessionsDir = join(__dirname, "../../../fixtures/sessions");
const files = readdirSync(sessionsDir).filter((f) => f.endsWith(".jsonl"));

describe("recorded fixture sessions", () => {
  it("has at least one curated session", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file}: every line is a valid recorded hook`, () => {
      const lines = readFileSync(join(sessionsDir, file), "utf8").trim().split("\n");
      for (const line of lines) {
        const rec = RecordedHook.parse(JSON.parse(line));
        expect(rec.hookEvent).toBeTruthy();
      }
    });
  }

  it("claude-code-basic starts a session, submits a prompt, and stops", () => {
    const events = readFileSync(join(sessionsDir, "claude-code-basic.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => RecordedHook.parse(JSON.parse(l)).hookEvent);
    expect(events[0]).toBe("SessionStart");
    expect(events).toContain("UserPromptSubmit");
    expect(events).toContain("Stop");
    expect(events.at(-1)).toBe("SessionEnd");
  });
});
