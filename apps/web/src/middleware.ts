/**
 * Supabase mode only: keep the sign-in session fresh and send signed-out visitors from private
 * pages to /signin. Local mode has no sign-in, so every page passes straight through.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PRIVATE = [/^\/room(\/|$)/, /^\/connect(\/|$)/, /^\/account(\/|$)/, /^\/admin(\/|$)/];

export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hosted = Boolean(url && key && process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!hosted) return NextResponse.next();

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(url!, key!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (all: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => {
        for (const { name, value } of all) req.cookies.set(name, value);
        res = NextResponse.next({ request: req });
        for (const { name, value, options } of all) res.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;
  if (!data.user && PRIVATE.some((re) => re.test(path))) {
    const signin = req.nextUrl.clone();
    signin.pathname = "/signin";
    signin.search = `?next=${encodeURIComponent(path + req.nextUrl.search)}`;
    return NextResponse.redirect(signin);
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/ingest|api/projects/tree|api/projects/link$|api/billing/webhook|api/live).*)"],
};
