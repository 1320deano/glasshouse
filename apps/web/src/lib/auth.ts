/**
 * Who is asking, and what may they see.
 *
 * - Local mode (no Supabase): it is your own machine. One implicit person, "local", on the Pro plan
 *   unless GLASSHOUSE_PLAN=free is set to preview the free tier. Every page is open.
 * - Supabase mode: sign-in through Supabase Auth with an email and a password. A person sees only the projects they
 *   connected. GLASSHOUSE_ADMIN_EMAILS lists who may open /admin. The setup secret still opens
 *   everything for scripts, and GLASSHOUSE_ALLOW_ANON_READ=1 keeps the Phase 1 behaviour if wanted.
 * - Connectors authenticate with a project token (bearer) in both modes.
 */
import { getStore } from "./store";
import { LOCAL_OWNER } from "./store/memory";
import type { Plan } from "./plan";
import type { Profile } from "./store/types";
import { supabaseConfigured, supabaseServer } from "./supabase/server";

export interface Viewer {
  id: string;
  email?: string;
  plan: Plan;
  admin: boolean;
  /** True in local mode: the machine's owner, no sign-in. */
  local: boolean;
}

export function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1]?.trim() ?? null;
}

export async function projectFromRequest(req: Request) {
  const token = bearerToken(req);
  if (!token) return null;
  return getStore().resolveToken(token);
}

export function adminEmails(): string[] {
  return (process.env.GLASSHOUSE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function setupSecretPresent(req: Request): boolean {
  const secret = process.env.GLASSHOUSE_SETUP_SECRET;
  return Boolean(secret) && req.headers.get("x-glasshouse-setup") === secret;
}

/** Creating projects without sign-in: local mode, or the setup secret. */
export function setupAllowed(req: Request): boolean {
  if (getStore().mode === "local") return true;
  return setupSecretPresent(req);
}

function localViewer(): Viewer {
  const plan: Plan = process.env.GLASSHOUSE_PLAN === "free" ? "free" : "pro";
  return { id: LOCAL_OWNER, plan, admin: true, local: true };
}

/**
 * Keep the person's profile row up to date, but never let a database problem stand between them
 * and the door. By the time this runs the sign-in cookie is already on the browser: the row is
 * bookkeeping (which plan they are on, when they were last seen), not permission to be here.
 *
 * So a failure here is swallowed and logged for the server's own records, and the caller carries
 * on without a row. The plan then falls back to Free, which is the safe direction: a database we
 * cannot read must never hand out something that was not paid for. This is what a hosted project
 * whose migrations have not been applied yet looks like from the outside — the `profiles` table is
 * missing, the write fails, and before this the whole route stopped dead and the browser was left
 * trying to read an error page as an answer.
 */
export async function rememberProfile(userId: string, email?: string): Promise<Profile | null> {
  try {
    return await getStore().upsertProfile({ userId, email });
  } catch (err) {
    console.error("[auth] could not write the profile row for", userId, err);
    return null;
  }
}

/** The signed-in person, with their plan. Null when nobody is signed in (Supabase mode only). */
export async function currentViewer(): Promise<Viewer | null> {
  const store = getStore();
  if (store.mode === "local") return localViewer();
  if (!supabaseConfigured()) return null;
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  const email = user.email?.toLowerCase();
  let profile = await store.getProfile(user.id).catch(() => null);
  if (!profile) profile = await rememberProfile(user.id, email);
  else if (email && profile.email !== email) profile = (await rememberProfile(user.id, email)) ?? profile;
  return { id: user.id, email, plan: profile?.plan ?? "free", admin: email ? adminEmails().includes(email) : false, local: false };
}

/** May this request read the project? Owner, admin, setup secret, or the open-read switch. */
export async function canReadProject(req: Request, projectId: string): Promise<Viewer | null> {
  const store = getStore();
  if (store.mode === "local") return localViewer();
  if (setupSecretPresent(req) || process.env.GLASSHOUSE_ALLOW_ANON_READ === "1") return { id: "setup", plan: "pro", admin: true, local: false };
  const viewer = await currentViewer();
  if (!viewer) return null;
  if (viewer.admin) return viewer;
  const project = await store.getProject(projectId);
  return project && project.ownerId === viewer.id ? viewer : null;
}

export async function canReadTask(req: Request, taskId: string): Promise<Viewer | null> {
  const store = getStore();
  if (store.mode === "local") return localViewer();
  const task = await store.getTask(taskId);
  if (!task) return null;
  return canReadProject(req, task.projectId);
}

/** Only admins (or local mode). */
export async function adminViewer(req: Request): Promise<Viewer | null> {
  if (getStore().mode === "local" || setupSecretPresent(req)) return { ...localViewer(), local: getStore().mode === "local" };
  const viewer = await currentViewer();
  return viewer?.admin ? viewer : null;
}

/**
 * The test account (scripts/dev-account.ts): a ready-made sign-in for trying the hosted Room on
 * this computer without typing anything. Off unless the switch and both values are set.
 */
export function devLogin(): { email: string; password: string } | null {
  if (process.env.GLASSHOUSE_DEV_LOGIN !== "1") return null;
  const email = process.env.GLASSHOUSE_DEV_EMAIL?.trim().toLowerCase();
  const password = process.env.GLASSHOUSE_DEV_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}

/** Second lock on the test account: it answers only a request made on this computer. */
export function localRequest(req: Request): boolean {
  const host = new URL(req.url).hostname.replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
}

/** Sign-in gate for the tester cohort. */
export async function signInAllowed(email: string): Promise<{ ok: boolean; reason?: string }> {
  const e = email.trim().toLowerCase();
  if (process.env.GLASSHOUSE_INVITE_ONLY !== "1") return { ok: true };
  if (adminEmails().includes(e) || (await getStore().isInvited(e))) return { ok: true };
  return { ok: false, reason: "This is a private test for now. Ask for an invite and we will add your email." };
}
