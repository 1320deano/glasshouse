import { canReadProject } from "@/lib/auth";
import { UPGRADE_REASONS, canGrowHelper } from "@/lib/plan";
import { HelperInput } from "@/lib/shed/input";
import { slugify } from "@/lib/shed/slug";
import { shedForViewer } from "@/lib/shed/view";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ projectId: string }> };

/** The Shed for one project: helpers, their files, their checks, and what the record suggests. */
export async function GET(req: Request, { params }: Params) {
  const { projectId } = await params;
  const viewer = await canReadProject(req, projectId);
  if (!viewer) return Response.json({ error: "Not yours to see." }, { status: 404 });
  const view = await shedForViewer(projectId, viewer);
  if (!view) return Response.json({ error: "No such project." }, { status: 404 });
  return Response.json(view);
}

/** Grow a helper, or change one. Body: HelperInput. */
export async function POST(req: Request, { params }: Params) {
  const { projectId } = await params;
  const viewer = await canReadProject(req, projectId);
  if (!viewer) return Response.json({ error: "Not yours to change." }, { status: 404 });
  const parsed = HelperInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Say what the helper should do, and pick at least one tool.", issues: parsed.error.issues.slice(0, 3) }, { status: 400 });
  const store = getStore();
  const input = parsed.data;
  const existing = input.id ? await store.getHelper(input.id) : null;
  if (existing && existing.projectId !== projectId) return Response.json({ error: "That helper belongs to another project." }, { status: 400 });
  if (!existing) {
    const count = (await store.listHelpers(projectId)).length;
    if (!canGrowHelper(viewer.plan, count)) return Response.json({ error: UPGRADE_REASONS.helpers, upgrade: "helpers" }, { status: 402 });
  }
  const saved = await store.saveHelper({
    id: existing?.id ?? crypto.randomUUID(),
    projectId,
    ownerId: existing?.ownerId ?? (viewer.local ? "local" : viewer.id === "setup" ? null : viewer.id),
    slug: existing?.slug && existing.name === input.name ? existing.slug : slugify(input.name),
    name: input.name,
    brief: input.brief,
    grownFrom: existing?.grownFrom ?? input.grownFrom,
  });
  const view = await shedForViewer(projectId, viewer);
  return Response.json({ helper: saved, shed: view });
}

/** Remove a helper. ?id=... */
export async function DELETE(req: Request, { params }: Params) {
  const { projectId } = await params;
  const viewer = await canReadProject(req, projectId);
  if (!viewer) return Response.json({ error: "Not yours to change." }, { status: 404 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const store = getStore();
  const helper = await store.getHelper(id);
  if (!helper || helper.projectId !== projectId) return Response.json({ error: "No such helper." }, { status: 404 });
  await store.deleteHelper(id);
  const view = await shedForViewer(projectId, viewer);
  return Response.json({ ok: true, shed: view });
}
