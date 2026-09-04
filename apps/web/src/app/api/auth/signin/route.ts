import { z } from "zod";
import { signInAllowed } from "@/lib/auth";
import { SITE_URL } from "@/lib/brand";
import { getStore } from "@/lib/store";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Body = z.object({ email: z.string().trim().email().max(200), next: z.string().max(400).optional(), visitorId: z.string().max(64).optional() });

/** Send a magic link. The tester cohort switch (GLASSHOUSE_INVITE_ONLY) is checked here, before any email goes out. */
export async function POST(req: Request) {
  const store = getStore();
  if (store.mode === "local") return Response.json({ error: "You are running the Room on your own computer; there is nothing to sign in to." }, { status: 400 });
  if (!supabaseConfigured()) return Response.json({ error: "Sign-in is not set up yet (Supabase keys missing)." }, { status: 503 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  const { email, next, visitorId } = parsed.data;
  const allowed = await signInAllowed(email);
  if (!allowed.ok) return Response.json({ error: allowed.reason }, { status: 403 });

  const origin = new URL(req.url).origin === "null" ? SITE_URL : SITE_URL;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}` } });
  if (error) return Response.json({ error: "Could not send the sign-in email right now. Try again in a minute." }, { status: 502 });
  if (visitorId) void store.recordMetric("signup_started", visitorId).catch(() => undefined);
  return Response.json({ ok: true, sent: true });
}
