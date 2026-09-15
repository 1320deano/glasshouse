import { describe, expect, it } from "vitest";
import type { AgentTool } from "@glasshouse/schema";
import type { RequestView, RoomState, SessionView, TaskView } from "../store/types";
import { agentsAnswer, intentOf, nextAnswer, summaryAnswer } from "./answers";
import { addressLine, openQuestions, requestLine } from "./story";
import { followUpFor, suggestForSession, suggestRequests } from "./suggest";
import { isListening, wantsTo } from "./view";

const NOW = Date.parse("2026-09-14T10:00:00.000Z");
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

function task(over: Partial<TaskView> & { id: string; tool?: AgentTool }): TaskView {
  return {
    sessionId: `sess-${over.id}`,
    tool: over.tool ?? "claude-code",
    headline: "Fixing how people log in",
    headlineSource: "template",
    stage: "building",
    storedStage: "building",
    risk: { level: "low", reasons: [] },
    startedAt: iso(30),
    lastEventAt: iso(1),
    eventCount: 5,
    changedPaths: ["src/auth/session.ts"],
    touchedPaths: ["src/auth/session.ts"],
    areas: [{ id: "login", name: "Login", description: "", changed: ["src/auth/session.ts"], looked: [] }],
    notTouched: ["Payments"],
    installs: 0,
    createdPaths: [],
    installed: [],
    ...over,
  };
}

function session(t: TaskView, over: Partial<SessionView> = {}): SessionView {
  return { id: t.sessionId, tool: t.tool, depth: "full", externalId: `ext-${t.id}`, startedAt: t.startedAt, lastEventAt: t.lastEventAt, task: t, recentEvents: [], ...over };
}

function room(sessions: SessionView[], over: Partial<RoomState> = {}): RoomState {
  return {
    project: { id: "p", name: "Storyboard", createdAt: iso(1000) },
    sessions,
    areas: [],
    generatedAt: new Date(NOW).toISOString(),
    inboxOpen: 0,
    sinceChecked: { done: 0, needsYou: 0 },
    story: [],
    progress: [{ id: "login", name: "Login", sensitive: true, stage: "building", running: 1, finished: 0, filesChanged: 1, lastTouchedAt: iso(1), tools: ["claude-code"] }],
    activity: { since: iso(10000), hours: {}, total: 0, byTool: { "claude-code": 0, codex: 0, cursor: 0, watcher: 0 } },
    helpers: [],
    requests: [],
    ...over,
  };
}

describe("ready-made lines from the record", () => {
  it("offers to unstick a stuck agent, and says what it rests on", () => {
    const s = session(task({ id: "t1", stage: "stuck", stuckReason: "the same error came back three times" }));
    const lines = suggestForSession(s, NOW);
    expect(lines[0]).toMatchObject({ kind: "stuck", tool: "claude-code", taskId: "t1", session: { id: "sess-t1", live: true } });
    expect(lines[0]!.text).toMatch(/^You look stuck \(the same error came back three times\)/);
    expect(lines[0]!.because).toMatch(/Detected from the record/);
  });

  it("offers to fix failing checks, carry on, and write checks, from the facts of a finished task", () => {
    const failed = session(task({ id: "t2", stage: "done", endedAt: iso(10), lastTests: { passed: 6, failed: 2 } }), { endedAt: iso(10) });
    expect(suggestForSession(failed, NOW).map((l) => l.kind)).toEqual(["checks"]);
    expect(suggestForSession(failed, NOW)[0]!.text).toMatch(/^2 checks failed after the work on Login/);
    const clean = session(task({ id: "t3", stage: "done", endedAt: iso(10) }), { endedAt: iso(10) });
    expect(suggestForSession(clean, NOW).map((l) => l.kind)).toEqual(["no-checks", "carry-on"]);
    expect(suggestForSession(clean, NOW)[0]!.because).toBe("No checks were run during this task, and it changed 1 file.");
  });

  it("hands a task that ran out of usage to another tool", () => {
    const s = session(task({ id: "t4", stage: "done", endedAt: iso(5), endReason: "usage_limit", usageLimitConfirmed: true }), { endedAt: iso(5) });
    const [line] = suggestForSession(s, NOW);
    expect(line).toMatchObject({ kind: "limit", tool: "codex", label: "Pick it up with Codex" });
    expect(line!.text).toMatch(/^Claude Code ran out of usage while working on/);
  });

  it("offers a placed helper to Claude Code by its file name", () => {
    const s = session(task({ id: "t5" }));
    const lines = suggestForSession(s, NOW, [{ id: "h1", name: "Login checker", slug: "login-checker", tools: ["claude-code"], job: "Runs the checks before anything is called finished", placedAt: iso(500), runs: [] }]);
    expect(lines.find((l) => l.kind === "helper")?.text).toBe("Use the login-checker helper on what you are doing now: Runs the checks before anything is called finished");
  });

  it("gives the whole Room the most urgent line per agent first, and only the focused agent's lines with a focus", () => {
    const stuck = session(task({ id: "a", stage: "stuck" }));
    const failed = session(task({ id: "b", tool: "codex", stage: "done", endedAt: iso(3), lastTests: { failed: 1 } }), { endedAt: iso(3) });
    const watcher = session(task({ id: "w", tool: "watcher" }));
    const all = suggestRequests(room([failed, stuck, watcher]), NOW);
    expect(all.map((l) => l.kind)).toEqual(["stuck", "checks"]);
    expect(suggestRequests(room([failed, stuck]), NOW, { sessionId: "sess-b" }).map((l) => l.taskId)).toEqual(["b"]);
  });

  it("knows which agents words can reach from the Room", () => {
    const live = session(task({ id: "l" }));
    const ended = session(task({ id: "e", endedAt: iso(9) }), { endedAt: iso(9) });
    const ours: RequestView = { id: "r", projectId: "p", createdAt: iso(20), tool: "claude-code", text: "x", origin: { kind: "typed" }, care: "ask", status: "running", statusAt: iso(20), sessionId: "sess-l", questions: [] };
    expect(followUpFor(live, [], NOW)).toMatchObject({ ok: false, reason: expect.stringMatching(/own window/) });
    expect(followUpFor(live, [ours], NOW)).toEqual({ ok: true, live: true });
    expect(followUpFor(ended, [], NOW)).toEqual({ ok: true, live: false });
  });
});

describe("what Glasshouse says on its own", () => {
  it("recognises the three set questions and nothing else", () => {
    expect(intentOf("Where are we?")).toBe("summary");
    expect(intentOf("give me a quick status update")).toBe("summary");
    expect(intentOf("What should we do next?")).toBe("next");
    expect(intentOf("how is each agent getting on")).toBe("agents");
    expect(intentOf("Did it change how people log in?")).toBe("other");
  });

  it("sums up what is running, asking, finished and needing the owner, from the facts only", () => {
    const live = session(task({ id: "a", location: "Login" }), { recentEvents: [{ id: "e1", kind: "edit", tool: "claude-code", ts: iso(2), receivedAt: iso(2), plain: "Changing how logged-in users are identified", summary: "Changed x", paths: [], sourceEvent: "PostToolUse" }] });
    const done = session(task({ id: "b", tool: "codex", stage: "done", endedAt: iso(40), lastTests: { passed: 4, failed: 1 }, report: { headline: "Payments now retries a failed card once", touched: [{ id: "pay", name: "Payments", reason: "" }], notTouched: [], touchedReasons: {}, needsYou: "review", needsYouDetail: "Check the retry limit", source: "template", risk: { level: "medium", reasons: [] }, evidence: { tests: { ran: true, passed: 4, failed: 1 }, filesChanged: 2, installs: 0, commands: 0 }, createdAt: iso(40) } as never }), { endedAt: iso(40) });
    const asking: RequestView = { id: "r", projectId: "p", createdAt: iso(5), tool: "claude-code", text: "x", origin: { kind: "typed" }, care: "ask", status: "running", statusAt: iso(5), sessionId: "sess-a", questions: [{ id: "q", askedAt: iso(1), kind: "permission", toolName: "Bash", summary: "Ran: pnpm test", paths: [], plain: "Wants to run the checks" }] };
    const text = summaryAnswer(room([live, done], { requests: [asking] }), NOW);
    expect(text).toContain("1 agent is working. Claude Code is building in Login: “Fixing how people log in”, last seen 2 min ago.");
    expect(text).toContain("Waiting on your answer: Claude Code wants to run the checks.");
    expect(text).toContain("Finished today: 1 task. Codex finished “Payments now retries a failed card once” 40 min ago (Payments; 1 of 5 checks failed). Review recommended.");
    expect(text).toContain("Needs you: 1 review (“Payments now retries a failed card once”).");
    expect(text).toContain("This week the agents touched Login.");
  });

  it("says plainly when there is nothing to act on, and lists the lines when there is", () => {
    expect(nextAnswer(room([]), NOW)).toMatch(/^Nothing in the record is asking for action/);
    const failed = session(task({ id: "b", tool: "codex", stage: "done", endedAt: iso(3), lastTests: { failed: 1 } }), { endedAt: iso(3) });
    expect(nextAnswer(room([failed]), NOW)).toBe("From the record, one thing is worth doing next. 1. Fix the failing checks: 1 check failed the last time this task ran them. Tap one of the lines under the box to send it, or change the words first.");
    expect(agentsAnswer(room([]), NOW)).toMatch(/^No agent has run today/);
  });
});

describe("the lines under the owner's message", () => {
  const base: RequestView = { id: "r", projectId: "p", createdAt: iso(1), tool: "codex", text: "x", origin: { kind: "typed" }, care: "ask", status: "queued", statusAt: iso(1), questions: [] };
  it("says whether the computer is listening, then follows the run", () => {
    expect(requestLine(base, { listening: true })).toMatchObject({ badge: "Sent", tone: "info" });
    expect(requestLine(base, { listening: false })).toMatchObject({ badge: "Not picked up", tone: "attention", command: "glasshouse watch" });
    expect(requestLine({ ...base, status: "taken" }, { listening: true }).text).toBe("Your computer is starting Codex.");
    expect(requestLine({ ...base, status: "running", sessionId: "s" }, { listening: true }).text).toBe("Codex is on it.");
    expect(requestLine({ ...base, status: "failed", result: { ok: false, reason: "Codex is not installed on this computer." } }, { listening: true })).toMatchObject({ badge: "Could not start", text: "Codex is not installed on this computer." });
    expect(requestLine({ ...base, status: "expired" }, { listening: true }).badge).toBe("Not run");
    expect(addressLine(base)).toBe("To Codex (new)");
    expect(addressLine({ ...base, continues: { sessionId: "s", externalId: "e" } })).toBe("To Codex (follow-up)");
    expect(addressLine({ ...base, tool: "glasshouse" })).toBe("To Glasshouse");
  });
  it("only counts a question as open while the run is going", () => {
    const q = { id: "q", askedAt: iso(1), kind: "permission" as const, toolName: "Bash", summary: "s", paths: [], plain: "Wants to run the checks" };
    expect(openQuestions({ status: "running", questions: [q] })).toHaveLength(1);
    expect(openQuestions({ status: "running", questions: [{ ...q, answer: { allow: true, at: iso(0) } }] })).toHaveLength(0);
    expect(openQuestions({ status: "finished", questions: [q] })).toHaveLength(0);
  });
});

describe("the view's words", () => {
  it("turns a present-tense line into a request", () => {
    expect(wantsTo("Running the checks")).toBe("Wants to run the checks");
    expect(wantsTo("Changing how logged-in users are identified")).toBe("Wants to change how logged-in users are identified");
    expect(wantsTo("Ran the checks")).toBe("Wants to run the checks");
    expect(wantsTo("Run the test suite")).toBe("Wants to run the test suite");
    expect(wantsTo("Used the github plug-in (create issue)")).toBe("Wants to use the github plug-in (create issue)");
    expect(wantsTo("The checks were interrupted")).toBe("Wants to go ahead with: the checks were interrupted");
  });
  it("counts the connector as listening for 45 seconds after it last asked", () => {
    expect(isListening(undefined, NOW)).toBe(false);
    expect(isListening(new Date(NOW - 30_000).toISOString(), NOW)).toBe(true);
    expect(isListening(new Date(NOW - 60_000).toISOString(), NOW)).toBe(false);
  });
});
