import { describe, expect, it } from "vitest";
import { STORYBOARD_ROOT, replayHooks, storyboardAreas } from "./fixtures.test-support.js";
import { assessRisk } from "./risk.js";
import { diffFromEvents, mergeAiReport, needsYouFloor, questionIn, reportCard, templateReportText, type ReportFacts } from "./report.js";

const areas = storyboardAreas();
const ctx = { areas, fileDescriptions: { "src/auth/session.ts": "how logged-in users are identified" } };

function facts(over: Partial<ReportFacts> = {}): ReportFacts {
  const changedPaths = over.changedPaths ?? ["src/auth/session.ts", "src/dashboard/page.tsx"];
  return {
    tool: "codex",
    prompt: "Continue the login session change",
    closingMessage: "The session now always carries the organisation id, and the dashboard reads it directly. All 6 tests pass.",
    endReason: "stop",
    changedPaths,
    touchedPaths: [...changedPaths, "src/payments/stripe.ts"],
    createdPaths: [],
    installs: 0,
    installed: [],
    testRuns: 1,
    lastTests: { passed: 6, failed: 0 },
    recentErrors: [],
    errorCount: 0,
    commits: 0,
    eventCount: 8,
    risk: assessRisk({ changedPaths, areas, installs: over.installs ?? 0 }),
    ...over,
  };
}

describe("the template report card", () => {
  it("computes touched and not touched from the changed-files list, never from what was only read", () => {
    const card = reportCard(templateReportText(facts(), ctx), facts(), ctx);
    expect(card.touched.map((t) => [t.name, t.files, t.reason])).toEqual([
      ["Login", ["src/auth/session.ts"], "Changed how logged-in users are identified"],
      ["Dashboard", ["src/dashboard/page.tsx"], "Changed the dashboard page"],
    ]);
    // Payments was read, not changed: it is verifiably untouched.
    expect(card.notTouched).toEqual(["Storyboard", "Payments", "Uploads and files", "Project setup"]);
    expect(card.outsideAnyPart).toEqual([]);
    expect(card.headline).toBe("The session now always carries the organisation id, and the dashboard reads it directly. All 6 tests pass.");
    expect(card.beforeAfter).toBeUndefined();
    expect(card.evidence).toEqual({
      tests: { ran: true, runs: 1, passed: 6, failed: 0 },
      newDependencies: [],
      installs: 0,
      secretsTouched: [],
      settingsTouched: [],
      databaseTouched: [],
      filesChanged: 2,
      filesCreated: 0,
      commits: 0,
      errors: 0,
    });
    expect(card.risk).toEqual({ level: "high", reasons: ["Changes Login"] });
    expect(card.riskReason).toBe("Changes Login");
    // High risk with nothing worse means "review recommended".
    expect(card.needsYou).toBe("review");
    expect(card.needsYouDetail).toBe("High risk: changes login.");
    expect(card.source).toBe("template");
    expect(card.finished).toBe(true);
  });

  it("writes a headline from the facts when the agent left no closing words", () => {
    expect(templateReportText(facts({ closingMessage: undefined }), ctx).headline).toBe("Changed Login and Dashboard");
    expect(templateReportText(facts({ closingMessage: undefined, changedPaths: [] }), ctx).headline).toBe("Looked around without changing anything");
    expect(templateReportText(facts({ closingMessage: undefined, changedPaths: ["notes.txt"] }), { areas: [] }).headline).toBe("Changed 1 file");
    expect(templateReportText(facts({ closingMessage: "interrupted" }), ctx).headline).toBe("Stopped early: interrupted");
    expect(templateReportText(facts({ tool: "claude-code", endReason: "usage_limit", usageLimitConfirmed: true }), ctx).headline).toBe("Stopped before finishing: usage limit reached");
  });

  it("lists secrets, settings and database files as evidence", () => {
    const f = facts({ changedPaths: [".env.local", "package.json", "supabase/migrations/3.sql", "src/storyboard/scenes.ts"], installed: ["stripe"], installs: 1 });
    const card = reportCard(templateReportText(f, ctx), f, ctx);
    expect(card.evidence.secretsTouched).toEqual([".env.local"]);
    expect(card.evidence.settingsTouched).toEqual(["package.json"]);
    expect(card.evidence.databaseTouched).toEqual(["supabase/migrations/3.sql"]);
    expect(card.evidence.newDependencies).toEqual(["stripe"]);
    // .env.local sits at the top level, which the map files under "Project setup"; the migration folder is on no map.
    expect(card.outsideAnyPart).toEqual(["supabase/migrations/3.sql"]);
  });
});

describe("needs you, from facts", () => {
  it("is nothing when the task ended cleanly at low risk", () => {
    expect(needsYouFloor(facts({ changedPaths: ["src/storyboard/scenes.ts"], risk: { level: "low", reasons: ["Only Storyboard changed"] } }))).toEqual({ status: "nothing" });
  });
  it("is blocked after a usage limit, with what to do next", () => {
    expect(needsYouFloor(facts({ tool: "claude-code", endReason: "usage_limit", usageLimitConfirmed: true }))).toEqual({
      status: "blocked",
      detail: "Claude Code hit its usage limit before finishing. Pick the task up in another tool, or wait for the limit to reset.",
    });
    expect(needsYouFloor(facts({ tool: "codex", endReason: "usage_limit", usageLimitConfirmed: false })).detail).toContain("seems to have hit a usage limit");
  });
  it("is blocked when it ended on an unresolved error", () => {
    expect(needsYouFloor(facts({ recentErrors: ["Bash failed: exit code 1\nvitest: 2 tests failed"] }))).toEqual({ status: "blocked", detail: "It ended with an error still unresolved: Bash failed: exit code 1 vitest: 2 tests failed" });
  });
  it("is a decision when the agent's closing words ask a question", () => {
    const msg = "I changed the session shape. Should I also update the mobile app, or leave it for now?";
    expect(questionIn(msg)).toBe("Should I also update the mobile app, or leave it for now?");
    expect(needsYouFloor(facts({ closingMessage: msg }))).toEqual({ status: "decision", detail: "Should I also update the mobile app, or leave it for now?" });
    expect(questionIn("All done. Nothing else needed.")).toBeUndefined();
  });
  it("is review when checks were failing at the end", () => {
    expect(needsYouFloor(facts({ lastTests: { passed: 4, failed: 2 }, risk: { level: "low", reasons: [] } }))).toEqual({ status: "review", detail: "2 checks still failing when it stopped." });
  });
});

describe("merging the AI's words", () => {
  const template = templateReportText(facts(), ctx);

  it("keeps the AI's words but not its claims about parts it did not change", () => {
    const merged = mergeAiReport(
      template,
      {
        headline: "Dashboards now know which organisation you are in.",
        beforeAfter: "Previously the session only knew who you were. Now it also carries which organisation you belong to, so the dashboard shows the right one.",
        touched: [
          { area: "Login", reason: "the session now records the organisation" },
          { area: "Payments", reason: "invoices are now per organisation" },
          { area: "Dashboard", reason: "reads the organisation from the session instead of asking again" },
        ],
        needsYou: "nothing",
      },
      facts(),
      ctx,
    );
    expect(merged.source).toBe("ai");
    expect(merged.headline).toBe("Dashboards now know which organisation you are in");
    expect(merged.beforeAfter).toContain("Previously the session");
    const card = reportCard(merged, facts(), ctx);
    expect(card.touched.map((t) => [t.name, t.reason])).toEqual([
      ["Login", "The session now records the organisation"],
      ["Dashboard", "Reads the organisation from the session instead of asking again"],
    ]);
    // The AI mentioned Payments; the changed-files list says otherwise, so it stays "not touched".
    expect(card.notTouched).toContain("Payments");
    // The AI said "nothing"; the facts say high risk, so review stays.
    expect(merged.needsYou).toBe("review");
    expect(merged.needsYouDetail).toBe("High risk: changes login.");
  });

  it("lets the AI raise needs-you and supply the question, never lower it", () => {
    const raised = mergeAiReport(template, { headline: "x", needsYou: "decision", needsYouDetail: "Do you want the organisation switcher on the dashboard too?" }, facts(), ctx);
    expect(raised.needsYou).toBe("decision");
    expect(raised.needsYouDetail).toBe("Do you want the organisation switcher on the dashboard too?");
    const blocked = facts({ tool: "claude-code", endReason: "usage_limit", usageLimitConfirmed: true });
    const lowered = mergeAiReport(templateReportText(blocked, ctx), { headline: "All good", needsYou: "nothing" }, blocked, ctx);
    expect(lowered.needsYou).toBe("blocked");
    expect(lowered.needsYouDetail).toContain("usage limit");
  });

  it("falls back to the template headline when the AI sends nothing usable", () => {
    expect(mergeAiReport(template, { headline: "   " }, facts(), ctx).headline).toBe(template.headline);
  });
});

describe("the diff behind the card", () => {
  it("is rebuilt from the patches on the recorded Claude Code edits", () => {
    const events = replayHooks("claude-code-usage-limit-synthetic.jsonl", STORYBOARD_ROOT);
    const diff = diffFromEvents(events);
    expect(diff.files).toBe(1);
    expect(diff.withoutPatch).toBe(0);
    expect(diff.truncated).toBe(false);
    expect(diff.text.split("\n")[0]).toBe("--- src/auth/session.ts");
    expect(diff.text).toContain("@@ -1,1 +1,1 @@");
    expect(diff.text).toContain("-export interface Session { userId: string");
  });

  it("counts edits that carried no patch and stops at the budget", () => {
    const hunk = { oldStart: 1, oldLines: 2, newStart: 1, newLines: 2, lines: ["-a".padEnd(300, "x"), "+b".padEnd(300, "y")] };
    const mk = (i: number, raw?: unknown) => ({ kind: "edit", paths: [`src/f${i}.ts`], raw, ts: `2026-09-04T09:00:0${i}.000Z` });
    const events = [mk(1, { tool_response: { structuredPatch: [hunk] } }), mk(2, { tool_response: {} }), mk(3, { tool_response: { structuredPatch: [hunk] } }), mk(4, { tool_response: { structuredPatch: [hunk] } })];
    const diff = diffFromEvents(events, 1000);
    expect(diff.withoutPatch).toBe(1);
    expect(diff.truncated).toBe(true);
    expect(diff.text.length).toBeLessThanOrEqual(1000 + 20);
    expect(diff.files).toBeGreaterThanOrEqual(1);
  });
});
