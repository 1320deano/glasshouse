import { z } from "zod";
import { readAllowed } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const Body = z.object({ eventId: z.string().min(1), note: z.string().max(500).optional() });

/** Thumbs-down on a plain-English line. Stored with the event behind it so the worst translations can be reviewed. */
export async function POST(req: Request) {
  if (!readAllowed(req)) return Response.json({ error: "not allowed" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid feedback" }, { status: 400 });
  const record = await getStore().addFeedback(parsed.data);
  if (!record) return Response.json({ error: "no such action" }, { status: 404 });
  return Response.json({ ok: true, id: record.id });
}
