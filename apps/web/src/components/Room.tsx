"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UPGRADE_REASONS, type GatedRoom } from "@/lib/plan";
import type { RoomState, SessionView } from "@/lib/store/types";
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

export function Room({ initial, mode, productName, welcome = false, viewer }: { initial: GatedRoom; mode: "local" | "supabase"; productName: string; welcome?: boolean; viewer: { email?: string; admin: boolean; local: boolean } }) {
  const [gated, setGated] = useState<GatedRoom>(initial);
  const state: RoomState = gated.room;
  const [now, setNow] = useState(() => Date.now());
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

  return (
    <main className="room">
      <div className="room-header">
        <div>
          <a href="/" className="muted">
            {productName}
          </a>{" "}
          · <strong>{state.project.name}</strong>
        </div>
        <div className="room-links">
          <a href={`/room/${projectId}/digest`} title={state.lastCheckedAt ? `Last checked ${new Date(state.lastCheckedAt).toLocaleString()}` : "Not checked yet"}>
            Since you last checked{state.sinceChecked.done > 0 ? ` (${state.sinceChecked.done} done${state.sinceChecked.needsYou > 0 ? `, ${state.sinceChecked.needsYou} need you` : ""})` : gated.plan === "free" ? " · Pro" : ""}
          </a>
          <a href={`/room/${projectId}/inbox`} className={state.inboxOpen > 0 ? "inbox-link lit" : "inbox-link"}>
            Needs you{state.inboxOpen > 0 ? ` (${state.inboxOpen})` : gated.plan === "free" ? " · Pro" : ""}
          </a>
          <a href={`/room/${projectId}/areas`}>Parts of your app{state.areas.length > 0 ? ` (${state.areas.length})` : ""}</a>
          {!viewer.local && <a href="/account">{gated.plan === "pro" ? "Pro" : "Free"}</a>}
          {viewer.admin && !viewer.local && <a href="/admin">Testers</a>}
          <span>
            {live === "live" ? "Live" : live === "polling" ? "Refreshing every 10s" : "Connecting"} · {mode === "local" ? "on this computer" : "hosted"}
          </span>
        </div>
      </div>

      <Walkthrough state={state} welcome={welcome} />

      {gated.locked.reasons.length > 0 && (
        <div className="notice locked">
          {gated.locked.agents > 0 && (
            <span>
              {gated.locked.agents} more agent{gated.locked.agents === 1 ? " is" : "s are"} running. {UPGRADE_REASONS.more_agents}{" "}
            </span>
          )}
          {gated.locked.history > 0 && (
            <span>
              {gated.locked.history} older session{gated.locked.history === 1 ? "" : "s"} hidden. {UPGRADE_REASONS.history}{" "}
            </span>
          )}
          <a href="/account">See plans</a>
        </div>
      )}

      {state.areas.length === 0 && (
        <div className="notice">
          This project has no map of its parts yet, so tiles use folder names. Run <code>glasshouse map</code> in the project folder to build one.
        </div>
      )}

      {needsYou.length > 0 && (
        <div className="notice waiting">
          {needsYou.length === 1 ? "One agent is waiting for you." : `${needsYou.length} agents are waiting for you.`}
        </div>
      )}

      {active.length === 0 ? (
        <div className="empty">
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

      {quiet.length > 0 && (
        <>
          <div className="section-title">Earlier</div>
          <div className="tiles">
            {quiet.map((s) => (
              <Tile key={s.id} session={s} project={state.project.name} now={now} quiet />
            ))}
          </div>
        </>
      )}

      <div className="footer">
        <span>Updated {new Date(state.generatedAt).toLocaleTimeString()}</span>
        <span>
          {state.sessions.length} session{state.sessions.length === 1 ? "" : "s"} today
        </span>
        {state.areaMapSource && <span>Parts of your app named {state.areaMapSource === "ai" ? "by AI" : "from folder names"}</span>}
        <ReportProblem projectId={projectId} />
      </div>
    </main>
  );
}
