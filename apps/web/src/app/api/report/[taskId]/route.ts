import { readAllowed } from "@/lib/auth";
import { writeReportWithAI } from "@/lib/ai/report";
import { aiEnabled } from "@/lib/ai/client";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The report card for one finished task: the stored words plus facts recomputed against the current map. */
export async function GET(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  if (!readAllowed(req)) return Response.json({ error: "not allowed" }, { status: 401 });
  const { taskId } = await params;
  const task = await getStore().getTask(taskId);
  if (!task) return Response.json({ error: "no such task" }, { status: 404 });
  if (!task.report) return Response.json({ error: "this task has not finished yet", stage: task.stage }, { status: 404 });
  return Response.json({ report: task.report, task: { id: task.id, tool: task.tool, headline: task.headline, prompt: task.prompt, endedAt: task.endedAt, areas: task.areas } });
}

/** Ask for the AI words again (after adding a key, or when the first attempt failed). */
export async function POST(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  if (!readAllowed(req)) return Response.json({ error: "not allowed" }, { status: 401 });
  const { taskId } = await params;
  if (!aiEnabled()) return Response.json({ error: "AI is not configured; the card keeps its template words" }, { status: 409 });
  const written = await writeReportWithAI(taskId);
  const task = await getStore().getTask(taskId);
  return Response.json({ rewritten: Boolean(written), report: task?.report ?? null });
}
