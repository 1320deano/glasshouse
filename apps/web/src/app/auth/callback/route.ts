import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** The magic link lands here: exchange the code for a session cookie, then carry on to where the person was going. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (!code || !supabaseConfigured()) return NextResponse.redirect(new URL("/signin?error=link", url.origin));
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/signin?error=expired", url.origin));
  const store = getStore();
  const user = data.user;
  if (user) {
    const email = user.email?.toLowerCase();
    const existing = await store.getProfile(user.id);
    if (!existing) await store.upsertProfile({ userId: user.id, email });
    if (email) void store.markInviteAccepted(email, new Date().toISOString()).catch(() => undefined);
    const visitor = url.searchParams.get("v");
    if (!existing) void store.recordMetric("signup_completed", visitor ?? user.id).catch(() => undefined);
  }
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
