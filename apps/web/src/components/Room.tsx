"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UPGRADE_REASONS, type GatedRoom } from "@/lib/plan";
import type { RoomState, SessionView } from "@/lib/store/types";
import { Alert, Info, Screen } from "./icons";
import { ReportProblem } from "./ReportProblem";
import { Tile } from "./Tile";
import { Walkthrough } from "./Walkthrough";

const ACTIVE_WINDOW_MS = 30 * 60 * 1000;
const POLL_MS = 10000;

function isActive(s: SessionView, now: number): boolean {
  if (s.endedAt) return false;
  const last = new Date(s.lastEventAt ?? s.startedAt).getTime();
  return now - last < ACTIVE_WINDOW_MS;
}

const LIVE_TEXT = { live: "Live", polling: "Refreshing every 10s", connecting: "Connecting" } as const;

export function Room({ initial, mode, productName, welcome = false, viewer }: { initial: GatedRoom; mode: "local" | "supabase"; productName: string; welcome?: boolean; viewer: { email?: string; admin: boolean; local: boolean } }) {
  const [gated, setGated] = useState<GatedRoom>(initial);
  const state: RoomState = gated.room;
  // Seeded from the server's own timestamp so the first client render matches the HTML exactly;
  // the real clock takes over on mount. Without this every "22 min ago" is a hydration mismatch.
  const [now, setNow] = useState(() => new Date(initial.room.generatedAt).getTime());
  const [live, setLive] = useState<"connecting" | "live" | "polling">("connecting");
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectId = initial.room.project.id;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/room/${projectId}`, { cache: "no-store" });
      if (res.ok) setGated((await res.json()) as GatedRoom);
    } catch {
      /* next poll will retry */
    }
  }, [projectId]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      void refresh();
    }, 150);
  }, [refresh]);

  useEffect(() => {
    setNow(Date.now());
    const es = new EventSource(`/api/live?projectId=${projectId}`);
    es.onopen = () => setLive("live");
    es.onmessage = (m) => {
      try {
        const data = JSON.parse(m.data as string) as { type: string };
        if (data.type === "update") scheduleRefresh();
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => setLive("polling");
    const poll = setInterval(() => void refresh(), POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      es.close();
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [projectId, refresh, scheduleRefresh]);

  const active = state.sessions.filter((s) => isActive(s, now));
  const quiet = state.sessions.filter((s) => !isActive(s, now)).slice(0, 4);
  const needsYou = active.filter((s) => s.task?.stage === "waiting");
  const sinceLabel = state.sinceChecked.done > 0 ? String(state.sinceChecked.done) : gated.plan === "free" ? "Pro" : null;

  return (
    <>
      <a className="skip-link" href="#agents">
        Skip to what the agents are doing
      </a>
      <main className="page room">
        <header className="page-head">
          <div className="page-head-left">
            <a className="brand" href="/">
              {productName}
            </a>
            <span className="crumb-sep" aria-hidden="true">
              /
            </span>
            <span className="page-title">{state.project.name}</span>
          </div>
          <nav className="room-nav" aria-label="This project">
            <a className="nav-link" href={`/room/${projectId}/digest`} title={state.lastCheckedAt ? `Last checked ${new Date(state.lastCheckedAt).toLocaleString()}` : "Not checked yet"}>
              Since you last checked
              {sinceLabel && <span className="nav-count">{sinceLabel}</span>}
            </a>
            <a className={state.inboxOpen > 0 ? "nav-link lit" : "nav-link"} href={`/room/${projectId}/inbox`}>
              Needs you
              {state.inboxOpen > 0 ? <span className="nav-count">{state.inboxOpen}</span> : gated.plan === "free" ? <span className="nav-count">Pro</span> : null}
            </a>
            <a className="nav-link" href={`/room/${projectId}/areas`}>
              Parts of your app
              {state.areas.length > 0 && <span className="nav-count">{state.areas.length}</span>}
            </a>
            {!viewer.local && (
              <a className="nav-link" href="/account">
                {gated.plan === "pro" ? "Pro" : "Free"}
              </a>
            )}
            {viewer.admin && !viewer.local && (
              <a className="nav-link" href="/admin">
                Testers
              </a>
            )}
            <span className="live-state" data-state={live} title={mode === "local" ? "Running on this computer" : "Hosted"}>
              <span className={live === "live" ? "dot live" : "dot"} aria-hidden="true" />
              {LIVE_TEXT[live]}
            </span>
          </nav>
        </header>

        <Walkthrough state={state} welcome={welcome} />

        {gated.locked.reasons.length > 0 && (
          <div className="notice dashed">
            <Info />
            <div className="notice-body">
              {gated.locked.agents > 0 && (
                <span>
                  {gated.locked.agents} more agent{gated.locked.agents === 1 ? " is" : "s are"} running. {UPGRADE_REASONS.more_agents}
                </span>
              )}
              {gated.locked.history > 0 && (
                <span>
                  {gated.locked.history} older session{gated.locked.history === 1 ? "" : "s"} hidden. {UPGRADE_REASONS.history}
                </span>
              )}
              <a className="link-accent link-underline" href="/account">
                See plans
              </a>
            </div>
          </div>
        )}

        {state.areas.length === 0 && (
          <div className="notice">
            <Info />
            <div className="notice-body">
              <span>
                This project has no map of its parts yet, so tiles use folder names. Run <code>glasshouse map</code> in the project folder to build one.
              </span>
            </div>
          </div>
        )}

        {needsYou.length > 0 && (
          <div className="notice attention" role="status">
            <Alert />
            <div className="notice-body">
              <strong>{needsYou.length === 1 ? "One agent is waiting for you." : `${needsYou.length} agents are waiting for you.`}</strong>
            </div>
          </div>
        )}

        <div id="agents">
          {active.length === 0 ? (
            <div className="empty">
              <Screen size={22} className="empty-icon" />
              <h2>No agents running.</h2>
              <p>Start Claude Code, Codex or Cursor in this project and its tile appears here within a second or two.</p>
            </div>
          ) : (
            <div className="tiles">
              {active.map((s) => (
                <Tile key={s.id} session={s} project={state.project.name} now={now} />
              ))}
            </div>
          )}
        </div>

        {quiet.length > 0 && (
          <>
            <h2 className="section-label">Earlier</h2>
            <div className="tiles earlier">
              {quiet.map((s) => (
                <Tile key={s.id} session={s} project={state.project.name} now={now} quiet />
              ))}
            </div>
          </>
        )}

        <div className="page-foot">
          <span>Updated {new Date(state.generatedAt).toLocaleTimeString()}</span>
          <span>
            {state.sessions.length} session{state.sessions.length === 1 ? "" : "s"} today
          </span>
          {state.areaMapSource && <span>Parts of your app named {state.areaMapSource === "ai" ? "by AI" : "from folder names"}</span>}
          <ReportProblem projectId={projectId} />
        </div>
      </main>
    </>
  );
}
