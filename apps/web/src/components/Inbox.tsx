"use client";

import { useCallback, useEffect, useState } from "react";
import type { InboxItem, ProjectSummary } from "@/lib/store/types";
import { NEEDS_YOU_TEXT, RISK_TEXT, TOOL_NAMES, ago } from "./labels";

interface InboxState {
  open: InboxItem[];
  cleared: InboxItem[];
  days: number;
}

export function Inbox({ project }: { project: ProjectSummary }) {
  const [state, setState] = useState<InboxState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/inbox/${project.id}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status}`);
      setState((await res.json()) as InboxState);
      setError(null);
    } catch {
      setError("Could not load the inbox right now.");
    }
  }, [project.id]);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 15000);
    const tick = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  async function act(taskId: string, action: "clear" | "reopen") {
    setBusy(taskId);
    try {
      await fetch(`/api/inbox/${project.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId, action }) });
      await load();
    } finally {
      setBusy(null);
    }
  }

  const Item = ({ item, cleared }: { item: InboxItem; cleared?: boolean }) => (
    <li className={`inbox-item ${item.status}`}>
      <div className="inbox-main">
        <span className={`needs-badge ${item.status}`}>{NEEDS_YOU_TEXT[item.status]}</span>
        <strong>{item.headline}</strong>
        <div className="muted small">
          {TOOL_NAMES[item.tool]} · {RISK_TEXT[item.risk.level]}
          {item.endedAt ? ` · finished ${ago(item.endedAt, now)}` : ""}
          {cleared && item.resolvedAt ? ` · cleared ${ago(item.resolvedAt, now)}` : ""}
        </div>
        {item.detail && <div className="inbox-detail">{item.detail}</div>}
      </div>
      <div className="inbox-actions">
        <a className="button subtle" href={`/room/${project.id}#task-${item.taskId}`}>
          See the report
        </a>
        <button className="button" disabled={busy === item.taskId} onClick={() => void act(item.taskId, cleared ? "reopen" : "clear")}>
          {cleared ? "Put back" : "Clear"}
        </button>
      </div>
    </li>
  );

  return (
    <main className="room">
      <div className="room-header">
        <div>
          <a href={`/room/${project.id}`}>← Back to the Room</a>
        </div>
        <div>
          <strong>{project.name}</strong> · Needs you
        </div>
      </div>

      <div className="settings-intro">
        <p>Everything a report card flagged as Review recommended, Decision needed or Blocked, in one list. Clear an item once you have dealt with it.</p>
      </div>

      {error && <div className="notice error">{error}</div>}
      {!state && !error && <div className="muted">Loading…</div>}

      {state && (
        <>
          {state.open.length === 0 ? (
            <div className="empty">
              <h2>Nothing needs you.</h2>
              <p>When a finished task needs a look, a decision or is blocked, it appears here.</p>
            </div>
          ) : (
            <ul className="inbox">
              {state.open.map((item) => (
                <Item key={item.taskId} item={item} />
              ))}
            </ul>
          )}
          {state.cleared.length > 0 && (
            <>
              <div className="section-title">Cleared</div>
              <ul className="inbox cleared">
                {state.cleared.map((item) => (
                  <Item key={item.taskId} item={item} cleared />
                ))}
              </ul>
            </>
          )}
          <div className="footer">
            <span>Covers the last {state.days} days.</span>
          </div>
        </>
      )}
    </main>
  );
}
