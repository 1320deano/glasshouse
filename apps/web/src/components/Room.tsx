"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UPGRADE_REASONS, type GatedRoom } from "@/lib/plan";
import type { RoomState, SessionView } from "@/lib/store/types";
import { AgentCard } from "./AgentCard";
import { Conversation } from "./Conversation";
import { Info, Mark, PanelLeft, PanelRight, Rows, Screen } from "./icons";
import { TOOL_COLOURS, TOOL_NAMES, ago, statusOf } from "./labels";
import { Progress } from "./Progress";
import { ReportProblem } from "./ReportProblem";
import { Walkthrough } from "./Walkthrough";

/**
 * The Room (Phase 5): three columns, laid out the way the Claude app lays out a coding session.
 *   left    one card per agent: live ones in full, finished ones as a line, older ones behind a link.
 *           Folds to a narrow rail so the story can have the screen.
 *   middle  the running story of the project, and a box to ask about any task in it
 *   right   the week as counts and stages: activity, tools, parts of the app. Folds away entirely.
 * On a phone the columns become three tabs. "Waiting for you" is the one thing allowed to light up.
 */

const ACTIVE_WINDOW_MS = 30 * 60 * 1000;
const STALE_MS = 10 * 60 * 1000;
const POLL_MS = 10000;
const LAYOUT_KEY = "glasshouse.room.layout";

function isActive(s: SessionView, now: number): boolean {
  if (s.endedAt) return false;
  const last = new Date(s.lastEventAt ?? s.startedAt).getTime();
  return now - last < ACTIVE_WINDOW_MS;
}

function isToday(iso: string | undefined, now: number): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date(now);
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

const LIVE_TEXT = { live: "Live", polling: "Refreshing every 10s", connecting: "Connecting" } as const;

type Tab = "agents" | "chat" | "progress";

/** How much of the Room is on screen. Remembered per browser; never anything about the project. */
interface Layout {
  agents: "open" | "rail";
  progress: "open" | "closed";
  density: "comfortable" | "compact";
}
const DEFAULT_LAYOUT: Layout = { agents: "open", progress: "open", density: "comfortable" };

export interface RoomProject {
  id: string;
  name: string;
}

export function Room({
  initial,
  mode,
  productName,
  welcome = false,
  viewer,
  projects,
}: {
  initial: GatedRoom;
  mode: "local" | "supabase";
  productName: string;
  welcome?: boolean;
  viewer: { email?: string; admin: boolean; local: boolean };
  projects: RoomProject[];
}) {
  const [gated, setGated] = useState<GatedRoom>(initial);
  // A server that has not been restarted since the Phase 5 columns arrived sends no story, progress or
  // activity. Draw empty columns rather than nothing at all.
  const state: RoomState = { ...gated.room, story: gated.room.story ?? [], progress: gated.room.progress ?? [], activity: gated.room.activity ?? { since: gated.room.generatedAt, hours: {}, total: 0, byTool: { "claude-code": 0, codex: 0, cursor: 0, watcher: 0 } } };
  // Seeded from the server's own timestamp so the first client render matches the HTML exactly;
  // the real clock takes over on mount. Without this every "22 min ago" is a hydration mismatch.
  const [now, setNow] = useState(() => new Date(initial.room.generatedAt).getTime());
  const [live, setLive] = useState<"connecting" | "live" | "polling">("connecting");
  const [tab, setTab] = useState<Tab>("agents");
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [showEarlier, setShowEarlier] = useState(false);
  // Wide screens show all three columns; the story is always visible there.
  const [wide, setWide] = useState(true);
  const [layout, setLayoutState] = useState<Layout>(DEFAULT_LAYOUT);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectId = initial.room.project.id;

  const setLayout = useCallback((patch: Partial<Layout>) => {
    setLayoutState((l) => {
      const next = { ...l, ...patch };
      try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
      } catch {
        /* no storage: the layout lasts for this page only */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "null") as Partial<Layout> | null;
      if (saved) setLayoutState({ ...DEFAULT_LAYOUT, ...saved });
    } catch {
      /* ignore a bad value */
    }
  }, []);

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
    const mq = window.matchMedia("(min-width: 960px)");
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

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

  // The conversation can point at a card: open it, unfold the agents, switch to the agents tab on a phone, scroll to it.
  const gatedRef = useRef(gated);
  gatedRef.current = gated;
  const openTaskCard = useCallback(
    (taskId: string) => {
      setOpenTask(taskId);
      setTab("agents");
      setLayout({ agents: "open" });
      const session = gatedRef.current.room.sessions.find((s) => s.task?.id === taskId);
      if (session && !isActive(session, Date.now()) && !isToday(session.task?.endedAt ?? session.lastEventAt, Date.now())) setShowEarlier(true);
      setTimeout(() => document.getElementById(`task-${taskId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    },
    [setLayout],
  );

  const live_ = state.sessions.filter((s) => isActive(s, now));
  const finishedToday = state.sessions.filter((s) => !isActive(s, now) && isToday(s.task?.endedAt ?? s.lastEventAt ?? s.startedAt, now));
  const earlier = state.sessions.filter((s) => !isActive(s, now) && !isToday(s.task?.endedAt ?? s.lastEventAt ?? s.startedAt, now));
  const waiting = live_.filter((s) => s.task?.stage === "waiting");
  const stuck = live_.filter((s) => s.task?.stage === "stuck");
  const lastEventAt = state.sessions.map((s) => s.lastEventAt ?? s.startedAt).sort().at(-1);
  const stale = live_.length > 0 && lastEventAt !== undefined && now - new Date(lastEventAt).getTime() > STALE_MS;
  const sinceLabel = state.sinceChecked.done > 0 ? String(state.sinceChecked.done) : gated.plan === "free" ? "Pro" : null;
  const needsCount = state.inboxOpen + waiting.length;
  const agentsFolded = layout.agents === "rail";
  const progressFolded = layout.progress === "closed";
  const compact = layout.density === "compact";

  const switcher =
    projects.length > 1 ? (
      <>
        <label className="visually-hidden" htmlFor="project-switch">
          Switch project
        </label>
        <select
          id="project-switch"
          className="field project-switch"
          value={projectId}
          onChange={(e) => {
            window.location.href = `/room/${e.target.value}`;
          }}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </>
    ) : (
      <span className="page-title">{state.project.name}</span>
    );

  return (
    <>
      <a className="skip-link" href="#agents">
        Skip to what the agents are doing
      </a>
      <main className="room" data-tab={tab} data-agents={layout.agents} data-progress={layout.progress} data-density={layout.density}>
        <header className="room-head">
          <div className="room-head-left">
            <button
              className="icon-button head-fold"
              aria-label={agentsFolded ? "Show the agents" : "Fold the agents away"}
              aria-pressed={!agentsFolded}
              title={agentsFolded ? "Show the agents" : "Fold the agents away"}
              onClick={() => setLayout({ agents: agentsFolded ? "open" : "rail" })}
            >
              <PanelLeft size={16} />
            </button>
            <a className="brand" href="/">
              <Mark />
              <span>{productName}</span>
            </a>
            <span className="crumb-sep" aria-hidden="true">
              /
            </span>
            {switcher}
          </div>
          <div className="room-head-mid" aria-live="polite">
            <span className="status-line">
              <span className="dot" data-on={live_.length > 0 ? "yes" : "no"} aria-hidden="true" />
              {live_.length === 0 ? "No agents working" : `${live_.length} agent${live_.length === 1 ? "" : "s"} working`}
            </span>
            {waiting.length > 0 && (
              <span className="pill" data-tone="attention">
                {waiting.length} waiting for you
              </span>
            )}
            {stuck.length > 0 && (
              <span className="pill" data-tone="critical">
                {stuck.length} look{stuck.length === 1 ? "s" : ""} stuck
              </span>
            )}
            <span className={`room-last${stale ? " stale" : ""}`} title={stale ? "Agents were working but nothing has arrived for a while. The connector may be off." : "When the most recent action reached the Room"}>
              {lastEventAt ? `Last action ${ago(lastEventAt, now)}` : "No actions yet"}
            </span>
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
            <button
              className="icon-button head-fold"
              aria-label={progressFolded ? "Show progress" : "Fold progress away"}
              aria-pressed={!progressFolded}
              title={progressFolded ? "Show progress" : "Fold progress away"}
              onClick={() => setLayout({ progress: progressFolded ? "open" : "closed" })}
            >
              <PanelRight size={16} />
            </button>
          </nav>
        </header>

        <nav className="room-tabs" aria-label="Sections">
          <button role="tab" aria-selected={tab === "agents"} onClick={() => setTab("agents")}>
            Agents
            {waiting.length > 0 ? (
              <span className="nav-count lit">{waiting.length}</span>
            ) : live_.length > 0 ? (
              <span className="nav-count">{live_.length}</span>
            ) : null}
          </button>
          <button role="tab" aria-selected={tab === "chat"} onClick={() => setTab("chat")}>
            Story
            {needsCount > 0 && <span className="nav-count lit">{needsCount}</span>}
          </button>
          <button role="tab" aria-selected={tab === "progress"} onClick={() => setTab("progress")}>
            Progress
          </button>
        </nav>

        <div className="room-grid">
          <aside className="room-col agents" id="agents" aria-label="Agents" data-active={tab === "agents"}>
            {/* The folded column: one square per live agent, so a glance still says who is working and who needs you. */}
            <div className="rail" aria-hidden={!agentsFolded}>
              <button className="icon-button rail-open" aria-label="Show the agents" title="Show the agents" onClick={() => setLayout({ agents: "open" })}>
                <PanelLeft size={16} />
              </button>
              {live_.map((s) => {
                const st = statusOf(s.task);
                return (
                  <button
                    key={s.id}
                    className="rail-agent"
                    data-status={st.cls}
                    title={`${TOOL_NAMES[s.tool]}: ${st.text}`}
                    aria-label={`${TOOL_NAMES[s.tool]}: ${st.text}. Show the agents`}
                    onClick={() => openTaskCard(s.task?.id ?? s.id)}
                  >
                    <span className="tool-dot" style={{ background: TOOL_COLOURS[s.tool] }} aria-hidden="true" />
                  </button>
                );
              })}
              {live_.length === 0 && <span className="rail-none" title="No agents working" />}
            </div>

            <div className="col-body">
              <div className="col-head">
                <h2 className="col-title">
                  Agents
                  {live_.length > 0 && <span className="count">{live_.length}</span>}
                </h2>
                <div className="col-tools">
                  <button className="icon-button" aria-label={compact ? "Show full cards" : "Show compact cards"} aria-pressed={compact} title={compact ? "Show full cards" : "Show compact cards"} onClick={() => setLayout({ density: compact ? "comfortable" : "compact" })}>
                    <Rows size={16} />
                  </button>
                </div>
              </div>

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

              {live_.length === 0 && finishedToday.length === 0 && (
                <div className="empty">
                  <Screen size={22} className="empty-icon" />
                  <h2>No agents running.</h2>
                  <p>Start Claude Code, Codex or Cursor in this project and its card appears here within a second or two.</p>
                </div>
              )}

              <div className="agents-list">
                {live_.map((s) => (
                  <AgentCard key={s.id} session={s} now={now} mode="live" compact={compact} open={openTask === (s.task?.id ?? s.id)} onToggle={setOpenTask} />
                ))}
              </div>

              {finishedToday.length > 0 && (
                <>
                  <h3 className="col-sub">Finished today</h3>
                  <div className="agents-list finished">
                    {finishedToday.map((s) => (
                      <AgentCard key={s.id} session={s} now={now} mode="finished" open={openTask === (s.task?.id ?? s.id)} onToggle={setOpenTask} />
                    ))}
                  </div>
                </>
              )}

              {earlier.length > 0 && (
                <>
                  <button className="link-button small col-sub" aria-expanded={showEarlier} onClick={() => setShowEarlier((v) => !v)}>
                    {showEarlier ? "Hide earlier" : `Show earlier (${earlier.length})`}
                  </button>
                  {showEarlier && (
                    <div className="agents-list finished">
                      {earlier.map((s) => (
                        <AgentCard key={s.id} session={s} now={now} mode="finished" open={openTask === (s.task?.id ?? s.id)} onToggle={setOpenTask} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>

          <section className="room-col story" aria-label="The story" data-active={tab === "chat"}>
            <Conversation
              state={state}
              now={now}
              onOpenTask={openTaskCard}
              active={tab === "chat" || wide}
              head={
                <div className="story-head">
                  <h1 className="story-title">{state.project.name}</h1>
                  <p className="story-sub">
                    {live_.length === 0 ? "Nothing running right now." : `${live_.length} agent${live_.length === 1 ? "" : "s"} working${waiting.length > 0 ? `, ${waiting.length} waiting for you` : ""}.`}
                    {state.areaMapSource ? ` Parts of your app named ${state.areaMapSource === "ai" ? "by AI" : "from folder names"}.` : ""}
                  </p>
                </div>
              }
              intro={<Walkthrough state={state} welcome={welcome} />}
            />
          </section>

          <aside className="room-col progress-col" aria-label="Progress" data-active={tab === "progress"}>
            <div className="col-body">
              <div className="col-head">
                <h2 className="col-title">Progress</h2>
                <div className="col-tools">
                  <span className="faint tiny">Last 7 days</span>
                </div>
              </div>
              <Progress state={state} now={now} />
              <div className="col-foot">
                <span>Updated {new Date(state.generatedAt).toLocaleTimeString()}</span>
                <span>
                  {state.sessions.length} session{state.sessions.length === 1 ? "" : "s"} shown
                </span>
                <ReportProblem projectId={projectId} />
              </div>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
