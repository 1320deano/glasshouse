/**
 * The landing page's live mock tile is driven by the recorded fixtures, not by hand-written copy:
 * the Claude Code session that hits its usage limit in Login, and the Codex session that picks it
 * up. Every frame is what the real Room would show at that moment, computed by the real store.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type NormalisedEvent, RecordedHook } from "@glasshouse/schema";
import { buildHeuristicAreaMap, normaliseClaudeCode, normaliseCodex } from "@glasshouse/translate";
import { MemoryStore } from "./store/memory";
import type { SessionView } from "./store/types";

export interface DemoTile {
  tool: "claude-code" | "codex" | "cursor" | "watcher";
  headline: string;
  location?: string;
  stage: string;
  risk: "low" | "medium" | "high";
  riskReasons: string[];
  ticker: string;
  continuedFrom?: string;
  card?: { headline: string; touched: string[]; notTouched: string[]; needsYou: string; needsYouDetail?: string };
  endReason?: string;
}

export interface DemoFrame {
  /** What the terminal on the other monitor is showing, for the split-screen story. */
  terminal: string;
  tiles: DemoTile[];
  /** How long to hold this frame, in ms. */
  holdMs: number;
}

const ROOT = "/home/chris/apps/storyboard";
const TREE = ["package.json", "README.md", "src/auth/session.ts", "src/auth/login.ts", "src/dashboard/page.tsx", "src/storyboard/scene-builder.ts", "src/storyboard/scenes.ts", "src/payments/stripe.ts", "src/upload/upload.ts"];

function fixturesDir(): string | null {
  for (const candidate of [join(process.cwd(), "fixtures"), join(process.cwd(), "..", "..", "fixtures"), join(process.cwd(), "..", "fixtures")]) {
    if (existsSync(join(candidate, "sessions"))) return candidate;
  }
  return null;
}

function replay(dir: string, file: string, projectId: string, startAt: string, prefix: string): NormalisedEvent[] {
  let n = 0;
  let t = Date.parse(startAt);
  return readFileSync(join(dir, "sessions", file), "utf8")
    .trim()
    .split("\n")
    .map((l) => RecordedHook.parse(JSON.parse(l)))
    .map((r) => {
      const ctx = { projectId, projectRoot: ROOT, makeId: () => `${prefix}0000-0000-4000-8000-${String(++n).padStart(12, "0")}`, now: () => new Date((t += 1000)).toISOString() };
      return r.tool === "codex" ? normaliseCodex(r.hookEvent, r.payload, ctx) : normaliseClaudeCode(r.hookEvent, r.payload, ctx);
    })
    .filter((e): e is NormalisedEvent => e !== null);
}

const TERMINAL: Record<string, string> = {
  session_start: "$ claude\n> ready",
  prompt: "> The dashboard needs to know which organisation a user is in. Change the login session so it carries the organisation id.",
  search: "⏺ Grep(pattern: \"organisationId\", path: \"src\")\n  ⎿  Found 2 files",
  read: "⏺ Read(src/dashboard/page.tsx)\n  ⎿  Read 84 lines",
  edit: "⏺ Update(src/auth/session.ts)\n  ⎿  Updated src/auth/session.ts with 1 addition and 1 removal",
  test_run: "⏺ Bash(pnpm test)\n  ⎿  Tests  6 passed (6)",
  command: "⏺ Bash(git status)\n  ⎿  modified: src/auth/session.ts",
  usage_limit: "✗ You've hit your usage limit. Resets at 2pm.",
  stop: "⏺ The session now always carries the organisation id, and the dashboard reads it directly. All 6 tests pass.",
  session_end: "$ _",
};

function tileOf(s: SessionView): DemoTile | null {
  const t = s.task;
  if (!t) return null;
  const last = s.recentEvents[0];
  return {
    tool: s.tool,
    headline: t.report && t.stage === "done" ? t.report.headline : t.headline,
    location: t.location,
    stage: t.stage,
    risk: t.risk.level,
    riskReasons: t.risk.reasons,
    ticker: last?.plain ?? "",
    continuedFrom: t.continuedFrom ? `Continuing from ${t.continuedFrom.tool === "claude-code" ? "Claude Code" : "Codex"}: ${t.continuedFrom.headline ?? ""}` : undefined,
    card: t.report ? { headline: t.report.headline, touched: t.report.touched.map((a) => a.name), notTouched: t.report.notTouched, needsYou: t.report.needsYou, needsYouDetail: t.report.needsYouDetail } : undefined,
    endReason: t.endReason,
  };
}

let cached: DemoFrame[] | null = null;

/** The frames, computed once per server process. Empty when the fixtures are not on disk. */
export async function demoFrames(): Promise<DemoFrame[]> {
  if (cached) return cached;
  const dir = fixturesDir();
  if (!dir) return (cached = []);
  // The clock follows the replay, so the stuck rule ("nothing for five minutes") never fires on a recording.
  let clock = "2026-09-04T09:00:00.000Z";
  const store = new MemoryStore({ now: () => clock });
  const { project } = await store.createProject({ name: "storyboard" });
  await store.saveAreaMap(project.id, buildHeuristicAreaMap({ paths: TREE }));
  await store.saveFileDescriptions(project.id, { "src/auth/session.ts": "how logged-in users are identified", "src/dashboard/page.tsx": "the dashboard page" });
  const events = [
    ...replay(dir, "claude-code-usage-limit-synthetic.jsonl", project.id, "2026-09-04T09:00:00.000Z", "aaaa"),
    ...replay(dir, "codex-hooks-synthetic.jsonl", project.id, "2026-09-04T09:05:00.000Z", "bbbb"),
  ];
  const frames: DemoFrame[] = [];
  for (const e of events) {
    clock = new Date(Date.parse(e.ts) + 1000).toISOString();
    await store.ingest(project.id, [e]);
    const room = await store.getRoom(project.id);
    const tiles = room!.sessions
      .slice()
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .map(tileOf)
      .filter((t): t is DemoTile => t !== null);
    if (tiles.length === 0) continue;
    const slow = e.kind === "usage_limit" || e.kind === "stop" || e.kind === "prompt";
    frames.push({ terminal: TERMINAL[e.kind] ?? `⏺ ${e.summary}`, tiles, holdMs: slow ? 3200 : 1500 });
  }
  return (cached = frames);
}
