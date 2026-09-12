"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Digest, DigestWindowKind } from "@glasshouse/translate";
import type { ProjectSummary } from "@/lib/store/types";
import { Alert } from "./icons";
import { NEEDS_YOU_TEXT, RISK_TEXT, STAGE_TEXT, TOOL_NAMES, ago } from "./labels";
import { Loading } from "./Loading";
import { PageHeader } from "./PageHeader";

const WINDOWS: Array<{ kind: DigestWindowKind; label: string }> = [
  { kind: "since-checked", label: "Since you last checked" },
  { kind: "today", label: "Today" },
  { kind: "week", label: "This week" },
];

/** Opening the digest counts as checking, once you have had it open for a moment. */
const MARK_AFTER_MS = 12_000;

export function DigestView({ project }: { project: ProjectSummary }) {
  const [kind, setKind] = useState<DigestWindowKind>("since-checked");
  const [digest, setDigest] = useState<Digest | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const marked = useRef(false);

  const load = useCallback(
    async (k: DigestWindowKind) => {
      setError(null);
      try {
        const res = await fetch(`/api/digest/${project.id}?window=${k}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = (await res.json()) as { digest: Digest; lastCheckedAt?: string };
        setDigest(data.digest);
        setLastCheckedAt(data.lastCheckedAt);
      } catch {
        setError("Could not load the digest right now.");
      }
    },
    [project.id],
  );

  useEffect(() => {
    void load(kind);
  }, [kind, load]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 15000);
    const mark = setTimeout(() => {
      if (marked.current) return;
      marked.current = true;
      void fetch(`/api/digest/${project.id}`, { method: "POST" }).catch(() => undefined);
    }, MARK_AFTER_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(mark);
    };
  }, [project.id]);

  return (
    <main className="page">
      <PageHeader back={`/room/${project.id}`} title={project.name} />

      <div className="page-intro">
        <h1>Digest</h1>
        <p>What your agents did while you were doing something else.</p>
      </div>

      <div className="toolbar">
        <div className="segmented" role="tablist" aria-label="Digest window">
          {WINDOWS.map((w) => (
            <button key={w.kind} role="tab" aria-selected={kind === w.kind} onClick={() => setKind(w.kind)}>
              {w.label}
            </button>
          ))}
        </div>
        <span className="faint small">
          {kind === "since-checked" ? (lastCheckedAt ? `Last checked ${new Date(lastCheckedAt).toLocaleString()}` : "First look: showing the last 24 hours") : ""}
        </span>
      </div>

      {error && (
        <div className="notice critical" role="alert">
          <Alert />
          <div className="notice-body">
            <span>{error}</span>
            <button className="link-button" onClick={() => void load(kind)}>
              Try again
            </button>
          </div>
        </div>
      )}
      {!digest && !error && <Loading label="Loading the digest" />}

      {digest && (
        <div className="digest">
          {digest.summary && <p className="digest-summary">{digest.summary}</p>}

          <section className={`digest-section${digest.needsYou.length > 0 ? " lit" : ""}`}>
            <h2 className="section-label">Needs you</h2>
            {digest.needsYou.length === 0 ? (
              <p className="muted">Nothing needs you.</p>
            ) : (
              <ul className="digest-list">
                {digest.needsYou.map((n) => (
                  <li key={`${n.taskId}-${n.from}`}>
                    <span>
                      <span className="needs-badge" data-need={n.status}>
                        {NEEDS_YOU_TEXT[n.status]}
                      </span>{" "}
                      <strong>{n.headline}</strong> <span className="digest-meta">{TOOL_NAMES[n.tool]}</span>
                    </span>
                    {n.detail && <span className="muted">{n.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
            {digest.needsYou.some((n) => n.from === "report") && (
              <a href={`/room/${project.id}/inbox`} className="link-accent link-underline small">
                Open the inbox to clear these
              </a>
            )}
          </section>

          <div className="digest-grid">
            <section className="digest-section">
              <h2 className="section-label">Done</h2>
              {digest.done.length === 0 ? (
                <p className="muted">Nothing finished in this window.</p>
              ) : (
                <ul className="digest-list">
                  {digest.done.map((d) => (
                    <li key={d.taskId}>
                      <strong>{d.headline}</strong>
                      <span className="digest-meta">
                        {TOOL_NAMES[d.tool]} · {RISK_TEXT[d.risk]} · {ago(d.endedAt, now)}
                        {d.needsYou !== "nothing" ? ` · ${NEEDS_YOU_TEXT[d.needsYou]}` : ""}
                        {d.note ? ` · ${d.note}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="digest-section">
              <h2 className="section-label">Still going</h2>
              {digest.stillGoing.length === 0 ? (
                <p className="muted">No agent is working right now.</p>
              ) : (
                <ul className="digest-list">
                  {digest.stillGoing.map((g) => (
                    <li key={g.taskId}>
                      <strong>{g.headline}</strong>
                      <span className="digest-meta">
                        {TOOL_NAMES[g.tool]} · {STAGE_TEXT[g.stage]}
                        {g.location ? ` · in ${g.location}` : ""} · {ago(g.lastEventAt, now)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="digest-section">
              <h2 className="section-label">New in your app</h2>
              {digest.newInApp.areas.length === 0 && digest.newInApp.dependencies.length === 0 && digest.newInApp.filesCreated === 0 ? (
                <p className="muted">Nothing new.</p>
              ) : (
                <ul className="digest-list">
                  {digest.newInApp.areas.length > 0 && <li>New parts of your app: {digest.newInApp.areas.join(", ")}</li>}
                  {digest.newInApp.dependencies.length > 0 && <li>New tools added to the project: {digest.newInApp.dependencies.join(", ")}</li>}
                  {digest.newInApp.filesCreated > 0 && (
                    <li>
                      {digest.newInApp.filesCreated} new file{digest.newInApp.filesCreated === 1 ? "" : "s"}
                      {digest.newInApp.areasWithNewFiles.length > 0 ? ` in ${digest.newInApp.areasWithNewFiles.join(", ")}` : ""}
                    </li>
                  )}
                </ul>
              )}
            </section>

            <section className="digest-section">
              <h2 className="section-label">Tools used</h2>
              {digest.toolsUsed.length === 0 ? (
                <p className="muted">No agent ran in this window.</p>
              ) : (
                <ul className="digest-list">
                  {digest.toolsUsed.map((t) => (
                    <li key={t.tool}>
                      <span>
                        {TOOL_NAMES[t.tool]}: {t.tasks} task{t.tasks === 1 ? "" : "s"}
                        {t.note ? <span className="faint"> · {t.note}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="page-foot">
            <span>
              Window: {new Date(digest.window.start).toLocaleString()} to {new Date(digest.window.end).toLocaleString()}
            </span>
            <span>{digest.summarySource === "ai" ? "Opening lines written by AI; every list is from the record" : "Every list is from the record; add an AI key for an opening summary"}</span>
          </div>
        </div>
      )}
    </main>
  );
}
