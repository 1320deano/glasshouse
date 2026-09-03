import { getStore } from "./store";

/**
 * Phase 1 access rules.
 * - Connectors authenticate with a project token (bearer). Same in both modes.
 * - Creating a project and reading the Room are open in local mode (it is your own machine).
 *   In Supabase mode they need the setup secret until Phase 4 adds sign-in.
 */
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

export function setupAllowed(req: Request): boolean {
  if (getStore().mode === "local") return true;
  const secret = process.env.GLASSHOUSE_SETUP_SECRET;
  return Boolean(secret) && req.headers.get("x-glasshouse-setup") === secret;
}

export function readAllowed(req: Request): boolean {
  if (getStore().mode === "local") return true;
  if (process.env.GLASSHOUSE_ALLOW_ANON_READ === "1") return true;
  const secret = process.env.GLASSHOUSE_SETUP_SECRET;
  return Boolean(secret) && req.headers.get("x-glasshouse-setup") === secret;
}
