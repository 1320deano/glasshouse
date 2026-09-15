import { projectFromRequest } from "@/lib/auth";
import { requestMoved, requestOfProject } from "@/lib/requests/server";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The connector claims a queued request before running it: only one computer ever runs it. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await projectFromRequest(req);
  if (!project) return Response.json({ error: "unknown project token" }, { status: 401 });
  if (!(await requestOfProject(id, project.id))) return Response.json({ error: "no such request" }, { status: 404 });
  const taken = await getStore().takeRequest(id, new Date().toISOString());
  if (!taken) return Response.json({ error: "already taken, or taken back" }, { status: 409 });
  requestMoved(project.id);
  return Response.json({ request: taken });
}
