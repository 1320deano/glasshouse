import { ProjectTree } from "@glasshouse/schema";
import { treeChangedMaterially } from "@glasshouse/translate";
import { buildHeuristicMap } from "@/lib/ai/area-map";
import { aiEnabled } from "@/lib/ai/client";
import { refreshAreaMapWithAI } from "@/lib/ai/workers";
import { projectFromRequest } from "@/lib/auth";
import { publish } from "@/lib/bus";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * The connector sends the file tree here on connect, on `glasshouse map`, and at most every few
 * hours on session start. A heuristic map is built at once so the Room speaks in areas
 * immediately; the AI map follows in the background when the tree is new or changed materially.
 */
export async function POST(req: Request) {
  const project = await projectFromRequest(req);
  if (!project) return Response.json({ error: "unknown project token" }, { status: 401 });
  const parsed = ProjectTree.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid tree", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });

  const store = getStore();
  const tree = parsed.data;
  const [previous, existing] = await Promise.all([store.getTree(project.id), store.getAreaMap(project.id)]);
  await store.saveTree(project.id, tree);

  const changed = !previous || treeChangedMaterially(previous.paths, tree.paths);
  let map = existing;
  let refreshed = false;
  if (!map || changed) {
    map = buildHeuristicMap(tree, existing);
    await store.saveAreaMap(project.id, map);
    refreshed = true;
    publish({ projectId: project.id, at: new Date().toISOString(), inserted: 0 });
  }
  const aiPending = aiEnabled() && (refreshed || map.source !== "ai");
  if (aiPending) void refreshAreaMapWithAI(project.id, tree);

  return Response.json({ areas: map.areas.length, refreshed, source: map.source ?? "heuristic", aiPending, files: tree.paths.length });
}
