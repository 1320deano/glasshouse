import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NormalisedEvent, RecordedHook } from "@glasshouse/schema";
import { normaliseClaudeCode } from "@glasshouse/translate";
import { MemoryStore } from "./memory";

const fixture = join(__dirname, "../../../../../fixtures/sessions/claude-code-basic.jsonl");

function replay(projectId: string): NormalisedEvent[] {
  let n = 0;
  let t = Date.parse("2026-09-01T10:00:00.000Z"); // safely in the past so latency (received - hook time) is positive
  return readFileSync(fixture, "utf8")
    .trim()
    .split("\n")
    .map((l) => RecordedHook.parse(JSON.parse(l)))
    .map((r) =>
      normaliseClaudeCode(r.hookEvent, r.payload, {
        projectId,
        projectRoot: "C:\\Users\\chris\\Downloads\\monitorappidea",
        makeId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
        now: () => new Date((t += 1000)).toISOString(),
      }),
    )
    .filter((e): e is NormalisedEvent => e !== null);
}

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "glasshouse-store-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("MemoryStore", () => {
  it("turns a recorded session into one session, one task and a room state", async () => {
    const store = new MemoryStore();
    const { project, token } = await store.createProject({ name: "demo", rootHint: "C:/demo" });
    expect(token.startsWith("gh_")).toBe(true);
    expect(await store.resolveToken(token)).toEqual(project);
    expect(await store.resolveToken("gh_wrong")).toBeNull();

    const events = replay(project.id);
    expect(await store.ingest(project.id, events)).toEqual({ inserted: 9, duplicates: 0 });
    expect(await store.ingest(project.id, events)).toEqual({ inserted: 0, duplicates: 9 });

    const room = await store.getRoom(project.id);
    expect(room?.sessions).toHaveLength(1);
    const session = room!.sessions[0]!;
    expect(session.tool).toBe("claude-code");
    expect(session.endedAt).toBeDefined();
    expect(session.recentEvents[0]!.kind).toBe("session_end");

    const task = session.task!;
    expect(task.prompt).toContain("record a sample session");
    expect(task.headline).toBe("done");
    expect(task.location).toBe("scratch/hello.txt");
    expect(task.stage).toBe("done");
    expect(task.endReason).toBe("session_end");
    expect(task.eventCount).toBe(8);

    const stats = await store.getStats(project.id);
    expect(stats).toMatchObject({ sessions: 1, tasks: 1, events: 9 });
    expect(stats.avgLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it("walks through the stages as the session progresses", async () => {
    const store = new MemoryStore();
    const { project } = await store.createProject({ name: "demo" });
    const events = replay(project.id);
    const stagesSeen: string[] = [];
    for (const e of events) {
      await store.ingest(project.id, [e]);
      const room = await store.getRoom(project.id);
      stagesSeen.push(room!.sessions[0]!.task?.stage ?? "-");
    }
    expect(stagesSeen).toEqual(["-", "investigating", "investigating", "investigating", "investigating", "building", "testing", "done", "done"]);
  });

  it("persists to disk and loads back", async () => {
    const path = join(dir, "store.json");
    const a = new MemoryStore({ persistPath: path });
    const { project, token } = await a.createProject({ name: "persisted" });
    await a.ingest(project.id, replay(project.id));
    await new Promise((r) => setTimeout(r, 500));

    const b = new MemoryStore({ persistPath: path });
    expect(await b.resolveToken(token)).toEqual(project);
    expect((await b.getRoom(project.id))!.sessions[0]!.task?.headline).toBe("done");
    expect(await b.ingest(project.id, replay(project.id))).toEqual({ inserted: 0, duplicates: 9 });
  });
});
