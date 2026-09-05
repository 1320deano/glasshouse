"use client";

import { useEffect, useState } from "react";
import type { DemoFrame } from "@/lib/demo";
import { Check } from "./icons";
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
          <i /> <i /> <i />
          <em>your prompting monitor</em>
        </div>
        <pre>{frame.terminal}</pre>
      </div>
      <div className="mock-room">
        <div className="mock-bar">
          <em>your second monitor</em>
        </div>
        {frame.tiles.map((t, n) => {
          const cls = t.endReason === "usage_limit" ? "limit" : t.stage === "done" ? "done" : "working";
          return (
            <div key={n} className="tile mock-tile" data-stage={cls}>
              <div className="tile-head">
                <span className="tile-tool">
                  <span className="tool-dot" style={{ background: TOOL_COLOURS[t.tool] }} />
                  {TOOL_NAMES[t.tool]}
                  <span className="tile-project">· storyboard</span>
                </span>
              </div>
              {t.continuedFrom && <p className="tile-continuing">{t.continuedFrom}</p>}
              <h3 className="tile-headline">{t.headline}</h3>
              {!t.card && (
                <p className="tile-location">
                  {t.location ? (
                    <>
                      Working in <strong>{t.location}</strong>
                    </>
                  ) : (
                    "Not in any part of the app yet"
                  )}
                </p>
              )}
              <div className="tile-status">
                <span className="badge stage" data-stage={cls}>
                  <span className="dot" aria-hidden="true" />
                  {t.endReason === "usage_limit" ? "Stopped: usage limit" : (STAGE_TEXT[t.stage as keyof typeof STAGE_TEXT] ?? t.stage)}
                </span>
                <span className="badge risk plain" data-level={t.risk} title={t.riskReasons.join(". ")}>
                  {RISK_TEXT[t.risk]}
                </span>
              </div>
              {t.card && t.stage === "done" && (
                <div className="report compact">
                  <div className="report-col">
                    <h4 className="section-label">Touched</h4>
                    <div className="muted small">{t.card.touched.join(" · ") || "Nothing"}</div>
                    <p className="verified small">
                      <Check />
                      <span>
                        <span className="verified-label">Not touched:</span> {t.card.notTouched.join(" · ")}
                      </span>
                    </p>
                  </div>
                  <p className="needs-you" data-need={t.card.needsYou}>
                    <strong>{NEEDS_YOU_TEXT[t.card.needsYou as keyof typeof NEEDS_YOU_TEXT]}</strong>
                    {t.card.needsYouDetail ? <> — {t.card.needsYouDetail}</> : null}
                  </p>
                </div>
              )}
              <div className="tile-foot">
                <span className="tile-ticker">{t.ticker}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
