import { EventBatch } from "@glasshouse/schema";
import { afterIngest } from "@/lib/ai/workers";
import { projectFromRequest } from "@/lib/auth";
import { publish } from "@/lib/bus";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The connector posts batches of normalised events here. */
export async function POST(req: Request) {
  const project = await projectFromRequest(req);
  if (!project) return Response.json({ error: "unknown project token" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = EventBatch.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid batch", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });

  // The token decides the project. Never trust the projectId in the payload.
  const events = parsed.data.events.map((e) => ({ ...e, projectId: project.id }));
  const result = await getStore().ingest(project.id, events);
  if (result.inserted > 0) {
    publish({ projectId: project.id, at: new Date().toISOString(), inserted: result.inserted });
    afterIngest(project.id, result); // AI headline and file descriptions, in the background
  }
  return Response.json({ inserted: result.inserted, duplicates: result.duplicates });
}
