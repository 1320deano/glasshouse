import { readAllowed } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Every disliked line for a project, newest first, with the raw action behind it. For the weekly review. */
export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  if (!readAllowed(req)) return Response.json({ error: "not allowed" }, { status: 401 });
  const { projectId } = await params;
  const store = getStore();
  const [items, stats] = await Promise.all([store.listFeedback(projectId), store.getStats(projectId)]);
  return Response.json({ items, events: stats.events, rate: stats.events > 0 ? Math.round((items.length / stats.events) * 10000) / 100 : 0 });
}
