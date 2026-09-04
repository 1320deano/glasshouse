"use client";

import { useEffect, useState } from "react";
import type { DemoFrame } from "@/lib/demo";
import { NEEDS_YOU_TEXT, RISK_TEXT, STAGE_TEXT, TOOL_COLOURS, TOOL_NAMES } from "./labels";

/**
 * The landing page's live tile: the two-monitor story played from the recorded fixtures.
 * Left, the terminal the owner would otherwise be squinting at. Right, the Room.
 */
export function MockTile({ frames }: { frames: DemoFrame[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (frames.length === 0) return;
    const f = frames[i]!;
    const t = setTimeout(() => setI((n) => (n + 1) % frames.length), i === frames.length - 1 ? 5000 : f.holdMs);
    return () => clearTimeout(t);
  }, [i, frames]);
  if (frames.length === 0) return null;
  const frame = frames[i]!;
  return (
    <div className="mock">
      <div className="mock-terminal">
        <div className="mock-bar">
          <span /> <span /> <span />
          <em>your prompting monitor</em>
        </div>
        <pre>{frame.terminal}</pre>
      </div>
      <div className="mock-room">
        <div className="mock-bar">
          <em>your second monitor</em>
        </div>
        {frame.tiles.map((t, n) => (
          <div key={n} className={`tile mock-tile${t.card && t.stage === "done" ? " card" : ""}`}>
            <div className="tile-head">
              <span className="tool-badge">
                <span className="tool-dot" style={{ background: TOOL_COLOURS[t.tool] }} />
                {TOOL_NAMES[t.tool]} · storyboard
              </span>
            </div>
            {t.continuedFrom && <div className="continuing">{t.continuedFrom}</div>}
            <div className="headline">{t.headline}</div>
            {!t.card && <div className="location">{t.location ? <>Working in <span>{t.location}</span></> : "Not in any part of the app yet"}</div>}
            <div className="stage-row">
              <span className={`stage ${t.endReason === "usage_limit" ? "limit" : t.stage === "done" ? "done" : "working"}`}>{t.endReason === "usage_limit" ? "Stopped: usage limit" : STAGE_TEXT[t.stage as keyof typeof STAGE_TEXT] ?? t.stage}</span>
              <span className={`risk ${t.risk}`} title={t.riskReasons.join(". ")}>
                {RISK_TEXT[t.risk]}
              </span>
            </div>
            {t.card && t.stage === "done" && (
              <div className="report compact">
                <div className="report-grid">
                  <section>
                    <div className="panel-title">Touched</div>
                    <div>{t.card.touched.join(" · ") || "Nothing"}</div>
                    <p className="not-touched">Not touched: {t.card.notTouched.map((n) => `${n} ✓`).join(" · ")}</p>
                  </section>
                </div>
                <div className={`needs-you ${t.card.needsYou}`}>
                  <strong>{NEEDS_YOU_TEXT[t.card.needsYou as keyof typeof NEEDS_YOU_TEXT]}</strong>
                  {t.card.needsYouDetail && <span> · {t.card.needsYouDetail}</span>}
                </div>
              </div>
            )}
            <div className="ticker">
              <span className="line">{t.ticker}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
