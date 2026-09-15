/**
 * The server's side of a request (Phase 8): the one place that knows which route may change
 * which field, how long the connector may wait, and how the Room is told something moved.
 */
import { publish, subscribe } from "@/lib/bus";
import { getStore } from "@/lib/store";
import type { RequestRecord } from "@/lib/store/types";

/** How long a connector (or the permission tool) may hold a poll open before asking again. */
export const LONG_POLL_MAX_S = 25;

export function requestMoved(projectId: string) {
  publish({ projectId, at: new Date().toISOString(), inserted: 0, kind: "request" });
}

/** Wait until something about this project's requests changes, `seconds` pass, or the caller goes away. */
export function waitForRequestChange(projectId: string, seconds: number, signal: AbortSignal): Promise<void> {
  const ms = Math.max(0, Math.min(seconds, LONG_POLL_MAX_S)) * 1000;
  if (ms === 0 || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsubscribe();
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const unsubscribe = subscribe((n) => {
      if (n.projectId === projectId && n.kind === "request") finish();
    });
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish);
  });
}

/** The request, when it belongs to the project the token opened. */
export async function requestOfProject(id: string, projectId: string): Promise<RequestRecord | null> {
  const r = await getStore().getRequest(id);
  return r && r.projectId === projectId ? r : null;
}

export function waitSeconds(req: Request): number {
  const raw = Number(new URL(req.url).searchParams.get("wait") ?? "0");
  return Number.isFinite(raw) ? Math.max(0, Math.min(raw, LONG_POLL_MAX_S)) : 0;
}
