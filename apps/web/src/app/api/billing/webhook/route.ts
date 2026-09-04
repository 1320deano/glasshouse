import { billingEnabled, handleWebhook } from "@/lib/billing";

export const dynamic = "force-dynamic";

/** Stripe calls this. It is the only code path that changes a person's plan. */
export async function POST(req: Request) {
  if (!billingEnabled()) return Response.json({ error: "billing not configured" }, { status: 503 });
  try {
    const result = await handleWebhook(await req.text(), req.headers.get("stripe-signature"));
    if (result.applied) console.log(`[glasshouse] billing: ${result.type} -> ${result.userId} is ${result.plan}`);
    return Response.json({ received: true, applied: result.applied });
  } catch (err) {
    console.error("[glasshouse] webhook rejected:", err);
    return Response.json({ error: "bad signature" }, { status: 400 });
  }
}
