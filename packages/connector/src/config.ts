import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const CONNECTOR_VERSION = "0.1.0";

/** A folder on this machine that has been linked to a project in the Room. */
export interface LinkedProject {
  projectId: string;
  name: string;
  /** Absolute path of the project folder. */
  root: string;
  /** Base URL of the Room, e.g. http://localhost:3000 */
  server: string;
  token: string;
  linkedAt: string;
}

export const homeDir = () => process.env.GLASSHOUSE_HOME ?? join(homedir(), ".glasshouse");
export const projectsPath = () => join(homeDir(), "projects.json");
export const spoolDir = () => join(homeDir(), "spool");
export const logPath = () => join(homeDir(), "connector.log");

export const normPath = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

export async function readProjects(): Promise<LinkedProject[]> {
  try {
    const parsed = JSON.parse(await readFile(projectsPath(), "utf8")) as { projects?: LinkedProject[] };
    return Array.isArray(parsed.projects) ? parsed.projects : [];
  } catch {
    return [];
  }
}

export async function writeProjects(projects: LinkedProject[]): Promise<void> {
  await mkdir(dirname(projectsPath()), { recursive: true });
  await writeFile(projectsPath(), JSON.stringify({ projects }, null, 2) + "\n", "utf8");
}

/** The linked project whose root contains `cwd` (longest match wins). */
export function findProject(projects: LinkedProject[], cwd: string): LinkedProject | undefined {
  const c = normPath(cwd);
  let best: LinkedProject | undefined;
  for (const p of projects) {
    const r = normPath(p.root);
    if (c === r || c.startsWith(r + "/")) {
      if (!best || r.length > normPath(best.root).length) best = p;
    }
  }
  return best;
}

export async function log(line: string): Promise<void> {
  try {
    await mkdir(homeDir(), { recursive: true });
    await appendFile(logPath(), `${new Date().toISOString()} ${line}\n`, "utf8");
  } catch {
    /* logging must never fail the hook */
  }
}
