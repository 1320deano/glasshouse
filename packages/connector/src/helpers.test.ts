import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { placeHelpers, type PulledHelper } from "./helpers.js";

const helper = (slug: string): PulledHelper => ({
  id: slug,
  slug,
  name: slug,
  tools: ["claude-code", "codex", "cursor"],
  updatedAt: "2026-09-09T00:00:00Z",
  files: [
    { tool: "claude-code", path: `.claude/agents/${slug}.md`, mode: "file", body: `---\nname: ${slug}\n---\n# ${slug}` },
    { tool: "codex", path: "AGENTS.md", mode: "section", marker: { start: `<!-- deano:helper:${slug} -->`, end: `<!-- /deano:helper:${slug} -->` }, body: `<!-- deano:helper:${slug} -->\n## Helper: ${slug}\n<!-- /deano:helper:${slug} -->` },
    { tool: "cursor", path: `.cursor/rules/${slug}.mdc`, mode: "file", body: `---\ndescription: ${slug}\n---\n# ${slug}` },
  ],
});

describe("glasshouse helpers", () => {
  it("writes each tool's files, merges Codex sections into an existing AGENTS.md, and removes what a deleted helper left behind", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-helpers-"));
    const state = join(root, ".state", "helpers-state.json");
    await writeFile(join(root, "AGENTS.md"), "# My project\n\nBe kind.\n");

    const first = await placeHelpers(root, "p1", [helper("checker"), helper("guard")], state);
    expect(first.written.sort()).toEqual([".claude/agents/checker.md", ".claude/agents/guard.md", ".cursor/rules/checker.mdc", ".cursor/rules/guard.mdc"]);
    const agents = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(agents.startsWith("# My project\n\nBe kind.")).toBe(true);
    expect(agents).toContain("## Helper: checker");
    expect(agents).toContain("## Helper: guard");

    const second = await placeHelpers(root, "p1", [helper("checker")], state);
    expect(second.removed.sort()).toEqual([".claude/agents/guard.md", ".cursor/rules/guard.mdc"]);
    expect(await readdir(join(root, ".claude", "agents"))).toEqual(["checker.md"]);
    const after = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(after).toContain("## Helper: checker");
    expect(after).not.toContain("guard");
    expect(after.startsWith("# My project\n\nBe kind.")).toBe(true);
  });

  it("never removes a section it did not write", async () => {
    const root = await mkdtemp(join(tmpdir(), "gh-helpers-"));
    const state = join(root, ".state", "helpers-state.json");
    await writeFile(join(root, "AGENTS.md"), "<!-- deano:helper:theirs -->\nhand-made\n<!-- /deano:helper:theirs -->\n");
    await placeHelpers(root, "p1", [helper("checker")], state);
    const text = await readFile(join(root, "AGENTS.md"), "utf8");
    expect(text).toContain("hand-made");
    expect(text).toContain("## Helper: checker");
  });
});
