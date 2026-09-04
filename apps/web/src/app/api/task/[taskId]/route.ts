import { canReadTask } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Everything the expanded tile needs for one task: the full stream, why, where, what changed. */
export async function GET(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  if (!(await canReadTask(req, taskId))) return Response.json({ error: "not allowed" }, { status: 401 });
  const task = await getStore().getTask(taskId);
  if (!task) return Response.json({ error: "no such task" }, { status: 404 });
  return Response.json(task);
}
