import { z } from "zod";
import { askAboutTask } from "@/lib/ai/ask";
import { readAllowed } from "@/lib/auth";

export const dynamic = "force-dynamic";

const Body = z.object({ taskId: z.string().min(1), question: z.string().trim().min(2).max(600) });

/** Ask about one task. The answer is grounded in that task's record and names the actions it rests on. */
export async function POST(req: Request) {
  if (!readAllowed(req)) return Response.json({ error: "not allowed" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "ask a question of 2 to 600 characters about one task" }, { status: 400 });
  const answer = await askAboutTask(parsed.data.taskId, parsed.data.question);
  if (!answer) return Response.json({ error: "no such task" }, { status: 404 });
  return Response.json(answer);
}
