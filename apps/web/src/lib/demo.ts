/**
 * The landing page's demo is driven by the recorded fixtures, not by hand-written copy: the
 * Claude Code session that hits its usage limit in Login, and the Codex session that picks it
 * up. Every frame is what the real Room would show at that moment, computed by the real store:
 * the agent cards, the story lines, the "this is the moment" callout, the report card. So the
 * demo can never drift from the product, and every reassuring line in it is a computed fact
 * (rule 2), the same way it would be in the Room.
 *
 * The frames are grouped into five chapters (the brief's thirty-second demo, section 15): it
 * reads first, it changes Login, it runs out, Codex carries on, the report card. The chapter is
 * decided by the recorded event, never by a hand-placed marker.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type NormalisedEvent, RecordedHook } from "@glasshouse/schema";
import { buildHeuristicAreaMap, normaliseClaudeCode, normaliseCodex } from "@glasshouse/translate";
import { firstMoment } from "./moment";
import { suggestHelpers } from "./shed/suggest";
import { MemoryStore } from "./store/memory";
import type { SessionView, StoryMessage } from "./store/types";
import { DEMO_CHAPTERS, type DemoChapterId, type DemoFrame, type DemoStoryLine, type DemoSuggestion, type DemoTile } from "./demo-chapters";

export { DEMO_CHAPTERS };
export type { DemoChapter, DemoChapterId, DemoFrame, DemoStoryLine, DemoSuggestion, DemoTile } from "./demo-chapters";

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

const clip = (s: string, n: number) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n - 1).replace(/[\s.,;:]+$/, "") + "…" : one;
};

/**
 * What the other monitor showed for this event. Written from the event's own fields (the prompt,
 * the file, the command, the test counts, the closing words), so the terminal is the recording
 * and not a caption typed beside it. The framing (the prompt marks, the tool's name) is styled.
 */
export function terminalLine(e: NormalisedEvent): string {
  const cli = e.tool === "codex" ? "codex" : e.tool === "cursor" ? "cursor" : "claude";
  const file = e.paths[0];
  switch (e.kind) {
    case "session_start":
      return `$ ${cli}\n> ready`;
    case "session_end":
      return "$ _";
    case "prompt":
      return `> ${clip(e.prompt ?? e.summary, 220)}`;
    case "read":
      return `⏺ Read(${file ?? "…"})`;
    case "search":
      return `⏺ ${e.text ? `Grep(pattern: "${e.text}"${file ? `, path: "${file}"` : ""})` : e.summary}`;
    case "edit":
      return `⏺ Update(${file ?? "…"})\n  ⎿  ${e.summary}`;
    case "test_run": {
      const t = e.tests;
      const counts = t ? `${t.failed ? `${t.failed} failed, ` : ""}${t.passed ?? 0} passed` : "finished";
      return `⏺ Bash(${clip(e.command ?? e.summary, 80)})\n  ⎿  Tests  ${counts}`;
    }
    case "command":
    case "install":
      return `⏺ Bash(${clip(e.command ?? e.summary, 80)})`;
    case "usage_limit":
      return "✗ You've hit your usage limit. Resets at 2pm.";
    case "stop":
      return `⏺ ${clip(e.text ?? e.summary, 240)}`;
    default:
      return `⏺ ${e.summary}`;
  }
}

function tileOf(s: SessionView): DemoTile | null {
  const t = s.task;
  if (!t) return null;
  const last = s.recentEvents[0];
  const r = t.report;
  const tests = r?.evidence.tests;
  const checks = tests?.ran ? (tests.failed ? `${tests.failed} of ${(tests.passed ?? 0) + tests.failed} checks failed` : `All ${tests.passed ?? 0} checks passed`) : undefined;
  return {
    tool: s.tool,
    headline: r && t.stage === "done" ? r.headline : t.headline,
    location: t.location,
    prompt: t.prompt,
    stage: t.stage,
    risk: t.risk.level,
    riskReasons: t.risk.reasons,
    ticker: last?.plain ?? "",
    continuedFrom: t.continuedFrom ? `Continuing from ${t.continuedFrom.tool === "claude-code" ? "Claude Code" : "Codex"}: ${t.continuedFrom.headline ?? ""}` : undefined,
    touched: t.areas.filter((a) => a.changed.length > 0).map((a) => a.name),
    looked: t.areas.filter((a) => a.changed.length === 0).map((a) => a.name),
    notTouched: t.changedPaths.length > 0 ? t.notTouched : [],
    card: r ? { headline: r.headline, touched: r.touched.map((a) => a.name), notTouched: r.notTouched, needsYou: r.needsYou, needsYouDetail: r.needsYouDetail, checks, risk: r.risk.level, riskReason: r.riskReason ?? r.risk.reasons.join("; ") } : undefined,
    endReason: t.endReason,
  };
}

const NEEDS: Record<string, string> = { review: "Review recommended", decision: "Decision needed", blocked: "Blocked" };

/** The same badge the Room's story puts beside a line. */
function badgeOf(m: StoryMessage): DemoStoryLine["badge"] {
  if (m.kind === "waiting") return { text: "Waiting for you", tone: "attention" };
  if (m.kind === "stuck") return { text: "Looks stuck", tone: "critical" };
  if (m.kind === "limit") return { text: "Stopped", tone: "critical" };
  if (m.kind === "finished" && m.needsYou && m.needsYou !== "nothing") return { text: NEEDS[m.needsYou] ?? m.needsYou, tone: m.needsYou === "review" ? "info" : "attention" };
  return undefined;
}

function storyLine(m: StoryMessage): DemoStoryLine {
  return { id: m.id, kind: m.kind, tool: m.tool, text: m.text, badge: badgeOf(m), touched: m.touched, notTouched: m.notTouched, checks: m.checks, risk: m.risk, needsYouDetail: m.needsYouDetail };
}

interface DemoShow {
  frames: DemoFrame[];
  suggestions: DemoSuggestion[];
}

let cached: Promise<DemoShow> | null = null;

async function build(): Promise<DemoShow> {
  const dir = fixturesDir();
  if (!dir) return { frames: [], suggestions: [] };
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
  let chapter: DemoChapterId = "reads";
  for (const e of events) {
    // The chapter turns on the recorded event: the first change, the limit, the other tool, the end.
    if (chapter === "reads" && e.kind === "edit") chapter = "login";
    if (e.kind === "usage_limit") chapter = "limit";
    if (chapter === "limit" && e.tool === "codex") chapter = "handoff";
    if (chapter === "handoff" && e.kind === "stop") chapter = "report";

    clock = new Date(Date.parse(e.ts) + 1000).toISOString();
    await store.ingest(project.id, [e]);
    const room = await store.getRoom(project.id);
    if (!room) continue;
    const tiles = room.sessions
      .slice()
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .map(tileOf)
      .filter((t): t is DemoTile => t !== null);
    if (tiles.length === 0) continue;
    const moment = firstMoment(room);
    const slow = e.kind === "usage_limit" || e.kind === "stop" || e.kind === "prompt";
    frames.push({
      terminal: terminalLine(e),
      tiles,
      story: room.story.map(storyLine),
      moment: moment ? { fact: moment.fact, why: moment.why } : undefined,
      chapter,
      holdMs: slow ? 3400 : 1700,
    });
  }

  // What the Potting Shed would propose from these two sessions alone: computed by the same code
  // the Shed runs, with the count and the tasks it rests on.
  const tasks = await store.listTasks(project.id, { since: "2026-01-01T00:00:00.000Z" });
  const areas = (await store.getAreaMap(project.id))?.areas ?? [];
  const suggestions = suggestHelpers(tasks, areas)
    .filter((s) => !s.starter)
    .map((s): DemoSuggestion => ({ id: s.id, kind: s.kind, name: s.name, summary: s.summary, evidence: s.evidence.text, tasks: s.evidence.taskIds.length }));

  return { frames, suggestions };
}

function show(): Promise<DemoShow> {
  return (cached ??= build().catch((err) => {
    cached = null;
    throw err;
  }));
}

/** The frames, computed once per server process. Empty when the fixtures are not on disk. */
export async function demoFrames(): Promise<DemoFrame[]> {
  return (await show()).frames;
}

/** The helpers the Shed would grow from the demo's own record. Empty when the fixtures are not on disk. */
export async function demoSuggestions(): Promise<DemoSuggestion[]> {
  return (await show()).suggestions;
}
