"use client";

import { useEffect } from "react";
import type { DemoFrame, DemoSuggestion } from "@/lib/demo-chapters";
import { visitorId } from "@/lib/visitor";
import { AuthForm } from "./AuthForm";
import { Demo } from "./Demo";
import { ArrowRight, Check, Handoff, Inbox, Layers, Screen, Search, Sprout } from "./icons";
import { ToolLogo } from "./ToolLogo";

/**
 * The landing page (brief 14.2, day 1 to 3: "the two-monitor story and a mock tile"). Rebuilt so
 * the page shows the product instead of describing it. Everything on it that looks like the Room
 * is the Room's own output over the two recorded sessions (lib/demo.ts): the demo, the "this is
 * the moment" callout, the report card, the handoff, and the two helpers the Potting Shed would
 * propose. So rule 2 holds on the landing page too: no reassuring line here is typed in by hand.
 */

const FREE = ["1 project", "1 agent at a time", "The live Room and report cards", "Last 24 hours of history"];
const PRO = ["Unlimited projects and agents", "Full history: go back to any task", "Daily and weekly digests", "The needs-you inbox", "Ask questions about any task", "As many helpers as you like"];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Does it slow my agent down?",
    a: "No. Each listener writes one small file and exits at once; nothing waits for the Room. If the Room is off, actions queue on your computer and are sent the next time it is up.",
  },
  {
    q: "Can it change what my agent does?",
    a: "No. It is watch-only by design: there is no pause, approve or send. The one button that is “for the agent” copies words for you to paste into the agent’s own window yourself.",
  },
  {
    q: "Which tools does it understand?",
    a: "Claude Code in full: stage, headline, where, why, stuck detection, report cards. Codex and Cursor at a standard depth, and their cards say so. Anything else is followed through file saves and commits.",
  },
  {
    q: "Do I need an AI key?",
    a: "No. Everything works from templates and the names of your folders. With a key, headlines, report cards and the digest get better words. The facts underneath never change: what was touched, what was not, what the checks said.",
  },
  {
    q: "What if a plain-English line is wrong?",
    a: "The real action is one click away behind “technical detail”, on every line. A thumbs-down on any line records it with the action behind it, so the worst translations get fixed.",
  },
  {
    q: "What does it run on?",
    a: "macOS, Linux, and Windows with Git Bash installed (it comes with Git). One command in the project folder connects it; nothing runs in the background afterwards except the listeners your agent calls.",
  },
];

export function Landing({
  frames,
  suggestions,
  siteName,
  productName,
  shedName,
  priceGbp,
  local,
  connectCommand,
}: {
  frames: DemoFrame[];
  suggestions: DemoSuggestion[];
  siteName: string;
  productName: string;
  shedName: string;
  priceGbp: number;
  local: boolean;
  connectCommand: string;
}) {
  useEffect(() => {
    void fetch("/api/metrics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "landing_view", visitorId: visitorId() }) }).catch(() => undefined);
  }, []);

  const last = frames[frames.length - 1];
  const moment = frames.find((f) => f.moment)?.moment;
  const report = last?.tiles.find((t) => t.tool === "codex" && t.card)?.card;
  const stopped = last?.tiles.find((t) => t.endReason === "usage_limit");
  const carried = last?.tiles.find((t) => t.continuedFrom);
  const shown = suggestions.filter((s) => s.kind === "sensitive" || s.kind === "handoff").slice(0, 2);

  return (
    <>
      <a className="skip-link" href="#start">
        Skip to getting started
      </a>
      <main className="landing">
        <header className="landing-head">
          <a className="brand" href="/">
            <strong className="page-title">{siteName}</strong>
          </a>
          <nav aria-label="Landing page">
            <a className="nav-link" href="#how">
              How it works
            </a>
            <a className="nav-link" href="#shed">
              {shedName}
            </a>
            <a className="nav-link" href="#price">
              Price
            </a>
            <a className="nav-link" href={local ? "/" : "/signin"}>
              {local ? `Open ${siteName}` : "Sign in"}
            </a>
          </nav>
        </header>

        <section className="hero" id="start">
          <p className="works-with">
            <span className="works-with-marks" aria-hidden="true">
              <ToolLogo tool="claude-code" size={14} />
              <ToolLogo tool="codex" size={14} />
              <ToolLogo tool="cursor" size={14} />
            </span>
            Works with Claude Code, Codex, Cursor, and anything that saves to GitHub
          </p>
          <h1>See what your AI coding agents are doing. In plain English.</h1>
          <p className="lede">
            You prompt on one screen. On the other, {siteName} narrates: what each agent is doing this second, which part of your app that is, whether it is stuck or waiting for you. When it
            finishes, its card turns into a report card. When your credits run out and you switch tools, the story carries on.
          </p>
          <AuthForm local={local} label="Get started free" />
          <ul className="hero-facts" aria-label="Three things to know">
            <li>
              <Check /> Watch-only. Nothing here can touch an agent.
            </li>
            <li>
              <Check /> One command to connect a project.
            </li>
            <li>
              <Check /> Free while you try it.
            </li>
          </ul>
        </section>

        <section className="landing-section" id="how" aria-labelledby="how-title">
          <div className="landing-section-head">
            <p className="eyebrow">A recording, not a mock-up</p>
            <h2 id="how-title">Two monitors. One story.</h2>
            <p>
              Two real sessions, replayed through the real product. Nothing on the right was typed in by hand: every card, line and verified fact is computed from what the agents actually did.
            </p>
          </div>
          <Demo frames={frames} />
        </section>

        <section className="landing-section proofs" aria-label="What makes it different">
          <article className="proof">
            <div className="proof-words">
              <p className="eyebrow">The first session</p>
              <h3>The moment you would have missed</h3>
              <p>
                You asked for a dashboard change. It changed how people log in. The Room says so the moment it happens, with your own instruction beside it and one line on why it matters. No
                digging, no diff.
              </p>
            </div>
            <div className="proof-show">
              {moment ? (
                <aside className="moment demo-moment">
                  <p className="moment-label">This is the moment</p>
                  <p className="moment-fact">{moment.fact}</p>
                  <p className="moment-why">{moment.why}</p>
                </aside>
              ) : null}
              <p className="proof-note">Computed from the recorded session above, by the same code that runs in the Room.</p>
            </div>
          </article>

          <article className="proof">
            <div className="proof-words">
              <p className="eyebrow">Every task</p>
              <h3>Reassurance you can check</h3>
              <p>
                “Not touched: Payments” is not an opinion. It is worked out from the list of files that changed. So is the risk, so are the checks. Nothing reassuring on a card is generated or
                guessed, and the real action behind every line is one click away.
              </p>
            </div>
            <div className="proof-show">
              {report ? (
                <div className="proof-report">
                  <p className="proof-report-head">
                    <ToolLogo tool="codex" size={14} /> Codex <span className="status" data-status="done"><span className="dot" aria-hidden="true" />Finished</span>
                  </p>
                  <p className="proof-report-title">{report.headline}</p>
                  <dl className="msg-facts">
                    <div>
                      <dt>Touched</dt>
                      <dd>{report.touched.join(" · ")}</dd>
                    </div>
                    <div className="verified">
                      <dt>
                        <Check /> Not touched
                      </dt>
                      <dd>{report.notTouched.join(" · ")}</dd>
                    </div>
                    {report.checks && (
                      <div>
                        <dt>Checks</dt>
                        <dd>{report.checks}</dd>
                      </div>
                    )}
                    <div>
                      <dt>Risk</dt>
                      <dd className="risk-word" data-level={report.risk}>
                        {report.risk === "high" ? "High risk" : report.risk === "medium" ? "Medium risk" : "Low risk"}
                        {report.riskReason ? `: ${report.riskReason.toLowerCase()}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>Needs you</dt>
                      <dd>
                        <span className="pill sm" data-need={report.needsYou}>
                          {report.needsYou === "review" ? "Review recommended" : report.needsYou === "decision" ? "Decision needed" : report.needsYou === "blocked" ? "Blocked" : "Nothing"}
                        </span>
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : null}
              <p className="proof-note">The report card from the session above. Touched and not touched come from the changed-files list; the words may be improved by AI, the facts may not.</p>
            </div>
          </article>

          <article className="proof">
            <div className="proof-words">
              <p className="eyebrow">Across tools</p>
              <h3>One story, whichever tool you pick up</h3>
              <p>
                Claude Code hits its limit mid-task. You open Codex. The new card says it is continuing from Claude Code, the report covers both, and a month later the history is the one place
                the whole project’s story exists, whatever tools you used. No lab will build this for a rival’s tool. {siteName} is neutral, so it falls out naturally.
              </p>
            </div>
            <div className="proof-show">
              {stopped && carried ? (
                <div className="proof-handoff">
                  <div className="proof-mini" data-status="limit">
                    <span className="agent-tool">
                      <ToolLogo tool={stopped.tool} /> {stopped.tool === "claude-code" ? "Claude Code" : "Codex"}
                    </span>
                    <span className="status" data-status="limit">
                      <span className="dot" aria-hidden="true" />
                      Stopped: usage limit
                    </span>
                    <span className="proof-mini-where">Working in {stopped.location}</span>
                  </div>
                  <span className="proof-arrow" aria-hidden="true">
                    <Handoff size={16} />
                  </span>
                  <div className="proof-mini" data-status="done">
                    <span className="agent-tool">
                      <ToolLogo tool={carried.tool} /> {carried.tool === "codex" ? "Codex" : "Claude Code"}
                    </span>
                    <span className="agent-continuing">
                      <Handoff /> Continuing from {stopped.tool === "claude-code" ? "Claude Code" : "Codex"}
                    </span>
                    <span className="status" data-status="done">
                      <span className="dot" aria-hidden="true" />
                      Finished{carried.card?.checks ? ` · ${carried.card.checks.toLowerCase()}` : ""}
                    </span>
                  </div>
                </div>
              ) : null}
              <p className="proof-note">The handoff is recognised from the record: the same part of the app, the same words in the new instruction, minutes apart.</p>
            </div>
          </article>
        </section>

        <section className="landing-section" aria-labelledby="room-title">
          <div className="landing-section-head">
            <p className="eyebrow">{productName}</p>
            <h2 id="room-title">The Room, in six lines</h2>
            <p>A browser tab on the second monitor. Glanced at, never leaned into. Every word in it is written for someone who will never open the code.</p>
          </div>
          <ul className="features">
            <li>
              <span className="feature-icon" aria-hidden="true">
                <Screen size={16} />
              </span>
              <span className="feature-text">
                <strong>One card per agent.</strong> What it is doing now, which part of your app that is, whether it is stuck or waiting for you. The only thing allowed to light up is “waiting for
                you”.
              </span>
            </li>
            <li>
              <span className="feature-icon" aria-hidden="true">
                <Layers size={16} />
              </span>
              <span className="feature-text">
                <strong>The story.</strong> A running account of the project that gets a line only when something changes meaning: started, waiting, stuck, finished, ran out. Every action is still
                there underneath.
              </span>
            </li>
            <li>
              <span className="feature-icon" aria-hidden="true">
                <Check size={16} />
              </span>
              <span className="feature-text">
                <strong>Progress as stages, never percentages.</strong> Looking, planning, building, testing, finished, per part of your app. An agent cannot honestly say it is 68% done.
              </span>
            </li>
            <li>
              <span className="feature-icon" aria-hidden="true">
                <ArrowRight size={16} />
              </span>
              <span className="feature-text">
                <strong>A report card the moment a task ends.</strong> What changed and why, touched, verifiably not touched, the checks, the risk, and whether it needs you.
              </span>
            </li>
            <li>
              <span className="feature-icon" aria-hidden="true">
                <Inbox size={16} />
              </span>
              <span className="feature-text">
                <strong>The digest and the inbox.</strong> Since you last checked, today, this week. Everything that needs a decision in one list you clear yourself. <span className="feature-pro">Pro</span>
              </span>
            </li>
            <li>
              <span className="feature-icon" aria-hidden="true">
                <Search size={16} />
              </span>
              <span className="feature-text">
                <strong>Ask about any task.</strong> Answered only from that task’s record, naming the actions the answer rests on. Never a guess. <span className="feature-pro">Pro</span>
              </span>
            </li>
          </ul>
        </section>

        <section className="landing-section shed-pitch" id="shed" aria-labelledby="shed-title">
          <div className="landing-section-head">
            <p className="eyebrow">
              <Sprout size={12} /> The second product: {shedName}
            </p>
            <h2 id="shed-title">The only agent builder that has watched your project</h2>
            <p>
              Every other builder starts from a blank box. {shedName} starts from your record. It proposes helpers for your agents from what actually happened, you tick boxes instead of writing
              a prompt, one command places them for Claude Code, Codex and Cursor at once, and afterwards it checks whether each helper kept to its patch, from the files its runs changed.
            </p>
          </div>
          {shown.length > 0 && (
            <div className="shed-show">
              <ul className="suggestions" aria-label="Helpers proposed from the demo's record">
                {shown.map((s) => (
                  <li key={s.id} className="suggestion">
                    <p className="suggestion-name">
                      <Sprout size={14} /> {s.name}
                    </p>
                    <p className="suggestion-summary">{s.summary}</p>
                    <p className="suggestion-evidence">
                      <Check /> {s.evidence}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="proof-note">Proposed from the two sessions above, by the same code the Shed runs. Each carries the count it rests on and links to the tasks behind it.</p>
            </div>
          )}
        </section>

        <section className="landing-section setup" aria-labelledby="setup-title">
          <div className="setup-col how">
            <div className="landing-section-head">
              <p className="eyebrow">Setup</p>
              <h2 id="setup-title">Running in a minute</h2>
            </div>
            <ol>
              <li>
                <span>
                  Make an account with an email and a password. Then, in your project folder, run <code>{connectCommand}</code>.
                </span>
              </li>
              <li>
                <span>Start Claude Code, Codex or Cursor as usual. Its card appears within a second.</span>
              </li>
              <li>
                <span>Put the tab on your second monitor and get on with your day.</span>
              </li>
            </ol>
          </div>
          <div className="setup-col privacy">
            <div className="landing-section-head">
              <p className="eyebrow">What leaves your computer</p>
              <h2>Descriptions of actions. Not your code.</h2>
            </div>
            <dl className="privacy-list">
              <div>
                <dt>Always sent</dt>
                <dd>What kind of action it was, the file names involved, the commands run, the tool’s name, the time, and your prompts.</dd>
              </div>
              <div>
                <dt>Only for a report card, and the Ask box</dt>
                <dd>The changes in the files a finished task edited. Never a secrets file.</dd>
              </div>
              <div>
                <dt>Never sent</dt>
                <dd>Any other file contents. Passwords, keys and tokens: the connector strips them before anything leaves.</dd>
              </div>
            </dl>
            <p className="muted small">It only ever watches. It cannot pause, approve or change what an agent does, and it never slows one down.</p>
          </div>
        </section>

        <section className="landing-section" id="price" aria-labelledby="price-title">
          <div className="landing-section-head">
            <p className="eyebrow">Price</p>
            <h2 id="price-title">Free while you try it.</h2>
            <p>Free is enough to have the “I’d have missed that” moment. Pro is the Room plus the reasons to stay: the history, the digest, the inbox, the questions.</p>
          </div>
          <div className="plans landing-plans">
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
              <a className="button plan-cta" href={local ? "/" : "#start"}>
                Get started free
              </a>
            </div>
            <div className="plan featured">
              <div className="plan-head">
                <span className="plan-name">Pro</span>
                <span className="pill sm">Everything</span>
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
              <a className="button primary plan-cta" href={local ? "/" : "#start"}>
                Start free, upgrade when it bites
              </a>
            </div>
          </div>
          <p className="muted small measure">When it bites, in the order it usually does: a second project, history beyond a day, the morning digest, then the inbox.</p>
        </section>

        <section className="landing-section" aria-labelledby="faq-title">
          <div className="landing-section-head">
            <p className="eyebrow">Questions</p>
            <h2 id="faq-title">Before you run the command</h2>
          </div>
          <div className="faq">
            {FAQ.map((f) => (
              <details key={f.q} className="faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="cta">
          <h2>Two tools. One story. You never opened the code.</h2>
          <AuthForm local={local} label="Get started free" />
        </section>

        <footer className="landing-foot">
          <span>
            {siteName} is watch-only by design. Built for people who run AI coding agents and would rather understand than supervise.
          </span>
          <nav aria-label="Footer">
            <a className="nav-link" href="#price">
              Price
            </a>
            <a className="nav-link" href={local ? "/" : "/signin"}>
              {local ? `Open ${siteName}` : "Sign in"}
            </a>
          </nav>
        </footer>
      </main>
    </>
  );
}
