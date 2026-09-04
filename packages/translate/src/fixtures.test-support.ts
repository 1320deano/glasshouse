/** Test-only helpers: replay recorded fixtures through the normalisers. Excluded from the package build. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type NormalisedEvent, RecordedHook } from "@glasshouse/schema";
import { normaliseClaudeCode } from "./normalise/claude-code.js";
import { normaliseCodex } from "./normalise/codex.js";
import { normaliseCursor } from "./normalise/cursor.js";
import { createRolloutState, normaliseCodexRollout } from "./normalise/codex-rollout.js";
import { buildHeuristicAreaMap } from "./areas.js";

export const fixturesDir = join(__dirname, "../../../fixtures");
export const STORYBOARD_ROOT = "/home/chris/apps/storyboard";
export const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

export const STORYBOARD_TREE = [
  "package.json",
  "README.md",
  "src/auth/session.ts",
  "src/auth/login.ts",
  "src/auth/session.test.ts",
  "src/dashboard/page.tsx",
  "src/dashboard/page.test.ts",
  "src/storyboard/scene-builder.ts",
  "src/storyboard/scene-builder.test.ts",
  "src/storyboard/scenes.ts",
  "src/storyboard/scenes.test.ts",
  "src/payments/stripe.ts",
  "src/payments/invoices.ts",
  "src/upload/upload.ts",
];

export const storyboardAreas = () => buildHeuristicAreaMap({ paths: STORYBOARD_TREE }, { now: () => "2026-09-04T00:00:00.000Z" }).areas;

export function readRecorded(file: string) {
  return readFileSync(join(fixturesDir, "sessions", file), "utf8")
    .trim()
    .split("\n")
    .map((l) => RecordedHook.parse(JSON.parse(l)));
}

export function idMaker(prefix = "0000") {
  let n = 0;
  return () => `${prefix}0000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

export function replayHooks(file: string, root: string, opts: { startAt?: string; stepMs?: number } = {}): NormalisedEvent[] {
  let t = Date.parse(opts.startAt ?? "2026-09-04T09:00:00.000Z");
  const step = opts.stepMs ?? 1000;
  const makeId = idMaker();
  return readRecorded(file)
    .map((r) => {
      const ctx = { projectId: PROJECT_ID, projectRoot: root, makeId, now: () => new Date((t += step)).toISOString() };
      if (r.tool === "claude-code") return normaliseClaudeCode(r.hookEvent, r.payload, ctx);
      if (r.tool === "codex") return normaliseCodex(r.hookEvent, r.payload, ctx);
      if (r.tool === "cursor") return normaliseCursor(r.hookEvent, r.payload, ctx);
      return null;
    })
    .filter((e): e is NormalisedEvent => e !== null);
}

export function replayRollout(file: string, root: string): NormalisedEvent[] {
  const state = createRolloutState();
  const makeId = idMaker("1111");
  return readFileSync(join(fixturesDir, "rollouts", file), "utf8")
    .trim()
    .split("\n")
    .map((l) => normaliseCodexRollout(JSON.parse(l), state, { projectId: PROJECT_ID, projectRoot: root, makeId }))
    .filter((e): e is NormalisedEvent => e !== null);
}
