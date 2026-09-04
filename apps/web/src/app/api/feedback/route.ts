import { z } from "zod";
import { canReadProject } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const Body = z.object({ eventId: z.string().min(1), projectId: z.string().min(1), note: z.string().max(500).optional() });

/** Thumbs-down on a plain-English line. Stored with the event behind it so the worst translations can be reviewed. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid feedback" }, { status: 400 });
  if (!(await canReadProject(req, parsed.data.projectId))) return Response.json({ error: "not allowed" }, { status: 401 });
  const record = await getStore().addFeedback(parsed.data);
  if (!record) return Response.json({ error: "no such action" }, { status: 404 });
  return Response.json({ ok: true, id: record.id });
}
