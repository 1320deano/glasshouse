import { z } from "zod";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const Body = z.object({ event: z.enum(["landing_view", "signup_started", "upgrade_clicked"]), visitorId: z.string().min(4).max(64) });

/** Landing-page counters, one per visitor per event. Anything else is recorded server-side. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid metric" }, { status: 400 });
  await getStore().recordMetric(parsed.data.event, parsed.data.visitorId);
  return Response.json({ ok: true });
}
