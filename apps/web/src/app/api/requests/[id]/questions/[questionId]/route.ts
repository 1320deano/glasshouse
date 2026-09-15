import { projectFromRequest } from "@/lib/auth";
import { requestOfProject, waitForRequestChange, waitSeconds } from "@/lib/requests/server";

export const dynamic = "force-dynamic";

/** The tool waits for the owner's answer. With `?wait=20` the reply is held until it arrives or the seconds pass. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; questionId: string }> }) {
  const { id, questionId } = await params;
  const project = await projectFromRequest(req);
  if (!project) return Response.json({ error: "unknown project token" }, { status: 401 });
  const find = async () => (await requestOfProject(id, project.id))?.questions.find((q) => q.id === questionId) ?? null;
  let question = await find();
  if (!question) return Response.json({ error: "no such question" }, { status: 404 });
  const wait = waitSeconds(req);
  if (!question.answer && wait > 0) {
    await waitForRequestChange(project.id, wait, req.signal);
    if (req.signal.aborted) return new Response(null, { status: 499 });
    question = await find();
  }
  return Response.json({ question });
}
