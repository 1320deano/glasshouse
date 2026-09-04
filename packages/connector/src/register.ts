/**
 * Writes (and removes) the Glasshouse hook entries for each agent.
 *
 * - Claude Code: `~/.claude/settings.json` (or the project's `.claude/settings.json`).
 * - Codex: `~/.codex/hooks.json` plus `[features] hooks = true` in `~/.codex/config.toml`.
 *   Non-managed hooks stay off until the user trusts them from `/hooks` inside Codex.
 * - Cursor: `~/.cursor/hooks.json` in Cursor's own `{version: 1, hooks: {...}}` shape.
 *
 * Existing hooks from other tools are left untouched; a backup is written before any change.
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const LISTEN_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "PermissionDenied",
  "Notification",
  "SubagentStart",
  "SubagentStop",
  "Stop",
  "StopFailure",
  "SessionEnd",
] as const;

/** Codex 0.150+: same shape as Claude Code, fewer events. */
export const CODEX_EVENTS = ["SessionStart", "UserPromptSubmit", "PostToolUse", "PermissionRequest", "SubagentStart", "SubagentStop", "Stop", "Interrupt", "SessionEnd"] as const;

/** Cursor 3.x: camelCase names; the IDE fires all of these, the CLI a subset. */
export const CURSOR_EVENTS = [
  "sessionStart",
  "sessionEnd",
  "beforeSubmitPrompt",
  "beforeReadFile",
  "afterFileEdit",
  "afterShellExecution",
  "afterMCPExecution",
  "postToolUse",
  "postToolUseFailure",
  "afterAgentThought",
  "subagentStart",
  "subagentStop",
  "stop",
] as const;

export const MARKER = "hook claude-code";
export const CODEX_MARKER = "hook codex";
export const CURSOR_MARKER = "hook cursor";

interface HookEntry {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string; [k: string]: unknown }>;
  [k: string]: unknown;
}
interface Settings {
  hooks?: Record<string, HookEntry[]>;
  [k: string]: unknown;
}

const quote = (p: string) => `"${p.replace(/\\/g, "/")}"`;

export function hookCommandFor(cliPath: string, event: string, nodePath = process.execPath, tool = "claude-code"): string {
  return `${quote(nodePath)} ${quote(cliPath)} hook ${tool} ${event}`;
}

const ownedBy = (marker: string) => (entry: HookEntry) => Array.isArray(entry.hooks) && entry.hooks.some((h) => typeof h.command === "string" && h.command.includes(marker));
const isOurs = ownedBy(MARKER);

async function readJson<T extends object>(path: string): Promise<{ value: T; existed: boolean }> {
  try {
    return { value: JSON.parse(await readFile(path, "utf8")) as T, existed: true };
  } catch {
    return { value: {} as T, existed: false };
  }
}

async function writeJson(path: string, value: unknown, existed: boolean) {
  await mkdir(dirname(path), { recursive: true });
  if (existed) await copyFile(path, `${path}.glasshouse-backup`).catch(() => undefined);
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

// ---------------------------------------------------------------------------------------------
// Claude Code
// ---------------------------------------------------------------------------------------------

export async function registerClaudeCodeHooks(settingsPath: string, cliPath: string, nodePath?: string): Promise<{ events: number }> {
  const { value: settings, existed } = await readJson<Settings>(settingsPath);
  const hooks = settings.hooks ?? {};
  for (const event of LISTEN_EVENTS) {
    const list = (Array.isArray(hooks[event]) ? hooks[event] : []).filter((e) => !isOurs(e));
    list.push({ hooks: [{ type: "command", command: hookCommandFor(cliPath, event, nodePath), timeout: 10, async: true }] });
    hooks[event] = list;
  }
  settings.hooks = hooks;
  await writeJson(settingsPath, settings, existed);
  return { events: LISTEN_EVENTS.length };
}

export async function unregisterClaudeCodeHooks(settingsPath: string): Promise<{ removed: number }> {
  return removeOwned(settingsPath, MARKER);
}

export function hasClaudeCodeHooks(settings: Settings): boolean {
  return Object.values(settings.hooks ?? {}).some((list) => Array.isArray(list) && list.some(isOurs));
}

async function removeOwned(path: string, marker: string): Promise<{ removed: number }> {
  const { value: settings, existed } = await readJson<Settings>(path);
  if (!existed || !settings.hooks) return { removed: 0 };
  const mine = ownedBy(marker);
  let removed = 0;
  for (const [event, list] of Object.entries(settings.hooks)) {
    if (!Array.isArray(list)) continue;
    const kept = list.filter((e) => !mine(e));
    removed += list.length - kept.length;
    if (kept.length === 0) delete settings.hooks[event];
    else settings.hooks[event] = kept;
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  await writeJson(path, settings, existed);
  return { removed };
}

// ---------------------------------------------------------------------------------------------
// Codex
// ---------------------------------------------------------------------------------------------

export async function registerCodexHooks(hooksPath: string, configTomlPath: string, cliPath: string, nodePath?: string): Promise<{ events: number; configChanged: boolean }> {
  const { value: settings, existed } = await readJson<Settings>(hooksPath);
  const hooks = settings.hooks ?? {};
  const mine = ownedBy(CODEX_MARKER);
  for (const event of CODEX_EVENTS) {
    const list = (Array.isArray(hooks[event]) ? hooks[event] : []).filter((e) => !mine(e));
    const command = hookCommandFor(cliPath, event, nodePath, "codex");
    // Windows runs hooks under PowerShell; the same quoted command works there too.
    list.push({ hooks: [{ type: "command", command, commandWindows: command, timeout: 10 }] });
    hooks[event] = list;
  }
  settings.hooks = hooks;
  await writeJson(hooksPath, settings, existed);
  const configChanged = await enableCodexHooksFeature(configTomlPath);
  return { events: CODEX_EVENTS.length, configChanged };
}

/** Add `[features]\nhooks = true` to config.toml without touching anything else (notify, model...). */
export async function enableCodexHooksFeature(configTomlPath: string): Promise<boolean> {
  let text = "";
  let existed = false;
  try {
    text = await readFile(configTomlPath, "utf8");
    existed = true;
  } catch {
    /* no config yet */
  }
  const sectionMatch = /^\[features\]\s*$/m.exec(text);
  if (sectionMatch) {
    const start = sectionMatch.index + sectionMatch[0].length;
    const rest = text.slice(start);
    const nextSection = /^\[/m.exec(rest);
    const body = nextSection ? rest.slice(0, nextSection.index) : rest;
    if (/^\s*hooks\s*=\s*true\s*$/m.test(body)) return false;
    const newBody = /^\s*hooks\s*=/m.test(body) ? body.replace(/^(\s*hooks\s*=\s*)\S+/m, "$1true") : `${body.replace(/\s*$/, "")}\nhooks = true\n`;
    text = text.slice(0, start) + newBody + (nextSection ? rest.slice(nextSection.index) : "");
  } else {
    text = `${text.replace(/\s*$/, "")}${text.trim() ? "\n\n" : ""}[features]\nhooks = true\n`;
  }
  await mkdir(dirname(configTomlPath), { recursive: true });
  if (existed) await copyFile(configTomlPath, `${configTomlPath}.glasshouse-backup`).catch(() => undefined);
  await writeFile(configTomlPath, text, "utf8");
  return true;
}

export async function unregisterCodexHooks(hooksPath: string): Promise<{ removed: number }> {
  return removeOwned(hooksPath, CODEX_MARKER);
}

export function hasCodexHooks(settings: Settings): boolean {
  return Object.values(settings.hooks ?? {}).some((list) => Array.isArray(list) && list.some(ownedBy(CODEX_MARKER)));
}

// ---------------------------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------------------------

interface CursorHooks {
  version?: number;
  hooks?: Record<string, Array<{ command?: string; [k: string]: unknown }>>;
  [k: string]: unknown;
}

export async function registerCursorHooks(hooksPath: string, cliPath: string, nodePath?: string): Promise<{ events: number }> {
  const { value: file, existed } = await readJson<CursorHooks>(hooksPath);
  const hooks = file.hooks ?? {};
  for (const event of CURSOR_EVENTS) {
    const list = (Array.isArray(hooks[event]) ? hooks[event] : []).filter((h) => !(typeof h.command === "string" && h.command.includes(CURSOR_MARKER)));
    list.push({ command: hookCommandFor(cliPath, event, nodePath, "cursor") });
    hooks[event] = list;
  }
  file.version = file.version ?? 1;
  file.hooks = hooks;
  await writeJson(hooksPath, file, existed);
  return { events: CURSOR_EVENTS.length };
}

export async function unregisterCursorHooks(hooksPath: string): Promise<{ removed: number }> {
  const { value: file, existed } = await readJson<CursorHooks>(hooksPath);
  if (!existed || !file.hooks) return { removed: 0 };
  let removed = 0;
  for (const [event, list] of Object.entries(file.hooks)) {
    if (!Array.isArray(list)) continue;
    const kept = list.filter((h) => !(typeof h.command === "string" && h.command.includes(CURSOR_MARKER)));
    removed += list.length - kept.length;
    if (kept.length === 0) delete file.hooks[event];
    else file.hooks[event] = kept;
  }
  await writeJson(hooksPath, file, existed);
  return { removed };
}

export function hasCursorHooks(file: CursorHooks): boolean {
  return Object.values(file.hooks ?? {}).some((list) => Array.isArray(list) && list.some((h) => typeof h.command === "string" && h.command.includes(CURSOR_MARKER)));
}
