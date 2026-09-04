/**
 * Small authenticated calls from the connector to the Room, other than event batches:
 * sending the file tree for the area map.
 */
import type { ProjectTree } from "@glasshouse/schema";
import type { LinkedProject } from "./config.js";

export interface TreeUploadResult {
  ok: boolean;
  status: number;
  /** What the Room did with it. */
  body?: { areas?: number; refreshed?: boolean; source?: string; error?: string };
}

export async function sendTree(project: LinkedProject, tree: ProjectTree, fetchImpl: typeof fetch = fetch, timeoutMs = 20000): Promise<TreeUploadResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${project.server.replace(/\/+$/, "")}/api/projects/tree`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${project.token}` },
      body: JSON.stringify(tree),
      signal: ctrl.signal,
    });
    const body = (await res.json().catch(() => undefined)) as TreeUploadResult["body"];
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}
