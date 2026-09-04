/**
 * What runs after an ingest or a tree upload, in the background of the same server process.
 * All of it is optional polish: the Room is already correct from templates before any of this.
 */
import type { ProjectTree } from "@glasshouse/schema";
import { publish } from "@/lib/bus";
import { getStore } from "@/lib/store";
import type { IngestResult } from "@/lib/store/types";
import { buildAreaMapWithAI } from "./area-map";
import { aiEnabled } from "./client";
import { describeFiles } from "./file-descriptions";
import { requestHeadline } from "./headline";
import { writeReportWithAI } from "./report";

export function afterIngest(projectId: string, result: IngestResult): void {
  if (!aiEnabled()) return;
  for (const r of result.headlineRequests) void requestHeadline(r.taskId, r.trigger).catch((err) => console.error("[glasshouse] headline worker:", err));
  if (result.undescribedPaths.length > 0) void describeFiles(projectId, result.undescribedPaths).catch((err) => console.error("[glasshouse] description worker:", err));
  // The template card is already saved; one strong call per finished task improves its words.
  for (const taskId of result.finishedTasks) void writeReportWithAI(taskId).catch((err) => console.error("[glasshouse] report worker:", err));
}

const refreshing = new Set<string>();

/** Rebuild the area map with AI and publish. Returns the new map, or null when AI is off, busy or failed. */
export async function refreshAreaMapWithAI(projectId: string, tree: ProjectTree) {
  if (!aiEnabled() || refreshing.has(projectId)) return null;
  refreshing.add(projectId);
  try {
    const store = getStore();
    const existing = await store.getAreaMap(projectId);
    const map = await buildAreaMapWithAI(projectId, tree, existing);
    if (!map) return null;
    await store.saveAreaMap(projectId, map);
    publish({ projectId, at: new Date().toISOString(), inserted: 0 });
    return map;
  } catch (err) {
    console.error("[glasshouse] area map worker:", err);
    return null;
  } finally {
    refreshing.delete(projectId);
  }
}
