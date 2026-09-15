import { z } from "zod";
import { projectFromRequest } from "@/lib/auth";
import { requestMoved, requestOfProject } from "@/lib/requests/server";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const Body = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["permission", "choice"]),
  toolName: z.string().min(1).max(120),
  eventKind: z.string().max(40).optional(),
  description: z.string().max(400).optional(),
  summary: z.string().min(1).max(400),
  paths: z.array(z.string().max(500)).max(50).default([]),
  command: z.string().max(2000).optional(),
  choices: z
    .array(z.object({ question: z.string().max(600), header: z.string().max(60).optional(), options: z.array(z.object({ label: z.string().max(200), description: z.string().max(600).optional() })).max(8), multiSelect: z.boolean().optional() }))
    .max(4)
    .optional(),
  raw: z.unknown().optional(),
});

/** The running tool asks the owner something through the Room: may it do this, or which way should it go. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await projectFromRequest(req);
  if (!project) return Response.json({ error: "unknown project token" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid question", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  const existing = await requestOfProject(id, project.id);
  if (!existing) return Response.json({ error: "no such request" }, { status: 404 });
  const q = parsed.data;
  const question = await getStore().addQuestion(id, {
    id: q.id ?? crypto.randomUUID(),
    askedAt: new Date().toISOString(),
    kind: q.kind,
    toolName: q.toolName,
    eventKind: q.eventKind as never,
    description: q.description,
    summary: q.summary,
    paths: q.paths,
    command: q.command,
    choices: q.choices,
    raw: q.raw,
  });
  requestMoved(project.id);
  return Response.json({ question });
}
