"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Digest, DigestWindowKind } from "@glasshouse/translate";
import type { ProjectSummary } from "@/lib/store/types";
import { NEEDS_YOU_TEXT, RISK_TEXT, STAGE_TEXT, TOOL_NAMES, ago } from "./labels";

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
    <main className="room">
      <div className="room-header">
        <div>
          <a href={`/room/${project.id}`}>← Back to the Room</a>
        </div>
        <div>
          <strong>{project.name}</strong> · Digest
        </div>
      </div>

      <div className="settings-actions">
        {WINDOWS.map((w) => (
          <button key={w.kind} className={`button${kind === w.kind ? "" : " subtle"}`} onClick={() => setKind(w.kind)}>
            {w.label}
          </button>
        ))}
        <span className="muted small">
          {kind === "since-checked" ? (lastCheckedAt ? `Last checked ${new Date(lastCheckedAt).toLocaleString()}` : "First look: showing the last 24 hours") : ""}
        </span>
      </div>

      {error && <div className="notice error">{error}</div>}
      {!digest && !error && <div className="muted">Loading…</div>}

      {digest && (
        <div className="digest">
          {digest.summary && <p className="digest-summary">{digest.summary}</p>}

          <section className={`digest-section${digest.needsYou.length > 0 ? " lit" : ""}`}>
            <div className="panel-title">Needs you</div>
            {digest.needsYou.length === 0 ? (
              <p className="muted">Nothing needs you.</p>
            ) : (
              <ul className="digest-list">
                {digest.needsYou.map((n) => (
                  <li key={`${n.taskId}-${n.from}`}>
                    <span className={`needs-badge ${n.status}`}>{NEEDS_YOU_TEXT[n.status]}</span> <strong>{n.headline}</strong>
                    <span className="muted"> · {TOOL_NAMES[n.tool]}</span>
                    {n.detail && <div className="muted">{n.detail}</div>}
                  </li>
                ))}
              </ul>
            )}
            {digest.needsYou.some((n) => n.from === "report") && (
              <a href={`/room/${project.id}/inbox`} className="small">
                Open the inbox to clear these
              </a>
            )}
          </section>

          <div className="panel-grid">
            <section className="digest-section">
              <div className="panel-title">Done</div>
              {digest.done.length === 0 ? (
                <p className="muted">Nothing finished in this window.</p>
              ) : (
                <ul className="digest-list">
                  {digest.done.map((d) => (
                    <li key={d.taskId}>
                      <strong>{d.headline}</strong>
                      <div className="muted small">
                        {TOOL_NAMES[d.tool]} · {RISK_TEXT[d.risk]} · {ago(d.endedAt, now)}
                        {d.needsYou !== "nothing" ? ` · ${NEEDS_YOU_TEXT[d.needsYou]}` : ""}
                        {d.note ? ` · ${d.note}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="digest-section">
              <div className="panel-title">Still going</div>
              {digest.stillGoing.length === 0 ? (
                <p className="muted">No agent is working right now.</p>
              ) : (
                <ul className="digest-list">
                  {digest.stillGoing.map((g) => (
                    <li key={g.taskId}>
                      <strong>{g.headline}</strong>
                      <div className="muted small">
                        {TOOL_NAMES[g.tool]} · {STAGE_TEXT[g.stage]}
                        {g.location ? ` · in ${g.location}` : ""} · {ago(g.lastEventAt, now)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="digest-section">
              <div className="panel-title">New in your app</div>
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
              <div className="panel-title">Tools used</div>
              {digest.toolsUsed.length === 0 ? (
                <p className="muted">No agent ran in this window.</p>
              ) : (
                <ul className="digest-list">
                  {digest.toolsUsed.map((t) => (
                    <li key={t.tool}>
                      {TOOL_NAMES[t.tool]}: {t.tasks} task{t.tasks === 1 ? "" : "s"}
                      {t.note ? <span className="muted"> · {t.note}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="footer">
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
