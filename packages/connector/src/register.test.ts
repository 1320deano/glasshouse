import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LISTEN_EVENTS, hasClaudeCodeHooks, registerClaudeCodeHooks, unregisterClaudeCodeHooks } from "./register.js";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "glasshouse-settings-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("Claude Code hook registration", () => {
  it("adds our hooks without disturbing existing ones, and is idempotent", async () => {
    const path = join(dir, "settings.json");
    const existing = { model: "opus", hooks: { PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo other" }] }] } };
    await writeFile(path, JSON.stringify(existing));

    await registerClaudeCodeHooks(path, "C:\\tools\\glasshouse\\dist\\cli.js", "C:\\Program Files\\nodejs\\node.exe");
    await registerClaudeCodeHooks(path, "C:\\tools\\glasshouse\\dist\\cli.js", "C:\\Program Files\\nodejs\\node.exe");

    const s = JSON.parse(await readFile(path, "utf8"));
    expect(s.model).toBe("opus");
    expect(s.hooks.PostToolUse).toHaveLength(2);
    expect(s.hooks.PostToolUse[0].hooks[0].command).toBe("echo other");
    expect(s.hooks.PostToolUse[1].hooks[0]).toEqual({
      type: "command",
      command: '"C:/Program Files/nodejs/node.exe" "C:/tools/glasshouse/dist/cli.js" hook claude-code PostToolUse',
      timeout: 10,
      async: true,
    });
    for (const ev of LISTEN_EVENTS) expect(s.hooks[ev]).toBeDefined();
    expect(hasClaudeCodeHooks(s)).toBe(true);
    await expect(readFile(`${path}.glasshouse-backup`, "utf8")).resolves.toContain('"model"');
  });

  it("removes only our hooks", async () => {
    const path = join(dir, "settings.json");
    const { removed } = await unregisterClaudeCodeHooks(path);
    expect(removed).toBe(LISTEN_EVENTS.length);
    const s = JSON.parse(await readFile(path, "utf8"));
    expect(s.hooks).toEqual({ PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo other" }] }] });
    expect(hasClaudeCodeHooks(s)).toBe(false);
  });

  it("creates the settings file when there is none", async () => {
    const path = join(dir, "fresh", "settings.json");
    await registerClaudeCodeHooks(path, "/x/cli.js", "/usr/bin/node");
    const s = JSON.parse(await readFile(path, "utf8"));
    expect(s.hooks.Stop[0].hooks[0].command).toBe('"/usr/bin/node" "/x/cli.js" hook claude-code Stop');
  });
});
