import { describe, expect, it } from "vitest";
import { storyboardAreas } from "./fixtures.test-support.js";
import { assessRisk } from "./risk.js";

const areas = storyboardAreas();

describe("assessRisk", () => {
  it("is low with a reason when only a plain area changed", () => {
    expect(assessRisk({ changedPaths: ["src/storyboard/scenes.ts"], areas, installs: 0 })).toEqual({ level: "low", reasons: ["Only Storyboard changed"] });
    expect(assessRisk({ changedPaths: [], areas, installs: 0 })).toEqual({ level: "low", reasons: ["No files changed yet"] });
  });

  it("is high when a sensitive area, a secrets file or the database layout changes", () => {
    expect(assessRisk({ changedPaths: ["src/auth/session.ts"], areas, installs: 0 })).toEqual({ level: "high", reasons: ["Changes Login"] });
    expect(assessRisk({ changedPaths: [".env.local"], areas, installs: 0 })).toMatchObject({ level: "high" });
    expect(assessRisk({ changedPaths: [".env.local"], areas, installs: 0 }).reasons).toContain("Touches a secrets file");
    expect(assessRisk({ changedPaths: ["supabase/migrations/2.sql"], areas, installs: 0 }).reasons).toContain("Changes the database layout");
  });

  it("is medium for settings files, installs and many files", () => {
    expect(assessRisk({ changedPaths: ["vitest.config.ts", "src/storyboard/a.ts"], areas: areas.filter((a) => a.name !== "Project setup"), installs: 0 })).toEqual({ level: "medium", reasons: ["Changes a settings file"] });
    expect(assessRisk({ changedPaths: ["src/storyboard/a.ts"], areas, installs: 2 })).toEqual({ level: "medium", reasons: ["Adds 2 new tools to the project"] });
    const many = Array.from({ length: 12 }, (_, i) => `src/storyboard/f${i}.ts`);
    expect(assessRisk({ changedPaths: many, areas, installs: 0 })).toEqual({ level: "medium", reasons: ["12 files changed"] });
  });

  it("every reason is a fact the user can check against the file list", () => {
    const r = assessRisk({ changedPaths: ["src/auth/a.ts", "src/payments/b.ts", "package.json"], areas, installs: 1 });
    expect(r.level).toBe("high");
    expect(r.reasons).toEqual(["Changes Login", "Changes Payments", "Changes Project setup", "Changes a settings file", "Adds a new tool to the project"]);
  });
});
