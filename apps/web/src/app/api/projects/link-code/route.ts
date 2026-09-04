import { currentViewer } from "@/lib/auth";
import { canCreateProject } from "@/lib/plan";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** A fresh one-time code for `glasshouse connect --code`. Fails early if the plan has no room for another project. */
export async function POST() {
  const viewer = await currentViewer();
  if (!viewer) return Response.json({ error: "sign in first" }, { status: 401 });
  const store = getStore();
  const existing = (await store.listProjects(viewer.id)).length;
  if (!canCreateProject(viewer.plan, existing)) return Response.json({ error: "Free watches one project. Pro watches as many as you like.", upgrade: "second_project" }, { status: 402 });
  const code = await store.createLinkCode(viewer.id);
  return Response.json({ code: code.code, expiresAt: code.expiresAt });
}
