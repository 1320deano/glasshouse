import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProjectTree } from "@glasshouse/schema";
import { parseManifest, scanTree, scrubReadme } from "./tree.js";

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "glasshouse-tree-"));
  await mkdir(join(root, "src", "auth"), { recursive: true });
  await mkdir(join(root, "node_modules", "zod"), { recursive: true });
  await mkdir(join(root, "dist"), { recursive: true });
  await mkdir(join(root, "secret-out"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "storyboard", description: "Turns scripts into storyboards", scripts: { dev: "next dev", test: "vitest" }, dependencies: { next: "15", zod: "3" }, devDependencies: { vitest: "3" } }));
  await writeFile(join(root, "README.md"), "# Storyboard\n\nMakes storyboards.\nAPI_KEY=sk-abcdef123456\nMore text.\n");
  await writeFile(join(root, ".gitignore"), "secret-out\n*.log\n");
  await writeFile(join(root, "src", "auth", "session.ts"), "export {}");
  await writeFile(join(root, "src", "auth", "session.test.ts"), "");
  await writeFile(join(root, "src", "app.log"), "log");
  await writeFile(join(root, "node_modules", "zod", "index.js"), "");
  await writeFile(join(root, "dist", "bundle.js"), "");
  await writeFile(join(root, "secret-out", "x.txt"), "");
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("scanTree", () => {
  it("lists source paths only and reads manifest heads, never file contents", async () => {
    const tree = await scanTree(root, { now: () => "2026-09-04T00:00:00.000Z" });
    ProjectTree.parse(tree);
    expect(tree.paths).toEqual([".gitignore", "README.md", "package.json", "src/auth/session.test.ts", "src/auth/session.ts"]);
    expect(tree.truncated).toBe(false);
    expect(tree.manifests).toEqual([{ path: "package.json", name: "storyboard", description: "Turns scripts into storyboards", scripts: ["dev", "test"], dependencies: ["next", "zod", "vitest"] }]);
    expect(tree.readmeHead).toBe("# Storyboard\n\nMakes storyboards.\nMore text.");
    expect(JSON.stringify(tree)).not.toContain("sk-abcdef");
    expect(JSON.stringify(tree)).not.toContain("export {}");
  });

  it("parses other manifests", () => {
    expect(parseManifest("pyproject.toml", '[project]\nname = "scenes"\ndescription = "Scene tools"\ndependencies = [\n]\nrequests = ">=2"\n')).toMatchObject({ name: "scenes", description: "Scene tools" });
    expect(parseManifest("go.mod", "module example.com/app\n\nrequire (\n\tgithub.com/x/y v1.2.0\n)\n")).toEqual({ path: "go.mod", name: "example.com/app", dependencies: ["github.com/x/y"] });
  });

  it("scrubs secret-looking README lines and caps length", () => {
    expect(scrubReadme("ok\nTOKEN=abc\nfine\n")).toBe("ok\nfine");
    expect(scrubReadme("x".repeat(5000)).length).toBe(2000);
  });
});
