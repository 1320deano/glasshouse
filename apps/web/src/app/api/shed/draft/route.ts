import { z } from "zod";
import { draftHelper } from "@/lib/ai/helper";
import { aiEnabled } from "@/lib/ai/client";
import { canReadProject } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const Body = z.object({ projectId: z.string().uuid(), words: z.string().trim().min(3).max(1200) });

/** The owner's rough sentence, made into a first draft of a helper. Optional: no key, no draft, said plainly. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Say a little more about what the helper should do." }, { status: 400 });
  const viewer = await canReadProject(req, parsed.data.projectId);
  if (!viewer) return Response.json({ error: "Not yours to see." }, { status: 404 });
  if (!aiEnabled()) return Response.json({ draft: null, reason: "No AI key is set, so your words are used as typed. Add ANTHROPIC_API_KEY to have them tidied into a first draft." });
  const map = await getStore().getAreaMap(parsed.data.projectId);
  const draft = await draftHelper(parsed.data.projectId, parsed.data.words, map?.areas ?? []);
  return Response.json({ draft, reason: draft ? undefined : "The AI did not answer this time; your words are used as typed." });
}
