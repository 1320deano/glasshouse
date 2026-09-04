"use client";

import { useEffect, useState } from "react";
import type { DemoFrame } from "@/lib/demo";
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
        <span className="muted small">You are running it on your own computer; there is nothing to sign up for.</span>
      </div>
    );
  }
  if (state === "sent") return <div className="notice">Check your email for a sign-in link. It works once and expires in an hour.</div>;
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
      <input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={state === "sending"} />
      <button className="button primary" type="submit" disabled={state === "sending" || !email}>
        {state === "sending" ? "Sending…" : label}
      </button>
      {message && <div className="error small">{message}</div>}
    </form>
  );
}

export function Landing({ frames, productName, priceGbp, local, connectCommand }: { frames: DemoFrame[]; productName: string; priceGbp: number; local: boolean; connectCommand: string }) {
  useEffect(() => {
    void fetch("/api/metrics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "landing_view", visitorId: visitorId() }) }).catch(() => undefined);
  }, []);
  return (
    <main className="landing">
      <header className="landing-head">
        <strong>{productName}</strong>
        <nav>
          <a href="#price">Price</a>
          <a href={local ? "/" : "/signin"}>{local ? "Open the Room" : "Sign in"}</a>
        </nav>
      </header>

      <section className="hero">
        <p className="works-with">Works with Claude Code, Codex, Cursor and anything that saves to GitHub.</p>
        <h1>See what your AI coding agents are doing. In plain English. On your second monitor.</h1>
        <p className="lede">
          You prompt on one screen. On the other, {productName} narrates: what each agent is doing this second, which part of your app that is, whether it is stuck or waiting for you.
          When it finishes, the tile turns into a report card. When your credits run out and you switch tools, the story carries on.
        </p>
        <SignUpForm local={local} label="Get started free" />
      </section>

      <section className="demo">
        <MockTile frames={frames} />
        <p className="muted small">This is a recording of two real sessions, replayed through the real product. Not a mock-up.</p>
      </section>

      <section className="three">
        <div>
          <h3>Watch, don&apos;t read code</h3>
          <p>Every action becomes one plain line: “Changing how logged-in users are identified”, not a file path. The real action is one click away when you want it.</p>
        </div>
        <div>
          <h3>Backed by facts, never guesses</h3>
          <p>“Not touched: Payments ✓” is worked out from the list of files that changed. Risk comes from which parts were touched. Nothing reassuring is invented.</p>
        </div>
        <div>
          <h3>One story across tools</h3>
          <p>Claude Code hits its limit mid-task. You open Codex. The Room shows “Continuing from Claude Code” and the report covers both.</p>
        </div>
      </section>

      <section className="how">
        <h2>Set up in a minute</h2>
        <ol>
          <li>
            Sign in with your email, then in your project folder run <code>{connectCommand}</code>.
          </li>
          <li>Start Claude Code, Codex or Cursor as usual. The tile appears within a second.</li>
          <li>Put the tab on your second monitor and get on with your day.</li>
        </ol>
        <p className="muted">
          It only ever watches. It cannot pause, approve or change what an agent does. File names, commands and your prompts are sent; file contents never are, except the changes in a finished task for its report card.
        </p>
      </section>

      <section className="price" id="price">
        <div className="plan">
          <h3>Free</h3>
          <div className="amount">£0</div>
          <ul>
            <li>1 project</li>
            <li>1 agent at a time</li>
            <li>The live Room and report cards</li>
            <li>Last 24 hours of history</li>
          </ul>
        </div>
        <div className="plan pro">
          <h3>Pro</h3>
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
        </div>
      </section>

      <section className="cta">
        <h2>Two tools. One story. You never opened the code.</h2>
        <SignUpForm local={local} label="Get started free" />
      </section>

      <footer className="landing-foot muted small">
        {productName} is watch-only by design. Built for people who run AI coding agents and would rather understand than supervise.
      </footer>
    </main>
  );
}
