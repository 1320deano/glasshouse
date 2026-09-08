/**
 * Supabase Auth with the service-role key: making an account.
 *
 * Sign-up creates the account already confirmed (`email_confirm: true`), so nobody has to find a
 * link in their inbox before they can use the Room, whatever the project's "Confirm email" setting
 * says. Server only: the service-role key must never reach the browser.
 */
import { createClient } from "@supabase/supabase-js";

export function supabaseAdminConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
