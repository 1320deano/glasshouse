import { signInAllowed } from "@/lib/auth";
import { Credentials, MIN_PASSWORD, safePath } from "@/lib/credentials";
import { getStore } from "@/lib/store";
import { supabaseAdmin, supabaseAdminConfigured } from "@/lib/supabase/admin";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Make an account with an email and a password, and sign this browser in straight away. No
 * confirmation email: the account is created already confirmed, so there is nothing to wait for
 * and nothing to click. The tester cohort switch (GLASSHOUSE_INVITE_ONLY) is checked first.
 *
 * One thing to know before this is open to the public: because the account is made with the
 * service role, Supabase's own sign-up rate limit does not apply to it (sign-in still has one).
 * GLASSHOUSE_INVITE_ONLY=1 is what holds the door during the tester period; a public launch wants
 * a rate limit or a captcha here as well.
 */
export async function POST(req: Request) {
  const store = getStore();
  if (store.mode === "local") return Response.json({ error: "You are running the Room on your own computer; there is nothing to sign up for." }, { status: 400 });
  if (!supabaseConfigured() || !supabaseAdminConfigured()) return Response.json({ error: "Sign-up is not set up yet (Supabase keys missing)." }, { status: 503 });

  const parsed = Credentials.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: `Enter a valid email address and a password of at least ${MIN_PASSWORD} characters.` }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const { password, visitorId } = parsed.data;

  const allowed = await signInAllowed(email);
  if (!allowed.ok) return Response.json({ error: allowed.reason }, { status: 403 });
  if (visitorId) void store.recordMetric("signup_started", visitorId).catch(() => undefined);

  // Created by the service role with email_confirm, so the account works the second it exists.
  const admin = supabaseAdmin();
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError || !created.user) {
    const taken = /already|registered|exists/i.test(createError?.message ?? "");
    if (taken) return Response.json({ error: "That email already has an account. Sign in instead." }, { status: 409 });
    const weak = /password/i.test(createError?.message ?? "");
    return Response.json({ error: weak ? `That password is too weak. Use at least ${MIN_PASSWORD} characters.` : "Could not make the account right now. Try again in a minute." }, { status: 502 });
  }

  // The same password, straight back in, to put the session cookie on this browser.
  const supabase = await supabaseServer();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return Response.json({ error: "Your account was made, but signing in did not work. Try signing in." }, { status: 502 });

  const user = created.user;
  // The database makes the profile row on sign-up; this is the belt to that pair of braces.
  const existing = await store.getProfile(user.id);
  if (!existing) await store.upsertProfile({ userId: user.id, email });
  else if (existing.email !== email) await store.upsertProfile({ userId: user.id, email });
  void store.markInviteAccepted(email, new Date().toISOString()).catch(() => undefined);
  void store.recordMetric("signup_completed", visitorId ?? user.id).catch(() => undefined);

  return Response.json({ ok: true, next: safePath(parsed.data.next) });
}
