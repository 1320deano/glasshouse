import { z } from "zod";
import { projectFromRequest } from "@/lib/auth";
import { requestMoved, requestOfProject } from "@/lib/requests/server";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const Body = z.object({
  status: z.enum(["running", "finished", "failed"]),
  externalSessionId: z.string().min(1).max(200).optional(),
  result: z
    .object({
      ok: z.boolean(),
      reason: z.string().max(600).optional(),
      closing: z.string().max(4000).optional(),
      exitCode: z.number().int().optional(),
      command: z.string().max(2000).optional(),
      stderr: z.string().max(4000).optional(),
      costUsd: z.number().nonnegative().optional(),
      durationMs: z.number().nonnegative().optional(),
      turns: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

/** The connector reports what the tool did: started, finished, or could not. Facts from the process only. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await projectFromRequest(req);
  if (!project) return Response.json({ error: "unknown project token" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid status", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  const existing = await requestOfProject(id, project.id);
  if (!existing) return Response.json({ error: "no such request" }, { status: 404 });
  // A run that already ended does not come back to life because a late "running" arrives.
  const ended = existing.status === "finished" || existing.status === "failed" || existing.status === "withdrawn" || existing.status === "expired";
  const patch = ended && parsed.data.status === "running" ? { externalSessionId: parsed.data.externalSessionId } : parsed.data;
  const updated = await getStore().updateRequest(id, { ...patch, statusAt: new Date().toISOString() });
  requestMoved(project.id);
  return Response.json({ request: updated });
}
