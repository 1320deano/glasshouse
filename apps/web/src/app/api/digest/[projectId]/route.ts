import { digestFor } from "@/lib/ai/digest";
import { readAllowed } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const KINDS = new Set(["since-checked", "today", "week"]);

/** The digest for a window: ?window=since-checked (default) | today | week. */
export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  if (!readAllowed(req)) return Response.json({ error: "not allowed" }, { status: 401 });
  const { projectId } = await params;
  const kind = new URL(req.url).searchParams.get("window") ?? "since-checked";
  if (!KINDS.has(kind)) return Response.json({ error: "window must be since-checked, today or week" }, { status: 400 });
  const digest = await digestFor(projectId, kind as "since-checked" | "today" | "week");
  if (!digest) return Response.json({ error: "no such project" }, { status: 404 });
  return Response.json({ digest, lastCheckedAt: await getStore().getLastChecked(projectId) });
}

/** The owner has read the digest: the next "since you last checked" starts now. */
export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  if (!readAllowed(req)) return Response.json({ error: "not allowed" }, { status: 401 });
  const { projectId } = await params;
  const store = getStore();
  if (!(await store.getProject(projectId))) return Response.json({ error: "no such project" }, { status: 404 });
  const at = new Date().toISOString();
  await store.markChecked(projectId, at);
  return Response.json({ ok: true, lastCheckedAt: at });
}
