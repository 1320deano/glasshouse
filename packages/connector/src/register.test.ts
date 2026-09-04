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

describe("Codex hook registration", () => {
  it("writes hooks.json with commandWindows and turns the feature on in config.toml without touching notify", async () => {
    const { enableCodexHooksFeature, hasCodexHooks, registerCodexHooks, unregisterCodexHooks, CODEX_EVENTS } = await import("./register.js");
    const hooks = join(dir, "codex", "hooks.json");
    const config = join(dir, "codex", "config.toml");
    await writeFile(config, 'model = "gpt-5-codex"\nnotify = ["/usr/bin/notify"]\n\n[features]\nweb_search = true\n', { flag: "w" }).catch(async () => {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(join(dir, "codex"), { recursive: true });
      await writeFile(config, 'model = "gpt-5-codex"\nnotify = ["/usr/bin/notify"]\n\n[features]\nweb_search = true\n');
    });
    const r = await registerCodexHooks(hooks, config, "/x/cli.js", "/usr/bin/node");
    expect(r).toEqual({ events: CODEX_EVENTS.length, configChanged: true });
    const h = JSON.parse(await readFile(hooks, "utf8"));
    expect(h.hooks.Stop[0].hooks[0]).toMatchObject({ command: '"/usr/bin/node" "/x/cli.js" hook codex Stop', commandWindows: '"/usr/bin/node" "/x/cli.js" hook codex Stop' });
    expect(hasCodexHooks(h)).toBe(true);
    const toml = await readFile(config, "utf8");
    expect(toml).toContain('notify = ["/usr/bin/notify"]');
    expect(toml).toMatch(/\[features\]\nweb_search = true\nhooks = true/);
    expect(await enableCodexHooksFeature(config)).toBe(false); // idempotent
    expect((await unregisterCodexHooks(hooks)).removed).toBe(CODEX_EVENTS.length);
  });

  it("creates config.toml when there is none", async () => {
    const { enableCodexHooksFeature } = await import("./register.js");
    const config = join(dir, "codex2", "config.toml");
    expect(await enableCodexHooksFeature(config)).toBe(true);
    expect(await readFile(config, "utf8")).toBe("[features]\nhooks = true\n");
  });
});

describe("Cursor hook registration", () => {
  it("uses Cursor's own file shape and leaves other hooks alone", async () => {
    const { hasCursorHooks, registerCursorHooks, unregisterCursorHooks, CURSOR_EVENTS } = await import("./register.js");
    const path = join(dir, "cursor", "hooks.json");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(dir, "cursor"), { recursive: true });
    await writeFile(path, JSON.stringify({ version: 1, hooks: { afterFileEdit: [{ command: "./format.sh" }] } }));
    await registerCursorHooks(path, "/x/cli.js", "/usr/bin/node");
    await registerCursorHooks(path, "/x/cli.js", "/usr/bin/node");
    const f = JSON.parse(await readFile(path, "utf8"));
    expect(f.version).toBe(1);
    expect(f.hooks.afterFileEdit).toEqual([{ command: "./format.sh" }, { command: '"/usr/bin/node" "/x/cli.js" hook cursor afterFileEdit' }]);
    for (const ev of CURSOR_EVENTS) expect(f.hooks[ev]).toBeDefined();
    expect(hasCursorHooks(f)).toBe(true);
    expect((await unregisterCursorHooks(path)).removed).toBe(CURSOR_EVENTS.length);
    expect(JSON.parse(await readFile(path, "utf8")).hooks).toEqual({ afterFileEdit: [{ command: "./format.sh" }] });
  });
});
