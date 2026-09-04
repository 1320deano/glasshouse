import { describe, expect, it } from "vitest";
import type { NormalisedEvent } from "@glasshouse/schema";
import { describeFile } from "./files.js";
import { PROJECT_ID, STORYBOARD_ROOT, replayHooks, storyboardAreas } from "./fixtures.test-support.js";
import { locationFor, translateEvent } from "./templates.js";

const ctx = { areas: storyboardAreas() };

const base = (over: Partial<NormalisedEvent>): NormalisedEvent => ({
  id: "0b3a0d4e-1e2f-4c5d-8a9b-0c1d2e3f4a5b",
  projectId: PROJECT_ID,
  sessionId: "s",
  tool: "claude-code",
  kind: "read",
  ts: "2026-09-04T09:00:00.000Z",
  paths: [],
  summary: "x",
  sourceEvent: "PostToolUse",
  raw: {},
  ...over,
});

describe("describeFile", () => {
  it("turns file names into nouns an owner would recognise", () => {
    expect(describeFile("src/auth/session.ts", "Login")).toBe("the session part of Login");
    expect(describeFile("package.json")).toBe("the project's list of tools and settings");
    expect(describeFile("README.md")).toBe("the project's notes for people");
    expect(describeFile(".env.local")).toBe("secret settings");
    expect(describeFile("supabase/migrations/20260903_init.sql", "Database")).toBe("the database layout");
    expect(describeFile("src/auth/session.test.ts", "Login")).toBe("the automatic checks for session");
    expect(describeFile("app/globals.css", "Screens")).toBe("how Screens looks");
    expect(describeFile("src/dashboard/page.tsx", "Dashboard")).toBe("the dashboard page");
    expect(describeFile("apps/web/src/app/api/ingest/route.ts", "Behind the scenes")).toBe("how the app answers requests about ingest");
    expect(describeFile("src/components/LoginForm.tsx", "Screen parts")).toBe("the login form part of the screen in Screen parts");
    expect(describeFile("vitest.config.ts")).toBe("settings for the vitest tool");
    expect(describeFile("src/lib/utils.ts", "Shared building blocks")).toBe("the helpers part of Shared building blocks");
  });
});

describe("translateEvent", () => {
  it("speaks in areas and file nouns, and keeps the pointer to the event", () => {
    const t = translateEvent(base({ kind: "read", paths: ["src/auth/session.ts"] }), ctx);
    expect(t).toMatchObject({ plain: "Looking at the session part of Login", areaName: "Login", eventId: "0b3a0d4e-1e2f-4c5d-8a9b-0c1d2e3f4a5b" });
  });

  it("prefers a cached description when one exists", () => {
    const t = translateEvent(base({ kind: "edit", paths: ["src/auth/session.ts"], summary: "Changed src/auth/session.ts" }), { ...ctx, fileDescriptions: { "src/auth/session.ts": "how logged-in users are identified" } });
    expect(t.plain).toBe("Changing how logged-in users are identified");
  });

  it("covers every kind without a file path or a tool name leaking", () => {
    const lines = [
      base({ kind: "prompt", prompt: "Fix the login bug" }),
      base({ kind: "search", text: "organisationId", paths: ["src"] }),
      base({ kind: "edit", summary: "Created src/auth/reset.ts", paths: ["src/auth/reset.ts"] }),
      base({ kind: "command", command: "git push origin main", summary: "Ran: git push origin main" }),
      base({ kind: "command", command: "pnpm typecheck", summary: "Ran: pnpm typecheck" }),
      base({ kind: "command", command: "ls -la src", summary: "Ran: ls -la src" }),
      base({ kind: "command", command: "pnpm --version", summary: "Show pnpm version" }),
      base({ kind: "test_run", command: "pnpm test", summary: "Ran: pnpm test", tests: { passed: 8, failed: 1 } }),
      base({ kind: "test_run", command: "pnpm test", summary: "Ran: pnpm test", tests: { passed: 8, failed: 0 } }),
      base({ kind: "install", command: "pnpm add zod@3", summary: "Ran: pnpm add zod@3" }),
      base({ kind: "commit", text: "Add organisation id to session\n\nlong body", summary: "Committed" }),
      base({ kind: "web", summary: "Looked at https://docs.example.com/x" }),
      base({ kind: "plan", text: "[ ] Read session\n[ ] Change type" }),
      base({ kind: "reasoning", text: "The session lacks the org id." }),
      base({ kind: "subagent_start", summary: "Started a helper: Find every use of the session" }),
      base({ kind: "permission_wait", sourceTool: "Bash", summary: "Waiting for your permission to use Bash" }),
      base({ kind: "error", text: "ENOENT: no such file or directory, open 'x'", summary: "Read failed", paths: ["src/auth/session.ts"] }),
      base({ kind: "stop", text: "All done, tests pass.", summary: "All done, tests pass." }),
      base({ kind: "usage_limit", text: "confirmed", summary: "Stopped: usage limit reached" }),
      base({ kind: "usage_limit", tool: "cursor", text: "suspected", summary: "Stopped: possibly a usage limit" }),
      base({ kind: "idle", summary: "Waiting for your next prompt" }),
    ].map((e) => translateEvent(e, ctx).plain);
    expect(lines).toEqual([
      "You asked: “Fix the login bug”",
      "Searching the project for “organisationId”",
      "Adding the reset part of Login",
      "Sending the work up to GitHub",
      "Checking the code for mistakes",
      "Looking around the project",
      "Show pnpm version",
      "Ran the checks: 8 passed, 1 failed",
      "Ran the checks: all 8 passed",
      "Adding zod to the project's tools",
      "Saved a checkpoint: “Add organisation id to session”",
      "Read a web page on docs.example.com",
      "Wrote down the plan: “[ ] Read session”",
      "Thinking: “The session lacks the org id.”",
      "Sent a helper off to find every use of the session",
      "Waiting for you to approve a command",
      "Could not find something it was looking for while working on the session part of Login",
      "Finished: “All done, tests pass.”",
      "Stopped: usage limit reached",
      "Stopped: possibly a usage limit",
      "Finished and waiting for your next instruction",
    ]);
    for (const l of lines) expect(l).not.toMatch(/\.(ts|tsx|py)\b|src\//);
  });

  it("translates the whole recorded Claude Code session without a path in any line", () => {
    const events = replayHooks("claude-code-basic.jsonl", "C:\\Users\\chris\\Downloads\\monitorappidea");
    const areas = [{ id: "root", name: "Project setup", description: "", prefixes: ["."], userCorrected: false, source: "heuristic" as const, sensitive: true }, { id: "scratch", name: "Scratch space", description: "", prefixes: ["scratch"], userCorrected: false, source: "heuristic" as const, sensitive: false }];
    const lines = events.map((e) => translateEvent(e, { areas }).plain);
    expect(lines).toEqual([
      "Started up",
      "You asked: “You are being used to record a sample session. Do exactly these steps in order and nothing else: 1) Read package.json. 2) Use Grep to searc…”",
      "Looking at the project's list of tools and settings",
      "Searching the project for “workspace”",
      "Show pnpm version",
      "Adding the hello part of Scratch space",
      "Ran the checks: all 13 passed",
      "Finished: “done”",
      "Closed the session",
    ]);
  });

  it("builds the location line from the area and the file", () => {
    expect(locationFor("src/auth/session.ts", ctx)).toBe("Login → session");
    expect(locationFor("src/storyboard/scenes.ts", ctx)).toBe("Storyboard → scenes");
    expect(locationFor("package.json", ctx)).toBe("Project setup → package");
    expect(locationFor("elsewhere/thing.ts", ctx)).toBe("thing");
    expect(locationFor(undefined, ctx)).toBeUndefined();
  });

  it("the usage-limit synthetic session reads as the credit-switch moment", () => {
    const events = replayHooks("claude-code-usage-limit-synthetic.jsonl", STORYBOARD_ROOT);
    const lines = events.map((e) => translateEvent(e, ctx).plain);
    expect(lines.at(-1)).toBe("Stopped: usage limit reached");
    expect(lines).toContain("Changing the session part of Login");
    expect(events.at(-1)?.kind).toBe("usage_limit");
  });
});
