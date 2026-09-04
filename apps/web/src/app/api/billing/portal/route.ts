import { currentViewer } from "@/lib/auth";
import { SITE_URL } from "@/lib/brand";
import { billingEnabled, createPortalUrl } from "@/lib/billing";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Change or cancel the subscription, through Stripe's own page. */
export async function POST(req: Request) {
  const viewer = await currentViewer();
  if (!viewer) return Response.json({ error: "sign in first" }, { status: 401 });
  if (viewer.local || !billingEnabled()) return Response.json({ error: "Billing is not set up." }, { status: 503 });
  const profile = await getStore().getProfile(viewer.id);
  const url = profile ? await createPortalUrl(profile, SITE_URL || new URL(req.url).origin) : null;
  if (!url) return Response.json({ error: "No subscription to manage yet." }, { status: 404 });
  return Response.json({ url });
}
