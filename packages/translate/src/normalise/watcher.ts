/**
 * Folder and git watcher -> NormalisedEvent. The basic fallback for tools without hooks:
 * file changes become `edit` events and commits become `commit` events. No why, no stage
 * beyond Building, a slower ticker.
 *
 * One watcher session per project per day, so the Room shows one "Folder watcher" tile that
 * quietly accumulates rather than a new tile per save.
 */
import type { NormalisedEvent } from "@glasshouse/schema";

export type WatcherChange = "created" | "changed" | "deleted";

const day = (iso: string) => iso.slice(0, 10);

export const watcherSessionId = (ts: string) => `watch-${day(ts)}`;
export const watcherTaskKey = (ts: string) => `watch-${day(ts)}`;

export interface WatcherEditInput {
  projectId: string;
  /** Relative path, forward slashes. */
  path: string;
  change: WatcherChange;
  ts: string;
  makeId?: () => string;
}

export function watcherEditEvent(input: WatcherEditInput): NormalisedEvent {
  const verb = input.change === "created" ? "Created" : input.change === "deleted" ? "Deleted" : "Changed";
  return {
    id: (input.makeId ?? (() => globalThis.crypto.randomUUID()))(),
    projectId: input.projectId,
    sessionId: watcherSessionId(input.ts),
    taskKey: watcherTaskKey(input.ts),
    tool: "watcher",
    kind: "edit",
    ts: input.ts,
    paths: [input.path],
    summary: `${verb} ${input.path}`,
    sourceEvent: "fs.watch",
    sourceTool: "folder watcher",
    raw: { path: input.path, change: input.change },
  };
}

export interface WatcherCommitInput {
  projectId: string;
  hash: string;
  message: string;
  paths: string[];
  author?: string;
  ts: string;
  makeId?: () => string;
}

export function watcherCommitEvent(input: WatcherCommitInput): NormalisedEvent {
  const first = input.message.split(/\r?\n/)[0]?.trim() ?? "";
  return {
    id: (input.makeId ?? (() => globalThis.crypto.randomUUID()))(),
    projectId: input.projectId,
    sessionId: watcherSessionId(input.ts),
    taskKey: watcherTaskKey(input.ts),
    tool: "watcher",
    kind: "commit",
    ts: input.ts,
    paths: input.paths,
    text: input.message.slice(0, 2000),
    summary: `Committed: ${first.slice(0, 120) || input.hash.slice(0, 7)}`,
    sourceEvent: "git.commit",
    sourceTool: "git",
    raw: { hash: input.hash, author: input.author, files: input.paths.slice(0, 200), message: input.message.slice(0, 2000) },
  };
}
