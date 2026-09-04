/**
 * Tails Codex rollout logs (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`) and turns new lines
 * into events for the project the session runs in. Needs no trust step and is the only place a
 * Codex usage limit is visible (docs/hooks-codex-cursor.md).
 *
 * Each file keeps a byte offset (persisted) and a reducer state (rebuilt silently on restart by
 * replaying the file up to the offset), so nothing is sent twice. Event ids are derived from the
 * file and line number, so even a crash between "sent" and "offset saved" cannot duplicate.
 */
import type { NormalisedEvent } from "@glasshouse/schema";
import { createRolloutState, normaliseCodexRollout, type RolloutState } from "@glasshouse/translate";
import { createHash } from "node:crypto";
import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { findProject, type LinkedProject } from "./config.js";

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => typeof v === "object" && v !== null && !Array.isArray(v);

export interface TailedFile {
  offset: number;
  lines: number;
  /** Set once the session_meta line named a folder that is not linked. */
  ignored?: boolean;
  state: RolloutState;
  project?: LinkedProject;
  remainder: string;
}

export interface TailerState {
  files: Map<string, TailedFile>;
}

export const RECENT_MS = 36 * 60 * 60 * 1000;

/** A stable UUID-shaped id for line N of a file. */
export function lineId(file: string, line: number): string {
  const h = createHash("sha1").update(`${file}\n${line}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** rollout-*.jsonl files under sessions/, modified recently. archived_sessions is left alone. */
export async function findRolloutFiles(codexHome: string, now = Date.now()): Promise<string[]> {
  const root = join(codexHome, "sessions");
  const out: string[] = [];
  async function walk(dir: string, depth: number) {
    if (depth > 4) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p, depth + 1);
      else if (e.isFile() && /^rollout-.*\.jsonl$/.test(e.name)) {
        try {
          if (now - (await stat(p)).mtimeMs <= RECENT_MS) out.push(p);
        } catch {
          /* vanished */
        }
      }
    }
  }
  await walk(root, 0);
  return out.sort();
}

async function readFrom(path: string, offset: number): Promise<{ text: string; end: number }> {
  const fh = await open(path, "r");
  try {
    const size = (await fh.stat()).size;
    if (size <= offset) return { text: "", end: size };
    const buf = Buffer.alloc(Math.min(size - offset, 8 * 1024 * 1024));
    const { bytesRead } = await fh.read(buf, 0, buf.length, offset);
    return { text: buf.subarray(0, bytesRead).toString("utf8"), end: offset + bytesRead };
  } finally {
    await fh.close();
  }
}

export interface TailOptions {
  projects: LinkedProject[];
  /** Persisted offsets from a previous run: path -> byte offset. */
  savedOffsets?: Record<string, number>;
  now?: () => string;
}

/**
 * Feed a line to a file's reducer. The first line (session_meta) decides the project; until it is
 * known, nothing can be emitted.
 */
function feedLine(path: string, tf: TailedFile, rawLine: string, opts: TailOptions, silent: boolean): NormalisedEvent | null {
  tf.lines++;
  let line: unknown;
  try {
    line = JSON.parse(rawLine);
  } catch {
    return null;
  }
  if (!tf.project && isDict(line) && line.type === "session_meta" && isDict(line.payload)) {
    const cwd = typeof line.payload.cwd === "string" ? line.payload.cwd : undefined;
    tf.project = cwd ? findProject(opts.projects, cwd) : undefined;
    if (!tf.project) tf.ignored = true;
  }
  if (!tf.project) return null;
  const lineNo = tf.lines;
  const event = normaliseCodexRollout(line, tf.state, {
    projectId: tf.project.projectId,
    projectRoot: tf.project.root,
    makeId: () => lineId(path, lineNo),
    now: opts.now,
  });
  return silent ? null : event;
}

/** Read everything new in one file. Returns the events to send. */
export async function tailFile(path: string, tailer: TailerState, opts: TailOptions): Promise<NormalisedEvent[]> {
  let tf = tailer.files.get(path);
  const events: NormalisedEvent[] = [];
  if (!tf) {
    tf = { offset: 0, lines: 0, state: createRolloutState(), remainder: "" };
    tailer.files.set(path, tf);
    const saved = opts.savedOffsets?.[path];
    if (saved && saved > 0) {
      // Rebuild the reducer state without re-sending anything.
      const { text, end } = await readFrom(path, 0);
      const upto = text.slice(0, Math.min(saved, text.length));
      const lines = upto.split("\n");
      tf.remainder = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) feedLine(path, tf, l, opts, true);
      tf.offset = Math.min(saved, end);
      if (tf.remainder) tf.offset -= Buffer.byteLength(tf.remainder, "utf8");
      tf.remainder = "";
    }
  }
  if (tf.ignored) return events;

  const { text, end } = await readFrom(path, tf.offset);
  if (!text) return events;
  const chunk = tf.remainder + text;
  const lines = chunk.split("\n");
  const partial = lines.pop() ?? "";
  for (const l of lines) {
    if (!l.trim()) continue;
    const e = feedLine(path, tf, l, opts, false);
    if (e) events.push(e);
    if (tf.ignored) break;
  }
  tf.remainder = partial;
  tf.offset = end - Buffer.byteLength(partial, "utf8");
  return events;
}

/** One pass over every recent rollout file. */
export async function tailAll(codexHome: string, tailer: TailerState, opts: TailOptions): Promise<NormalisedEvent[]> {
  const events: NormalisedEvent[] = [];
  for (const path of await findRolloutFiles(codexHome)) {
    try {
      events.push(...(await tailFile(path, tailer, opts)));
    } catch {
      /* unreadable right now; next pass */
    }
  }
  return events;
}

export function offsetsOf(tailer: TailerState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [path, tf] of tailer.files) out[path] = tf.offset;
  return out;
}
