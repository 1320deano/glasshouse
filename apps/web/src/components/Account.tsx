"use client";

import { useState } from "react";
import { PLAN_LIMITS } from "@/lib/plan";

export function Account({ productName, email, plan, priceGbp, billing, local, subscriptionStatus, upgraded, projects }: { productName: string; email?: string; plan: "free" | "pro"; priceGbp: number; billing: boolean; local: boolean; subscriptionStatus?: string; upgraded: boolean; projects: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(path: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Not available.");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Not available.");
      setBusy(false);
    }
  }

  return (
    <main className="room narrow">
      <div className="room-header">
        <div>
          <a href="/">← {productName}</a>
        </div>
        {!local && (
          <form action="/api/auth/signout" method="post">
            <button className="button subtle" type="submit">
              Sign out
            </button>
          </form>
        )}
      </div>

      <div className="settings-intro">
        <h2>Your account</h2>
        {email && <p className="muted">{email}</p>}
        {upgraded && <div className="notice">Thank you. Pro is on the way; it switches on the moment the payment is confirmed, usually within a minute.</div>}
      </div>

      <div className="price">
        <div className={`plan${plan === "free" ? " current" : ""}`}>
          <h3>Free {plan === "free" && <span className="tag">your plan</span>}</h3>
          <div className="amount">£0</div>
          <ul>
            <li>{PLAN_LIMITS.free.projects} project</li>
            <li>{PLAN_LIMITS.free.agentsAtOnce} agent at a time</li>
            <li>The live Room and report cards</li>
            <li>Last 24 hours of history</li>
          </ul>
        </div>
        <div className={`plan pro${plan === "pro" ? " current" : ""}`}>
          <h3>Pro {plan === "pro" && <span className="tag">your plan</span>}</h3>
          <div className="amount">
            £{priceGbp}
            <span>/month</span>
          </div>
          <ul>
            <li>Unlimited projects and agents</li>
            <li>Full history</li>
            <li>Daily and weekly digests</li>
            <li>The needs-you inbox</li>
            <li>Ask questions about any task</li>
          </ul>
          {plan === "free" && !local && (
            <button className="button primary" disabled={busy || !billing} onClick={() => void go("/api/billing/checkout")}>
              {billing ? (busy ? "Opening checkout…" : "Upgrade to Pro") : "Upgrades open soon"}
            </button>
          )}
          {plan === "pro" && !local && billing && subscriptionStatus !== "manual" && (
            <button className="button" disabled={busy} onClick={() => void go("/api/billing/portal")}>
              Manage or cancel
            </button>
          )}
          {plan === "pro" && subscriptionStatus === "manual" && <p className="muted small">Switched on for you as a tester. Nothing to pay.</p>}
        </div>
      </div>
      {!billing && !local && <p className="muted small">Billing is not connected yet. During the private test, Pro is switched on by hand.</p>}
      {local && <p className="muted small">You are running {productName} on your own computer, where everything is on. To preview the free tier, start the Room with GLASSHOUSE_PLAN=free.</p>}
      {error && <div className="notice error">{error}</div>}
      <p className="muted small">
        {projects} project{projects === 1 ? "" : "s"} connected. <a href="/connect">Connect another</a>
      </p>
    </main>
  );
}
