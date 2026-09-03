/**
 * Writes (and removes) the Glasshouse hook entries in a Claude Code settings file.
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

export const MARKER = "hook claude-code";

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

export function hookCommandFor(cliPath: string, event: string, nodePath = process.execPath): string {
  return `${quote(nodePath)} ${quote(cliPath)} ${MARKER} ${event}`;
}

const isOurs = (entry: HookEntry) => Array.isArray(entry.hooks) && entry.hooks.some((h) => typeof h.command === "string" && h.command.includes(MARKER));

async function readSettings(path: string): Promise<{ settings: Settings; existed: boolean }> {
  try {
    return { settings: JSON.parse(await readFile(path, "utf8")) as Settings, existed: true };
  } catch {
    return { settings: {}, existed: false };
  }
}

async function writeSettings(path: string, settings: Settings, existed: boolean) {
  await mkdir(dirname(path), { recursive: true });
  if (existed) await copyFile(path, `${path}.glasshouse-backup`).catch(() => undefined);
  await writeFile(path, JSON.stringify(settings, null, 2) + "\n", "utf8");
}

export async function registerClaudeCodeHooks(settingsPath: string, cliPath: string, nodePath?: string): Promise<{ events: number }> {
  const { settings, existed } = await readSettings(settingsPath);
  const hooks = settings.hooks ?? {};
  for (const event of LISTEN_EVENTS) {
    const list = (Array.isArray(hooks[event]) ? hooks[event] : []).filter((e) => !isOurs(e));
    list.push({ hooks: [{ type: "command", command: hookCommandFor(cliPath, event, nodePath), timeout: 10, async: true }] });
    hooks[event] = list;
  }
  settings.hooks = hooks;
  await writeSettings(settingsPath, settings, existed);
  return { events: LISTEN_EVENTS.length };
}

export async function unregisterClaudeCodeHooks(settingsPath: string): Promise<{ removed: number }> {
  const { settings, existed } = await readSettings(settingsPath);
  if (!existed || !settings.hooks) return { removed: 0 };
  let removed = 0;
  for (const [event, list] of Object.entries(settings.hooks)) {
    if (!Array.isArray(list)) continue;
    const kept = list.filter((e) => !isOurs(e));
    removed += list.length - kept.length;
    if (kept.length === 0) delete settings.hooks[event];
    else settings.hooks[event] = kept;
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  await writeSettings(settingsPath, settings, existed);
  return { removed };
}

export function hasClaudeCodeHooks(settings: Settings): boolean {
  return Object.values(settings.hooks ?? {}).some((list) => Array.isArray(list) && list.some(isOurs));
}
