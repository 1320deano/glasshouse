"use client";

import { useState } from "react";
import type { SessionView, TaskView } from "@/lib/store/types";
import { DEPTH_LABELS, RISK_TEXT, STAGE_TEXT, TOOL_COLOURS, TOOL_NAMES, ago } from "./labels";
import { ReportCard } from "./ReportCard";
import { TaskPanel } from "./TaskPanel";

/**
 * One agent, one tile. Fixed order: header, headline, location, stage + risk badge, ticker.
 * Readable from two metres: the headline is the only big text and it changes only when the
 * meaning changes. Everything technical lives behind the expanded view.
 */

function stageOf(task: TaskView | null): { text: string; cls: string; detail?: string } {
  if (!task) return { text: "Starting", cls: "working" };
  if (task.stage === "done" && task.endReason === "usage_limit") return { text: task.usageLimitConfirmed ? "Stopped: usage limit" : "Stopped: possibly a usage limit", cls: "limit" };
  switch (task.stage) {
    case "waiting":
      return { text: "Waiting for you", cls: "waiting" };
    case "done":
      return { text: "Done", cls: "done" };
    case "stuck":
      return { text: "Stuck", cls: "stuck", detail: task.stuckReason };
    default:
      return { text: STAGE_TEXT[task.stage], cls: "working" };
  }
}

export function Tile({ session, project, now, quiet = false }: { session: SessionView; project: string; now: number; quiet?: boolean }) {
  const [open, setOpen] = useState(false);
  const task = session.task;
  const last = session.recentEvents[0];
  const stage = stageOf(task);
  // When the task has finished, the tile turns into its report card (brief 5.1).
  const card = task?.report && task.stage === "done" ? task.report : undefined;
  const headline = card?.headline ?? task?.headline ?? last?.plain ?? "Starting up";
  const depth = DEPTH_LABELS[session.depth];
  const risk = task?.risk;

  return (
    <section id={task ? `task-${task.id}` : undefined} className={`tile${quiet ? " quiet" : ""}${open ? " open" : ""}`}>
      <div className="tile-head">
        <span className="tool-badge">
          <span className="tool-dot" style={{ background: TOOL_COLOURS[session.tool] }} />
          {TOOL_NAMES[session.tool]} · {project}
          {depth && <span className="depth-label">{depth}</span>}
        </span>
        <span className="tile-when" title={session.externalId}>
          {task?.startedAt ? `started ${ago(task.startedAt, now)}` : ""}
        </span>
      </div>

      {task?.continuedFrom && (
        <div className="continuing" title={task.continuedFrom.reason}>
          Continuing from {TOOL_NAMES[task.continuedFrom.tool]}: {task.continuedFrom.headline ?? task.continuedFrom.prompt ?? "the earlier task"}
        </div>
      )}

      <div className="headline">{headline}</div>

      {!card && <div className="location">{task?.location ? <>Working in <span>{task.location}</span></> : "Not in any part of the app yet"}</div>}

      <div className="stage-row">
        <span className={`stage ${stage.cls}`} title={stage.detail}>
          {stage.text}
        </span>
        {stage.detail && <span className="stage-detail">{stage.detail}</span>}
        {risk && (
          <span className={`risk ${risk.level}`} title={risk.reasons.join(". ")}>
            {RISK_TEXT[risk.level]}
          </span>
        )}
        {task?.continuedBy && <span className="stage-detail">Continued in {TOOL_NAMES[task.continuedBy.tool]}</span>}
      </div>

      {card && task && !open && <ReportCard task={task} compact />}

      <div className="ticker">
        <span className="line">{last?.plain ?? "…"}</span>
        <span className="when">{ago(last?.ts, now)}</span>
      </div>

      <button className="detail-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? "Close" : card ? "Open the report" : "Expand"}
      </button>

      {open && <TaskPanel session={session} now={now} />}
    </section>
  );
}
