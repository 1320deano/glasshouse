/**
 * The test account. One sign-in that is already verified in Supabase, so the hosted Room can be
 * opened on this computer without waiting for an email to arrive.
 *
 *   pnpm dev:account          # make it, or repair it, on the Pro plan
 *   pnpm dev:account --free   # the same account, moved to Free, to see the upgrade gates
 *
 * Safe to run again at any time: it creates what is missing and leaves the rest alone. The email
 * and password come from apps/web/.env.local (GLASSHOUSE_DEV_EMAIL / GLASSHOUSE_DEV_PASSWORD), so
 * re-running never changes them behind your back.
 *
 * Only ever point this at a test Supabase project.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ENV_FILE = join(process.cwd(), "apps", "web", ".env.local");

function env(): Record<string, string> {
  let fromFile: Record<string, string> = {};
  try {
    fromFile = Object.fromEntries(
      readFileSync(ENV_FILE, "utf8")
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
    );
  } catch {
    /* no file: fall back to the real environment */
  }
  return { ...fromFile, ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v)) } as Record<string, string>;
}

interface AuthUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
}

async function main() {
  const e = env();
  const url = e.NEXT_PUBLIC_SUPABASE_URL;
  const key = e.SUPABASE_SERVICE_ROLE_KEY;
  const email = e.GLASSHOUSE_DEV_EMAIL?.toLowerCase();
  const password = e.GLASSHOUSE_DEV_PASSWORD;
  const plan = process.argv.includes("--free") ? "free" : "pro";

  if (!url || !key) throw new Error(`No Supabase keys. Fill NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in ${ENV_FILE}.`);
  if (!email || !password) throw new Error(`No test account details. Add GLASSHOUSE_DEV_EMAIL and GLASSHOUSE_DEV_PASSWORD to ${ENV_FILE}.`);

  const auth = (path: string, init?: RequestInit) =>
    fetch(`${url}/auth/v1${path}`, { ...init, headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", ...(init?.headers ?? {}) } });
  const rest = (path: string, init?: RequestInit) =>
    fetch(`${url}/rest/v1${path}`, { ...init, headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", ...(init?.headers ?? {}) } });

  const listed = await auth("/admin/users?per_page=200");
  if (!listed.ok) throw new Error(`Could not reach Supabase (${listed.status}). Check the keys in ${ENV_FILE}.`);
  const users = ((await listed.json()) as { users?: AuthUser[] }).users ?? [];
  const existing = users.find((u) => u.email?.toLowerCase() === email);

  let user: AuthUser;
  if (existing) {
    // Already there: put the password and the verified mark back the way this file says they are.
    const res = await auth(`/admin/users/${existing.id}`, { method: "PUT", body: JSON.stringify({ password, email_confirm: true }) });
    if (!res.ok) throw new Error(`Could not update the test account: ${res.status} ${await res.text()}`);
    user = (await res.json()) as AuthUser;
    console.log(`Test account already existed; password and verified mark reset. ${email}`);
  } else {
    const res = await auth("/admin/users", {
      method: "POST",
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { test_account: true } }),
    });
    if (!res.ok) throw new Error(`Could not create the test account: ${res.status} ${await res.text()}`);
    user = (await res.json()) as AuthUser;
    console.log(`Test account created and verified. ${email}`);
  }

  // The plan. Normally only Stripe or the admin switch writes this; a test account is the exception.
  const profile = await rest("/profiles", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ user_id: user.id, email, plan, plan_updated_at: new Date().toISOString() }),
  });
  if (!profile.ok) throw new Error(`Could not set the plan: ${profile.status} ${await profile.text()}`);
  console.log(`Plan: ${plan}.`);

  // On the invite list too, so the account still works if the private-test switch is turned on.
  const invite = await rest("/invites", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ email, note: "Test account" }),
  });
  if (!invite.ok) console.warn(`Could not add it to the invite list: ${invite.status} ${await invite.text()}`);
  else console.log("On the invite list.");

  console.log(`\nSign in on this computer by opening:  http://localhost:3000/api/auth/dev`);
  console.log(`Or on the sign-in page, use "${email}" with the password in ${ENV_FILE}.`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
