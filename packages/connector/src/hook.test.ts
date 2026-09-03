import { readFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EventBatch, RecordedHook } from "@glasshouse/schema";
import type { LinkedProject } from "./config.js";
import { runHook } from "./hook.js";
import { spoolDir } from "./config.js";

const fixture = join(__dirname, "../../../fixtures/sessions/claude-code-basic.jsonl");
const recorded = readFileSync(fixture, "utf8").trim().split("\n").map((l) => RecordedHook.parse(JSON.parse(l)));

const project: LinkedProject = {
  projectId: "11111111-1111-4111-8111-111111111111",
  name: "glasshouse",
  root: "C:\\Users\\chris\\Downloads\\monitorappidea",
  server: "http://room.test",
  token: "gh_test",
  linkedAt: "2026-09-03T00:00:00.000Z",
};

function fakeServer(ok: boolean) {
  const batches: EventBatch[] = [];
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    expect(String(url)).toBe("http://room.test/api/ingest");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer gh_test");
    if (!ok) throw new Error("connection refused");
    batches.push(EventBatch.parse(JSON.parse(String(init?.body))));
    return new Response(JSON.stringify({ inserted: 1, duplicates: 0 }), { status: 200 });
  }) as typeof fetch;
  return { batches, fetchImpl };
}

let home: string;
beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), "glasshouse-test-"));
  process.env.GLASSHOUSE_HOME = home;
});
afterAll(async () => {
  delete process.env.GLASSHOUSE_HOME;
  await rm(home, { recursive: true, force: true });
});

const waiting = async () => (await readdir(spoolDir()).catch(() => [])).filter((f) => f.endsWith(".json")).length;

describe("runHook", () => {
  it("sends every meaningful event from the recorded session and leaves nothing waiting", async () => {
    const { batches, fetchImpl } = fakeServer(true);
    const outcomes = [];
    for (const r of recorded) outcomes.push(await runHook("claude-code", r.hookEvent, JSON.stringify(r.payload), { projects: [project], fetchImpl }));
    const sent = batches.flatMap((b) => b.events);
    expect(sent.map((e) => e.kind)).toEqual(["session_start", "prompt", "read", "search", "command", "edit", "test_run", "stop", "session_end"]);
    expect(outcomes.filter((o) => o.status === "ignored").length).toBe(5); // the PreToolUse hooks
    expect(await waiting()).toBe(0);
  });

  it("keeps events on disk while the Room is down, then sends them all when it is back", async () => {
    const down = fakeServer(false);
    const [start, prompt] = recorded;
    expect(await runHook("claude-code", start!.hookEvent, JSON.stringify(start!.payload), { projects: [project], fetchImpl: down.fetchImpl })).toMatchObject({ status: "spooled" });
    expect(await runHook("claude-code", prompt!.hookEvent, JSON.stringify(prompt!.payload), { projects: [project], fetchImpl: down.fetchImpl })).toMatchObject({ status: "spooled", waiting: 2 });
    expect(await waiting()).toBe(2);

    const up = fakeServer(true);
    const read = recorded[3]!; // PostToolUse Read (index 2 is the PreToolUse, which is ignored)
    expect(await runHook("claude-code", read.hookEvent, JSON.stringify(read.payload), { projects: [project], fetchImpl: up.fetchImpl })).toMatchObject({ status: "sent", sent: 3 });
    expect(up.batches[0]!.events.map((e) => e.kind)).toEqual(["session_start", "prompt", "read"]);
    expect(await waiting()).toBe(0);
  });

  it("does nothing for folders that are not linked", async () => {
    const { batches, fetchImpl } = fakeServer(true);
    const other = { ...recorded[1]!.payload as object, cwd: "C:\\somewhere\\else" };
    expect(await runHook("claude-code", "UserPromptSubmit", JSON.stringify(other), { projects: [project], fetchImpl })).toEqual({ status: "skipped", reason: "folder not linked" });
    expect(batches.length).toBe(0);
  });

  it("never throws on garbage input", async () => {
    expect(await runHook("claude-code", "Stop", "not json", { projects: [project] })).toMatchObject({ status: "skipped" });
  });
});
