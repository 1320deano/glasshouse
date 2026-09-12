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
 * A cached store is only reused while it is an instance of the classes this module currently holds.
 * When the store code itself changes, development hot-reload gives us new classes, and the old
 * instance would be missing whatever the change added: `instanceof` catches that and rebuilds,
 * instead of leaving the server with a store from before the change.
 */
export function getStore(): Store {
  const cached = globalThis.__glasshouseStore;
  if (cached && (cached instanceof SupabaseStore || cached instanceof MemoryStore)) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const store: Store =
    url && key
      ? new SupabaseStore(url, key)
      : new MemoryStore({ persistPath: process.env.GLASSHOUSE_LOCAL_STORE ?? join(homedir(), ".glasshouse", "local-store.json") });
  globalThis.__glasshouseStore = store;
  return store;
}

export type { AiCallLog, AreaTouched, ChangeLine, EventView, HelperBrief, HelperRecord, HelperRun, IngestResult, RoomState, SessionView, Stats, Store, TaskDetail, TaskView, ViewDepth } from "./types";
