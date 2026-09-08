"use client";

import { AuthForm } from "./AuthForm";
import { Alert } from "./icons";
import { PageHeader } from "./PageHeader";

/**
 * Making an account and coming back to one: the same screen with two sets of words. An email and
 * a password, nothing to confirm, no link in an inbox.
 */
export function AuthScreen({ mode, productName, next, error, inviteOnly, testAccount }: { mode: "signup" | "signin"; productName: string; next: string; error?: string; inviteOnly: boolean; testAccount?: boolean }) {
  const signingUp = mode === "signup";
  const title = signingUp ? "Create your account" : "Sign in";
  const other = signingUp ? { href: "/signin", lead: "Already have an account?", label: "Sign in" } : { href: "/signup", lead: "No account yet?", label: "Create one" };
  const otherHref = next && next !== "/" ? `${other.href}?next=${encodeURIComponent(next)}` : other.href;
  return (
    <main className="page narrow">
      <PageHeader brand={productName} title={signingUp ? "Create account" : "Sign in"} />
      <div className="page-intro">
        <h1>{title}</h1>
        <p>{signingUp ? "An email address and a password. That is the whole of it — no confirmation email to wait for." : "The email address and password you signed up with."}</p>
        {inviteOnly && signingUp && <p className="faint small">This is a private test for now. If your email is not on the list you will be told, and can ask for an invite.</p>}
      </div>
      {error === "dev" && (
        <div className="notice critical" role="alert">
          <Alert />
          <div className="notice-body">The test account could not be signed in. Run `pnpm dev:account` to make it again.</div>
        </div>
      )}
      <AuthForm mode={mode} next={next} label={signingUp ? "Create account" : "Sign in"} />
      <p className="faint small" style={{ marginTop: "var(--space-4)" }}>
        {other.lead}{" "}
        <a className="link-button" href={otherHref}>
          {other.label}
        </a>
      </p>
      {testAccount && (
        <p className="faint small" style={{ marginTop: "var(--space-2)" }}>
          Testing on this computer:{" "}
          <a className="link-button" href={`/api/auth/dev?next=${encodeURIComponent(next)}`}>
            sign in as the test account
          </a>
        </p>
      )}
    </main>
  );
}
