"use client";

import { useEffect, useState } from "react";
import type { DemoFrame } from "@/lib/demo";
import { Check } from "./icons";
import { MockTile } from "./MockTile";

/** A random id kept in the browser so visitors are counted once, never identified. */
export function visitorId(): string {
  try {
    const key = "glasshouse.visitor";
    let id = localStorage.getItem(key);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

export function SignUpForm({ next = "/", label = "Get started", local = false }: { next?: string; label?: string; local?: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
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
  if (state === "sent")
    return (
      <div className="notice" role="status">
        <Check />
        <div className="notice-body">Check your email for a sign-in link. It works once and expires in an hour.</div>
      </div>
    );
  return (
    <form
      className="signup"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("sending");
        setMessage(null);
        try {
          const res = await fetch("/api/auth/signin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, next, visitorId: visitorId() }) });
          const data = (await res.json()) as { error?: string };
          if (!res.ok) throw new Error(data.error ?? "Could not send the link.");
          setState("sent");
        } catch (err) {
          setState("error");
          setMessage(err instanceof Error ? err.message : "Could not send the link.");
        }
      }}
    >
      <label className="visually-hidden" htmlFor="signup-email">
        Your email address
      </label>
      <input id="signup-email" className="field" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={state === "sending"} />
      <button className="button primary" type="submit" disabled={state === "sending" || !email}>
        {state === "sending" ? <span className="spinner" /> : null}
        {state === "sending" ? "Sending" : label}
      </button>
      {message && (
        <div className="signup-note error-text" role="alert">
          {message}
        </div>
      )}
    </form>
  );
}

const FREE = ["1 project", "1 agent at a time", "The live Room and report cards", "Last 24 hours of history"];
const PRO = ["Unlimited projects and agents", "Full history", "Daily and weekly digests", "The needs-you inbox", "Ask questions about any task"];

export function Landing({ frames, productName, priceGbp, local, connectCommand }: { frames: DemoFrame[]; productName: string; priceGbp: number; local: boolean; connectCommand: string }) {
  useEffect(() => {
    void fetch("/api/metrics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "landing_view", visitorId: visitorId() }) }).catch(() => undefined);
  }, []);
  return (
    <main className="landing">
      <header className="landing-head">
        <strong className="page-title">{productName}</strong>
        <nav>
          <a className="nav-link" href="#price">
            Price
          </a>
          <a className="nav-link" href={local ? "/" : "/signin"}>
            {local ? "Open the Room" : "Sign in"}
          </a>
        </nav>
      </header>

      <section className="hero">
        <p className="works-with">
          <span className="dot" aria-hidden="true" />
          Claude Code, Codex, Cursor, and anything that saves to GitHub
        </p>
        <h1>See what your AI coding agents are doing. In plain English.</h1>
        <p className="lede">
          You prompt on one screen. On the other, {productName} narrates: what each agent is doing this second, which part of your app that is, whether it is stuck or waiting for you. When it
          finishes, the tile turns into a report card. When your credits run out and you switch tools, the story carries on.
        </p>
        <SignUpForm local={local} label="Get started free" />
      </section>

      <section className="landing-section">
        <MockTile frames={frames} />
        <p className="faint small">A recording of two real sessions, replayed through the real product. Not a mock-up.</p>
      </section>

      <section className="landing-section">
        <div className="three">
          <div>
            <h3>Watch, don&apos;t read code</h3>
            <p>Every action becomes one plain line: “Changing how logged-in users are identified”, not a file path. The real action is one click away when you want it.</p>
          </div>
          <div>
            <h3>Backed by facts, never guesses</h3>
            <p>“Not touched: Payments” is worked out from the list of files that changed. Risk comes from which parts were touched. Nothing reassuring is invented.</p>
          </div>
          <div>
            <h3>One story across tools</h3>
            <p>Claude Code hits its limit mid-task. You open Codex. The Room shows “Continuing from Claude Code” and the report covers both.</p>
          </div>
        </div>
      </section>

      <section className="landing-section how">
        <div className="landing-section-head">
          <p className="eyebrow">Setup</p>
          <h2>Running in a minute</h2>
        </div>
        <ol>
          <li>
            <span>
              Sign in with your email, then in your project folder run <code>{connectCommand}</code>.
            </span>
          </li>
          <li>
            <span>Start Claude Code, Codex or Cursor as usual. The tile appears within a second.</span>
          </li>
          <li>
            <span>Put the tab on your second monitor and get on with your day.</span>
          </li>
        </ol>
        <p className="muted measure">
          It only ever watches. It cannot pause, approve or change what an agent does. File names, commands and your prompts are sent; file contents never are, except the changes in a finished task
          for its report card.
        </p>
      </section>

      <section className="landing-section" id="price">
        <div className="landing-section-head">
          <p className="eyebrow">Price</p>
          <h2>Free while you try it.</h2>
        </div>
        <div className="plans">
          <div className="plan">
            <div className="plan-head">
              <span className="plan-name">Free</span>
            </div>
            <div className="plan-price">£0</div>
            <ul className="plan-features">
              {FREE.map((f) => (
                <li key={f}>
                  <Check />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="plan">
            <div className="plan-head">
              <span className="plan-name">Pro</span>
            </div>
            <div className="plan-price">
              £{priceGbp}
              <span>/month</span>
            </div>
            <ul className="plan-features">
              {PRO.map((f) => (
                <li key={f}>
                  <Check />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="cta">
        <h2>Two tools. One story. You never opened the code.</h2>
        <SignUpForm local={local} label="Get started free" />
      </section>

      <footer className="landing-foot">
        {productName} is watch-only by design. Built for people who run AI coding agents and would rather understand than supervise.
      </footer>
    </main>
  );
}
