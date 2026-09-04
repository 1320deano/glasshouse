import { currentViewer } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The signed-in person's projects, with their plan, for the home page and the connect page. */
export async function GET() {
  const viewer = await currentViewer();
  if (!viewer) return Response.json({ error: "sign in first" }, { status: 401 });
  const projects = await getStore().listProjects(viewer.id);
  return Response.json({ projects, plan: viewer.plan, admin: viewer.admin, local: viewer.local });
}
