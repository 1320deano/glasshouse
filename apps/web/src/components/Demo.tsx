"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEMO_CHAPTERS, type DemoChapterId, type DemoFrame, type DemoStoryLine, type DemoTile } from "@/lib/demo-chapters";
import { Check, Handoff, Mark, Pause, Play } from "./icons";
import { RISK_TEXT, STAGE_TEXT, TOOL_NAMES } from "./labels";
import { ToolLogo } from "./ToolLogo";

/**
 * The landing page's demo: the two-monitor story, played from the recorded fixtures through
 * the real store (lib/demo.ts). Left, the terminal the owner would otherwise be squinting at.
 * Right, the Room in miniature: the agent cards and the story, drawn with the Room's own
 * parts so the demo looks like the product because it is the product's own output.
 *
 * Five chapters sit above the stage. Each is a beat of the brief's thirty-second demo; which
 * frames belong to which is decided by the recorded events, never by hand. Click one to jump
 * there. Under reduced motion nothing plays by itself: the stage rests on the final frame, the
 * richest one, and the chapters still answer a click.
 */

const NEEDS: Record<string, string> = { review: "Review recommended", decision: "Decision needed", blocked: "Blocked" };
const END_HOLD_MS = 5200;
const TERMINAL_LINES = 7;

function statusOf(t: DemoTile): { text: string; cls: "working" | "waiting" | "done" | "stuck" | "limit" } {
  if (t.endReason === "usage_limit") return { text: "Stopped: usage limit", cls: "limit" };
  if (t.stage === "waiting") return { text: "Waiting for you", cls: "waiting" };
  if (t.stage === "stuck") return { text: "Looks stuck", cls: "stuck" };
  if (t.stage === "done") return { text: "Finished", cls: "done" };
  return { text: STAGE_TEXT[t.stage as keyof typeof STAGE_TEXT] ?? t.stage, cls: "working" };
}

const clip = (s: string, n: number) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n - 1).replace(/[\s.,;:]+$/, "") + "…" : one;
};

/**
 * One agent, one card: the Room's own card, in its own classes, drawn from a frame. A card that
 * has ended folds to one line once a later agent is on screen, the way finished sessions do in
 * the Room, so the live card has the room.
 */
function DemoCard({ t, folded }: { t: DemoTile; folded: boolean }) {
  const status = statusOf(t);
  const need = t.card && t.card.needsYou !== "nothing" ? t.card.needsYou : undefined;
  if (folded) {
    return (
      <article className="agent finished demo-agent" data-status={status.cls}>
        <div className="agent-line">
          <ToolLogo tool={t.tool} size={14} />
          <span className="agent-line-tool">{TOOL_NAMES[t.tool]}</span>
          <span className="agent-line-title" title={t.headline}>
            {t.headline}
          </span>
          {need && (
            <span className="pill sm" data-need={need}>
              {NEEDS[need] ?? need}
            </span>
          )}
        </div>
      </article>
    );
  }
  return (
    <article className="agent demo-agent" data-status={status.cls}>
      <header className="agent-head">
        <span className="agent-tool">
          <ToolLogo tool={t.tool} />
          {TOOL_NAMES[t.tool]}
        </span>
        <span className="status" data-status={status.cls}>
          <span className="dot" aria-hidden="true" />
          {status.text}
        </span>
      </header>
      {t.continuedFrom && (
        <p className="agent-continuing">
          <Handoff />
          <span>Continuing from {t.continuedFrom.startsWith("Continuing from Claude Code") ? "Claude Code" : "Codex"}</span>
        </p>
      )}
      <h3 className="agent-title">{t.headline}</h3>
      <p className="agent-desc">
        {t.location ? (
          <>
            Working in <strong>{t.location}</strong>.
          </>
        ) : (
          "Not in any part of the app yet."
        )}
        {t.prompt ? <> You asked: “{clip(t.prompt, 110)}”</> : null}
      </p>
      {need && t.card && (
        <div className="agent-alert" data-tone={need === "review" ? "info" : "attention"} role="status">
          <span>
            <strong>{NEEDS[need] ?? need}.</strong>
            {t.card.needsYouDetail ? ` ${t.card.needsYouDetail}` : ""}
          </span>
        </div>
      )}
      <div className="agent-facts">
        <span className="agent-label">Parts touched</span>
        {t.touched.length === 0 && t.looked.length === 0 ? (
          <span className="faint small">Nothing yet.</span>
        ) : (
          <div className="chips">
            {t.touched.map((a) => (
              <span className="chip" key={a}>
                {a}
              </span>
            ))}
            {t.looked.map((a) => (
              <span className="chip quiet" key={a} title="Only looked at, nothing changed">
                {a}
              </span>
            ))}
          </div>
        )}
      </div>
      {t.notTouched.length > 0 && (
        <p className="agent-verified" title="Checked against the list of files this task changed">
          <Check />
          <span>
            <span className="verified-label">Not touched:</span> {t.notTouched.slice(0, 4).join(" · ")}
            {t.notTouched.length > 4 ? ` · ${t.notTouched.length - 4} more` : ""}
          </span>
        </p>
      )}
      <footer className="agent-foot">
        {t.risk !== "low" && (
          <span className="risk" data-level={t.risk} title={t.riskReasons.join(". ")}>
            {RISK_TEXT[t.risk]}
          </span>
        )}
        <span className="agent-ticker" title={t.ticker}>
          {t.ticker}
        </span>
      </footer>
    </article>
  );
}

/** One line of the story, in the story's own classes. */
function DemoLine({ m }: { m: DemoStoryLine }) {
  const facts = (m.kind === "finished" || m.kind === "limit") && (m.touched?.length || m.notTouched?.length || m.checks);
  return (
    <div className="msg glasshouse demo-msg">
      <span className="msg-avatar" aria-hidden="true">
        <Mark size={16} />
      </span>
      <div className="msg-body">
        <div className="msg-head">
          <span className="msg-who">Glasshouse</span>
          {m.badge && (
            <span className="pill sm" data-tone={m.badge.tone}>
              {m.badge.text}
            </span>
          )}
        </div>
        <p className="msg-text">{m.text}</p>
        {facts ? (
          <dl className="msg-facts">
            {m.touched && m.touched.length > 0 && (
              <div>
                <dt>Touched</dt>
                <dd>{m.touched.join(" · ")}</dd>
              </div>
            )}
            {m.notTouched && m.notTouched.length > 0 && (
              <div className="verified" title="Checked against the list of files this task changed">
                <dt>
                  <Check /> Not touched
                </dt>
                <dd>{m.notTouched.join(" · ")}</dd>
              </div>
            )}
            {m.checks && (
              <div>
                <dt>Checks</dt>
                <dd>{m.checks}</dd>
              </div>
            )}
            {m.risk && (
              <div>
                <dt>Risk</dt>
                <dd className="risk-word" data-level={m.risk}>
                  {RISK_TEXT[m.risk]}
                </dd>
              </div>
            )}
          </dl>
        ) : null}
      </div>
    </div>
  );
}

export function Demo({ frames }: { frames: DemoFrame[] }) {
  const last = frames.length - 1;
  const [reduced, setReduced] = useState(false);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const storyEl = useRef<HTMLDivElement | null>(null);
  const termEl = useRef<HTMLPreElement | null>(null);

  // Under reduced motion the stage rests on the final frame and nothing moves by itself.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduced(mq.matches);
      if (mq.matches) {
        setPlaying(false);
        setI(last);
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [last]);

  useEffect(() => {
    if (!playing || frames.length === 0) return;
    const hold = i === last ? END_HOLD_MS : frames[i]!.holdMs;
    const t = setTimeout(() => setI((n) => (n + 1) % frames.length), hold);
    return () => clearTimeout(t);
  }, [i, playing, frames, last]);

  // The story and the terminal read top down until they overflow; then the newest line is kept in
  // view, the way the Room keeps the newest line of its story at the bottom.
  useEffect(() => {
    for (const el of [storyEl.current, termEl.current]) {
      if (el && el.scrollHeight > el.clientHeight) el.scrollTo({ top: el.scrollHeight, behavior: reduced ? "auto" : "smooth" });
    }
  }, [i, reduced]);

  // Where each chapter starts and ends, from the frames' own chapter marks.
  const spans = useMemo(() => {
    const out = new Map<DemoChapterId, { from: number; to: number }>();
    frames.forEach((f, n) => {
      const s = out.get(f.chapter);
      if (s) s.to = n;
      else out.set(f.chapter, { from: n, to: n });
    });
    return out;
  }, [frames]);

  if (frames.length === 0) return null;
  const frame = frames[i]!;
  const chapter = DEMO_CHAPTERS.find((c) => c.id === frame.chapter) ?? DEMO_CHAPTERS[0]!;
  const chapterIndex = DEMO_CHAPTERS.indexOf(chapter);

  // The terminal keeps the last few things it printed, so it reads as a terminal and not a caption.
  const printed: string[] = [];
  for (let n = 0; n <= i; n++) {
    const line = frames[n]!.terminal;
    if (printed[printed.length - 1] !== line) printed.push(line);
  }
  const terminal = printed.slice(-TERMINAL_LINES);

  const jump = (id: DemoChapterId) => {
    const s = spans.get(id);
    if (!s) return;
    setI(s.from);
    if (!reduced) setPlaying(true);
  };

  return (
    <div className="demo" data-chapter={frame.chapter}>
      <div className="demo-chapters" role="tablist" aria-label="The five moments of the demo">
        {DEMO_CHAPTERS.map((c, n) => {
          const s = spans.get(c.id);
          const state = n < chapterIndex ? "done" : n === chapterIndex ? "current" : "todo";
          const fill = !s ? 0 : state === "done" ? 1 : state === "todo" ? 0 : (i - s.from + 1) / (s.to - s.from + 1);
          return (
            <button key={c.id} type="button" role="tab" aria-selected={state === "current"} className="demo-chapter" data-state={state} onClick={() => jump(c.id)} disabled={!s}>
              <span className="demo-chapter-bar" aria-hidden="true">
                <span style={{ transform: `scaleX(${fill})` }} />
              </span>
              <span className="demo-chapter-num" aria-hidden="true">
                {n + 1}
              </span>
              <span className="demo-chapter-title">{c.title}</span>
            </button>
          );
        })}
        <button type="button" className="icon-button demo-play" aria-label={playing ? "Pause the demo" : "Play the demo"} title={playing ? "Pause" : "Play"} onClick={() => setPlaying((p) => !p)}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
      </div>

      <div className="demo-stage">
        <div className="demo-screen demo-terminal" aria-label="Your prompting monitor">
          <div className="demo-bar">
            <i /> <i /> <i />
            <em>your prompting monitor</em>
          </div>
          <pre ref={termEl}>
            {terminal.map((line, n) => (
              <span key={`${i}-${n}`} className="demo-term-line" data-latest={n === terminal.length - 1 ? "yes" : "no"}>
                {line}
              </span>
            ))}
            <span className="demo-cursor" aria-hidden="true" />
          </pre>
        </div>

        <div className="demo-screen demo-room" aria-label="Your second monitor">
          <div className="demo-bar demo-bar-room">
            <span className="demo-brand">
              <Mark size={14} />
              Glasshouse
            </span>
            <span className="demo-crumb">/ storyboard</span>
            <span className="demo-live">
              <span className="dot live" aria-hidden="true" />
              Live
            </span>
            <em>your second monitor</em>
          </div>
          <div className="demo-room-body">
            <div className="demo-agents" aria-label="Agents">
              <span className="demo-col-title">
                Agents <span className="count">{frame.tiles.filter((t) => t.stage !== "done").length || ""}</span>
              </span>
              {frame.tiles.map((t, n) => (
                <DemoCard key={t.tool} t={t} folded={t.stage === "done" && n < frame.tiles.length - 1} />
              ))}
            </div>
            <div className="demo-story" aria-label="The story">
              <span className="demo-col-title">The story</span>
              {/* Newest at the bottom, like the Room; what no longer fits slips off the top. */}
              <div className="demo-story-lines" ref={storyEl}>
                {frame.moment && (
                  <aside className="moment demo-moment" key="moment">
                    <p className="moment-label">This is the moment</p>
                    <p className="moment-fact">{frame.moment.fact}</p>
                    <p className="moment-why">{frame.moment.why}</p>
                  </aside>
                )}
                {frame.story.map((m) => (
                  <DemoLine key={m.id} m={m} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="demo-caption" aria-live="polite">
        <span className="demo-caption-num" aria-hidden="true">
          {chapterIndex + 1}
        </span>
        <span>
          <strong>{chapter.title}.</strong> {chapter.caption}
        </span>
      </p>
    </div>
  );
}
