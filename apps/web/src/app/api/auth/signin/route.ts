import { signInAllowed } from "@/lib/auth";
import { Credentials, safePath } from "@/lib/credentials";
import { getStore } from "@/lib/store";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Sign in with the email and password used at sign-up. The tester cohort switch is checked first. */
export async function POST(req: Request) {
  const store = getStore();
  if (store.mode === "local") return Response.json({ error: "You are running the Room on your own computer; there is nothing to sign in to." }, { status: 400 });
  if (!supabaseConfigured()) return Response.json({ error: "Sign-in is not set up yet (Supabase keys missing)." }, { status: 503 });

  const parsed = Credentials.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter your email address and your password." }, { status: 400 });
  const email = parsed.data.email.toLowerCase();

  const allowed = await signInAllowed(email);
  if (!allowed.ok) return Response.json({ error: allowed.reason }, { status: 403 });

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
  if (error || !data.user) return Response.json({ error: "That email address and password do not go together. Check them and try again." }, { status: 401 });

  const user = data.user;
  const existing = await store.getProfile(user.id);
  if (!existing || existing.email !== email) await store.upsertProfile({ userId: user.id, email });
  void store.markInviteAccepted(email, new Date().toISOString()).catch(() => undefined);

  return Response.json({ ok: true, next: safePath(parsed.data.next) });
}
