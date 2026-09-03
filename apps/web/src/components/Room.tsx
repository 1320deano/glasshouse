"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomState, SessionView } from "@/lib/store/types";
import { Tile } from "./Tile";

const ACTIVE_WINDOW_MS = 30 * 60 * 1000;
const POLL_MS = 10000;

function isActive(s: SessionView, now: number): boolean {
  if (s.endedAt) return false;
  const last = new Date(s.lastEventAt ?? s.startedAt).getTime();
  return now - last < ACTIVE_WINDOW_MS;
}

export function Room({ initial, mode }: { initial: RoomState; mode: "local" | "supabase" }) {
  const [state, setState] = useState<RoomState>(initial);
  const [now, setNow] = useState(() => Date.now());
  const [live, setLive] = useState<"connecting" | "live" | "polling">("connecting");
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectId = initial.project.id;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/room/${projectId}`, { cache: "no-store" });
      if (res.ok) setState((await res.json()) as RoomState);
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
  const quiet = state.sessions.filter((s) => !isActive(s, now)).slice(0, 3);

  return (
    <main className="room">
      <div className="room-header">
        <div>
          <strong>{state.project.name}</strong> · Glasshouse
        </div>
        <div>
          {live === "live" ? "Live" : live === "polling" ? "Refreshing every 10s" : "Connecting"} · {mode === "local" ? "local" : "Supabase"}
        </div>
      </div>

      {active.length === 0 ? (
        <div className="empty">
          <h2>No agents running.</h2>
          <p>Start Claude Code in this project and its tile appears here within a second or two.</p>
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
        <span>{state.sessions.length} session{state.sessions.length === 1 ? "" : "s"} today</span>
      </div>
    </main>
  );
}
