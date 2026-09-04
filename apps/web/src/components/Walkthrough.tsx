"use client";

import { useEffect, useState } from "react";
import { firstMoment } from "@/lib/moment";
import type { RoomState } from "@/lib/store/types";
import { TOOL_NAMES } from "./labels";

/**
 * The first-session walkthrough (brief section 3, Phase 4): the Room's own voice while the first
 * agent has not shown up yet, and the callout the moment it shows something the owner would have
 * missed. Dismissed once, remembered in this browser.
 */
export function Walkthrough({ state, welcome }: { state: RoomState; welcome: boolean }) {
  const key = `glasshouse.walkthrough.${state.project.id}`;
  const [dismissed, setDismissed] = useState<string>("");
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(key) ?? "");
    } catch {
      /* no storage */
    }
  }, [key]);
  const dismiss = (what: string) => {
    setDismissed(what);
    try {
      localStorage.setItem(key, what);
    } catch {
      /* no storage */
    }
  };

  const moment = firstMoment(state);
  if (moment && dismissed !== "moment" && dismissed !== "all") {
    return (
      <div className="moment">
        <div className="moment-label">This is the moment</div>
        <div className="moment-fact">{moment.fact}</div>
        <div className="moment-why">{moment.why} Expand the {TOOL_NAMES[moment.tool]} tile to see exactly what changed, and what verifiably did not.</div>
        <button className="link-button" onClick={() => dismiss("moment")}>
          Got it
        </button>
      </div>
    );
  }
  if (state.sessions.length === 0 && (welcome || dismissed !== "empty")) {
    return (
      <div className="notice">
        <strong>Connected.</strong> Now start Claude Code, Codex or Cursor in that folder and give it something to do. Its tile appears here within a second or two. The first time it touches a part of your app you did not ask about, this page will say so.
        {!welcome && (
          <>
            {" "}
            <button className="link-button" onClick={() => dismiss("empty")}>
              Hide
            </button>
          </>
        )}
      </div>
    );
  }
  return null;
}
