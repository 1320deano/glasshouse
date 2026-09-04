import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/store/memory";
import { GET as getAreas, PATCH as patchAreas } from "./areas/[projectId]/route";
import { POST as postTree } from "./projects/tree/route";
import { GET as getTask } from "./task/[taskId]/route";
import { POST as ingest } from "./ingest/route";

const TREE = { paths: ["package.json", "src/auth/session.ts", "src/auth/login.ts", "src/payments/stripe.ts", "src/storyboard/scenes.ts"], scannedAt: "2026-09-04T09:00:00.000Z" };
const json = (body: unknown, token?: string) => new Request("http://x/", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const patch = (body: unknown) => new Request("http://x/", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

let store: MemoryStore;
let projectId: string;
let token: string;
beforeEach(async () => {
  store = new MemoryStore();
  globalThis.__glasshouseStore = store;
  const created = await store.createProject({ name: "storyboard" });
  projectId = created.project.id;
  token = created.token;
});
afterEach(() => {
  globalThis.__glasshouseStore = undefined;
});

describe("POST /api/projects/tree", () => {
  it("needs a project token and builds a heuristic map straight away", async () => {
    expect((await postTree(json(TREE))).status).toBe(401);
    const res = await postTree(json(TREE, token));
    expect(await res.json()).toEqual({ areas: 4, refreshed: true, source: "heuristic", aiPending: false, files: 5 });
    const map = await store.getAreaMap(projectId);
    expect(map?.areas.map((a) => a.name)).toEqual(["Login", "Payments", "Storyboard", "Project setup"]);
    // the same tree again changes nothing
    expect((await (await postTree(json(TREE, token))).json()).refreshed).toBe(false);
    // a materially different tree refreshes, keeping ids for areas that still exist
    const bigger = { ...TREE, paths: [...TREE.paths, "src/search/index.ts", "src/search/rank.ts"] };
    expect((await (await postTree(json(bigger, token))).json()).refreshed).toBe(true);
    expect((await store.getAreaMap(projectId))?.areas.map((a) => a.name)).toContain("Search");
  });
});

describe("GET/PATCH /api/areas/[projectId]", () => {
  it("renames and merges, and corrections survive a refresh", async () => {
    await postTree(json(TREE, token));
    const before = (await (await getAreas(new Request("http://x/"), params({ projectId }))).json()) as { map: { areas: Array<{ id: string; name: string }> } };
    const login = before.map.areas.find((a) => a.name === "Login")!;
    const payments = before.map.areas.find((a) => a.name === "Payments")!;

    const renamed = (await (await patchAreas(patch({ action: "rename", id: login.id, name: "Signing in", description: "Where people log in" }), params({ projectId }))).json()) as { map: { areas: Array<{ id: string; name: string; userCorrected: boolean }> } };
    expect(renamed.map.areas.find((a) => a.id === login.id)).toMatchObject({ name: "Signing in", userCorrected: true });

    const merged = (await (await patchAreas(patch({ action: "merge", from: payments.id, into: login.id }), params({ projectId }))).json()) as { map: { areas: Array<{ id: string; name: string; prefixes: string[] }> } };
    expect(merged.map.areas.find((a) => a.id === payments.id)).toBeUndefined();
    expect(merged.map.areas.find((a) => a.id === login.id)?.prefixes.sort()).toEqual(["src/auth", "src/payments"]);

    const refreshed = (await (await patchAreas(patch({ action: "refresh" }), params({ projectId }))).json()) as { map: { areas: Array<{ id: string; name: string; prefixes: string[] }> }; source: string };
    expect(refreshed.source).toBe("heuristic");
    expect(refreshed.map.areas.find((a) => a.id === login.id)?.name).toBe("Signing in");
    expect(refreshed.map.areas.find((a) => a.name === "Payments")).toBeUndefined();

    expect((await patchAreas(patch({ action: "explode" }), params({ projectId }))).status).toBe(400);
  });
});

describe("GET /api/task/[taskId]", () => {
  it("returns the expanded view for a task after ingest, translated with the map", async () => {
    await postTree(json(TREE, token));
    const events = [
      { id: "0b3a0d4e-1e2f-4c5d-8a9b-0c1d2e3f4a51", projectId, sessionId: "s1", taskKey: "p1", tool: "claude-code", kind: "prompt", ts: "2026-09-04T09:00:00.000Z", paths: [], prompt: "fix the login bug", summary: "fix the login bug", sourceEvent: "UserPromptSubmit", raw: {} },
      { id: "0b3a0d4e-1e2f-4c5d-8a9b-0c1d2e3f4a52", projectId, sessionId: "s1", taskKey: "p1", tool: "claude-code", kind: "edit", ts: "2026-09-04T09:00:05.000Z", paths: ["src/auth/session.ts"], summary: "Changed src/auth/session.ts", sourceEvent: "PostToolUse", sourceTool: "Edit", raw: { tool_name: "Edit" } },
    ];
    const res = await ingest(json({ connectorVersion: "0.2.0", events }, token));
    expect(await res.json()).toEqual({ inserted: 2, duplicates: 0 });
    const room = await store.getRoom(projectId);
    const task = room!.sessions[0]!.task!;
    expect(task.location).toBe("Login → session");
    expect(task.risk.level).toBe("high");

    expect((await getTask(new Request("http://x/"), params({ taskId: "nope" }))).status).toBe(404);
    const detail = (await (await getTask(new Request("http://x/"), params({ taskId: task.id }))).json()) as { events: Array<{ plain: string; raw: unknown }>; changes: Array<{ plain: string }>; notTouched: string[] };
    expect(detail.events.map((e) => e.plain)).toEqual(["Changing the session part of Login", "You asked: “fix the login bug”"]);
    expect(detail.events[0]?.raw).toEqual({ tool_name: "Edit" });
    expect(detail.changes).toEqual([expect.objectContaining({ plain: "Changed the session part of Login" })]);
    expect(detail.notTouched).toEqual(["Payments", "Storyboard", "Project setup"]);
  });
});
