import { mergeAreas, renameArea } from "@glasshouse/translate";
import { z } from "zod";
import { buildHeuristicMap } from "@/lib/ai/area-map";
import { aiEnabled } from "@/lib/ai/client";
import { refreshAreaMapWithAI } from "@/lib/ai/workers";
import { canReadProject } from "@/lib/auth";
import { publish } from "@/lib/bus";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rename"), id: z.string(), name: z.string().min(1).max(80), description: z.string().max(300).optional() }),
  z.object({ action: z.literal("merge"), from: z.string(), into: z.string() }),
  z.object({ action: z.literal("refresh") }),
]);

/** The area map: the app in the owner's words. GET reads it; PATCH renames, merges or refreshes. */
export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!(await canReadProject(req, projectId))) return Response.json({ error: "not allowed" }, { status: 401 });
  const store = getStore();
  const [map, tree] = await Promise.all([store.getAreaMap(projectId), store.getTree(projectId)]);
  return Response.json({ map, tree: tree ? { files: tree.paths.length, scannedAt: tree.scannedAt, truncated: tree.truncated } : null, aiEnabled: aiEnabled() });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!(await canReadProject(req, projectId))) return Response.json({ error: "not allowed" }, { status: 401 });
  const parsed = Action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid action", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  const store = getStore();
  const map = await store.getAreaMap(projectId);
  if (!map) return Response.json({ error: "no area map yet; connect the project first" }, { status: 404 });

  const action = parsed.data;
  if (action.action === "refresh") {
    const tree = await store.getTree(projectId);
    if (!tree) return Response.json({ error: "no file map yet; run `glasshouse map` in the project folder" }, { status: 404 });
    const ai = await refreshAreaMapWithAI(projectId, tree);
    const next = ai ?? buildHeuristicMap(tree, map);
    if (!ai) await store.saveAreaMap(projectId, next);
    publish({ projectId, at: new Date().toISOString(), inserted: 0 });
    return Response.json({ map: next, source: next.source });
  }
  const next = action.action === "rename" ? renameArea(map, action.id, action.name, action.description) : mergeAreas(map, action.from, action.into);
  await store.saveAreaMap(projectId, next);
  publish({ projectId, at: new Date().toISOString(), inserted: 0 });
  return Response.json({ map: next });
}
