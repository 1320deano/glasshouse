/**
 * The file tree the area map is built from. Paths only, plus the heads of a few manifests.
 * Never file contents: the README head is the one exception and it is scrubbed of anything
 * that looks like a secret.
 */
import type { ManifestHead, ProjectTree } from "@glasshouse/schema";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

export const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
  ".parcel-cache",
  "coverage",
  ".nyc_output",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".venv",
  "venv",
  "env",
  ".tox",
  "target",
  "vendor",
  ".idea",
  ".vscode",
  ".vs",
  ".DS_Store",
  "tmp",
  "temp",
  ".glasshouse",
  ".pnpm-store",
  "bower_components",
  ".gradle",
  ".dart_tool",
  "Pods",
  "DerivedData",
  ".terraform",
]);

const IGNORED_FILES = /\.(log|lock|map|min\.js|min\.css|pyc|class|o|so|dll|exe|zip|tar|gz|7z|rar|png|jpe?g|gif|webp|ico|mp4|mp3|wav|woff2?|ttf|otf|eot|pdf|sqlite|db)$/i;
const MAX_PATHS = 20000;
const MAX_DEPTH = 14;
const SECRET_LINE = /(api[_-]?key|secret|password|token|bearer|sk-[a-z0-9]|ghp_[a-z0-9])/i;

const toSlashes = (p: string) => p.replace(/\\/g, "/");

/** Simple directory names from the root .gitignore (no globs, no negation). */
async function gitignoredDirs(root: string): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const text = await readFile(join(root, ".gitignore"), "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || line.startsWith("!") || /[*?[\]]/.test(line)) continue;
      const name = line.replace(/^\/+/, "").replace(/\/+$/, "");
      if (name && !name.includes("/")) out.add(name);
    }
  } catch {
    /* no .gitignore */
  }
  return out;
}

export interface ScanResult extends ProjectTree {
  /** Milliseconds the scan took; informational. */
  tookMs: number;
}

export async function scanTree(root: string, opts: { now?: () => string } = {}): Promise<ScanResult> {
  const started = Date.now();
  const ignoredDirs = new Set([...IGNORED_DIRS, ...(await gitignoredDirs(root))]);
  const paths: string[] = [];
  let truncated = false;

  async function walk(dir: string, depth: number) {
    if (truncated || depth > MAX_DEPTH) return;
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean }>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)); // byte order: the same on every machine
    for (const entry of entries) {
      if (truncated) return;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) continue;
        await walk(join(dir, entry.name), depth + 1);
      } else if (entry.isFile()) {
        if (IGNORED_FILES.test(entry.name)) continue;
        if (paths.length >= MAX_PATHS) {
          truncated = true;
          return;
        }
        paths.push(toSlashes(relative(root, join(dir, entry.name))));
      }
    }
  }
  await walk(root, 0);

  const manifests = await manifestHeads(root, paths);
  const readmeHead = await readmeHeadFor(root, paths);
  return { paths, truncated, manifests, readmeHead, scannedAt: (opts.now ?? (() => new Date().toISOString()))(), tookMs: Date.now() - started };
}

async function manifestHeads(root: string, paths: string[]): Promise<ManifestHead[]> {
  const heads: ManifestHead[] = [];
  const candidates = paths.filter((p) => /(^|\/)(package\.json|pyproject\.toml|cargo\.toml|go\.mod|composer\.json|gemfile)$/i.test(p)).slice(0, 40);
  for (const p of candidates) {
    try {
      const size = (await stat(join(root, p))).size;
      if (size > 200_000) continue;
      const text = await readFile(join(root, p), "utf8");
      const head = parseManifest(p, text);
      if (head) heads.push(head);
    } catch {
      /* unreadable */
    }
  }
  return heads;
}

export function parseManifest(path: string, text: string): ManifestHead | undefined {
  const base = path.split("/").pop()?.toLowerCase();
  if (base === "package.json") {
    try {
      const pkg = JSON.parse(text) as { name?: unknown; description?: unknown; scripts?: Record<string, unknown>; dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
      return {
        path,
        name: typeof pkg.name === "string" ? pkg.name : undefined,
        description: typeof pkg.description === "string" ? pkg.description.slice(0, 500) : undefined,
        scripts: pkg.scripts ? Object.keys(pkg.scripts).slice(0, 50) : undefined,
        dependencies: [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})].slice(0, 200),
      };
    } catch {
      return { path };
    }
  }
  if (base === "pyproject.toml" || base === "cargo.toml") {
    const name = /^\s*name\s*=\s*"([^"]+)"/m.exec(text)?.[1];
    const description = /^\s*description\s*=\s*"([^"]+)"/m.exec(text)?.[1];
    const deps = [...text.matchAll(/^\s*"?([A-Za-z0-9_.-]+)"?\s*(?:=|>=|~=|==)/gm)].map((m) => m[1]!).filter((d) => !/^(name|version|description|authors|license|readme|requires-python|edition|python|build-backend|requires)$/.test(d));
    return { path, name, description: description?.slice(0, 500), dependencies: [...new Set(deps)].slice(0, 200) };
  }
  if (base === "go.mod") {
    const name = /^module\s+(\S+)/m.exec(text)?.[1];
    const deps = [...text.matchAll(/^\s+(\S+)\s+v[\d.]/gm)].map((m) => m[1]!);
    return { path, name, dependencies: deps.slice(0, 200) };
  }
  return { path };
}

async function readmeHeadFor(root: string, paths: string[]): Promise<string | undefined> {
  const readme = paths.find((p) => /^readme(\.md|\.txt|\.rst)?$/i.test(p));
  if (!readme) return undefined;
  try {
    const text = await readFile(join(root, readme), "utf8");
    return scrubReadme(text);
  } catch {
    return undefined;
  }
}

/** First 40 lines, minus anything that looks like a credential. */
export function scrubReadme(text: string): string {
  return text
    .split(/\r?\n/)
    .slice(0, 40)
    .filter((l) => !SECRET_LINE.test(l))
    .join("\n")
    .trimEnd()
    .slice(0, 2000);
}
