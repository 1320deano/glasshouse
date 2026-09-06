/**
 * Seeds a running local Room with realistic data, so every screen can be looked at (and
 * screenshotted) without an agent actually running. Design QA only; never used in production.
 *
 *   pnpm dev                      # in one terminal, with GLASSHOUSE_LOCAL_STORE set
 *   pnpm tsx scripts/seed-demo.ts # in another
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { RecordedHook, type NormalisedEvent } from "@glasshouse/schema";
import { normaliseClaudeCode, normaliseCodex, normaliseCursor } from "@glasshouse/translate";

const BASE = process.env.SEED_BASE ?? "http://127.0.0.1:3000";
const ROOT = "/home/chris/apps/storyboard";
const FIXTURES = join(process.cwd(), "fixtures");

const TREE = [
  "package.json",
  "README.md",
  "src/auth/session.ts",
  "src/auth/login.ts",
  "src/auth/tokens.ts",
  "src/dashboard/page.tsx",
  "src/dashboard/widgets.tsx",
  "src/storyboard/scene-builder.ts",
  "src/storyboard/scenes.ts",
  "src/payments/stripe.ts",
  "src/payments/invoices.ts",
  "src/upload/upload.ts",
  "src/settings/profile.tsx",
  ".env.example",
];

async function post(path: string, body: unknown, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text}`);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

/** Replay a recorded hook file into normalised events, with the clock moved to `startAt`. */
function replay(file: string, projectId: string, startAt: number, stepMs: number, sessionSuffix: string): NormalisedEvent[] {
  let t = startAt;
  return readFileSync(join(FIXTURES, "sessions", file), "utf8")
    .trim()
    .split("\n")
    .map((l) => RecordedHook.parse(JSON.parse(l)))
    .map((r) => {
      const now = () => new Date((t += stepMs)).toISOString();
      const ctx = { projectId, projectRoot: ROOT, makeId: () => randomUUID(), now };
      const e = r.tool === "codex" ? normaliseCodex(r.hookEvent, r.payload, ctx) : r.tool === "cursor" ? normaliseCursor(r.hookEvent, r.payload, ctx) : normaliseClaudeCode(r.hookEvent, r.payload, ctx);
      return e ? { ...e, sessionId: `${e.sessionId}-${sessionSuffix}`, ts: new Date(t).toISOString() } : null;
    })
    .filter((e): e is NormalisedEvent => e !== null);
}


type Ev = Omit<NormalisedEvent, "id" | "projectId" | "sessionId" | "raw"> & { raw?: unknown };

/** Hand-built sessions, for the states the recordings do not reach: waiting, stuck, a decision. */
function handBuilt(projectId: string, sessionId: string, tool: NormalisedEvent["tool"], taskKey: string, startAt: number, stepMs: number, evs: Ev[]): NormalisedEvent[] {
  let t = startAt;
  return evs.map((e) => ({
    id: randomUUID(),
    projectId,
    sessionId,
    taskKey,
    tool,
    paths: [],
    raw: { synthetic: true, sourceEvent: e.sourceEvent },
    ...e,
    ts: new Date((t += stepMs)).toISOString(),
  })) as NormalisedEvent[];
}

const src = (kind: string, sourceTool?: string) => ({ sourceEvent: kind, sourceTool });

function waitingSession(projectId: string, now: number): NormalisedEvent[] {
  return handBuilt(projectId, "seed-waiting", "claude-code", "seed-waiting-task", now - 6 * 60_000, 20_000, [
    { kind: "session_start", summary: "Session started", ...src("SessionStart") },
    { kind: "prompt", summary: "Prompt submitted", prompt: "Add two-factor sign-in for anyone on the team plan.", ...src("UserPromptSubmit") },
    { kind: "read", summary: "Read src/auth/login.ts", paths: ["src/auth/login.ts"], ...src("PostToolUse", "Read") },
    { kind: "search", summary: "Grep for twoFactor", paths: ["src/auth"], ...src("PostToolUse", "Grep") },
    { kind: "edit", summary: "Edit src/auth/tokens.ts", paths: ["src/auth/tokens.ts"], ...src("PostToolUse", "Edit") },
    { kind: "permission_wait", summary: "Waiting for permission to run: npm install otplib", command: "npm install otplib", ...src("PermissionRequest", "Bash") },
  ]);
}

function stuckSession(projectId: string, now: number): NormalisedEvent[] {
  const err = "TypeError: cannot read properties of undefined (reading 'organisationId')";
  return handBuilt(projectId, "seed-stuck", "cursor", "seed-stuck-task", now - 14 * 60_000, 45_000, [
    { kind: "session_start", summary: "Session started", ...src("SessionStart") },
    { kind: "prompt", summary: "Prompt submitted", prompt: "The dashboard crashes when a brand new account signs in for the first time.", ...src("UserPromptSubmit") },
    { kind: "read", summary: "Read src/dashboard/page.tsx", paths: ["src/dashboard/page.tsx"], ...src("PostToolUse", "Read") },
    { kind: "edit", summary: "Edit src/dashboard/page.tsx", paths: ["src/dashboard/page.tsx"], ...src("PostToolUse", "Edit") },
    { kind: "test_run", summary: "npm test", command: "npm test", tests: { passed: 11, failed: 2 }, success: false, ...src("PostToolUse", "Bash") },
    { kind: "error", summary: err, text: err, success: false, ...src("PostToolUseFailure", "Bash") },
    { kind: "edit", summary: "Edit src/dashboard/widgets.tsx", paths: ["src/dashboard/widgets.tsx"], ...src("PostToolUse", "Edit") },
    { kind: "error", summary: err, text: err, success: false, ...src("PostToolUseFailure", "Bash") },
    { kind: "edit", summary: "Edit src/dashboard/page.tsx", paths: ["src/dashboard/page.tsx"], ...src("PostToolUse", "Edit") },
    { kind: "error", summary: err, text: err, success: false, ...src("PostToolUseFailure", "Bash") },
  ]);
}

function decisionSession(projectId: string, now: number): NormalisedEvent[] {
  return handBuilt(projectId, "seed-decision", "codex", "seed-decision-task", now - 70 * 60_000, 30_000, [
    { kind: "session_start", summary: "Session started", ...src("SessionStart") },
    { kind: "prompt", summary: "Prompt submitted", prompt: "Stop charging people twice when they click pay more than once.", ...src("UserPromptSubmit") },
    { kind: "read", summary: "Read src/payments/stripe.ts", paths: ["src/payments/stripe.ts"], ...src("PostToolUse", "Read") },
    { kind: "edit", summary: "Edit src/payments/stripe.ts", paths: ["src/payments/stripe.ts"], ...src("PostToolUse", "Edit") },
    { kind: "edit", summary: "Edit src/payments/invoices.ts", paths: ["src/payments/invoices.ts"], ...src("PostToolUse", "Edit") },
    { kind: "edit", summary: "Edit .env.example", paths: [".env.example"], ...src("PostToolUse", "Edit") },
    { kind: "test_run", summary: "npm test", command: "npm test", tests: { passed: 24, failed: 0 }, ...src("PostToolUse", "Bash") },
    { kind: "commit", summary: "Commit: guard the pay button against double clicks", text: "guard the pay button against double clicks", ...src("PostToolUse", "Bash") },
    {
      kind: "stop",
      summary: "Turn finished",
      text: "Payments now ignore a second click within ten seconds. Should refunds use the same ten-second window, or would you rather I left refunds alone?",
      ...src("Stop"),
    },
    { kind: "session_end", summary: "Session ended", ...src("SessionEnd") },
  ]);
}

async function seedProject(name: string, plan: { tree: boolean }) {
  const created = (await post("/api/projects/link", { name, rootHint: `${ROOT}/${name}` })) as { projectId: string; token: string };
  if (plan.tree) await post("/api/projects/tree", { root: ROOT, paths: TREE, scannedAt: new Date().toISOString() }, created.token);
  return created;
}

async function send(token: string, events: NormalisedEvent[]) {
  for (let i = 0; i < events.length; i += 200) {
    await post("/api/ingest", { connectorVersion: "seed", events: events.slice(i, i + 200) }, token);
  }
}

async function main() {
  const now = Date.now();

  // 1. The busy project: a Claude Code session that hit its usage limit, and the Codex session
  //    that picked the task up. Both recent, so both tiles are live.
  const busy = await seedProject("storyboard", { tree: true });
  const a = replay("claude-code-usage-limit-synthetic.jsonl", busy.projectId, now - 22 * 60_000, 4_000, "a");
  const b = replay("codex-hooks-synthetic.jsonl", busy.projectId, now - 9 * 60_000, 4_000, "b");
  const c = replay("claude-code-basic.jsonl", busy.projectId, now - 3 * 60_000, 2_500, "c");
  await send(busy.token, [...a, ...b, ...c]);
  await send(busy.token, [...decisionSession(busy.projectId, now), ...stuckSession(busy.projectId, now), ...waitingSession(busy.projectId, now)]);

  // Earlier in the week, so the activity heatmap, the tool mix and the per-part progress have a
  // week to show and the "Show earlier" link has something behind it.
  const day = 24 * 60 * 60_000;
  const earlier = [
    replay("claude-code-basic.jsonl", busy.projectId, now - 1 * day - 3 * 60 * 60_000, 3_000, "d1"),
    replay("codex-hooks-synthetic.jsonl", busy.projectId, now - 2 * day - 5 * 60 * 60_000, 5_000, "d2"),
    replay("cursor-synthetic.jsonl", busy.projectId, now - 3 * day - 2 * 60 * 60_000, 4_000, "d3"),
    replay("claude-code-basic.jsonl", busy.projectId, now - 4 * day + 4 * 60 * 60_000, 2_000, "d4"),
    replay("claude-code-usage-limit-synthetic.jsonl", busy.projectId, now - 6 * day - 1 * 60 * 60_000, 6_000, "d6"),
  ];
  for (const events of earlier) await send(busy.token, events);

  // 2. A second project with nothing running, for the project list and the empty Room.
  await seedProject("marketing-site", { tree: true });

  console.log(JSON.stringify({ busy: busy.projectId }, null, 2));
}

void main();
