"use client";

import { useState } from "react";
import { MIN_PASSWORD, PASSWORD_RULE } from "@/lib/credentials";
import { visitorId } from "@/lib/visitor";

/**
 * The one email-and-password form, in both places it is needed: making an account and coming back.
 * There is no email to wait for and no link to click; the server signs this browser in as soon as
 * the account exists, and the page moves on.
 */
export function AuthForm({ mode = "signup", next = "/", label, local = false }: { mode?: "signup" | "signin"; next?: string; label?: string; local?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const signingUp = mode === "signup";
  const buttonLabel = label ?? (signingUp ? "Get started" : "Sign in");

  if (local) {
    return (
      <div className="signup">
        <a className="button primary" href="/">
          Open your Room
        </a>
        <span className="signup-note">You are running it on your own computer; there is nothing to sign up for.</span>
      </div>
    );
  }

  return (
    <form
      className="signup"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("working");
        setMessage(null);
        try {
          const res = await fetch(signingUp ? "/api/auth/signup" : "/api/auth/signin", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email, password, next, visitorId: visitorId() }),
          });
          const data = (await res.json()) as { error?: string; next?: string };
          if (!res.ok) throw new Error(data.error ?? (signingUp ? "Could not make the account." : "Could not sign in."));
          // The session cookie is on this browser now; a full load picks it up everywhere.
          window.location.href = data.next ?? next;
        } catch (err) {
          setState("error");
          setMessage(err instanceof Error ? err.message : signingUp ? "Could not make the account." : "Could not sign in.");
        }
      }}
    >
      <label className="visually-hidden" htmlFor={`${mode}-email`}>
        Your email address
      </label>
      <input
        id={`${mode}-email`}
        className="field"
        type="email"
        name="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={state === "working"}
      />
      <label className="visually-hidden" htmlFor={`${mode}-password`}>
        {signingUp ? `Choose a password, at least ${MIN_PASSWORD} characters` : "Your password"}
      </label>
      <input
        id={`${mode}-password`}
        className="field field-password"
        type="password"
        name="password"
        autoComplete={signingUp ? "new-password" : "current-password"}
        required
        minLength={signingUp ? MIN_PASSWORD : undefined}
        placeholder={signingUp ? "Choose a password" : "Your password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={state === "working"}
      />
      <button className="button primary" type="submit" disabled={state === "working" || !email || !password}>
        {state === "working" ? <span className="spinner" /> : null}
        {state === "working" ? (signingUp ? "Making your account" : "Signing in") : buttonLabel}
      </button>
      {signingUp && <span className="signup-note">{PASSWORD_RULE} No confirmation email; you are in as soon as you press the button.</span>}
      {message && (
        <div className="signup-note error-text" role="alert">
          {message}
        </div>
      )}
    </form>
  );
}
