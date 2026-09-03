"use client";

import { useState } from "react";
import type { EventView, SessionView } from "@/lib/store/types";

const TOOL_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  watcher: "Folder watcher",
};

const TOOL_COLOURS: Record<string, string> = {
  "claude-code": "#d9a066",
  codex: "#8be9a8",
  cursor: "#c7b6ff",
  watcher: "#8b91a1",
};

function ago(iso: string | undefined, now: number): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} h ago`;
}

function stageLabel(session: SessionView): { text: string; cls: string } {
  const t = session.task;
  if (!t) return { text: "Starting", cls: "working" };
  if (t.endReason === "usage_limit") return { text: "Stopped: usage limit", cls: "limit" };
  switch (t.stage) {
    case "waiting":
      return { text: "Waiting for you", cls: "waiting" };
    case "done":
      return { text: "Done", cls: "done" };
    case "stuck":
      return { text: "Stuck", cls: "stuck" };
    case "planning":
      return { text: "Planning", cls: "working" };
    case "building":
      return { text: "Building", cls: "working" };
    case "testing":
      return { text: "Testing", cls: "working" };
    default:
      return { text: "Investigating", cls: "working" };
  }
}

function latency(e: EventView): string {
  const ms = new Date(e.receivedAt).getTime() - new Date(e.ts).getTime();
  return Number.isFinite(ms) && ms >= 0 ? `${ms} ms` : "";
}

export function Tile({ session, project, now, quiet = false }: { session: SessionView; project: string; now: number; quiet?: boolean }) {
  const [open, setOpen] = useState(false);
  const task = session.task;
  const last = session.recentEvents[0];
  const stage = stageLabel(session);
  const headline = task?.headline ?? last?.summary ?? "Starting up";

  return (
    <section className={`tile${quiet ? " quiet" : ""}`}>
      <div className="tile-head">
        <span className="tool-badge">
          <span className="tool-dot" style={{ background: TOOL_COLOURS[session.tool] }} />
          {TOOL_NAMES[session.tool] ?? session.tool} · {project}
        </span>
        <span title={session.externalId}>session {session.externalId.slice(0, 8)}</span>
      </div>

      <div className="headline">{headline}</div>

      <div className="location">
        {task?.location ? (
          <>
            Working in <span className="mono">{task.location}</span>
          </>
        ) : (
          "Not in any file yet"
        )}
      </div>

      <div className="stage-row">
        <span className={`stage ${stage.cls}`}>{stage.text}</span>
        {task && (
          <span style={{ color: "var(--faint)", fontSize: 14 }}>
            {task.eventCount} action{task.eventCount === 1 ? "" : "s"} this task
          </span>
        )}
      </div>

      <div className="ticker">
        <span className="line">{last?.summary ?? "…"}</span>
        <span className="when">{ago(last?.ts, now)}</span>
      </div>

      <button className="detail-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? "Hide technical detail" : "Show technical detail"}
      </button>

      {open && (
        <div className="detail">
          {task?.prompt && <div className="prompt">You asked: {task.prompt}</div>}
          {session.recentEvents.map((e) => (
            <div className="detail-row" key={e.id}>
              <span className="kind">{e.kind.replace("_", " ")}</span>
              <span className={`summary${e.success === false ? " failed" : ""}`}>
                {e.summary}
                {e.paths.length > 0 && <span className="mono" style={{ color: "var(--muted)" }}> · {e.paths.join(", ")}</span>}
                {e.command && e.command !== e.summary && <span className="mono" style={{ color: "var(--muted)" }}> · {e.command}</span>}
              </span>
              <span className="meta">
                {e.sourceTool ?? e.sourceEvent} · {latency(e)} · {ago(e.ts, now)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
