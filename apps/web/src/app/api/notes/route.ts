import { z } from "zod";
import { currentViewer } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const Body = z.object({ note: z.string().trim().min(2).max(2000), page: z.string().max(300), projectId: z.string().max(80).optional() });

/** "Something's wrong": a tester's note with where they were. Read on /admin. */
export async function POST(req: Request) {
  const viewer = await currentViewer();
  if (!viewer) return Response.json({ error: "sign in first" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "write a note of 2 to 2000 characters" }, { status: 400 });
  const note = await getStore().addTesterNote({ userId: viewer.id, email: viewer.email, projectId: parsed.data.projectId, page: parsed.data.page, note: parsed.data.note, userAgent: req.headers.get("user-agent") ?? undefined });
  return Response.json({ ok: true, id: note.id });
}
