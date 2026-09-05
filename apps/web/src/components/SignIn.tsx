"use client";

import { Alert } from "./icons";
import { SignUpForm } from "./Landing";
import { PageHeader } from "./PageHeader";

export function SignIn({ productName, next, error, inviteOnly }: { productName: string; next: string; error?: string; inviteOnly: boolean }) {
  return (
    <main className="page narrow">
      <PageHeader brand={productName} title="Sign in" />
      <div className="page-intro">
        <h1>Sign in</h1>
        <p>Enter your email and we will send a link. No password to remember.</p>
        {inviteOnly && <p className="faint small">This is a private test for now. If your email is not on the list you will be told, and can ask for an invite.</p>}
      </div>
      {error === "expired" && (
        <div className="notice critical" role="alert">
          <Alert />
          <div className="notice-body">That link has expired or was already used. Ask for a new one below.</div>
        </div>
      )}
      {error === "link" && (
        <div className="notice critical" role="alert">
          <Alert />
          <div className="notice-body">That link did not work. Ask for a new one below.</div>
        </div>
      )}
      <SignUpForm next={next} label="Send me a link" />
    </main>
  );
}
