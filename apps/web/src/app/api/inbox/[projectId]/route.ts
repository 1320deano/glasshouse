import { z } from "zod";
import { readAllowed } from "@/lib/auth";
import { publish } from "@/lib/bus";
import { getStore } from "@/lib/store";
import { inboxItemFrom } from "@/lib/store/derive";
import type { InboxItem } from "@/lib/store/types";

export const dynamic = "force-dynamic";

const INBOX_DAYS = 30;

/** Everything flagged Review recommended, Decision needed or Blocked, in one list, until the owner clears it. */
export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  if (!readAllowed(req)) return Response.json({ error: "not allowed" }, { status: 401 });
  const { projectId } = await params;
  const store = getStore();
  if (!(await store.getProject(projectId))) return Response.json({ error: "no such project" }, { status: 404 });
  const since = new Date(Date.now() - INBOX_DAYS * 24 * 3600 * 1000).toISOString();
  const tasks = await store.listTasks(projectId, { since, limit: 500 });
  const items = tasks.map(inboxItemFrom).filter((i): i is InboxItem => i !== null);
  const order = { blocked: 0, decision: 1, review: 2, nothing: 3 } as const;
  const open = items.filter((i) => !i.resolvedAt).sort((a, b) => order[a.status] - order[b.status] || (b.endedAt ?? "").localeCompare(a.endedAt ?? ""));
  const cleared = items.filter((i) => i.resolvedAt).sort((a, b) => b.resolvedAt!.localeCompare(a.resolvedAt!)).slice(0, 30);
  return Response.json({ open, cleared, days: INBOX_DAYS });
}

const Action = z.object({ taskId: z.string().min(1), action: z.enum(["clear", "reopen"]) });

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  if (!readAllowed(req)) return Response.json({ error: "not allowed" }, { status: 401 });
  const { projectId } = await params;
  const parsed = Action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid action" }, { status: 400 });
  const store = getStore();
  const report = await store.getReport(parsed.data.taskId);
  if (!report || report.projectId !== projectId) return Response.json({ error: "no such report" }, { status: 404 });
  await store.setReportResolved(parsed.data.taskId, parsed.data.action === "clear");
  publish({ projectId, at: new Date().toISOString(), inserted: 0 });
  return Response.json({ ok: true, resolved: parsed.data.action === "clear" });
}
