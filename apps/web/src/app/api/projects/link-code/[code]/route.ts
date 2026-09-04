import { currentViewer } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The connect page polls this until the connector has used the code. */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const viewer = await currentViewer();
  if (!viewer) return Response.json({ error: "sign in first" }, { status: 401 });
  const { code } = await params;
  const row = await getStore().getLinkCode(code);
  if (!row || row.ownerId !== viewer.id) return Response.json({ error: "no such code" }, { status: 404 });
  const project = row.projectId ? await getStore().getProject(row.projectId) : null;
  return Response.json({ used: Boolean(row.usedAt), expired: row.expiresAt < new Date().toISOString(), project: project ? { id: project.id, name: project.name } : null });
}
