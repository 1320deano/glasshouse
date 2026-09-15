import { describe, expect, it } from "vitest";
import type { RequestView, RoomState, SessionView, TaskView } from "../store/types";
import { filterOptions, mentionAt, mentionOptions, placeholderFor, targetForSession, targetLabel, withoutMention } from "./compose";

const NOW = Date.parse("2026-09-14T10:00:00.000Z");
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

function session(id: string, over: Omit<Partial<SessionView>, "task"> & { task?: Partial<TaskView> } = {}): SessionView {
  const task = { id: `t-${id}`, sessionId: id, tool: "claude-code", headline: "Fixing how people log in", headlineSource: "template", stage: "building", storedStage: "building", risk: { level: "low", reasons: [] }, startedAt: iso(30), lastEventAt: iso(1), eventCount: 1, changedPaths: [], touchedPaths: [], areas: [], notTouched: [], installs: 0, createdPaths: [], installed: [], ...over.task } as unknown as TaskView;
  const { task: _t, ...rest } = over;
  return { id, tool: "claude-code", depth: "full", externalId: `ext-${id}`, startedAt: iso(30), lastEventAt: iso(1), task, recentEvents: [], ...rest };
}
const room = (sessions: SessionView[], requests: RequestView[] = []): Pick<RoomState, "sessions" | "requests"> => ({ sessions, requests });

describe("who @ can find", () => {
  it("offers Glasshouse, then the agents in the Room, then a new agent per tool", () => {
    const live = session("a");
    const finished = session("b", { endedAt: iso(9), task: { endedAt: iso(9), stage: "done" } });
    const old = session("c", { endedAt: iso(60 * 30), lastEventAt: iso(60 * 30), task: { endedAt: iso(60 * 30), stage: "done" } });
    const opts = mentionOptions(room([live, finished, old]), NOW);
    expect(opts.map((o) => o.id)).toEqual(["glasshouse", "session:a", "session:b", "new:claude-code", "new:codex", "new:cursor"]);
    expect(opts[1]!.hint).toMatch(/own window/);
    expect(opts[2]!.hint).toMatch(/Picks up where it left off/);
  });
  it("says a live agent the Room started can be reached", () => {
    const live = session("a");
    const ours: RequestView = { id: "r", projectId: "p", createdAt: iso(20), tool: "claude-code", text: "x", origin: { kind: "typed" }, care: "ask", status: "running", statusAt: iso(20), sessionId: "a", questions: [] };
    expect(targetForSession(live, [ours], NOW)).toMatchObject({ kind: "session", reachable: true, live: true, label: "Claude Code · Fixing how people log in" });
    expect(targetForSession(live, [], NOW)).toMatchObject({ reachable: false, reason: expect.stringMatching(/own window/) });
    expect(targetForSession({ ...live, tool: "watcher" }, [], NOW)).toBeNull();
  });
  it("finds the name being typed, and takes it out again", () => {
    expect(mentionAt("hello @cla", 10)).toEqual({ start: 6, query: "cla" });
    expect(mentionAt("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionAt("email me@example.com", 20)).toBeNull();
    expect(mentionAt("@Claude Code fix it", 19)).toEqual({ start: 0, query: "Claude Code fix it" });
    expect(withoutMention("hello @cla there", { start: 6, query: "cla" })).toBe("hello there");
    expect(withoutMention("@Codex", { start: 0, query: "Codex" })).toBe("");
    const opts = mentionOptions(room([session("a")]), NOW);
    expect(filterOptions(opts, "codex").map((o) => o.id)).toEqual(["new:codex"]);
    expect(filterOptions(opts, "claude").map((o) => o.id)).toEqual(["session:a", "new:claude-code"]);
  });
  it("labels the box for whoever it is for", () => {
    expect(targetLabel(null)).toBe("Glasshouse");
    expect(targetLabel({ kind: "new", tool: "codex" })).toBe("Codex (new)");
    expect(placeholderFor({ kind: "new", tool: "cursor" }, true)).toMatch(/^Tell Cursor what you want/);
    expect(placeholderFor(null, false)).toMatch(/^Type @ to start/);
  });
});
