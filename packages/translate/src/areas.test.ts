import { describe, expect, it } from "vitest";
import { areaForPath, areasForPaths, buildHeuristicAreaMap, groupPathsByFolder, mergeAreaMaps, mergeAreas, renameArea, treeChangedMaterially, treeHash } from "./areas.js";
import { STORYBOARD_TREE, storyboardAreas } from "./fixtures.test-support.js";

describe("buildHeuristicAreaMap", () => {
  const map = buildHeuristicAreaMap({ paths: STORYBOARD_TREE }, { now: () => "2026-09-04T00:00:00.000Z" });

  it("names areas in owner words, looking through src/", () => {
    const names = map.areas.map((a) => a.name).sort();
    expect(names).toEqual(["Dashboard", "Login", "Payments", "Project setup", "Storyboard", "Uploads and files"]);
    expect(map.areas.find((a) => a.name === "Login")).toMatchObject({ prefixes: ["src/auth"], sensitive: true, description: "How people sign in and stay signed in", source: "heuristic" });
    expect(map.areas.find((a) => a.name === "Storyboard")?.sensitive).toBe(false);
    expect(map.source).toBe("heuristic");
    expect(map.treeHash).toBe(treeHash(STORYBOARD_TREE));
  });

  it("handles a pnpm monorepo like this one", () => {
    const paths = ["package.json", "apps/web/src/app/page.tsx", "apps/web/src/lib/store/memory.ts", "packages/connector/src/cli.ts", "packages/schema/src/index.ts", "docs/plan.md", "supabase/migrations/1.sql"];
    const m = buildHeuristicAreaMap({ paths });
    expect([...groupPathsByFolder(paths).keys()].sort()).toEqual([".", "apps/web/src/app", "apps/web/src/lib", "docs", "packages/connector", "packages/schema", "supabase"]);
    expect(m.areas.map((a) => a.name)).toContain("Documentation");
    expect(m.areas.map((a) => a.name)).toContain("Connector");
    expect(m.areas.find((a) => a.prefixes.includes("supabase"))?.name).toBe("Database");
  });

  it("caps the number of areas and gathers the rest", () => {
    const paths = Array.from({ length: 40 }, (_, i) => `part${i}/file.ts`);
    const m = buildHeuristicAreaMap({ paths });
    expect(m.areas.length).toBeLessThanOrEqual(24);
    expect(m.areas.find((a) => a.name === "Other parts")?.prefixes.length).toBeGreaterThan(10);
  });
});

describe("areaForPath", () => {
  const areas = storyboardAreas();
  it("uses the longest matching prefix and the root for top-level files", () => {
    expect(areaForPath("src/auth/session.ts", areas)?.name).toBe("Login");
    expect(areaForPath("package.json", areas)?.name).toBe("Project setup");
    expect(areaForPath("src/nowhere/x.ts", areas)).toBeUndefined();
    expect(areaForPath(undefined, areas)).toBeUndefined();
  });
  it("prefers a specific file prefix over its folder", () => {
    const withFile = [...areas, { id: "special", name: "Session rules", description: "", prefixes: ["src/auth/session.ts"], userCorrected: true, source: "user" as const, sensitive: true }];
    expect(areaForPath("src/auth/session.ts", withFile)?.name).toBe("Session rules");
    expect(areaForPath("src/auth/login.ts", withFile)?.name).toBe("Login");
  });
  it("lists distinct areas for many paths", () => {
    expect(areasForPaths(["src/auth/a.ts", "src/auth/b.ts", "src/payments/c.ts"], areas).map((a) => a.name)).toEqual(["Login", "Payments"]);
  });
});

describe("corrections and refreshes", () => {
  const map = buildHeuristicAreaMap({ paths: STORYBOARD_TREE });
  const login = map.areas.find((a) => a.name === "Login")!;
  const dashboard = map.areas.find((a) => a.name === "Dashboard")!;

  it("rename marks the area as corrected", () => {
    const renamed = renameArea(map, login.id, "Signing in", "Where people log in");
    expect(renamed.areas.find((a) => a.id === login.id)).toMatchObject({ name: "Signing in", description: "Where people log in", userCorrected: true, source: "user" });
  });

  it("merge moves prefixes across and removes the source", () => {
    const merged = mergeAreas(map, dashboard.id, login.id);
    expect(merged.areas.find((a) => a.id === dashboard.id)).toBeUndefined();
    expect(merged.areas.find((a) => a.id === login.id)?.prefixes.sort()).toEqual(["src/auth", "src/dashboard"]);
    expect(areaForPath("src/dashboard/page.tsx", merged.areas)?.name).toBe("Login");
  });

  it("a refresh keeps corrections and drops fresh areas whose prefixes are owned", () => {
    const corrected = mergeAreas(renameArea(map, login.id, "Signing in"), dashboard.id, login.id);
    const fresh = buildHeuristicAreaMap({ paths: [...STORYBOARD_TREE, "src/search/index.ts"] });
    const result = mergeAreaMaps(corrected, fresh);
    const signIn = result.areas.find((a) => a.id === login.id);
    expect(signIn).toMatchObject({ name: "Signing in", userCorrected: true });
    expect(signIn?.prefixes.sort()).toEqual(["src/auth", "src/dashboard"]);
    expect(result.areas.find((a) => a.name === "Dashboard")).toBeUndefined();
    expect(result.areas.find((a) => a.name === "Search")).toBeDefined();
    // uncorrected areas keep their ids so events stay attached
    expect(result.areas.find((a) => a.name === "Payments")?.id).toBe(map.areas.find((a) => a.name === "Payments")!.id);
  });
});

describe("treeChangedMaterially", () => {
  it("ignores small edits and notices new top-level groups or big churn", () => {
    expect(treeChangedMaterially(STORYBOARD_TREE, [...STORYBOARD_TREE, "src/auth/reset.ts"])).toBe(false);
    expect(treeChangedMaterially(STORYBOARD_TREE, [...STORYBOARD_TREE, "src/search/index.ts"])).toBe(true);
    expect(treeChangedMaterially(STORYBOARD_TREE, STORYBOARD_TREE.slice(0, 5))).toBe(true);
    expect(treeChangedMaterially([], STORYBOARD_TREE)).toBe(true);
  });
  it("hashes are order-independent and slash-insensitive", () => {
    expect(treeHash(["a/b.ts", "c.ts"])).toBe(treeHash(["c.ts", "a\\b.ts"]));
    expect(treeHash(["a/b.ts"])).not.toBe(treeHash(["a/c.ts"]));
  });
});
