import { canReadProject } from "@/lib/auth";
import { roomForViewer } from "@/lib/room";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const viewer = await canReadProject(req, projectId);
  if (!viewer) return Response.json({ error: "not allowed" }, { status: 401 });
  const gated = await roomForViewer(projectId, viewer);
  if (!gated) return Response.json({ error: "no such project" }, { status: 404 });
  return Response.json(gated);
}
