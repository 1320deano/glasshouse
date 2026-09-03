/**
 * In-process notifications from the ingest route to open Room pages (server-sent events).
 * Single-server only. Phase 4 replaces this with Supabase Realtime once sign-in exists.
 */
export interface RoomNotice {
  projectId: string;
  at: string;
  inserted: number;
}

type Listener = (n: RoomNotice) => void;

declare global {
  var __glasshouseBus: Set<Listener> | undefined;
}

function bus(): Set<Listener> {
  if (!globalThis.__glasshouseBus) globalThis.__glasshouseBus = new Set();
  return globalThis.__glasshouseBus;
}

export function publish(n: RoomNotice) {
  for (const l of bus()) {
    try {
      l(n);
    } catch {
      /* a dead listener must not break ingest */
    }
  }
}

export function subscribe(l: Listener): () => void {
  bus().add(l);
  return () => bus().delete(l);
}
