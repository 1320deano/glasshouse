/**
 * `glasshouse` CLI.
 *
 *   glasshouse connect [--server URL] [--name NAME] [--project] [--tools a,b]   link this folder and register hooks
 *   glasshouse hook <tool> <event>                                              called by the agent (stdin JSON)
 *   glasshouse map                                                              resend the file tree so the Room can refresh the area map
 *   glasshouse watch [--no-folders]                                             watch folders, commits and Codex logs (long-running)
 *   glasshouse status                                                           what is linked, what is waiting
 *   glasshouse disconnect                                                       remove hooks and unlink this folder
 *   glasshouse record <tool> <event>                                            append raw payload to a recording file
 *
 * The hook command must never fail the agent: it always exits 0 and prints nothing to stdout.
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONNECTOR_VERSION, codexHome, cursorHome, findProject, homeDir, log, readProjects, spoolDir, writeProjects, type LinkedProject } from "./config.js";
import { payloadCwd, readStdin, runHook } from "./hook.js";
import { recordHook } from "./record.js";
import {
  hasClaudeCodeHooks,
  hasCodexHooks,
  hasCursorHooks,
  registerClaudeCodeHooks,
  registerCodexHooks,
  registerCursorHooks,
  unregisterClaudeCodeHooks,
  unregisterCodexHooks,
  unregisterCursorHooks,
} from "./register.js";
import { scanTree } from "./tree.js";
import { sendTree } from "./upload.js";
import { startWatch } from "./watch.js";

const [, , command = "", ...rest] = process.argv;

function flag(name: string): string | undefined {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
}
const has = (name: string) => rest.includes(`--${name}`);

/** Absolute path of the built CLI, which is what the hook entries must point at. */
function cliPath(): string {
  const here = fileURLToPath(import.meta.url);
  if (here.endsWith(".ts")) {
    const dist = resolve(dirname(here), "..", "dist", "cli.js");
    if (!existsSync(dist)) throw new Error(`Build the connector first (pnpm --filter glasshouse build); expected ${dist}`);
    return dist;
  }
  return here;
}

const userSettingsPath = () => join(homedir(), ".claude", "settings.json");
const projectSettingsPath = (root: string) => join(root, ".claude", "settings.json");
const codexHooksPath = () => join(codexHome(), "hooks.json");
const codexConfigPath = () => join(codexHome(), "config.toml");
const cursorHooksPath = () => join(cursorHome(), "hooks.json");

const TREE_REFRESH_MS = 6 * 60 * 60 * 1000;

async function projectName(root: string): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { name?: string };
    if (pkg.name) return pkg.name;
  } catch {
    /* no package.json */
  }
  return basename(root);
}

/** Which agents to register for: `--tools a,b`, else Claude Code plus whichever of Codex and Cursor is installed. */
function toolsToRegister(): Set<string> {
  const explicit = flag("tools");
  if (explicit) return new Set(explicit.split(",").map((t) => t.trim()).filter(Boolean));
  const tools = new Set(["claude-code"]);
  if (existsSync(codexHome())) tools.add("codex");
  if (existsSync(cursorHome())) tools.add("cursor");
  return tools;
}

/** Scan the folder and send the tree; updates the linked project's fingerprint. Returns a one-line result. */
async function refreshTree(project: LinkedProject, projects: LinkedProject[]): Promise<string> {
  const tree = await scanTree(project.root);
  const res = await sendTree(project, tree);
  if (!res.ok) return `Could not send the file map (${res.status || "no connection"}); the Room will use folder names until it arrives.`;
  project.treeSentAt = new Date().toISOString();
  await writeProjects(projects);
  const areas = res.body?.areas;
  const how = res.body?.source === "ai" ? "named by AI" : "named from folder names";
  return `Mapped ${tree.paths.length} files${tree.truncated ? " (partial)" : ""} into ${areas ?? "?"} parts of your app, ${how}.`;
}

async function connect() {
  const root = process.cwd();
  const server = (flag("server") ?? process.env.GLASSHOUSE_SERVER ?? "http://localhost:3000").replace(/\/+$/, "");
  const name = flag("name") ?? (await projectName(root));

  let linked: { projectId: string; token: string; name: string; mode: string };
  try {
    const res = await fetch(`${server}/api/projects/link`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(process.env.GLASSHOUSE_SETUP_SECRET ? { "x-glasshouse-setup": process.env.GLASSHOUSE_SETUP_SECRET } : {}) },
      body: JSON.stringify({ name, rootHint: root }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    linked = (await res.json()) as typeof linked;
  } catch (err) {
    console.error(`Could not reach the Room at ${server}.`);
    console.error(`Start it first (pnpm room, or pnpm dev while developing), then run this again.`);
    console.error(String(err));
    process.exitCode = 1;
    return;
  }

  const projects = (await readProjects()).filter((p) => p.root.toLowerCase() !== root.toLowerCase());
  const entry: LinkedProject = { projectId: linked.projectId, name: linked.name, root, server, token: linked.token, linkedAt: new Date().toISOString() };
  projects.push(entry);
  await writeProjects(projects);
  console.log(`Connected "${linked.name}" to ${server} (${linked.mode} mode).`);

  const tools = toolsToRegister();
  const cli = cliPath();
  if (tools.has("claude-code")) {
    const settings = has("project") ? projectSettingsPath(root) : userSettingsPath();
    const { events } = await registerClaudeCodeHooks(settings, cli);
    console.log(`Claude Code: listening to ${events} events (${settings}).`);
  }
  if (tools.has("codex")) {
    const { events, configChanged } = await registerCodexHooks(codexHooksPath(), codexConfigPath(), cli);
    console.log(`Codex: listening to ${events} events (${codexHooksPath()})${configChanged ? "; enabled hooks in config.toml" : ""}.`);
    console.log(`  One step for you: open Codex, type /hooks and trust the Glasshouse hooks. Until then Codex is followed through its logs by \`glasshouse watch\`.`);
  }
  if (tools.has("cursor")) {
    const { events } = await registerCursorHooks(cursorHooksPath(), cli);
    console.log(`Cursor: listening to ${events} events (${cursorHooksPath()}).`);
  }

  console.log(await refreshTree(entry, projects));
  console.log(`Open ${server}/room/${linked.projectId} on your second monitor, then start your agent in this folder.`);
  console.log(`For commits, plain file saves and Codex's logs, also run: glasshouse watch`);
}

async function map() {
  const projects = await readProjects();
  const project = findProject(projects, process.cwd());
  if (!project) {
    console.error("This folder is not connected. Run `glasshouse connect` first.");
    process.exitCode = 1;
    return;
  }
  console.log(await refreshTree(project, projects));
}

async function status() {
  const projects = await readProjects();
  console.log(`glasshouse ${CONNECTOR_VERSION} · home ${homeDir()}`);
  if (projects.length === 0) console.log("No folders linked. Run `glasshouse connect` inside a project.");
  for (const p of projects) console.log(`- ${p.name}  ${p.root}  ->  ${p.server}/room/${p.projectId}${p.treeSentAt ? `  (map sent ${p.treeSentAt.slice(0, 16).replace("T", " ")})` : "  (map not sent)"}`);
  const waiting = await readdir(spoolDir()).then((f) => f.filter((x) => x.endsWith(".json")).length).catch(() => 0);
  console.log(`${waiting} event${waiting === 1 ? "" : "s"} waiting to be sent.`);
  const checks: Array<[string, string, (s: never) => boolean]> = [
    ["Claude Code", userSettingsPath(), hasClaudeCodeHooks as (s: never) => boolean],
    ["Codex", codexHooksPath(), hasCodexHooks as (s: never) => boolean],
    ["Cursor", cursorHooksPath(), hasCursorHooks as (s: never) => boolean],
  ];
  if (findProject(projects, process.cwd())) checks.push(["Claude Code (this project)", projectSettingsPath(process.cwd()), hasClaudeCodeHooks as (s: never) => boolean]);
  for (const [name, path, check] of checks) {
    try {
      const s = JSON.parse(await readFile(path, "utf8")) as never;
      console.log(`${name}: ${check(s) ? "hooks registered" : "no Glasshouse hooks"} (${path})`);
    } catch {
      /* no settings file */
    }
  }
}

async function disconnect() {
  const root = process.cwd();
  const projects = await readProjects();
  const remaining = projects.filter((p) => p.root.toLowerCase() !== root.toLowerCase());
  await writeProjects(remaining);
  let removed = (await unregisterClaudeCodeHooks(projectSettingsPath(root))).removed;
  if (remaining.length === 0) {
    removed += (await unregisterClaudeCodeHooks(userSettingsPath())).removed;
    removed += (await unregisterCodexHooks(codexHooksPath())).removed;
    removed += (await unregisterCursorHooks(cursorHooksPath())).removed;
  }
  console.log(`Unlinked ${root}. Removed ${removed} hook entries.`);
  if (remaining.length > 0) console.log(`User-level hooks kept: ${remaining.length} other folder(s) still linked.`);
}

async function hook() {
  const [tool = "claude-code", event = "unknown"] = rest;
  try {
    const input = await readStdin();
    const projects = await readProjects();
    const outcome = await runHook(tool, event, input, { projects });
    if (outcome.status === "skipped" && outcome.reason !== "folder not linked") await log(`skipped ${event}: ${outcome.reason}`);
    // A new session is a cheap moment to keep the area map fresh.
    if (/^(SessionStart|sessionStart)$/.test(event) && outcome.status !== "skipped") {
      const cwd = payloadCwd(JSON.parse(input));
      const project = cwd ? findProject(projects, cwd) : undefined;
      if (project && (!project.treeSentAt || Date.now() - Date.parse(project.treeSentAt) > TREE_REFRESH_MS)) await refreshTree(project, projects);
    }
  } catch (err) {
    await log(`hook ${event} failed: ${String(err)}`);
  }
}

async function watch() {
  const projects = await readProjects();
  if (projects.length === 0) {
    console.error("No folders linked. Run `glasshouse connect` inside a project first.");
    process.exitCode = 1;
    return;
  }
  const handle = await startWatch({ projects, folders: !has("no-folders"), out: (line) => console.log(`${new Date().toLocaleTimeString()}  ${line}`) });
  console.log(`Watching ${projects.length} folder${projects.length === 1 ? "" : "s"} for saves and commits, and Codex logs in ${codexHome()}. Press Ctrl+C to stop.`);
  const stop = async () => {
    await handle.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
  await new Promise(() => undefined); // run until killed
}

async function main() {
  switch (command) {
    case "connect":
      return connect();
    case "hook":
      return hook();
    case "map":
      return map();
    case "watch":
      return watch();
    case "status":
      return status();
    case "disconnect":
      return disconnect();
    case "record": {
      const [tool = "claude-code", event = "unknown"] = rest;
      return recordHook(tool, event);
    }
    case "--version":
    case "-v":
      console.log(CONNECTOR_VERSION);
      return;
    default:
      console.log("usage: glasshouse <connect [--server URL] [--name NAME] [--project] [--tools claude-code,codex,cursor] | map | watch [--no-folders] | status | disconnect | hook <tool> <event> | record <tool> <event>>");
  }
}

main()
  .catch((err) => {
    if (command !== "hook") {
      console.error(String(err));
      process.exitCode = 1;
    }
  })
  .finally(() => {
    if (command === "hook") process.exit(0);
  });
