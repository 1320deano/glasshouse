"use client";

import { useEffect, useState } from "react";
import type { RequestQuestion, SessionView } from "@/lib/store/types";
import { Alert, Check, ChevronDown, Handoff } from "./icons";
import { NEEDS_YOU_TEXT, RISK_TEXT, TOOL_NAMES, ago, clip, statusOf } from "./labels";
import { TaskPanel } from "./TaskPanel";
import { ToolLogo } from "./ToolLogo";

/**
 * One agent, one card (Phase 5). Fixed order: tool + status, headline, where and why, anything
 * that needs the owner, parts touched, not touched, then the ticker and the details toggle.
 * The default view is owner language only (rule 5): paths, diff counts and the task id live
 * behind "Details", which opens the full task panel underneath.
 *
 *   live      the full card. `compact` keeps the tool, status, headline and ticker and folds the rest,
 *             so a wall of agents still fits one screen.
 *   finished  one line: the headline and "See the report"
 *
 * Phase 8: "Talk to it" puts this agent in the chat's To box. A question a run started from the
 * Room has put to the owner (may it run this, which way) sits on the card too, answered with a tap.
 */
export type CardQuestion = RequestQuestion & { plain: string; requestId: string };

export function AgentCard({
  session,
  now,
  mode,
  open,
  compact = false,
  onToggle,
  onTalk,
  questions = [],
  onAnswer,
}: {
  session: SessionView;
  now: number;
  mode: "live" | "finished";
  open: boolean;
  compact?: boolean;
  onToggle: (taskId: string | null) => void;
  /** Put this agent in the chat's To box. */
  onTalk?: (session: SessionView) => void;
  /** Questions a run started from the Room is waiting on, for this agent. */
  questions?: CardQuestion[];
  onAnswer?: (requestId: string, questionId: string, allow: boolean, answers?: Record<string, string>) => void;
}) {
  const task = session.task;
  const last = session.recentEvents[0];
  const status = statusOf(task);
  const report = task?.report && task.stage === "done" ? task.report : undefined;
  // The template headline for a waiting task is the bare "Waiting for you"; the last action says what for.
  const bareWaiting = task?.stage === "waiting" && /^waiting for you\.?$/i.test(task.headline.trim());
  const headline = report?.headline ?? (bareWaiting ? (last?.plain ?? task?.headline) : task?.headline) ?? last?.plain ?? "Starting up";
  const panelId = task ? `task-panel-${task.id}` : `session-panel-${session.id}`;
  const changed = task?.areas.filter((a) => a.changed.length > 0) ?? [];
  const looked = task?.areas.filter((a) => a.changed.length === 0) ?? [];
  const notTouched = task?.notTouched ?? [];
  const needsYou = report?.needsYou && report.needsYou !== "nothing" ? report.needsYou : undefined;
  const [flash, setFlash] = useState(false);

  // When the conversation points at this card, it lights up for a moment so the eye can find it.
  useEffect(() => {
    if (!open) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1600);
    return () => clearTimeout(t);
  }, [open]);

  const toggle = () => onToggle(open ? null : (task?.id ?? session.id));
  // An open card is always the full card: the owner asked to see it.
  const folded = compact && !open;
  const talk = onTalk && session.tool !== "watcher" ? (
    <button className="agent-toggle agent-talk" type="button" title={mode === "finished" ? "Say what to do next; it picks up where it left off" : "Say something to this agent from the chat"} onClick={() => onTalk(session)}>
      Talk to it
    </button>
  ) : null;

  if (mode === "finished") {
    return (
      <article id={task ? `task-${task.id}` : undefined} className={`agent finished${open ? " open" : ""}${flash ? " flash" : ""}`} data-status={status.cls}>
        <div className="agent-line">
          <ToolLogo tool={session.tool} size={14} />
          <span className="agent-line-tool">{TOOL_NAMES[session.tool]}</span>
          <span className="agent-line-title" title={headline}>
            {headline}
          </span>
          <span className="agent-when">{task?.endedAt ? ago(task.endedAt, now) : ago(session.endedAt ?? session.lastEventAt, now)}</span>
          {talk}
          <button className="agent-toggle" data-shot="expand" aria-expanded={open} aria-controls={panelId} title={open ? "Close" : report ? "See the report" : "Details"} onClick={toggle}>
            {open ? "Close" : report ? "Report" : "Details"}
            <ChevronDown />
          </button>
        </div>
        {needsYou && (
          <div className="agent-line-sub">
            <span className="pill sm" data-need={needsYou}>
              {NEEDS_YOU_TEXT[needsYou]}
            </span>
          </div>
        )}
        {open && (
          <div id={panelId}>
            <TaskPanel session={session} now={now} />
          </div>
        )}
      </article>
    );
  }

  return (
    <article id={task ? `task-${task.id}` : undefined} className={`agent${open ? " open" : ""}${flash ? " flash" : ""}${folded ? " compact" : ""}`} data-status={status.cls}>
      <header className="agent-head">
        <span className="agent-tool">
          <ToolLogo tool={session.tool} />
          {TOOL_NAMES[session.tool]}
        </span>
        <span className="status" data-status={status.cls} title={status.detail}>
          <span className="dot" aria-hidden="true" />
          {status.text}
        </span>
      </header>

      {task?.continuedFrom && !folded && (
        <p className="agent-continuing" title={task.continuedFrom.reason}>
          <Handoff />
          <span>Continuing from {TOOL_NAMES[task.continuedFrom.tool]}</span>
        </p>
      )}

      <h3 className="agent-title">{headline}</h3>

      {!folded && (
        <p className="agent-desc">
          {task?.location ? (
            <>
              Working in <strong>{task.location}</strong>.
            </>
          ) : (
            "Not in any part of the app yet."
          )}
          {task?.prompt ? <> You asked: “{clip(task.prompt, 140)}”</> : null}
        </p>
      )}

      {status.cls === "stuck" && (
        <div className="agent-alert" data-tone="critical" role="status">
          <Alert />
          <span>{status.detail ? `Looks stuck: ${status.detail}.` : "Looks stuck."} Nothing has been declared; this is detected from the record.</span>
        </div>
      )}
      {questions.map((q) => (
        <div className="agent-alert" data-tone="attention" role="status" key={q.id}>
          <Alert />
          <div className="agent-alert-body">
            <span>
              <strong>Waiting for you.</strong> {q.plain}
            </span>
            <div className="agent-answer">
              {q.kind === "permission" ? (
                <>
                  <button type="button" className="button sm primary" onClick={() => onAnswer?.(q.requestId, q.id, true)}>
                    Allow
                  </button>
                  <button type="button" className="button sm subtle" onClick={() => onAnswer?.(q.requestId, q.id, false)}>
                    Don’t allow
                  </button>
                </>
              ) : (
                (q.choices ?? []).length === 1 &&
                q.choices![0]!.options.map((o) => (
                  <button type="button" className="button sm subtle" key={o.label} title={o.description} onClick={() => onAnswer?.(q.requestId, q.id, true, { [q.choices![0]!.question]: o.label })}>
                    {o.label}
                  </button>
                ))
              )}
              {q.kind === "choice" && (q.choices ?? []).length > 1 && <span className="small faint">Answer it in the story.</span>}
            </div>
          </div>
        </div>
      ))}
      {status.cls === "waiting" && questions.length === 0 && (
        <div className="agent-alert" data-tone="attention" role="status">
          <Alert />
          <span>The agent is waiting for you in its own window.</span>
        </div>
      )}
      {needsYou && report && (
        <div className="agent-alert" data-tone={needsYou === "review" ? "info" : "attention"} role="status">
          <Alert />
          <span>
            <strong>{NEEDS_YOU_TEXT[needsYou]}.</strong>
            {report.needsYouDetail ? ` ${report.needsYouDetail}` : ""}
          </span>
        </div>
      )}

      {!folded && (
        <div className="agent-facts">
          <span className="agent-label">Parts touched</span>
          {changed.length === 0 && looked.length === 0 ? (
            <span className="faint small">Nothing yet.</span>
          ) : (
            <div className="chips">
              {changed.map((a) => (
                <span className="chip" key={a.id} title={a.description || `${a.changed.length} file${a.changed.length === 1 ? "" : "s"} changed`}>
                  {a.name}
                </span>
              ))}
              {looked.map((a) => (
                <span className="chip quiet" key={a.id} title="Only looked at, nothing changed">
                  {a.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {!folded && changed.length > 0 && notTouched.length > 0 && (
        <p className="agent-verified" title="Checked against the list of files this task changed">
          <Check />
          <span>
            <span className="verified-label">Not touched:</span> {notTouched.slice(0, 4).join(" · ")}
            {notTouched.length > 4 ? ` · ${notTouched.length - 4} more` : ""}
          </span>
        </p>
      )}

      <footer className="agent-foot">
        {task?.risk && task.risk.level !== "low" && (
          <span className="risk" data-level={task.risk.level} title={task.risk.reasons.join(". ")}>
            {RISK_TEXT[task.risk.level]}
          </span>
        )}
        <span className="agent-ticker" title={last?.plain}>
          {last?.plain ?? "…"}
        </span>
        <span className="agent-when">{ago(last?.ts, now)}</span>
        {talk}
        <button className="agent-toggle" data-shot="expand" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
          {open ? "Close" : "Details"}
          <ChevronDown />
        </button>
      </footer>

      {open && (
        <div id={panelId}>
          <TaskPanel session={session} now={now} />
        </div>
      )}
    </article>
  );
}
