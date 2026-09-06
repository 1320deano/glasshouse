import { NextResponse } from "next/server";
import { devLogin, localRequest } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The test account's way in. Signs this browser in as the account made by scripts/dev-account.ts,
 * with no email and no link, so the hosted Room can be tried on this computer.
 *
 * Two locks: GLASSHOUSE_DEV_LOGIN=1 with the email and password beside it, and the request must
 * have been made on this computer. With either lock shut the route behaves as if it is not there.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const dev = devLogin();
  if (!dev || !localRequest(req)) return NextResponse.redirect(new URL("/signin", url.origin));
  const store = getStore();
  if (store.mode === "local" || !supabaseConfigured()) return NextResponse.redirect(new URL("/", url.origin));

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email: dev.email, password: dev.password });
  if (error || !data.user) return NextResponse.redirect(new URL("/signin?error=dev", url.origin));

  const user = data.user;
  const existing = await store.getProfile(user.id);
  if (!existing) await store.upsertProfile({ userId: user.id, email: user.email?.toLowerCase() });

  const next = url.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
