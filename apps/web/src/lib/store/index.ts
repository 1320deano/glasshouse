import { homedir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "./memory";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

declare global {
  var __glasshouseStore: Store | undefined;
}

/**
 * One store per server process. Supabase when credentials are configured, otherwise the local
 * file-backed store. Kept on globalThis so Next.js hot reloads do not create a second one.
 *
 * A cached store is reused while it still does everything the current store code can do. The
 * check is by method names, not by class identity: in development each route is bundled with its
 * own copy of these classes, and a route compiled later would fail an `instanceof` check against
 * the store the earlier routes hold, build a second store from the same file, and the two would
 * then take turns overwriting each other's saves (an answer written by one route vanished under
 * the next save from another). When a code change adds a method the cached store lacks, it is
 * rebuilt, which is what a hot reload of the store code needs.
 */
export function getStore(): Store {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cached = globalThis.__glasshouseStore;
  if (cached && hasEveryMethod(cached)) return cached;
  const store: Store = url && key ? new SupabaseStore(url, key) : new MemoryStore({ persistPath: process.env.GLASSHOUSE_LOCAL_STORE ?? join(homedir(), ".glasshouse", "local-store.json") });
  globalThis.__glasshouseStore = store;
  return store;
}

/** The methods every store must have: the ones both store classes define (their own private helpers differ). */
function storeMethods(): string[] {
  const names = (cls: { prototype: object }) =>
    Object.getOwnPropertyNames(cls.prototype).filter((name) => name !== "constructor" && typeof Object.getOwnPropertyDescriptor(cls.prototype, name)?.value === "function");
  const supabase = new Set(names(SupabaseStore));
  return names(MemoryStore).filter((name) => supabase.has(name));
}

function hasEveryMethod(candidate: Store): boolean {
  const object = candidate as unknown as Record<string, unknown>;
  return storeMethods().every((name) => typeof object[name] === "function");
}

export type { AiCallLog, AreaTouched, ChangeLine, EventView, HelperBrief, HelperRecord, HelperRun, IngestResult, RoomState, SessionView, Stats, Store, TaskDetail, TaskView, ViewDepth } from "./types";
