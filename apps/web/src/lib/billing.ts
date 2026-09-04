/**
 * Stripe: one Pro subscription per person. Checkout to start it, the customer portal to change or
 * cancel it, and the webhook that is the only thing allowed to change a plan. Without the Stripe
 * keys, billing is simply "not set up yet" and every page says so; nothing else breaks.
 */
import Stripe from "stripe";
import { planFromSubscriptionStatus } from "./plan";
import { getStore } from "./store";
import type { Profile } from "./store/types";

export function billingEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID_PRO);
}

let client: Stripe | undefined;
export function stripe(): Stripe {
  return (client ??= new Stripe(process.env.STRIPE_SECRET_KEY!));
}

/** Start Checkout for Pro. Reuses the person's Stripe customer when there is one. */
export async function createCheckoutUrl(user: { id: string; email?: string }, origin: string): Promise<string> {
  const store = getStore();
  const profile = await store.getProfile(user.id);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_ID_PRO!, quantity: 1 }],
    customer: profile?.stripeCustomerId,
    customer_email: profile?.stripeCustomerId ? undefined : user.email,
    client_reference_id: user.id,
    metadata: { userId: user.id },
    subscription_data: { metadata: { userId: user.id } },
    allow_promotion_codes: true,
    success_url: `${origin}/account?upgraded=1`,
    cancel_url: `${origin}/account`,
  });
  if (!session.url) throw new Error("Stripe returned no checkout URL");
  return session.url;
}

export async function createPortalUrl(profile: Profile, origin: string): Promise<string | null> {
  if (!profile.stripeCustomerId) return null;
  const session = await stripe().billingPortal.sessions.create({ customer: profile.stripeCustomerId, return_url: `${origin}/account` });
  return session.url;
}

/** What a webhook event means for a profile. Pure, so it is testable without Stripe. */
export function planChangeFrom(event: { type: string; data: { object: unknown } }): { userId?: string; customerId?: string; subscriptionId?: string; status?: string } | null {
  const obj = event.data.object as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const meta = (obj.metadata as Record<string, unknown> | undefined) ?? {};
  switch (event.type) {
    case "checkout.session.completed":
      return { userId: str(obj.client_reference_id) ?? str(meta.userId), customerId: str(obj.customer), subscriptionId: str(obj.subscription), status: "active" };
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return { userId: str(meta.userId), customerId: str(obj.customer), subscriptionId: str(obj.id), status: event.type.endsWith("deleted") ? "canceled" : str(obj.status) };
    default:
      return null;
  }
}

/** Verify and apply one webhook delivery. Returns what changed, for the log. */
export async function handleWebhook(rawBody: string, signature: string | null): Promise<{ applied: boolean; type: string; userId?: string; plan?: string }> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signature) throw new Error("webhook secret or signature missing");
  const event = stripe().webhooks.constructEvent(rawBody, signature, secret);
  const change = planChangeFrom(event);
  if (!change) return { applied: false, type: event.type };
  const store = getStore();
  const profile = change.userId ? await store.getProfile(change.userId) : change.customerId ? await store.findProfileByCustomer(change.customerId) : null;
  const userId = profile?.userId ?? change.userId;
  if (!userId) return { applied: false, type: event.type };
  const plan = planFromSubscriptionStatus(change.status);
  await store.upsertProfile({
    userId,
    plan,
    stripeCustomerId: change.customerId ?? profile?.stripeCustomerId,
    stripeSubscriptionId: change.subscriptionId ?? profile?.stripeSubscriptionId,
    subscriptionStatus: change.status,
    planUpdatedAt: new Date().toISOString(),
  });
  return { applied: true, type: event.type, userId, plan };
}
