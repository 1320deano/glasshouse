/**
 * `glasshouse` CLI.
 *
 *   glasshouse connect [--server URL] [--name NAME] [--project]   link this folder and register hooks
 *   glasshouse hook <tool> <event>                                called by the agent (stdin JSON)
 *   glasshouse status                                             what is linked, what is waiting
 *   glasshouse disconnect                                         remove hooks and unlink this folder
 *   glasshouse record <tool> <event>                              append raw payload to a recording file
 *
 * The hook command must never fail the agent: it always exits 0 and prints nothing to stdout.
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONNECTOR_VERSION, findProject, homeDir, log, readProjects, spoolDir, writeProjects, type LinkedProject } from "./config.js";
import { readStdin, runHook } from "./hook.js";
import { recordHook } from "./record.js";
import { hasClaudeCodeHooks, registerClaudeCodeHooks, unregisterClaudeCodeHooks } from "./register.js";

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

async function projectName(root: string): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { name?: string };
    if (pkg.name) return pkg.name;
  } catch {
    /* no package.json */
  }
  return basename(root);
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

  const settings = has("project") ? projectSettingsPath(root) : userSettingsPath();
  const { events } = await registerClaudeCodeHooks(settings, cliPath());

  console.log(`Connected "${linked.name}" to ${server} (${linked.mode} mode).`);
  console.log(`Registered ${events} Claude Code hook events in ${settings}.`);
  console.log(`Open ${server}/room/${linked.projectId} on your second monitor, then start Claude Code in this folder.`);
}

async function status() {
  const projects = await readProjects();
  console.log(`glasshouse ${CONNECTOR_VERSION} · home ${homeDir()}`);
  if (projects.length === 0) console.log("No folders linked. Run `glasshouse connect` inside a project.");
  for (const p of projects) console.log(`- ${p.name}  ${p.root}  ->  ${p.server}/room/${p.projectId}`);
  const waiting = await readdir(spoolDir()).then((f) => f.filter((x) => x.endsWith(".json")).length).catch(() => 0);
  console.log(`${waiting} event${waiting === 1 ? "" : "s"} waiting to be sent.`);
  for (const path of [userSettingsPath(), findProject(projects, process.cwd()) ? projectSettingsPath(process.cwd()) : ""]) {
    if (!path) continue;
    try {
      const s = JSON.parse(await readFile(path, "utf8"));
      console.log(`${hasClaudeCodeHooks(s) ? "Hooks registered" : "No Glasshouse hooks"} in ${path}`);
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
  const a = await unregisterClaudeCodeHooks(projectSettingsPath(root));
  const b = remaining.length === 0 ? await unregisterClaudeCodeHooks(userSettingsPath()) : { removed: 0 };
  console.log(`Unlinked ${root}. Removed ${a.removed + b.removed} hook entries.`);
  if (remaining.length > 0) console.log(`User-level hooks kept: ${remaining.length} other folder(s) still linked.`);
}

async function hook() {
  const [tool = "claude-code", event = "unknown"] = rest;
  try {
    const input = await readStdin();
    const projects = await readProjects();
    const outcome = await runHook(tool, event, input, { projects });
    if (outcome.status === "skipped" && outcome.reason !== "folder not linked") await log(`skipped ${event}: ${outcome.reason}`);
  } catch (err) {
    await log(`hook ${event} failed: ${String(err)}`);
  }
}

async function main() {
  switch (command) {
    case "connect":
      return connect();
    case "hook":
      return hook();
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
      console.log("usage: glasshouse <connect [--server URL] [--name NAME] [--project] | status | disconnect | hook <tool> <event>>");
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
