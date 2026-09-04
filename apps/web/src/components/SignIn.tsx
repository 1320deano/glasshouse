"use client";

import { SignUpForm } from "./Landing";

export function SignIn({ productName, next, error, inviteOnly }: { productName: string; next: string; error?: string; inviteOnly: boolean }) {
  return (
    <main className="room narrow">
      <div className="room-header">
        <div>
          <a href="/">← {productName}</a>
        </div>
      </div>
      <div className="settings-intro">
        <h2>Sign in</h2>
        <p>Enter your email and we will send a link. No password to remember.</p>
        {inviteOnly && <p className="muted">This is a private test for now. If your email is not on the list you will be told, and can ask for an invite.</p>}
        {error === "expired" && <div className="notice error">That link has expired or was already used. Ask for a new one below.</div>}
        {error === "link" && <div className="notice error">That link did not work. Ask for a new one below.</div>}
      </div>
      <SignUpForm next={next} label="Send me a link" />
    </main>
  );
}
