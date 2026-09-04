import { currentViewer } from "@/lib/auth";
import { SITE_URL } from "@/lib/brand";
import { billingEnabled, createCheckoutUrl } from "@/lib/billing";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Start the Pro subscription. Records the upgrade click as a metric whatever happens next. */
export async function POST(req: Request) {
  const viewer = await currentViewer();
  if (!viewer) return Response.json({ error: "sign in first" }, { status: 401 });
  void getStore().recordMetric("upgrade_clicked", viewer.id).catch(() => undefined);
  if (viewer.local) return Response.json({ error: "You are running the Room on your own computer, where everything is already on. Set GLASSHOUSE_PLAN=free to preview the free tier." }, { status: 400 });
  if (!billingEnabled()) return Response.json({ error: "Billing is not set up yet. Pro is switched on by hand for testers." }, { status: 503 });
  try {
    const url = await createCheckoutUrl({ id: viewer.id, email: viewer.email }, SITE_URL || new URL(req.url).origin);
    return Response.json({ url });
  } catch (err) {
    console.error("[glasshouse] checkout:", err);
    return Response.json({ error: "Could not start checkout right now." }, { status: 502 });
  }
}
