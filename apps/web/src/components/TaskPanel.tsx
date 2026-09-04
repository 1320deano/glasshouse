"use client";

import { useEffect, useState } from "react";
import type { AskAnswer } from "@/lib/ai/ask";
import type { EventView, SessionView, TaskDetail } from "@/lib/store/types";
import { RISK_TEXT, TOOL_NAMES, ago, latencyOf } from "./labels";
import { ReportCard } from "./ReportCard";

/**
 * The expanded tile (brief 4.2): the live stream, Why, Where, What it's changed so far, and the
 * technical-detail toggle that shows the real action behind any line (rule 3).
 */

function Raw({ e }: { e: EventView }) {
  const [show, setShow] = useState(false);
  return (
    <div className="raw">
      <div className="raw-line">
        <span className="mono">{e.summary}</span>
        {e.paths.length > 0 && <span className="mono muted"> · {e.paths.join(", ")}</span>}
        {e.command && e.command !== e.summary && <span className="mono muted"> · {e.command}</span>}
        <span className="meta">
          {e.sourceTool ?? e.sourceEvent} · {latencyOf(e)}
        </span>
      </div>
      {e.text && <pre className="raw-text">{e.text}</pre>}
      <button className="link-button" onClick={() => setShow((s) => !s)}>
        {show ? "Hide the original payload" : "Show the original payload"}
      </button>
      {show && <pre className="raw-json">{JSON.stringify(e.raw ?? {}, null, 2)}</pre>}
    </div>
  );
}

/** Thumbs-down on a plain-English line (Phase 3): stored with the raw event so the worst translations can be reviewed. */
export function Dislike({ eventId }: { eventId: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  if (state === "sent") return <span className="dislike muted small">Noted, thanks</span>;
  return (
    <button
      className="dislike"
      title="This line is wrong or unclear"
      disabled={state === "sending"}
      onClick={async () => {
        setState("sending");
        try {
          const res = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventId }) });
          setState(res.ok ? "sent" : "failed");
        } catch {
          setState("failed");
        }
      }}
    >
      {state === "failed" ? "Could not send" : "👎"}
    </button>
  );
}

/** The Ask box (brief 5.1): a question about this task, answered from its record, with the actions it rests on. */
export function AskBox({ taskId, technical }: { taskId: string; technical: boolean }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Array<{ question: string; answer: AskAnswer }>>([]);

  async function ask() {
    const q = question.trim();
    if (q.length < 2 || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId, question: q }) });
      const data = (await res.json()) as AskAnswer & { error?: string };
      const answer: AskAnswer = res.ok ? data : { answer: null, basedOn: [], unsure: true, reason: data.error ?? "Could not ask right now." };
      setHistory((h) => [{ question: q, answer }, ...h]);
      setQuestion("");
    } catch {
      setHistory((h) => [{ question: q, answer: { answer: null, basedOn: [], unsure: true, reason: "Could not reach the Room." } }, ...h]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ask">
      <div className="panel-title">Ask about this task</div>
      <form
        className="ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Did it change how people log in?" maxLength={600} disabled={busy} />
        <button className="button" type="submit" disabled={busy || question.trim().length < 2}>
          {busy ? "Asking…" : "Ask"}
        </button>
      </form>
      <ul className="ask-history">
        {history.map((h, i) => (
          <li key={i}>
            <div className="ask-q">You asked: {h.question}</div>
            {h.answer.answer ? (
              <div className={`ask-a${h.answer.unsure ? " unsure" : ""}`}>{h.answer.answer}</div>
            ) : (
              <div className="ask-a muted">{h.answer.reason ?? "No answer."}</div>
            )}
            {h.answer.basedOn.length > 0 && (
              <div className="ask-basis muted small">
                Based on: {h.answer.basedOn.map((e) => e.plain).join(" · ")}
                {technical && <div className="mono">{h.answer.basedOn.map((e) => `${e.summary}${e.paths.length ? ` (${e.paths.join(", ")})` : ""}`).join(" · ")}</div>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TaskPanel({ session, now }: { session: SessionView; now: number }) {
  const taskId = session.task?.id;
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [technical, setTechnical] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/task/${taskId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status}`);
        const d = (await res.json()) as TaskDetail;
        if (!cancelled) setDetail(d);
      } catch {
        if (!cancelled) setError("Could not load this task right now.");
      }
    };
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [taskId, session.lastEventAt]);

  if (!taskId) {
    return (
      <div className="panel">
        <div className="panel-title">What it&apos;s doing</div>
        <ul className="stream">
          {session.recentEvents.map((e) => (
            <li key={e.id}>
              <span className="stream-line">{e.plain}</span>
              <span className="when">{ago(e.ts, now)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (error) return <div className="panel muted">{error}</div>;
  if (!detail) return <div className="panel muted">Loading…</div>;

  const helpers = new Set(detail.events.filter((e) => e.agentId).map((e) => e.agentId));

  return (
    <div className="panel">
      <div className="panel-bar">
        <label className="switch">
          <input type="checkbox" checked={technical} onChange={(ev) => setTechnical(ev.target.checked)} />
          Show technical detail
        </label>
        <span className="muted">
          {detail.eventCount} action{detail.eventCount === 1 ? "" : "s"}
          {helpers.size > 0 ? ` · ${helpers.size} helper${helpers.size === 1 ? "" : "s"}` : ""}
          {detail.headlineSource === "ai" ? " · headline written by AI" : ""}
        </span>
      </div>

      {detail.report && (
        <section>
          <div className="panel-title">Report card</div>
          <div className="report-headline">{detail.report.headline}</div>
          <ReportCard task={detail} technical={technical} />
        </section>
      )}

      <div className="panel-grid">
        <section>
          <div className="panel-title">Why</div>
          {detail.prompt ? <p className="prompt">You asked: {detail.prompt}</p> : <p className="muted">No instruction was captured for this task.</p>}
          {detail.plan && (
            <details>
              <summary>The agent&apos;s own plan</summary>
              <pre className="plan">{detail.plan}</pre>
            </details>
          )}
          {detail.continuedFrom && (
            <p className="muted">
              Continues the {TOOL_NAMES[detail.continuedFrom.tool]} task {detail.continuedFrom.headline ? `“${detail.continuedFrom.headline}”` : ""}. Why we think so: {detail.continuedFrom.reason}.
            </p>
          )}
          {detail.closingMessage && (
            <p className="muted">
              The agent&apos;s closing words: <em>{detail.closingMessage}</em>
            </p>
          )}
        </section>

        <section>
          <div className="panel-title">Where in your app</div>
          {detail.areas.length === 0 ? (
            <p className="muted">No part of the app touched yet.</p>
          ) : (
            <ul className="areas">
              {detail.areas.map((a) => (
                <li key={a.id}>
                  <strong>{a.name}</strong>
                  {a.changed.length > 0 ? ` · changed ${a.changed.length} file${a.changed.length === 1 ? "" : "s"}` : " · only looked at"}
                  {a.description && <div className="muted">{a.description}</div>}
                  {technical && <div className="mono muted small">{[...a.changed, ...a.looked].join(", ")}</div>}
                </li>
              ))}
            </ul>
          )}
          {detail.notTouched.length > 0 && (
            <p className="not-touched">
              Not changed: {detail.notTouched.join(" · ")}
              <span className="muted"> (checked against the list of files it changed)</span>
            </p>
          )}
          <p className={`risk-line ${detail.risk.level}`}>
            {RISK_TEXT[detail.risk.level]}: {detail.risk.reasons.join("; ")}
          </p>
        </section>

        <section>
          <div className="panel-title">What it&apos;s changed so far</div>
          {detail.changes.length === 0 ? (
            <p className="muted">Nothing changed yet.</p>
          ) : (
            <ul className="changes">
              {detail.changes.map((c) => (
                <li key={c.path}>
                  {c.plain}
                  {c.times > 1 ? ` (${c.times} times)` : ""}
                  {c.areaName ? <span className="muted"> · {c.areaName}</span> : null}
                  {technical && <div className="mono muted small">{c.path}</div>}
                </li>
              ))}
            </ul>
          )}
          {detail.lastTests && (
            <p className="muted">
              Last checks: {detail.lastTests.passed ?? 0} passed{detail.lastTests.failed ? `, ${detail.lastTests.failed} failed` : ""}
            </p>
          )}
          {detail.installs > 0 && <p className="muted">Added {detail.installs} new tool{detail.installs === 1 ? "" : "s"} to the project.</p>}
        </section>
      </div>

      <section>
        <div className="panel-title">What it&apos;s doing, newest first</div>
        <ul className="stream">
          {detail.events.map((e) => (
            <li key={e.id} className={`${e.success === false ? "failed" : ""}${e.agentId ? " helper" : ""}`}>
              <span className="stream-line">
                {e.agentId ? <span className="muted">helper · </span> : null}
                {e.plain}
              </span>
              <span className="when">{ago(e.ts, now)}</span>
              <Dislike eventId={e.id} />
              {technical && <Raw e={e} />}
            </li>
          ))}
        </ul>
      </section>

      <AskBox taskId={taskId} technical={technical} />
    </div>
  );
}
