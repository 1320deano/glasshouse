import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type NormalisedEvent, RecordedHook } from "@glasshouse/schema";
import { buildHeuristicAreaMap, createRolloutState, normaliseClaudeCode, normaliseCodex, normaliseCodexRollout, normaliseCursor, watcherCommitEvent, watcherEditEvent } from "@glasshouse/translate";
import { MemoryStore } from "./memory";

const fixtures = join(__dirname, "../../../../../fixtures");
const STORYBOARD = "/home/chris/apps/storyboard";
const STORYBOARD_TREE = ["package.json", "README.md", "src/auth/session.ts", "src/auth/login.ts", "src/dashboard/page.tsx", "src/storyboard/scene-builder.ts", "src/storyboard/scenes.ts", "src/payments/stripe.ts", "src/upload/upload.ts"];

function replay(file: string, projectId: string, root: string, startAt: string, prefix = "0000"): NormalisedEvent[] {
  let n = 0;
  let t = Date.parse(startAt);
  return readFileSync(join(fixtures, "sessions", file), "utf8")
    .trim()
    .split("\n")
    .map((l) => RecordedHook.parse(JSON.parse(l)))
    .map((r) => {
      const ctx = { projectId, projectRoot: root, makeId: () => `${prefix}0000-0000-4000-8000-${String(++n).padStart(12, "0")}`, now: () => new Date((t += 1000)).toISOString() };
      if (r.tool === "codex") return normaliseCodex(r.hookEvent, r.payload, ctx);
      if (r.tool === "cursor") return normaliseCursor(r.hookEvent, r.payload, ctx);
      return normaliseClaudeCode(r.hookEvent, r.payload, ctx);
    })
    .filter((e): e is NormalisedEvent => e !== null);
}

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "glasshouse-store-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("MemoryStore with the real recorded session", () => {
  it("turns it into one session, one task and a room state", async () => {
    const store = new MemoryStore();
    const { project, token } = await store.createProject({ name: "demo", rootHint: "C:/demo" });
    expect(token.startsWith("gh_")).toBe(true);
    expect(await store.resolveToken(token)).toEqual(project);
    expect(await store.resolveToken("gh_wrong")).toBeNull();

    const events = replay("claude-code-basic.jsonl", project.id, "C:\\Users\\chris\\Downloads\\monitorappidea", "2026-09-01T10:00:00.000Z");
    const first = await store.ingest(project.id, events);
    expect(first).toMatchObject({ inserted: 9, duplicates: 0 });
    expect(first.headlineRequests).toEqual([{ taskId: expect.any(String), trigger: "finished" }]);
    expect(first.undescribedPaths).toEqual(["package.json", "scratch/hello.txt"]);
    expect(await store.ingest(project.id, events)).toMatchObject({ inserted: 0, duplicates: 9 });

    const room = await store.getRoom(project.id);
    expect(room?.sessions).toHaveLength(1);
    const session = room!.sessions[0]!;
    expect(session.tool).toBe("claude-code");
    expect(session.depth).toBe("full");
    expect(session.endedAt).toBeDefined();
    expect(session.recentEvents[0]!.kind).toBe("session_end");
    expect(session.recentEvents.map((e) => e.plain)).toContain("Ran the checks: all 13 passed");

    const task = session.task!;
    expect(task.prompt).toContain("record a sample session");
    expect(task.headline).toBe("Done");
    expect(task.stage).toBe("done");
    expect(task.endReason).toBe("session_end");
    expect(task.eventCount).toBe(8);
    expect(task.changedPaths).toEqual(["scratch/hello.txt"]);
    expect(task.risk).toEqual({ level: "low", reasons: ["1 file changed, outside any known part of the app"] });
    expect(task.lastTests).toEqual({ passed: 13, failed: 0 });

    const stats = await store.getStats(project.id);
    expect(stats).toMatchObject({ sessions: 1, tasks: 1, events: 9, aiCalls: 0, aiCostGbp: 0 });
    expect(stats.avgLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it("walks through the stages as the session progresses", async () => {
    const store = new MemoryStore({ now: () => "2026-09-01T10:00:10.000Z" });
    const { project } = await store.createProject({ name: "demo" });
    const events = replay("claude-code-basic.jsonl", project.id, "C:\\Users\\chris\\Downloads\\monitorappidea", "2026-09-01T10:00:00.000Z");
    const stagesSeen: string[] = [];
    const headlines: string[] = [];
    for (const e of events) {
      await store.ingest(project.id, [e]);
      const room = await store.getRoom(project.id);
      stagesSeen.push(room!.sessions[0]!.task?.stage ?? "-");
      headlines.push(room!.sessions[0]!.task?.headline ?? "-");
    }
    expect(stagesSeen).toEqual(["-", "investigating", "investigating", "investigating", "investigating", "building", "testing", "done", "done"]);
    expect(headlines).toEqual([
      "-",
      "Looking into your request",
      "Looking into your request",
      "Looking into your request",
      "Looking into your request",
      "Changing the hello part of the app",
      "Checking the work: all 13 checks passed",
      "Done",
      "Done",
    ]);
  });

  it("persists to disk and loads back", async () => {
    const path = join(dir, "store.json");
    const a = new MemoryStore({ persistPath: path });
    const { project, token } = await a.createProject({ name: "persisted" });
    await a.saveAreaMap(project.id, buildHeuristicAreaMap({ paths: ["scratch/hello.txt", "package.json"] }));
    await a.ingest(project.id, replay("claude-code-basic.jsonl", project.id, "C:\\Users\\chris\\Downloads\\monitorappidea", "2026-09-01T10:00:00.000Z"));
    await new Promise((r) => setTimeout(r, 500));

    const b = new MemoryStore({ persistPath: path });
    expect(await b.resolveToken(token)).toEqual(project);
    expect((await b.getRoom(project.id))!.sessions[0]!.task?.headline).toBe("Done");
    expect((await b.getAreaMap(project.id))?.areas.map((a) => a.name)).toEqual(["Scratch", "Project setup"]);
    expect(await b.ingest(project.id, replay("claude-code-basic.jsonl", project.id, "C:\\Users\\chris\\Downloads\\monitorappidea", "2026-09-01T10:00:00.000Z"))).toMatchObject({ inserted: 0, duplicates: 9 });
  });
});

describe("the credit-switch story (Phase 2 exit test)", () => {
  async function setup() {
    const store = new MemoryStore({ now: () => "2026-09-04T10:02:00.000Z" });
    const { project } = await store.createProject({ name: "storyboard" });
    await store.saveAreaMap(project.id, buildHeuristicAreaMap({ paths: STORYBOARD_TREE }));
    return { store, project };
  }

  it("Claude Code hits its limit in Login; Codex picks the task up and the Room says so", async () => {
    const { store, project } = await setup();
    const claude = replay("claude-code-usage-limit-synthetic.jsonl", project.id, STORYBOARD, "2026-09-04T08:58:00.000Z", "aaaa");
    await store.ingest(project.id, claude);
    let room = await store.getRoom(project.id);
    const claudeTask = room!.sessions[0]!.task!;
    expect(claudeTask.stage).toBe("done");
    expect(claudeTask.endReason).toBe("usage_limit");
    expect(claudeTask.usageLimitConfirmed).toBe(true);
    expect(claudeTask.headline).toBe("Stopped: usage limit reached");
    expect(claudeTask.location).toBe("Login → session");
    expect(claudeTask.risk).toEqual({ level: "high", reasons: ["Changes Login"] });
    expect(claudeTask.areas.map((a) => [a.name, a.changed.length, a.looked.length])).toEqual([["Login", 1, 0], ["Dashboard", 0, 1]]);
    // Dashboard was only looked at, so it is verifiably unchanged too.
    expect(claudeTask.notTouched).toEqual(["Storyboard", "Dashboard", "Payments", "Uploads and files", "Project setup"]);

    const codex = replay("codex-hooks-synthetic.jsonl", project.id, STORYBOARD, "2026-09-04T09:12:00.000Z", "bbbb");
    await store.ingest(project.id, codex);
    room = await store.getRoom(project.id);
    expect(room!.sessions.map((s) => s.tool)).toEqual(["codex", "claude-code"]);
    const codexSession = room!.sessions[0]!;
    expect(codexSession.depth).toBe("standard");
    const codexTask = codexSession.task!;
    expect(codexTask.continuedFrom).toMatchObject({ taskId: claudeTask.id, tool: "claude-code", headline: "Stopped: usage limit reached" });
    expect(codexTask.continuedFrom?.reason).toBe("Claude Code hit its usage limit; same part of the app as the Claude Code task; the instructions match");
    expect(room!.sessions[1]!.task?.continuedBy).toEqual({ taskId: codexTask.id, tool: "codex" });
    expect(codexTask.stage).toBe("done");
    expect(codexTask.headline).toBe("The session now always carries the organisation id, and the dashboard reads it directly…");
    expect(codexTask.changedPaths).toEqual(["src/auth/session.ts", "src/dashboard/page.tsx"]);
    expect(codexTask.lastTests).toEqual({ passed: 6, failed: 0 });
    expect(codexSession.recentEvents.map((e) => e.plain)).toEqual([
      "Closed the session",
      "Finished: “The session now always carries the organisation id, and the dashboard reads it directly. All 6 tests pass.”",
      "Ran the checks: all 6 passed",
      "Changing the session part of Login",
      "Looking at the session part of Login",
      "Checking what has changed",
      "You asked: “Continue the login session change: the session needs to carry the organisation id so the dashboard knows which organisation a user is in. C…”",
      "Started up",
    ]);
  });

  it("a Cursor task on a different part of the app is not linked, and the rollout tailer feeds the same Codex session", async () => {
    const { store, project } = await setup();
    await store.ingest(project.id, replay("claude-code-usage-limit-synthetic.jsonl", project.id, STORYBOARD, "2026-09-04T08:58:00.000Z", "aaaa"));
    await store.ingest(project.id, replay("cursor-synthetic.jsonl", project.id, STORYBOARD, "2026-09-04T10:00:00.000Z", "cccc"));
    let room = await store.getRoom(project.id);
    const cursor = room!.sessions.find((s) => s.tool === "cursor")!;
    expect(cursor.task?.continuedFrom).toBeUndefined();
    expect(cursor.task?.risk).toEqual({ level: "low", reasons: ["Only Storyboard changed"] });
    expect(cursor.task?.plan).toBeUndefined();
    expect(cursor.recentEvents.find((e) => e.kind === "reasoning")?.plain).toBe("Thinking: “The scene builder assumes every scene has a location. I should add a default in the scene format an…”");

    const state = createRolloutState();
    let n = 0;
    const rollout = readFileSync(join(fixtures, "rollouts", "codex-synthetic.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => normaliseCodexRollout(JSON.parse(l), state, { projectId: project.id, projectRoot: STORYBOARD, makeId: () => `dddd0000-0000-4000-8000-${String(++n).padStart(12, "0")}` }))
      .filter((e): e is NormalisedEvent => e !== null);
    await store.ingest(project.id, rollout);
    room = await store.getRoom(project.id);
    const codex = room!.sessions.find((s) => s.tool === "codex")!;
    expect(room!.sessions.filter((s) => s.tool === "codex")).toHaveLength(1);
    expect(codex.task?.externalKey).toBe("turn-2");
    expect(codex.task?.endReason).toBe("usage_limit");
    expect(codex.task?.usageLimitConfirmed).toBe(true);
    expect(codex.task?.headline).toBe("Stopped: usage limit reached");
    const detail = await store.getTask(codex.task!.id);
    expect(detail?.events.map((e) => e.plain)).toEqual([
      "Interrupted",
      "Stopped: usage limit reached",
      "You asked: “Now add a test that a session without an organisation is rejected at login.”",
    ]);
  });

  it("the watcher reports saves and commits, but not the ones an agent just made", async () => {
    const { store, project } = await setup();
    const mk = (i: number) => `eeee0000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    await store.ingest(project.id, replay("claude-code-usage-limit-synthetic.jsonl", project.id, STORYBOARD, "2026-09-04T08:58:00.000Z", "aaaa"));
    const agentEditAt = "2026-09-04T08:58:06.000Z"; // the Edit event in the replay
    const dup = watcherEditEvent({ projectId: project.id, path: "src/auth/session.ts", change: "changed", ts: new Date(Date.parse(agentEditAt) + 800).toISOString(), makeId: () => mk(1) });
    const own = watcherEditEvent({ projectId: project.id, path: "src/upload/upload.ts", change: "changed", ts: "2026-09-04T09:30:00.000Z", makeId: () => mk(2) });
    const commit = watcherCommitEvent({ projectId: project.id, hash: "abc1234", message: "Handle large uploads", paths: ["src/upload/upload.ts"], ts: "2026-09-04T09:31:00.000Z", makeId: () => mk(3) });
    expect(await store.ingest(project.id, [dup, own, commit])).toMatchObject({ inserted: 2, duplicates: 1 });
    const room = await store.getRoom(project.id);
    const watcher = room!.sessions.find((s) => s.tool === "watcher")!;
    expect(watcher.depth).toBe("basic");
    expect(watcher.task?.stage).toBe("building");
    expect(watcher.task?.location).toBe("Uploads and files → upload");
    expect(watcher.recentEvents.map((e) => e.plain)).toEqual(["Saved a checkpoint: “Handle large uploads”", "Changing the upload part of Uploads and files"]);
    expect(watcher.task?.continuedFrom).toBeUndefined();
  });

  it("stuck is detected at read time, not stored", async () => {
    const store = new MemoryStore({ now: () => "2026-09-04T09:00:00.000Z" });
    const { project } = await store.createProject({ name: "storyboard" });
    const events = replay("claude-code-usage-limit-synthetic.jsonl", project.id, STORYBOARD, "2026-09-04T08:50:00.000Z").slice(0, 6); // stop before the limit
    await store.ingest(project.id, events);
    const room = await store.getRoom(project.id);
    expect(room!.sessions[0]!.task).toMatchObject({ storedStage: "building", stage: "stuck", stuckReason: "Nothing has happened for 9 minutes" });
  });

  it("task detail carries the change lines, the why and technical detail for every line", async () => {
    const { store, project } = await setup();
    await store.saveFileDescriptions(project.id, { "src/auth/session.ts": "how logged-in users are identified" });
    await store.ingest(project.id, replay("codex-hooks-synthetic.jsonl", project.id, STORYBOARD, "2026-09-04T09:12:00.000Z", "bbbb"));
    const room = await store.getRoom(project.id);
    const detail = (await store.getTask(room!.sessions[0]!.task!.id))!;
    expect(detail.prompt).toContain("Continue the login session change");
    expect(detail.changes).toEqual([
      { path: "src/auth/session.ts", plain: "Changed how logged-in users are identified", areaName: "Login", times: 1, kind: "changed" },
      { path: "src/dashboard/page.tsx", plain: "Changed the dashboard page", areaName: "Dashboard", times: 1, kind: "changed" },
    ]);
    expect(detail.events.every((e) => e.raw !== undefined && e.summary && e.plain)).toBe(true);
    expect(detail.events.find((e) => e.kind === "edit")?.plain).toBe("Changing how logged-in users are identified");
    await store.setHeadline(detail.id, "Making the dashboard know which organisation you are in", "ai");
    expect((await store.getTask(detail.id))?.headlineSource).toBe("ai");
  });
});
