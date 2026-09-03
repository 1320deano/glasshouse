import { z } from "zod";
import { setupAllowed } from "@/lib/auth";
import { getStore } from "@/lib/store";

const Body = z.object({ name: z.string().min(1).max(120), rootHint: z.string().max(1000).optional() });

/** Called once by `glasshouse connect`. Returns the project token, which is shown once and stored hashed. */
export async function POST(req: Request) {
  if (!setupAllowed(req)) return Response.json({ error: "setup secret required" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  const store = getStore();
  const { project, token } = await store.createProject(parsed.data);
  return Response.json({ projectId: project.id, name: project.name, token, mode: store.mode });
}

export async function GET() {
  const store = getStore();
  return Response.json({ mode: store.mode, projects: await store.listProjects() });
}
