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
 */
export function getStore(): Store {
  if (globalThis.__glasshouseStore) return globalThis.__glasshouseStore;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const store: Store =
    url && key
      ? new SupabaseStore(url, key)
      : new MemoryStore({ persistPath: process.env.GLASSHOUSE_LOCAL_STORE ?? join(homedir(), ".glasshouse", "local-store.json") });
  globalThis.__glasshouseStore = store;
  return store;
}

export type { EventView, RoomState, SessionView, Stats, Store, TaskView } from "./types";
