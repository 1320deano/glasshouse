import { projectFromRequest } from "@/lib/auth";
import { compileHelper } from "@/lib/shed/compile";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * The connector's side of the Shed: `glasshouse helpers` asks for every helper of the linked
 * project as ready-to-write files, then reports that it wrote them. Project token only (bearer),
 * like ingest. Nothing here is ever written by the server into anyone's folder: the owner runs
 * the command, so the Shed stays watch-only from the agents' point of view.
 */
export async function GET(req: Request) {
  const project = await projectFromRequest(req);
  if (!project) return Response.json({ error: "Unknown project token." }, { status: 401 });
  const store = getStore();
  const [helpers, map] = await Promise.all([store.listHelpers(project.id), store.getAreaMap(project.id)]);
  const areas = map?.areas ?? [];
  return Response.json({
    project: { id: project.id, name: project.name },
    helpers: helpers.map((h) => ({ id: h.id, slug: h.slug, name: h.name, tools: h.brief.tools, updatedAt: h.updatedAt, files: compileHelper(h, areas) })),
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  const project = await projectFromRequest(req);
  if (!project) return Response.json({ error: "Unknown project token." }, { status: 401 });
  await getStore().markHelpersPlaced(project.id, new Date().toISOString());
  return Response.json({ ok: true });
}
