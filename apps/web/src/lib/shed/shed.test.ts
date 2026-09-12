import type { Area } from "@glasshouse/schema";
import { describe, expect, it } from "vitest";
import { MemoryStore } from "../store/memory";
import type { HelperRecord, HelperRun, TaskView } from "../store/types";
import { briefFromChoices, choicesForKind, choicesFromBrief, describeChoices, DUTIES, jobFrom, nameFor, VOICES } from "./build";
import { compileHelper, emptyBrief, instructions, mergeSection, removeSection } from "./compile";
import { boxEvidenceFrom, rehearsalTasksFrom } from "./evidence";
import { rehearse } from "./rehearse";
import { helperLine, helperStory, jobLine, roomHelpersFrom } from "./room";
import { agentTypeOf, helperRunsFrom } from "./runs";
import { sameBrief, slugify, uniqueSlug } from "./slug";
import { suggestHelpers } from "./suggest";
import { checkHelper, judgeRun } from "./verify";

const AREAS: Area[] = [
  { id: "payments", name: "Payments", description: "Taking money", prefixes: ["src/payments"], userCorrected: false, source: "heuristic", sensitive: true },
  { id: "checkout", name: "Checkout", description: "The basket and the order", prefixes: ["src/checkout"], userCorrected: false, source: "heuristic", sensitive: false },
  { id: "login", name: "Login", description: "", prefixes: ["src/auth"], userCorrected: false, source: "heuristic", sensitive: true },
];

const helper: HelperRecord = {
  id: "h1",
  projectId: "p1",
  slug: "checkout-checker",
  name: "Checkout checker",
  grownFrom: "stuck:checkout",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  brief: {
    job: "Run the checks before anything in Checkout is called finished.",
    mayTouch: ["checkout"],
    mustNotTouch: ["payments", "login"],
    stopAndAsk: ["When the same check fails twice"],
    care: "careful",
    rules: [{ text: "Prices are shown in pounds, never pence." }],
    tools: ["claude-code", "codex", "cursor"],
  },
};

function task(over: Partial<TaskView> & { id: string }): TaskView {
  return {
    sessionId: "s",
    tool: "claude-code",
    headline: "Did a thing",
    headlineSource: "template",
    stage: "done",
    storedStage: "done",
    risk: { level: "low", reasons: [] } as unknown as TaskView["risk"],
    startedAt: "2026-09-01T00:00:00Z",
    endedAt: "2026-09-01T01:00:00Z",
    eventCount: 5,
    changedPaths: [],
    touchedPaths: [],
    areas: [],
    notTouched: [],
    installs: 0,
    createdPaths: [],
    installed: [],
    ...over,
  };
}

describe("compile", () => {
  it("turns the owner's words into real files for each tool, with boundaries as real folders", () => {
    const files = compileHelper(helper, AREAS);
    expect(files.map((f) => f.path)).toEqual([".claude/agents/checkout-checker.md", "AGENTS.md", ".cursor/rules/checkout-checker.mdc"]);
    const claude = files[0]!.body;
    expect(claude.startsWith("---\nname: checkout-checker\ndescription: ")).toBe(true);
    expect(claude).toContain("Payments (`src/payments/`)");
    expect(claude).toContain("You must never change files in these parts:");
    expect(claude).toContain("Prices are shown in pounds, never pence.");
    expect(claude).toContain("Never give a percentage");
    const cursor = files[2]!.body;
    expect(cursor).toContain('globs: ["src/checkout/**"]');
    expect(cursor).toContain("alwaysApply: false");
  });

  it("only writes the tools the owner chose", () => {
    const files = compileHelper({ ...helper, brief: { ...helper.brief, tools: ["codex"] } }, AREAS);
    expect(files).toHaveLength(1);
    expect(files[0]!.mode).toBe("section");
  });

  it("drops an area id the map no longer has rather than inventing a folder", () => {
    const text = instructions({ ...helper, brief: { ...helper.brief, mustNotTouch: ["gone", "payments"] } }, AREAS);
    expect(text).toContain("Payments");
    expect(text).not.toContain("gone");
  });

  it("merges a Codex section into AGENTS.md once, and can take it out again", () => {
    const section = compileHelper({ ...helper, brief: { ...helper.brief, tools: ["codex"] } }, AREAS)[0]!;
    const once = mergeSection("# My project\n\nBe nice.\n", section);
    expect(once).toContain("# My project");
    expect(once.split(section.marker!.start)).toHaveLength(2);
    const twice = mergeSection(once, { ...section, body: section.body.replace("Run the checks", "Run ALL the checks") });
    expect(twice.split(section.marker!.start)).toHaveLength(2);
    expect(twice).toContain("Run ALL the checks");
    expect(removeSection(twice, helper.slug)).toBe("# My project\n\nBe nice.\n");
  });
});

describe("build", () => {
  it("starts a kind with its usual ticks, and keeps every sensitive part off limits", () => {
    const c = choicesForKind("checker", AREAS);
    expect(c.duties).toEqual(["run-checks", "stop-on-repeat", "no-done-while-failing"]);
    expect(c.mustNotTouch).toEqual(["payments", "login"]);
    expect(c.stops).toEqual(["Before changing anything in Payments", "Before changing anything in Login", "When the same check fails twice"]);
    expect(c.care).toBe("careful");
    expect(nameFor(c, AREAS)).toBe("Checker");
    expect(nameFor({ ...c, mayTouch: ["checkout"] }, AREAS)).toBe("Checkout checker");
    expect(nameFor(choicesForKind("guard", AREAS), AREAS)).toBe("Payments guard");
    expect(nameFor(choicesForKind("rules", AREAS), AREAS)).toBe("House rules");
  });

  it("stores exactly the ticked sentences and the owner's own words, and nothing else", () => {
    const c = { ...choicesForKind("specialist", AREAS), mayTouch: ["checkout"], ownWords: "Our customers are schools.", knows: [{ text: "Prices are in pounds." }] };
    const b = briefFromChoices(c);
    expect(b.job).toBe(`${DUTIES[3]!.sentence}\n${DUTIES[4]!.sentence}\nOur customers are schools.`);
    expect(b.mustNotTouch).toEqual(["payments", "login"]);
    expect(b.rules.map((r) => r.text)).toEqual([VOICES[0]!.sentence, VOICES[3]!.sentence, "Prices are in pounds."]);
    expect(b.tools).toEqual(["claude-code", "codex", "cursor"]);
  });

  it("comes back with the same boxes ticked, exactly, and never guesses at words it did not write", () => {
    const c = { ...choicesForKind("checker", AREAS), mayTouch: ["checkout"], voices: ["short" as const], ownWords: "Also keep an eye on the basket.", knows: [{ text: "Asked before: refunds go to the card." }] };
    const back = choicesFromBrief(briefFromChoices(c), "kind:checker");
    expect(back).toEqual({ ...c, mustNotTouch: ["payments", "login"] });
    // A helper written before the builder existed: its prose is the owner's own words, its kind is read from the ticks or is "own".
    const old = choicesFromBrief({ ...helper.brief, job: "Run the checks before anything in Checkout is called finished." }, "owner");
    expect(old.kind).toBe("own");
    expect(old.duties).toEqual([]);
    expect(old.ownWords).toBe("Run the checks before anything in Checkout is called finished.");
    expect(old.knows).toEqual([{ text: "Prices are shown in pounds, never pence." }]);
    expect(choicesFromBrief({ ...helper.brief, job: jobFrom(["ask-before-off-limits"]) }, "owner").kind).toBe("guard");
    expect(choicesFromBrief(helper.brief, "stuck:checkout").kind).toBe("checker");
  });

  it("describes the helper in the owner's words, one fact per line", () => {
    const lines = describeChoices({ ...choicesForKind("guard", AREAS), voices: ["plain"] }, AREAS);
    expect(lines).toEqual([
      "Asks before changing anything it has been told is off limits",
      "Never changes Payments and Login",
      "Stops to ask you before changing anything in Payments and before changing anything in Login",
      "Careful: reads before it changes anything, runs the checks after every change, and stops if the same check fails twice.",
      "Talks this way: plain English, no code words or file names",
    ]);
    expect(describeChoices(choicesForKind("own", AREAS), AREAS)).toContain("May work anywhere in your app");
  });

  it("writes every suggestion from the same sentences, so it opens as ticked boxes", () => {
    const s = suggestHelpers([], AREAS);
    expect(choicesFromBrief(s[0]!.brief, s[0]!.id)).toMatchObject({ kind: "checker", duties: ["run-checks", "stop-on-repeat"], ownWords: "" });
    expect(choicesFromBrief(s[1]!.brief, s[1]!.id)).toMatchObject({ kind: "guard", duties: ["ask-before-off-limits"], mustNotTouch: ["payments", "login"] });
  });
});

describe("evidence and rehearsal", () => {
  const tasks: TaskView[] = [
    task({ id: "stuck1", stage: "stuck", storedStage: "testing", stuckReason: "The same error has happened three times in a row", headline: "Looks stuck", prompt: "Fix the basket total", endedAt: undefined, areas: [{ id: "checkout", name: "Checkout", description: "", changed: ["src/checkout/a.ts"], looked: [] }] }),
    task({ id: "fail1", lastTests: { passed: 3, failed: 2 }, areas: [{ id: "payments", name: "Payments", description: "", changed: ["src/payments/stripe.ts"], looked: [] }], installs: 1 }),
    task({ id: "ask1", report: { headline: "x", touchedReasons: {}, needsYou: "decision", needsYouDetail: "Refund to card or credit?", source: "template", createdAt: "2026-09-01T00:00:00Z" } as TaskView["report"] }),
    task({ id: "hand1", continuedFrom: { tool: "codex", taskId: "prev", reason: "same files" } as TaskView["continuedFrom"] }),
    task({ id: "clean1", lastTests: { passed: 9, failed: 0 }, areas: [{ id: "checkout", name: "Checkout", description: "", changed: ["src/checkout/b.ts"], looked: [] }] }),
  ];

  it("says, per box, what the record has seen, with the tasks behind it", () => {
    const e = boxEvidenceFrom(tasks, AREAS);
    expect(e["duty:run-checks"]!.taskIds).toEqual(["fail1"]);
    expect(e["duty:run-checks"]!.text).toBe("1 task in your project was called finished with checks still failing.");
    expect(e["duty:stop-on-repeat"]!.taskIds).toEqual(["stuck1"]);
    expect(e["stop:When the same check fails twice"]!.taskIds).toEqual(["stuck1"]);
    expect(e["stop:Before installing anything new"]!.taskIds).toEqual(["fail1"]);
    expect(e["duty:apply-answers"]!.text).toBe("You were asked to decide 1 time.");
    expect(e["duty:handover-note"]!.taskIds).toEqual(["hand1"]);
    expect(e["duty:ask-before-off-limits"]!.text).toBe("Agents changed Payments in 1 task.");
    expect(e["stop:Before changing anything in Payments"]!.taskIds).toEqual(["fail1"]);
    expect(e["area:checkout"]!.text).toBe("Changed in 2 tasks.");
    expect(e["kind:checker"]!.text).toBe("1 stuck moment and 1 task finished with failing checks in your project.");
    expect(e["kind:guard"]!.taskIds).toEqual(["fail1"]);
    expect(e["kind:specialist"]).toBeUndefined(); // one finished task per part is not a pattern
    expect(e["duty:stay-inside"]).toBeUndefined();
  });

  it("replays a helper's rules against what each task actually did, and counts the quiet ones", () => {
    const recent = rehearsalTasksFrom(tasks, AREAS);
    // Newest first by when it ended or last moved; the live task last moved before the others finished.
    expect(recent.map((t) => t.id)).toEqual(["fail1", "ask1", "hand1", "clean1", "stuck1"]);
    const checker = { ...choicesForKind("checker", AREAS), mayTouch: ["checkout"], stops: [...choicesForKind("checker", AREAS).stops, "Before installing anything new"] };
    const r = rehearse(checker, recent, AREAS);
    const byTask = Object.fromEntries(r.lines.map((l) => [l.taskId, l.would]));
    expect(byTask.stuck1).toEqual(["Would have stopped at the second time the same error came up and reported it, instead of trying a third way."]);
    expect(recent.find((t) => t.id === "stuck1")!.headline).toBe("Fix the basket total");
    // A silence is not a repeated error: nothing a helper could have done, so nothing is claimed.
    expect(rehearse(checker, rehearsalTasksFrom([task({ id: "quiet", stage: "stuck", storedStage: "building", stuckReason: "Nothing has happened for 7 minutes", endedAt: undefined })], AREAS), AREAS).lines).toEqual([]);
    expect(byTask.fail1).toEqual(["Would have stopped before changing Payments and asked you first.", "Would not have called it finished: 2 checks were still failing.", "Would have asked you before adding something new to the project."]);
    expect(byTask.ask1).toBeUndefined();
    expect(r.quiet).toBe(3);
    expect(r.total).toBe(5);
    const rules = { ...choicesForKind("rules", AREAS), knows: [{ text: "Refunds go back to the card." }] };
    expect(rehearse(rules, recent, AREAS).lines.find((l) => l.taskId === "ask1")!.would[0]).toMatch(/checked your standing answers first/);
    const handover = choicesForKind("handover", AREAS);
    expect(rehearse(handover, recent, AREAS).lines.find((l) => l.taskId === "hand1")!.would[0]).toBe("Would have left a handover note for Claude Code to pick up from Codex.");
    expect(rehearse(choicesForKind("own", AREAS), [], AREAS)).toEqual({ lines: [], quiet: 0, total: 0 });
  });
});

describe("helpers in the Room", () => {
  const run = (over: Partial<HelperRun>): HelperRun => ({ taskId: "t1", tool: "claude-code", agentType: "checkout-checker", startedAt: "2026-09-02T00:00:00Z", endedAt: "2026-09-02T00:05:00Z", changedPaths: ["src/checkout/basket.ts"], taskWide: false, ...over });

  it("shows each helper with its runs judged, and says so in the story", () => {
    const placed = { ...helper, placedAt: "2026-09-01T12:00:00Z", brief: { ...helper.brief, job: jobFrom(["run-checks"]) } };
    const [h] = roomHelpersFrom([placed], [run({}), run({ taskId: "t2", startedAt: "2026-09-03T00:00:00Z", endedAt: "2026-09-03T00:05:00Z", changedPaths: ["src/payments/stripe.ts"] }), run({ agentType: "someone-else" })], AREAS);
    expect(h!.job).toBe("Runs the project's checks before anything is called finished");
    expect(h!.runs.map((r) => r.verdict)).toEqual(["kept", "strayed"]);
    expect(helperLine(h!)).toEqual({ text: "Ran 2 times; went outside its patch once (Payments).", tone: "critical" });
    expect(helperLine({ runs: [], placedAt: undefined })).toEqual({ text: "Not placed in your project yet." });
    const story = helperStory([h!]);
    expect(story.map((m) => m.kind)).toEqual(["helper-started", "helper-finished", "helper-started", "helper-finished"]);
    expect(story[0]!.text).toBe("Claude Code handed part of this task to your helper Checkout checker.");
    expect(story[1]!.text).toBe("Your helper Checkout checker finished and kept to its patch.");
    expect(story[3]!.text).toBe("Your helper Checkout checker finished but changed Payments, outside its patch.");
    expect(story[3]!.helper).toEqual({ id: "h1", name: "Checkout checker", verdict: "strayed", outside: ["Payments"] });
    expect(jobLine({ ...helper.brief, job: "Look after the basket.\nMore." })).toBe("Look after the basket.");
  });
});

describe("slug", () => {
  it("makes a file-safe name and keeps it unique within a project", () => {
    expect(slugify("Checkout checker!")).toBe("checkout-checker");
    expect(slugify("   ")).toBe("helper");
    expect(uniqueSlug("Checkout checker", new Set(["checkout-checker"]))).toBe("checkout-checker-2");
  });
  it("knows when the words that reach the folder have not changed", () => {
    expect(sameBrief(helper, { ...helper, brief: { ...helper.brief, mayTouch: [...helper.brief.mayTouch] } })).toBe(true);
    expect(sameBrief(helper, { ...helper, brief: { ...helper.brief, care: "quick" } })).toBe(false);
  });
});

describe("suggest", () => {
  it("offers two starters, and says they are not from the record, when nothing has happened", () => {
    const s = suggestHelpers([], AREAS);
    expect(s).toHaveLength(2);
    expect(s.every((x) => x.starter)).toBe(true);
    expect(s[1]!.brief.mustNotTouch).toEqual(["payments", "login"]);
    expect(s[0]!.evidence.text).toMatch(/not from your record/);
  });

  it("grows a checker from stuck tasks, a guard from sensitive changes, and house rules from questions, each with its evidence", () => {
    const tasks: TaskView[] = [
      task({ id: "t1", stage: "stuck", storedStage: "testing", stuckReason: "The same error three times", areas: [{ id: "checkout", name: "Checkout", description: "", changed: ["src/checkout/basket.ts"], looked: [] }], endedAt: undefined }),
      task({ id: "t2", areas: [{ id: "payments", name: "Payments", description: "", changed: ["src/payments/stripe.ts"], looked: [] }] }),
      task({ id: "t3", report: { headline: "x", touchedReasons: {}, needsYou: "decision", needsYouDetail: "Should refunds go back to the card or to credit?", source: "template", createdAt: "2026-09-01T00:00:00Z" } as TaskView["report"] }),
      task({ id: "t4", report: { headline: "x", touchedReasons: {}, needsYou: "decision", needsYouDetail: "Should refunds go back to the card or to credit?", source: "template", createdAt: "2026-09-01T00:00:00Z" } as TaskView["report"] }),
    ];
    const s = suggestHelpers(tasks, AREAS, [helper]);
    const ids = s.map((x) => x.id);
    expect(ids).toContain("stuck:checkout");
    expect(ids).toContain("sensitive:payments");
    expect(ids).toContain("asked:all");
    expect(ids).not.toContain("sensitive:login");
    const checker = s.find((x) => x.id === "stuck:checkout")!;
    expect(checker.grownAs?.id).toBe("h1");
    expect(checker.evidence.taskIds).toEqual(["t1"]);
    expect(checker.brief.rules[0]!.text).toContain("The same error three times");
    const rules = s.find((x) => x.id === "asked:all")!;
    expect(rules.evidence.text).toBe("You were asked to decide 2 times across 1 different question.");
    expect(rules.brief.rules[0]!.text).toContain("Should refunds go back to the card or to credit?");
    expect(s.some((x) => x.starter)).toBe(false);
  });
});

describe("runs and verify", () => {
  const run = (over: Partial<HelperRun>): HelperRun => ({ taskId: "t1", tool: "claude-code", agentType: "checkout-checker", startedAt: "2026-09-02T00:00:00Z", changedPaths: [], taskWide: false, ...over });

  it("reads the helper's name from the sub-agent start and collects that agent's edits", () => {
    const runs = helperRunsFrom(
      [
        { id: "e1", kind: "subagent_start", tool: "claude-code", ts: "2026-09-02T00:00:00Z", agentId: "a1", taskId: "t1", paths: [], summary: "Started a helper (checkout-checker)", raw: { agent_type: "checkout-checker" } },
        { id: "e2", kind: "edit", tool: "claude-code", ts: "2026-09-02T00:01:00Z", agentId: "a1", taskId: "t1", paths: ["src/checkout/basket.ts"], summary: "Edited basket.ts" },
        { id: "e3", kind: "edit", tool: "claude-code", ts: "2026-09-02T00:02:00Z", taskId: "t1", paths: ["src/payments/stripe.ts"], summary: "Edited stripe.ts" },
        { id: "e4", kind: "subagent_stop", tool: "claude-code", ts: "2026-09-02T00:03:00Z", agentId: "a1", taskId: "t1", paths: [], summary: "Helper finished (checkout-checker)" },
      ],
      () => ["src/checkout/basket.ts", "src/payments/stripe.ts"],
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]!.changedPaths).toEqual(["src/checkout/basket.ts"]);
    expect(runs[0]!.taskWide).toBe(false);
    expect(runs[0]!.endedAt).toBe("2026-09-02T00:03:00Z");
    expect(agentTypeOf({ id: "x", kind: "subagent_start", tool: "cursor", ts: "", paths: [], summary: "Started a helper (guard)" })).toBe("guard");
  });

  it("says kept, strayed, or unclear, and never accuses when the tool did not say who edited", () => {
    expect(judgeRun(helper, run({ changedPaths: ["src/checkout/basket.ts"] }), AREAS).verdict).toBe("kept");
    const strayed = judgeRun(helper, run({ changedPaths: ["src/checkout/basket.ts", "src/payments/stripe.ts"] }), AREAS);
    expect(strayed.verdict).toBe("strayed");
    expect(strayed.outside).toEqual(["Payments"]);
    expect(judgeRun(helper, run({ changedPaths: ["src/payments/stripe.ts"], taskWide: true }), AREAS).verdict).toBe("unclear");
    expect(judgeRun(helper, run({ changedPaths: ["README.md"] }), AREAS).outside).toEqual(["somewhere outside its patch"]);
    const check = checkHelper(helper, [run({ changedPaths: ["src/checkout/a.ts"] }), run({ agentType: "other" })], AREAS);
    expect(check.runs).toBe(1);
    expect(check.line).toBe("Ran once; kept to its patch every time.");
    expect(checkHelper(helper, [], AREAS).line).toMatch(/Not run yet/);
  });
});

describe("store", () => {
  it("saves, lists, renames a colliding slug, remembers placement only while the words stand", async () => {
    const store = new MemoryStore();
    const { project } = await store.createProject({ name: "shop" });
    const a = await store.saveHelper({ ...helper, id: "a", projectId: project.id });
    const b = await store.saveHelper({ ...helper, id: "b", projectId: project.id });
    expect(a.slug).toBe("checkout-checker");
    expect(b.slug).toBe("checkout-checker-2");
    await store.markHelpersPlaced(project.id, "2026-09-03T00:00:00Z");
    expect((await store.getHelper("a"))!.placedAt).toBe("2026-09-03T00:00:00Z");
    const same = await store.saveHelper({ ...helper, id: "a", projectId: project.id });
    expect(same.placedAt).toBe("2026-09-03T00:00:00Z");
    const changed = await store.saveHelper({ ...helper, id: "a", projectId: project.id, brief: { ...helper.brief, care: "quick" } });
    expect(changed.placedAt).toBeUndefined();
    expect((await store.listHelpers(project.id)).map((h) => h.id)).toEqual(["a", "b"]);
    await store.deleteHelper("b");
    expect(await store.listHelpers(project.id)).toHaveLength(1);
    expect(emptyBrief().tools).toEqual(["claude-code", "codex", "cursor"]);
  });
});
