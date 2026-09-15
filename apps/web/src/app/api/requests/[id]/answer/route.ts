import { z } from "zod";
import { canReadProject } from "@/lib/auth";
import { requestMoved } from "@/lib/requests/server";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const Body = z.union([
  z.object({ questionId: z.string().min(1), allow: z.boolean(), answers: z.record(z.string().max(2000)).optional() }),
  z.object({ withdraw: z.literal(true) }),
]);

/** The owner answers a question the tool asked, or takes a request back before it was picked up. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid answer" }, { status: 400 });
  const store = getStore();
  const request = await store.getRequest(id);
  if (!request) return Response.json({ error: "no such request" }, { status: 404 });
  const viewer = await canReadProject(req, request.projectId);
  if (!viewer) return Response.json({ error: "not allowed" }, { status: 401 });
  const now = new Date().toISOString();
  if ("withdraw" in parsed.data) {
    const withdrawn = await store.withdrawRequest(id, now);
    if (!withdrawn) return Response.json({ error: "Too late: your computer has already picked it up." }, { status: 409 });
    requestMoved(request.projectId);
    return Response.json({ request: withdrawn });
  }
  const question = await store.answerQuestion(id, parsed.data.questionId, { allow: parsed.data.allow, answers: parsed.data.answers, at: now, by: viewer.email ?? viewer.id });
  if (!question) return Response.json({ error: "no such question" }, { status: 404 });
  requestMoved(request.projectId);
  return Response.json({ question });
}
