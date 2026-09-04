/**
 * The Room as one person sees it: the store's view with their plan applied. Shared by the page
 * and the API route so the gate is identical on first paint and on every refresh.
 */
import { gateRoom, type GatedRoom } from "./plan";
import { getStore } from "./store";
import type { Viewer } from "./auth";

const SEEN_THROTTLE_MS = 10 * 60 * 1000;

export async function roomForViewer(projectId: string, viewer: Viewer): Promise<GatedRoom | null> {
  const store = getStore();
  const room = await store.getRoom(projectId);
  if (!room) return null;
  if (!viewer.local && viewer.id !== "setup") {
    const profile = await store.getProfile(viewer.id);
    const last = profile?.lastSeenAt ? new Date(profile.lastSeenAt).getTime() : 0;
    if (Date.now() - last > SEEN_THROTTLE_MS) void store.upsertProfile({ userId: viewer.id, lastSeenAt: new Date().toISOString() }).catch(() => undefined);
  }
  return gateRoom(room, viewer.plan, room.generatedAt);
}
