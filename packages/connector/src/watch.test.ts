import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { appendFile, copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EventBatch } from "@glasshouse/schema";
import { lineId, tailAll, type TailerState } from "./codex-tailer.js";
import type { LinkedProject } from "./config.js";
import { commitsSince, parseGitLog } from "./git.js";
import { readWatchState, shouldIgnore, startWatch } from "./watch.js";

const rolloutFixture = join(__dirname, "../../../fixtures/rollouts/codex-synthetic.jsonl");

let home: string;
let repo: string;
let codexHomeDir: string;
const project: LinkedProject = { projectId: "11111111-1111-4111-8111-111111111111", name: "storyboard", root: "", server: "http://room.test", token: "gh_test", linkedAt: "2026-09-04T00:00:00.000Z" };

function git(args: string[]) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@x.y", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@x.y" } });
}

function fakeServer() {
  const batches: EventBatch[] = [];
  const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    batches.push(EventBatch.parse(JSON.parse(String(init?.body))));
    return new Response(JSON.stringify({ inserted: 1, duplicates: 0 }), { status: 200 });
  }) as typeof fetch;
  return { batches, fetchImpl };
}

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), "glasshouse-watch-"));
  process.env.GLASSHOUSE_HOME = join(home, "gh");
  repo = join(home, "repo");
  project.root = repo;
  await mkdir(join(repo, "src", "auth"), { recursive: true });
  git(["init", "-q"]);
  await writeFile(join(repo, "src", "auth", "session.ts"), "a");
  await writeFile(join(repo, "README.md"), "b");
  git(["add", "-A"]);
  git(["commit", "-qm", "First commit\n\nBody line one.\n\nSecond paragraph."]);
  codexHomeDir = join(home, "codex");
  await mkdir(join(codexHomeDir, "sessions", "2026", "09", "04"), { recursive: true });
});
afterAll(async () => {
  delete process.env.GLASSHOUSE_HOME;
  await rm(home, { recursive: true, force: true });
});

describe("git", () => {
  it("parses multi-paragraph messages and file lists", () => {
    const out = "\x1eaaa\x1fT\x1f2026-09-04T08:46:09+00:00\x1fFirst commit\n\nBody line one.\n\nSecond paragraph.\n\n\nREADME.md\nsrc/auth/session.ts\n\x1ebbb\x1fT\x1f2026-09-04T08:47:09+00:00\x1fSecond\n\n\nsrc/auth/session.ts\n";
    expect(parseGitLog(out)).toEqual([
      { hash: "aaa", author: "T", date: "2026-09-04T08:46:09+00:00", message: "First commit\n\nBody line one.\n\nSecond paragraph.", files: ["README.md", "src/auth/session.ts"] },
      { hash: "bbb", author: "T", date: "2026-09-04T08:47:09+00:00", message: "Second", files: ["src/auth/session.ts"] },
    ]);
  });

  it("reads real commits from a repository", async () => {
    const all = await commitsSince(repo, undefined, 5);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ message: "First commit\n\nBody line one.\n\nSecond paragraph.", files: ["README.md", "src/auth/session.ts"], author: "T" });
  });
});

describe("codex tailer", () => {
  it("tails a rollout as it grows and never re-sends after a restart", async () => {
    const path = join(codexHomeDir, "sessions", "2026", "09", "04", "rollout-2026-09-04T09-12-00-x.jsonl");
    const lines = readFileSync(rolloutFixture, "utf8").trim().split("\n");
    await writeFile(path, lines.slice(0, 8).join("\n") + "\n");
    const storyboard = { ...project, root: "/home/chris/apps/storyboard" };
    const tailer: TailerState = { files: new Map() };
    const first = await tailAll(codexHomeDir, tailer, { projects: [storyboard] });
    expect(first.map((e) => e.kind)).toEqual(["session_start", "prompt", "reasoning", "command"]);
    expect(first[0]?.id).toBe(lineId(path, 1));

    await appendFile(path, lines.slice(8, 12).join("\n") + "\n");
    const second = await tailAll(codexHomeDir, tailer, { projects: [storyboard] });
    expect(second.map((e) => e.kind)).toEqual(["edit", "test_run"]);

    // partial line: nothing until the newline arrives
    await appendFile(path, lines[12]!.slice(0, 20));
    expect(await tailAll(codexHomeDir, tailer, { projects: [storyboard] })).toEqual([]);
    await appendFile(path, lines[12]!.slice(20) + "\n" + lines.slice(13).join("\n") + "\n");
    const third = await tailAll(codexHomeDir, tailer, { projects: [storyboard] });
    expect(third.map((e) => e.kind)).toEqual(["stop", "prompt", "usage_limit", "stop"]);
    expect(third[1]?.taskKey).toBe("turn-2");

    // restart with saved offsets: state is rebuilt silently, nothing re-sent, new lines still flow
    const offset = tailer.files.get(path)!.offset;
    const fresh: TailerState = { files: new Map() };
    expect(await tailAll(codexHomeDir, fresh, { projects: [storyboard], savedOffsets: { [path]: offset } })).toEqual([]);
    await appendFile(path, JSON.stringify({ timestamp: "2026-09-04T09:30:00.000Z", type: "event_msg", payload: { type: "user_message", message: "one more" } }) + "\n");
    const after = await tailAll(codexHomeDir, fresh, { projects: [storyboard], savedOffsets: { [path]: offset } });
    expect(after.map((e) => [e.kind, e.taskKey])).toEqual([["prompt", "turn-3"]]);
  });

  it("ignores rollouts for folders that are not linked", async () => {
    const path = join(codexHomeDir, "sessions", "2026", "09", "04", "rollout-2026-09-04T11-00-00-y.jsonl");
    await copyFile(rolloutFixture, path);
    const tailer: TailerState = { files: new Map() };
    expect(await tailAll(codexHomeDir, tailer, { projects: [{ ...project, root: "/somewhere/else" }] })).toEqual([]);
    expect(tailer.files.get(path)?.ignored).toBe(true);
  });
});

describe("startWatch", () => {
  it("sends new commits and Codex events through the spool, remembering where it got to", async () => {
    const { batches, fetchImpl } = fakeServer();
    const handle = await startWatch({ projects: [project], fetchImpl, folders: false, intervalMs: 60_000, codexHomeDir: join(home, "no-codex") });
    // first pass: the latest existing commit is reported once
    let sent = batches.flatMap((b) => b.events);
    expect(sent.map((e) => e.kind)).toEqual(["commit"]);
    expect(sent[0]).toMatchObject({ tool: "watcher", summary: "Committed: First commit", paths: ["README.md", "src/auth/session.ts"] });

    await writeFile(join(repo, "src", "auth", "session.ts"), "changed");
    git(["commit", "-qam", "Carry the organisation id"]);
    await handle.poll();
    sent = batches.flatMap((b) => b.events);
    expect(sent.map((e) => e.summary)).toEqual(["Committed: First commit", "Committed: Carry the organisation id"]);
    expect(await handle.poll()).toBe(0);
    await handle.stop();
    const state = await readWatchState();
    expect(state.lastCommit[project.projectId]).toBe(git(["rev-parse", "HEAD"]).trim());
  });

  it("ignores build output, dependencies and editor noise", () => {
    expect(shouldIgnore("node_modules/zod/index.js")).toBe(true);
    expect(shouldIgnore(".next/server/app.js")).toBe(true);
    expect(shouldIgnore("src/auth/session.ts~")).toBe(true);
    expect(shouldIgnore("src/auth/session.ts")).toBe(false);
  });
});
