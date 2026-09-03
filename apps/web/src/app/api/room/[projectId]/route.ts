import { readAllowed } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  if (!readAllowed(req)) return Response.json({ error: "not allowed" }, { status: 401 });
  const { projectId } = await params;
  const room = await getStore().getRoom(projectId);
  if (!room) return Response.json({ error: "no such project" }, { status: 404 });
  return Response.json(room);
}
