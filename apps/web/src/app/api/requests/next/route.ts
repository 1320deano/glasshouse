import { projectFromRequest } from "@/lib/auth";
import { waitForRequestChange, waitSeconds } from "@/lib/requests/server";
import { REQUEST_QUEUE_MAX_MS } from "@/lib/requests/view";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * The connector asks for the next thing the owner wants run (Phase 8). Project token only. With
 * `?wait=20` the reply is held until a request arrives or the seconds pass, so the connector can
 * ask again straight away without hammering. Asking at all marks the owner's computer as listening.
 */
export async function GET(req: Request) {
  const project = await projectFromRequest(req);
  if (!project) return Response.json({ error: "unknown project token" }, { status: 401 });
  const store = getStore();
  await store.markListening(project.id, new Date().toISOString());
  let request = await store.nextRequest(project.id, new Date().toISOString(), REQUEST_QUEUE_MAX_MS);
  const wait = waitSeconds(req);
  if (!request && wait > 0) {
    await waitForRequestChange(project.id, wait, req.signal);
    if (req.signal.aborted) return new Response(null, { status: 499 });
    request = await store.nextRequest(project.id, new Date().toISOString(), REQUEST_QUEUE_MAX_MS);
  }
  await store.markListening(project.id, new Date().toISOString());
  return Response.json({ request });
}
