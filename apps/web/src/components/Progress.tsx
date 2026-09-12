"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AgentTool, Stage } from "@glasshouse/schema";
import { PROGRESS_STEPS, hourTotal, stepIndex } from "@/lib/progress";
import { helperLine } from "@/lib/shed/room";
import type { ActivityView, AreaProgress, RoomHelper, RoomState } from "@/lib/store/types";
import { ToolLogo } from "./ToolLogo";
import { Check, ChevronDown, Copy, Info, Sprout } from "./icons";
import { STAGE_TEXT, TOOL_COLOURS, TOOL_NAMES, ago } from "./labels";

/**
 * The right column (Phase 5): what the week looked like, as counts and stages.
 *
 *   Activity   actions per two-hour slot over the last seven days, from the event log.
 *   Tools      which tool did how much of that work.
 *   Parts      how far each part of the app got, as the furthest stage a task reached there.
 *
 * Nothing here is a percentage (rule 1) and nothing is generated: every cell is a count and
 * every bar is a stage read off a task row. Each section folds on its own and stays folded in
 * this browser.
 */

const SLOTS = 12; // two hours each
const DAYS = 7;
const TOOLS: AgentTool[] = ["claude-code", "codex", "cursor", "watcher"];
const STEP_WORDS: Partial<Record<Stage, string>> = { investigating: "Looking", planning: "Planning", building: "Building", testing: "Testing", done: "Finished" };
const FOLDS_KEY = "glasshouse.room.progress-folds";

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

/** Words the owner can paste into Claude Code to hand a job to this helper. Copied, never sent (rule 4). */
function CopyAsk({ slug }: { slug: string }) {
  const [done, setDone] = useState(false);
  const text = `Please use the ${slug} sub-agent for this.`;
  return (
    <button
      type="button"
      className="msg-link"
      title="Copies a line you can paste into Claude Code's own window to hand it this helper. Nothing is sent from here."
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {done ? <Check size={12} /> : <Copy size={12} />}
      {done ? "Copied" : "Copy a line that asks for it"}
    </button>
  );
}

/** One helper as the Room shows it: what it does, and the fact of how it did this week. */
function HelperRow({ h, now, projectId }: { h: RoomHelper; now: number; projectId: string }) {
  const line = helperLine(h);
  const last = h.runs[0];
  return (
    <li className="helper-row" data-tone={line.tone ?? ""}>
      <div className="helper-row-head">
        <span className="helper-row-tools" aria-hidden="true">
          {h.tools.map((t) => (
            <ToolLogo key={t} tool={t} size={12} />
          ))}
        </span>
        <a className="helper-row-name link-underline" href={`/shed/${projectId}#helper-${h.id}`} title="See this helper in the Potting Shed">
          {h.name}
        </a>
        {!h.placedAt && <span className="pill sm">Not placed</span>}
      </div>
      <p className="helper-row-job">{h.job}</p>
      <p className="helper-row-line" title="Computed from the files its runs changed, never from what it said">
        {line.tone === "positive" && <Check size={12} />}
        {line.text}
        {last && <span className="faint"> · {ago(last.at, now)}</span>}
      </p>
      {h.placedAt && h.tools.includes("claude-code") && <CopyAsk slug={h.slug} />}
    </li>
  );
}

type SectionId = "activity" | "tools" | "parts" | "helpers";

/** A white card with a heading that folds it. The fold is remembered in this browser. */
function Section({ id, title, aside, open, onToggle, children }: { id: SectionId; title: string; aside?: ReactNode; open: boolean; onToggle: (id: SectionId) => void; children: ReactNode }) {
  const bodyId = `progress-${id}`;
  return (
    <section className="panel-card" data-open={open ? "yes" : "no"} aria-labelledby={`${bodyId}-h`}>
      <div className="panel-card-head">
        <button className="panel-card-fold" aria-expanded={open} aria-controls={bodyId} onClick={() => onToggle(id)}>
          <ChevronDown size={14} />
          <h2 id={`${bodyId}-h`} className="panel-card-title">
            {title}
          </h2>
        </button>
        {aside}
      </div>
      {open && (
        <div id={bodyId} className="panel-card-body">
          {children}
        </div>
      )}
    </section>
  );
}

export function Progress({ state, now }: { state: RoomState; now: number }) {
  const [folded, setFolded] = useState<Record<SectionId, boolean>>({ activity: false, tools: false, parts: false, helpers: false });
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FOLDS_KEY) ?? "null") as Partial<Record<SectionId, boolean>> | null;
      if (saved) setFolded((f) => ({ ...f, ...saved }));
    } catch {
      /* ignore a bad value */
    }
  }, []);
  const toggle = (id: SectionId) =>
    setFolded((f) => {
      const next = { ...f, [id]: !f[id] };
      try {
        localStorage.setItem(FOLDS_KEY, JSON.stringify(next));
      } catch {
        /* no storage */
      }
      return next;
    });

  return (
    <div className="progress">
      <Section id="activity" title="Activity" open={!folded.activity} onToggle={toggle} aside={<span className="panel-card-aside tabular">{state.activity.total} action{state.activity.total === 1 ? "" : "s"}</span>}>
        <p className="panel-card-lead">
          <strong className="tabular">{state.activity.total}</strong> action{state.activity.total === 1 ? "" : "s"} recorded across the agents this week.
        </p>
        <Heatmap activity={state.activity} now={now} />
      </Section>

      <Section
        id="helpers"
        title="Your helpers"
        open={!folded.helpers}
        onToggle={toggle}
        aside={
          <a className="panel-card-aside link-underline" href={`/shed/${state.project.id}`} title="Grow helpers in the Potting Shed">
            Grow
          </a>
        }
      >
        {!state.helpers || state.helpers.length === 0 ? (
          <p className="panel-card-lead">
            <Sprout size={12} /> No helpers yet. Grow one in the Potting Shed from what has happened here, and it shows up in this story the moment it runs.
          </p>
        ) : (
          <ul className="helper-rows">
            {state.helpers.map((h) => (
              <HelperRow key={h.id} h={h} now={now} projectId={state.project.id} />
            ))}
          </ul>
        )}
      </Section>

      <Section id="tools" title="Which tools" open={!folded.tools} onToggle={toggle}>
        <ToolMix activity={state.activity} />
      </Section>

      <Section
        id="parts"
        title="Parts of your app"
        open={!folded.parts}
        onToggle={toggle}
        aside={
          <a className="panel-card-aside link-underline" href={`/room/${state.project.id}/areas`}>
            Rename
          </a>
        }
      >
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
      </Section>
    </div>
  );
}
