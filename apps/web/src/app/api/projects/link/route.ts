import { z } from "zod";
import { setupAllowed } from "@/lib/auth";
import { UPGRADE_REASONS, canCreateProject } from "@/lib/plan";
import { getStore } from "@/lib/store";
import { LOCAL_OWNER } from "@/lib/store/memory";

export const dynamic = "force-dynamic";

const Body = z.object({ name: z.string().min(1).max(120), rootHint: z.string().max(1000).optional(), code: z.string().min(4).max(20).optional() });

/**
 * Called once by `glasshouse connect`. Returns the project token, shown once and stored hashed.
 * Local mode: no code needed, it is your own machine. Hosted: the one-time code from /connect
 * says whose project this is, and the plan says whether there is room for another one.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  const store = getStore();
  const { name, rootHint, code } = parsed.data;

  let ownerId: string | null = null;
  if (code) {
    const link = await store.consumeLinkCode(code);
    if (!link) return Response.json({ error: "That code is unknown, used or has expired. Open the Room, click New project, and copy the fresh one." }, { status: 401 });
    ownerId = link.ownerId;
  } else if (store.mode === "local") ownerId = LOCAL_OWNER;
  else if (!setupAllowed(req)) return Response.json({ error: "A link code is needed: open the Room, click New project, and run the command it shows." }, { status: 401 });

  if (ownerId) {
    const plan = store.mode === "local" ? (process.env.GLASSHOUSE_PLAN === "free" ? "free" : "pro") : ((await store.getProfile(ownerId))?.plan ?? "free");
    const existing = (await store.listProjects(ownerId)).length;
    if (!canCreateProject(plan, existing)) return Response.json({ error: UPGRADE_REASONS.second_project, upgrade: "second_project" }, { status: 402 });
  }

  const { project, token } = await store.createProject({ name, rootHint, ownerId });
  if (code) await store.attachLinkCode(code, project.id);
  if (ownerId && ownerId !== LOCAL_OWNER) void store.recordMetric("project_connected", ownerId).catch(() => undefined);
  return Response.json({ projectId: project.id, name: project.name, token, mode: store.mode });
}

export async function GET(req: Request) {
  const store = getStore();
  if (!setupAllowed(req)) return Response.json({ mode: store.mode });
  return Response.json({ mode: store.mode, projects: await store.listProjects() });
}
