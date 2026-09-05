"use client";

import { useState } from "react";
import type { SessionView, TaskView } from "@/lib/store/types";
import { ChevronDown, Handoff } from "./icons";
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
  const panelId = task ? `task-panel-${task.id}` : `session-panel-${session.id}`;

  return (
    <article
      id={task ? `task-${task.id}` : undefined}
      className={`tile${quiet ? " quiet" : ""}${open ? " open" : ""}${card && !quiet ? " has-report" : ""}`}
      data-stage={stage.cls}
    >
      <div className="tile-head">
        <span className="tile-tool">
          <span className="tool-dot" style={{ background: TOOL_COLOURS[session.tool] }} />
          {TOOL_NAMES[session.tool]}
          <span className="tile-project">· {project}</span>
          {depth && <span className="badge sm plain">{depth}</span>}
        </span>
        <span className="tile-meta" title={session.externalId}>
          {task?.startedAt ? `started ${ago(task.startedAt, now)}` : ""}
        </span>
      </div>

      {task?.continuedFrom && (
        <p className="tile-continuing" title={task.continuedFrom.reason}>
          <Handoff />
          <span>
            Continuing from {TOOL_NAMES[task.continuedFrom.tool]}: {task.continuedFrom.headline ?? task.continuedFrom.prompt ?? "the earlier task"}
          </span>
        </p>
      )}

      <h2 className="tile-headline">{headline}</h2>

      {!card && (
        <p className="tile-location">
          {task?.location ? (
            <>
              Working in <strong>{task.location}</strong>
            </>
          ) : (
            "Not in any part of the app yet"
          )}
        </p>
      )}

      <div className="tile-status">
        <span className={`badge stage${stage.cls === "waiting" ? " attention" : ""}`} data-stage={stage.cls} title={stage.detail}>
          <span className="dot" aria-hidden="true" />
          {stage.text}
        </span>
        {risk && (
          <span className="badge risk plain" data-level={risk.level} title={risk.reasons.join(". ")}>
            {RISK_TEXT[risk.level]}
          </span>
        )}
        {stage.detail && <span className="stage-note">{stage.detail}</span>}
        {task?.continuedBy && <span className="stage-note">Continued in {TOOL_NAMES[task.continuedBy.tool]}</span>}
      </div>

      {card && task && !open && !quiet && <ReportCard task={task} compact />}
      {card && task && quiet && card.needsYou !== "nothing" && (
        <p className="needs-you" data-need={card.needsYou}>
          <strong>{card.needsYou === "blocked" ? "Blocked" : card.needsYou === "decision" ? "Decision needed" : "Review recommended"}</strong>
          {card.needsYouDetail ? <> — {card.needsYouDetail}</> : null}
        </p>
      )}

      <div className="tile-foot">
        <span className="tile-ticker">{last?.plain ?? "…"}</span>
        <span className="tile-when">{ago(last?.ts, now)}</span>
        <button className="tile-toggle" data-shot="expand" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : card ? "Open the report" : "Expand"}
          <ChevronDown />
        </button>
      </div>

      {open && (
        <div id={panelId}>
          <TaskPanel session={session} now={now} />
        </div>
      )}
    </article>
  );
}
