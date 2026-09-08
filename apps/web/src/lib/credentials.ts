/**
 * What counts as an email and a password, in one place, so the sign-up form, the sign-in form and
 * both routes agree. 72 is bcrypt's ceiling: anything longer is silently ignored, so it is refused
 * instead of quietly truncated.
 */
import { z } from "zod";

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 72;

export const PASSWORD_RULE = `At least ${MIN_PASSWORD} characters.`;

export const Credentials = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(MIN_PASSWORD).max(MAX_PASSWORD),
  next: z.string().max(400).optional(),
  visitorId: z.string().max(64).optional(),
});

/** Only ever send people to a path on this site. */
export function safePath(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
