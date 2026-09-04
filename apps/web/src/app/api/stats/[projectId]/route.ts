import { canReadProject } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Counts and hook-to-server latency. The numbers behind "is this fast enough to feel live?". */
export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!(await canReadProject(req, projectId))) return Response.json({ error: "not allowed" }, { status: 401 });
  return Response.json(await getStore().getStats(projectId));
}
