/**
 * `glasshouse helpers`: put the helpers grown in the Potting Shed into this folder.
 *
 * Pulls every helper of the linked project as ready-made files and writes them:
 *   .claude/agents/<slug>.md     Claude Code sub-agents (one file each)
 *   .cursor/rules/<slug>.mdc     Cursor rules (one file each)
 *   AGENTS.md                    Codex: one marked section per helper, merged into whatever is there
 * Files written on an earlier pull for helpers that no longer exist are removed; nothing else in
 * the folder is touched. The owner runs this by hand: the Shed never writes into a folder itself.
 */
import { mergeSection, removeSection, sectionSlugs, type CompiledFile } from "@glasshouse/translate";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homeDir, type LinkedProject } from "./config.js";

export interface PulledHelper {
  id: string;
  slug: string;
  name: string;
  tools: string[];
  updatedAt: string;
  files: CompiledFile[];
}

export interface PullResult {
  ok: boolean;
  status: number;
  body?: { project?: { id: string; name: string }; helpers?: PulledHelper[]; error?: string };
}

export async function pullHelpers(project: LinkedProject, fetchImpl: typeof fetch = fetch, timeoutMs = 20000): Promise<PullResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${project.server.replace(/\/+$/, "")}/api/shed/pull`, { headers: { authorization: `Bearer ${project.token}` }, signal: ctrl.signal });
    const body = (await res.json().catch(() => undefined)) as PullResult["body"];
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

export async function reportPlaced(project: LinkedProject, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(`${project.server.replace(/\/+$/, "")}/api/shed/pull`, { method: "POST", headers: { authorization: `Bearer ${project.token}` } });
    return res.ok;
  } catch {
    return false;
  }
}

/** Which files this command wrote last time, per project, so a deleted helper's files can be taken away again. */
export const helpersStatePath = () => join(homeDir(), "helpers-state.json");
type HelpersState = Record<string, { files: string[]; sections: string[] }>;

async function readState(path: string): Promise<HelpersState> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as HelpersState;
  } catch {
    return {};
  }
}

export interface PlaceResult {
  written: string[];
  removed: string[];
  /** AGENTS.md sections rewritten. */
  sections: string[];
}

/** Write the pulled helpers into `root`. Pure file work; no network. */
export async function placeHelpers(root: string, projectId: string, helpers: PulledHelper[], statePath = helpersStatePath()): Promise<PlaceResult> {
  const state = await readState(statePath);
  const before = state[projectId] ?? { files: [], sections: [] };
  const written: string[] = [];
  const sections: string[] = [];
  const removed: string[] = [];

  const wholeFiles = helpers.flatMap((h) => h.files.filter((f) => f.mode === "file"));
  for (const f of wholeFiles) {
    const abs = join(root, f.path);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, f.body.endsWith("\n") ? f.body : `${f.body}\n`, "utf8");
    written.push(f.path);
  }

  // Codex: merge every section into AGENTS.md, then drop sections for helpers that are gone.
  const sectionFiles = helpers.flatMap((h) => h.files.filter((f) => f.mode === "section"));
  const wantSlugs = new Set(helpers.filter((h) => h.files.some((f) => f.mode === "section")).map((h) => h.slug));
  const agentsPath = join(root, "AGENTS.md");
  if (sectionFiles.length > 0 || before.sections.length > 0) {
    let text = await readFile(agentsPath, "utf8").catch(() => "");
    const had = text.length > 0;
    for (const f of sectionFiles) text = mergeSection(text, f);
    for (const slug of sectionSlugs(text)) if (!wantSlugs.has(slug) && before.sections.includes(slug)) text = removeSection(text, slug);
    if (text.trim().length > 0) {
      await writeFile(agentsPath, text.endsWith("\n") ? text : `${text}\n`, "utf8");
      if (sectionFiles.length > 0) sections.push(...[...wantSlugs]);
    } else if (had) await rm(agentsPath, { force: true });
  }

  // Files from an earlier pull whose helper no longer exists.
  const keep = new Set(written);
  for (const path of before.files) {
    if (keep.has(path)) continue;
    await rm(join(root, path), { force: true }).catch(() => undefined);
    removed.push(path);
  }

  state[projectId] = { files: written, sections: [...wantSlugs] };
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
  return { written, removed, sections };
}
