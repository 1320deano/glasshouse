import { z } from "zod";
import { adminViewer } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Everything the tester dashboard shows: sign-up rate, each tester's activity, notes, invites, AI cost per active person. */
export async function GET(req: Request) {
  if (!(await adminViewer(req))) return Response.json({ error: "not allowed" }, { status: 403 });
  const store = getStore();
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days") ?? "30")));
  const [metrics, profiles, invites, notes, projects] = await Promise.all([store.metricCounts(days), store.listProfiles(), store.listInvites(), store.listTesterNotes(200), store.listProjects()]);
  const people = await Promise.all(
    profiles.map(async (p) => {
      const activity = await store.ownerActivity(p.userId);
      const owned = projects.filter((x) => x.ownerId === p.userId);
      let aiCostGbp = 0;
      for (const pr of owned) aiCostGbp += (await store.getStats(pr.id)).aiCostGbp;
      return { ...p, ...activity, aiCostGbp: Math.round(aiCostGbp * 100) / 100 };
    }),
  );
  const active = people.filter((p) => p.lastEventAt && Date.now() - new Date(p.lastEventAt).getTime() < 5 * 24 * 3600 * 1000);
  const pro = people.filter((p) => p.plan === "pro");
  const proCost = pro.reduce((a, p) => a + p.aiCostGbp, 0);
  return Response.json({
    metrics,
    people,
    invites,
    notes,
    summary: {
      testers: people.length,
      activeLast5Days: active.length,
      pro: pro.length,
      aiCostPerProGbp: pro.length > 0 ? Math.round((proCost / pro.length) * 100) / 100 : 0,
      unownedProjects: projects.filter((p) => !p.ownerId).length,
    },
  });
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite"), email: z.string().trim().email(), note: z.string().max(200).optional() }),
  z.object({ action: z.literal("uninvite"), email: z.string().trim().email() }),
  z.object({ action: z.literal("set_plan"), userId: z.string().min(1), plan: z.enum(["free", "pro"]) }),
]);

/** Admin actions: invite a tester, remove one, or switch a plan by hand (for testers, before Stripe is live). */
export async function POST(req: Request) {
  if (!(await adminViewer(req))) return Response.json({ error: "not allowed" }, { status: 403 });
  const parsed = Action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid action" }, { status: 400 });
  const store = getStore();
  const a = parsed.data;
  if (a.action === "invite") return Response.json({ invite: await store.addInvite(a.email, a.note) });
  if (a.action === "uninvite") {
    await store.removeInvite(a.email);
    return Response.json({ ok: true });
  }
  const profile = await store.upsertProfile({ userId: a.userId, plan: a.plan, planUpdatedAt: new Date().toISOString(), subscriptionStatus: a.plan === "pro" ? "manual" : "none" });
  return Response.json({ profile });
}
