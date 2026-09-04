import { getStore } from "@/lib/store";
import { supabaseConfigured, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (getStore().mode !== "local" && supabaseConfigured()) {
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
  }
  return Response.redirect(new URL("/", req.url), 303);
}
