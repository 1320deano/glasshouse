"use client";

import { useState } from "react";
import { askServer } from "@/lib/answer";
import { PLAN_LIMITS } from "@/lib/plan";
import { Alert, Check } from "./icons";
import { PageHeader } from "./PageHeader";

export function Account({ productName, email, plan, priceGbp, billing, local, subscriptionStatus, upgraded, projects }: { productName: string; email?: string; plan: "free" | "pro"; priceGbp: number; billing: boolean; local: boolean; subscriptionStatus?: string; upgraded: boolean; projects: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(path: string) {
    setBusy(true);
    setError(null);
    const { data, problem } = await askServer<{ url?: string; error?: string }>(() => fetch(path, { method: "POST" }), "Not available just now.");
    if (problem || !data?.url) {
      setError(problem ?? "Not available just now.");
      setBusy(false);
      return;
    }
    window.location.href = data.url;
  }

  const free = [`${PLAN_LIMITS.free.projects} project`, `${PLAN_LIMITS.free.agentsAtOnce} agent at a time`, "The live Room and report cards", "Last 24 hours of history"];
  const pro = ["Unlimited projects and agents", "Full history", "Daily and weekly digests", "The needs-you inbox", "Ask questions about any task"];

  return (
    <main className="page narrow">
      <PageHeader
        brand={productName}
        title="Your account"
        right={
          !local ? (
            <form action="/api/auth/signout" method="post">
              <button className="button subtle" type="submit">
                Sign out
              </button>
            </form>
          ) : undefined
        }
      />

      <div className="page-intro">
        <h1>Your account</h1>
        {email && <p className="faint">{email}</p>}
      </div>

      {upgraded && (
        <div className="notice" role="status">
          <Check />
          <div className="notice-body">Thank you. Pro is on the way; it switches on the moment the payment is confirmed, usually within a minute.</div>
        </div>
      )}

      <div className="plans">
        <div className={`plan${plan === "free" ? " current" : ""}`}>
          <div className="plan-head">
            <span className="plan-name">Free</span>
            {plan === "free" && <span className="badge sm">your plan</span>}
          </div>
          <div className="plan-price">£0</div>
          <ul className="plan-features">
            {free.map((f) => (
              <li key={f}>
                <Check />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <div className={`plan${plan === "pro" ? " current" : ""}`}>
          <div className="plan-head">
            <span className="plan-name">Pro</span>
            {plan === "pro" && <span className="badge sm">your plan</span>}
          </div>
          <div className="plan-price">
            £{priceGbp}
            <span>/month</span>
          </div>
          <ul className="plan-features">
            {pro.map((f) => (
              <li key={f}>
                <Check />
                {f}
              </li>
            ))}
          </ul>
          {plan === "free" && !local && (
            <div className="plan-cta">
              <button className="button primary block" disabled={busy || !billing} onClick={() => void go("/api/billing/checkout")}>
                {billing ? (busy ? "Opening checkout…" : "Upgrade to Pro") : "Upgrades open soon"}
              </button>
            </div>
          )}
          {plan === "pro" && !local && billing && subscriptionStatus !== "manual" && (
            <div className="plan-cta">
              <button className="button block" disabled={busy} onClick={() => void go("/api/billing/portal")}>
                Manage or cancel
              </button>
            </div>
          )}
          {plan === "pro" && subscriptionStatus === "manual" && <p className="faint small">Switched on for you as a tester. Nothing to pay.</p>}
        </div>
      </div>

      {error && (
        <div className="notice critical" role="alert">
          <Alert />
          <div className="notice-body">{error}</div>
        </div>
      )}

      <div className="page-foot">
        {!billing && !local && <span>Billing is not connected yet. During the private test, Pro is switched on by hand.</span>}
        {local && <span>You are running {productName} on your own computer, where everything is on. To preview the free tier, start the Room with GLASSHOUSE_PLAN=free.</span>}
        <span>
          {projects} project{projects === 1 ? "" : "s"} connected.{" "}
          <a className="link-accent link-underline" href="/connect">
            Connect another
          </a>
        </span>
      </div>
    </main>
  );
}
