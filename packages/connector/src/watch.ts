/**
 * `glasshouse watch`: the one long-running process, and only for the two sources that have no
 * hooks to call us: the project folder (file changes, commits) and Codex's rollout logs.
 *
 * Everything it produces goes through the same spool and flush as the hooks, so the Room cannot
 * tell the difference and nothing is lost when it is down.
 */
import type { NormalisedEvent } from "@glasshouse/schema";
import { toSlashes, watcherCommitEvent, watcherEditEvent } from "@glasshouse/translate";
import { watch as fsWatch, type FSWatcher } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { codexHome, type LinkedProject, log, watchStatePath } from "./config.js";
import { offsetsOf, tailAll, type TailerState } from "./codex-tailer.js";
import { commitsSince, headHash, headLogMtime } from "./git.js";
import { flushSpool, spoolEvent } from "./spool.js";
import { IGNORED_DIRS } from "./tree.js";

export interface WatchState {
  lastCommit: Record<string, string>; // projectId -> hash
  codexOffsets: Record<string, number>;
}

export async function readWatchState(): Promise<WatchState> {
  try {
    const parsed = JSON.parse(await readFile(watchStatePath(), "utf8")) as Partial<WatchState>;
    return { lastCommit: parsed.lastCommit ?? {}, codexOffsets: parsed.codexOffsets ?? {} };
  } catch {
    return { lastCommit: {}, codexOffsets: {} };
  }
}

export async function writeWatchState(state: WatchState): Promise<void> {
  await mkdir(dirname(watchStatePath()), { recursive: true });
  await writeFile(watchStatePath(), JSON.stringify(state, null, 2), "utf8");
}

const IGNORED_FILE = /\.(log|lock|map|tmp|swp|swo|pyc|class|o|so|dll|exe|zip|tar|gz|png|jpe?g|gif|webp|ico|mp4|mp3|woff2?|ttf|sqlite|db)$|~$|^\.#|\.DS_Store$/i;
const DEBOUNCE_MS = 1500;

export function shouldIgnore(relPath: string): boolean {
  const parts = relPath.split("/");
  if (parts.some((p) => IGNORED_DIRS.has(p))) return true;
  const base = parts[parts.length - 1] ?? "";
  return IGNORED_FILE.test(base) || base === "";
}

export interface WatchOptions {
  projects: LinkedProject[];
  fetchImpl?: typeof fetch;
  /** Poll interval for git and Codex logs. */
  intervalMs?: number;
  /** Watch folders too (true), or only poll git and Codex. */
  folders?: boolean;
  codexHomeDir?: string;
  out?: (line: string) => void;
}

export interface WatchHandle {
  /** Run one polling pass now (tests). */
  poll(): Promise<number>;
  stop(): Promise<void>;
}

export async function startWatch(opts: WatchOptions): Promise<WatchHandle> {
  const out = opts.out ?? (() => undefined);
  const intervalMs = opts.intervalMs ?? 5000;
  const state = await readWatchState();
  const tailer: TailerState = { files: new Map() };
  const watchers: FSWatcher[] = [];
  const pending = new Map<string, NodeJS.Timeout>();
  const seenMtimes = new Map<string, number>();
  const lastLogMtime = new Map<string, number>();
  let queue: NormalisedEvent[] = [];
  let stopped = false;

  const enqueue = (e: NormalisedEvent) => {
    queue.push(e);
  };

  async function send(): Promise<number> {
    if (queue.length === 0) return 0;
    const batch = queue;
    queue = [];
    for (const e of batch) await spoolEvent(e);
    const r = await flushSpool({ projects: opts.projects, fetchImpl: opts.fetchImpl });
    if (r.failed > 0) await log(`watch: room unreachable (${r.failed} waiting)`);
    return batch.length;
  }

  // -- folder watcher ------------------------------------------------------------------------
  if (opts.folders !== false) {
    for (const project of opts.projects) {
      try {
        const w = fsWatch(project.root, { recursive: true }, (_type, filename) => {
          if (!filename || stopped) return;
          const rel = toSlashes(String(filename));
          if (shouldIgnore(rel)) return;
          const key = `${project.projectId}|${rel}`;
          const existing = pending.get(key);
          if (existing) clearTimeout(existing);
          pending.set(
            key,
            setTimeout(async () => {
              pending.delete(key);
              const abs = join(project.root, rel);
              let change: "created" | "changed" | "deleted" = "changed";
              try {
                const s = await stat(abs);
                if (!s.isFile()) return;
                const prev = seenMtimes.get(key);
                if (prev !== undefined && prev === s.mtimeMs) return;
                if (prev === undefined && Date.now() - s.birthtimeMs < 10_000) change = "created";
                seenMtimes.set(key, s.mtimeMs);
              } catch {
                if (!seenMtimes.has(key)) return;
                seenMtimes.delete(key);
                change = "deleted";
              }
              enqueue(watcherEditEvent({ projectId: project.projectId, path: rel, change, ts: new Date().toISOString() }));
              out(`${project.name}: ${change} ${rel}`);
              void send();
            }, DEBOUNCE_MS),
          );
        });
        w.on("error", (err) => void log(`watch: folder watcher error for ${project.root}: ${String(err)}`));
        watchers.push(w);
        out(`Watching ${project.root}`);
      } catch (err) {
        await log(`watch: could not watch ${project.root}: ${String(err)}`);
      }
    }
  }

  // -- git + codex polling -------------------------------------------------------------------
  async function pollGit(project: LinkedProject) {
    const mtime = await headLogMtime(project.root);
    if (mtime === undefined) return;
    const previous = lastLogMtime.get(project.projectId);
    if (previous !== undefined && previous === mtime) return;
    lastLogMtime.set(project.projectId, mtime);
    const head = await headHash(project.root);
    if (!head) return;
    const last = state.lastCommit[project.projectId];
    if (last === head) return;
    const commits = await commitsSince(project.root, last, last ? 50 : 1);
    for (const c of commits) {
      enqueue(
        watcherCommitEvent({
          projectId: project.projectId,
          hash: c.hash,
          message: c.message,
          paths: c.files.map((f) => toSlashes(f)),
          author: c.author,
          ts: c.date && !Number.isNaN(Date.parse(c.date)) ? new Date(c.date).toISOString() : new Date().toISOString(),
        }),
      );
      out(`${project.name}: commit ${c.hash.slice(0, 7)} ${c.message.split("\n")[0] ?? ""}`);
    }
    state.lastCommit[project.projectId] = head;
  }

  async function poll(): Promise<number> {
    if (stopped) return 0;
    for (const p of opts.projects) {
      try {
        await pollGit(p);
      } catch (err) {
        await log(`watch: git poll failed for ${p.root}: ${String(err)}`);
      }
    }
    try {
      const events = await tailAll(opts.codexHomeDir ?? codexHome(), tailer, { projects: opts.projects, savedOffsets: state.codexOffsets });
      for (const e of events) {
        enqueue(e);
        out(`codex: ${e.summary}`);
      }
      state.codexOffsets = { ...state.codexOffsets, ...offsetsOf(tailer) };
    } catch (err) {
      await log(`watch: codex tail failed: ${String(err)}`);
    }
    const sent = await send();
    await writeWatchState(state).catch(() => undefined);
    return sent;
  }

  const timer = setInterval(() => void poll(), intervalMs);
  await poll();

  return {
    poll,
    async stop() {
      stopped = true;
      clearInterval(timer);
      for (const t of pending.values()) clearTimeout(t);
      for (const w of watchers) w.close();
      await send();
      await writeWatchState(state).catch(() => undefined);
    },
  };
}
