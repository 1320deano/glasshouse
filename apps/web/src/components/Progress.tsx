"use client";

import { useMemo } from "react";
import type { AgentTool, Stage } from "@glasshouse/schema";
import { PROGRESS_STEPS, hourTotal, stepIndex } from "@/lib/progress";
import type { ActivityView, AreaProgress, RoomState } from "@/lib/store/types";
import { Info } from "./icons";
import { STAGE_TEXT, TOOL_COLOURS, TOOL_NAMES, ago } from "./labels";

/**
 * The right column (Phase 5): what the week looked like, as counts and stages.
 *
 *   Activity   actions per two-hour slot over the last seven days, from the event log.
 *   Tools      which tool did how much of that work.
 *   Parts      how far each part of the app got, as the furthest stage a task reached there.
 *
 * Nothing here is a percentage (rule 1) and nothing is generated: every cell is a count and
 * every bar is a stage read off a task row.
 */

const SLOTS = 12; // two hours each
const DAYS = 7;
const TOOLS: AgentTool[] = ["claude-code", "codex", "cursor", "watcher"];
const STEP_WORDS: Partial<Record<Stage, string>> = { investigating: "Looking", planning: "Planning", building: "Building", testing: "Testing", done: "Finished" };

function Heatmap({ activity, now }: { activity: ActivityView; now: number }) {
  const grid = useMemo(() => {
    const today = new Date(now);
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const first = startOfDay(today) - (DAYS - 1) * 86400000;
    const rows = Array.from({ length: DAYS }, (_, i) => {
      const day = new Date(first + i * 86400000);
      return { label: day.toLocaleDateString([], { weekday: "short" }), date: day, cells: Array<number>(SLOTS).fill(0) };
    });
    let max = 0;
    for (const [key, slot] of Object.entries(activity.hours)) {
      const d = new Date(key); // local time from here on
      const row = Math.floor((startOfDay(d) - first) / 86400000);
      if (row < 0 || row >= DAYS) continue;
      const col = Math.floor(d.getHours() / 2);
      const n = hourTotal(slot);
      rows[row]!.cells[col] = (rows[row]!.cells[col] ?? 0) + n;
      max = Math.max(max, rows[row]!.cells[col]!);
    }
    return { rows, max };
  }, [activity.hours, now]);

  const level = (n: number) => (n === 0 ? 0 : grid.max <= 1 ? 4 : Math.min(4, 1 + Math.floor((3 * (n - 1)) / Math.max(1, grid.max - 1))));

  return (
    <div className="heat" role="img" aria-label={`${activity.total} actions over the last seven days`}>
      <div className="heat-grid">
        {grid.rows.map((r) => (
          <div className="heat-row" key={r.label + r.date.getDate()}>
            <span className="heat-day">{r.label}</span>
            {r.cells.map((n, c) => (
              <span className="heat-cell" data-level={level(n)} key={c} title={`${r.label} ${String(c * 2).padStart(2, "0")}:00–${String(c * 2 + 2).padStart(2, "0")}:00: ${n} action${n === 1 ? "" : "s"}`} />
            ))}
          </div>
        ))}
        <div className="heat-row heat-hours" aria-hidden="true">
          <span className="heat-day" />
          {Array.from({ length: SLOTS }, (_, c) => (
            <span className="heat-hour" key={c}>
              {c % 3 === 0 ? `${c * 2}` : ""}
            </span>
          ))}
        </div>
      </div>
      <div className="heat-legend" aria-hidden="true">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span className="heat-cell" data-level={l} key={l} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

function ToolMix({ activity }: { activity: ActivityView }) {
  const used = TOOLS.filter((t) => activity.byTool[t] > 0);
  if (used.length === 0) return <p className="faint small">No actions recorded this week.</p>;
  return (
    <div className="mix">
      <div className="mix-bar" role="img" aria-label={used.map((t) => `${TOOL_NAMES[t]}: ${activity.byTool[t]} actions`).join(", ")}>
        {used.map((t) => (
          <span key={t} style={{ flexGrow: activity.byTool[t], background: TOOL_COLOURS[t] }} />
        ))}
      </div>
      <ul className="mix-legend">
        {used.map((t) => (
          <li key={t}>
            <span className="tool-dot" style={{ background: TOOL_COLOURS[t] }} aria-hidden="true" />
            <span>{TOOL_NAMES[t]}</span>
            <span className="tabular faint">{activity.byTool[t]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AreaRow({ p, now }: { p: AreaProgress; now: number }) {
  const reached = stepIndex(p.stage);
  const word = p.attention === "waiting" ? "Waiting for you" : p.attention === "stuck" ? "Looks stuck" : p.stage ? (STEP_WORDS[p.stage] ?? STAGE_TEXT[p.stage]) : "Not touched";
  const bits: string[] = [];
  if (p.running > 0) bits.push(`${p.running} going`);
  if (p.finished > 0) bits.push(`${p.finished} finished`);
  if (p.filesChanged > 0) bits.push(`${p.filesChanged} file${p.filesChanged === 1 ? "" : "s"} changed`);
  const checks = p.checks ? (p.checks.failed ? `${p.checks.failed} check${p.checks.failed === 1 ? "" : "s"} failing` : `${p.checks.passed ?? 0} checks passing`) : null;
  return (
    <li className="part" data-attention={p.attention ?? ""} data-touched={p.stage ? "yes" : "no"}>
      <div className="part-head">
        <span className="part-name">{p.name}</span>
        <span className="part-stage">{word}</span>
      </div>
      <div className="part-bar" role="img" aria-label={p.stage ? `Reached ${word.toLowerCase()}` : "Not touched this week"}>
        {PROGRESS_STEPS.map((s, i) => (
          <span key={s} data-on={i <= reached ? "yes" : "no"} title={STEP_WORDS[s] ?? s} />
        ))}
      </div>
      {p.stage ? (
        <div className="part-meta">
          <span>{bits.join(" · ") || "Only looked at"}</span>
          {checks && <span className={p.checks?.failed ? "error-text" : "positive-text"}>{checks}</span>}
          <span className="faint">{p.lastTouchedAt ? ago(p.lastTouchedAt, now) : ""}</span>
        </div>
      ) : (
        <div className="part-meta">
          <span className="faint">Not touched this week</span>
        </div>
      )}
    </li>
  );
}

export function Progress({ state, now }: { state: RoomState; now: number }) {
  return (
    <div className="progress">
      <section className="panel-card" aria-labelledby="activity-h">
        <div className="panel-card-head">
          <h2 id="activity-h" className="section-label">
            Activity
          </h2>
          <span className="faint tiny">Last 7 days</span>
        </div>
        <p className="panel-card-lead">
          <strong className="tabular">{state.activity.total}</strong> action{state.activity.total === 1 ? "" : "s"} recorded across the agents this week.
        </p>
        <Heatmap activity={state.activity} now={now} />
      </section>

      <section className="panel-card" aria-labelledby="tools-h">
        <div className="panel-card-head">
          <h2 id="tools-h" className="section-label">
            Which tools
          </h2>
        </div>
        <ToolMix activity={state.activity} />
      </section>

      <section className="panel-card" aria-labelledby="parts-h">
        <div className="panel-card-head">
          <h2 id="parts-h" className="section-label">
            Parts of your app
          </h2>
          <a className="faint tiny link-underline" href={`/room/${state.project.id}/areas`}>
            Rename
          </a>
        </div>
        {state.progress.length === 0 ? (
          <div className="notice">
            <Info />
            <div className="notice-body">
              <span>
                No map of the parts yet, so cards use folder names. Run <code>glasshouse map</code> in the project folder to build one.
              </span>
            </div>
          </div>
        ) : (
          <ul className="parts">
            {state.progress.map((p) => (
              <AreaRow key={p.id} p={p} now={now} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
