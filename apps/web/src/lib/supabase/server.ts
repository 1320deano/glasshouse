/**
 * Supabase Auth on the server: a client bound to the request's cookies, used to find out who is
 * signed in, to sign in with an email and a password, and to sign out. Data access never goes
 * through this client (the store uses the service role); this is identity only.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (all: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => {
        try {
          for (const { name, value, options } of all) cookieStore.set(name, value, options);
        } catch {
          /* called from a server component: the middleware refreshes the session instead */
        }
      },
    },
  });
}
