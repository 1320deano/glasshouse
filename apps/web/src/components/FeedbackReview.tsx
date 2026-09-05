"use client";

import { useEffect, useState } from "react";
import type { FeedbackView, ProjectSummary } from "@/lib/store/types";
import { Alert, ThumbsDown } from "./icons";
import { PageHeader } from "./PageHeader";

interface FeedbackState {
  items: FeedbackView[];
  events: number;
  rate: number;
}

/** The weekly review of disliked lines (Phase 5 keeps the rate under ~5%). Raw action beside every line. */
export function FeedbackReview({ project }: { project: ProjectSummary }) {
  const [state, setState] = useState<FeedbackState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/feedback/${project.id}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        setState((await res.json()) as FeedbackState);
      })
      .catch(() => setError("Could not load the feedback right now."));
  }, [project.id]);

  return (
    <main className="page">
      <PageHeader back={`/room/${project.id}`} title={project.name} />
      <div className="page-intro">
        <h1>Lines you disliked</h1>
        <p>Every plain-English line you gave a thumbs-down, with the real action it was describing. This is the list to review each week so the worst translations get fixed.</p>
        {state && (
          <p className="faint small">
            {state.items.length} disliked line{state.items.length === 1 ? "" : "s"} out of {state.events} action{state.events === 1 ? "" : "s"} recorded ({state.rate}%).
          </p>
        )}
      </div>
      {error && (
        <div className="notice critical" role="alert">
          <Alert />
          <div className="notice-body">{error}</div>
        </div>
      )}
      {!state && !error && (
        <span className="loading-row">
          <span className="spinner" />
          Loading
        </span>
      )}
      {state && state.items.length === 0 && (
        <div className="empty">
          <ThumbsDown size={22} className="empty-icon" />
          <h2>No dislikes yet.</h2>
          <p>Use the thumbs-down next to any line in an expanded tile when a description is wrong or unclear.</p>
        </div>
      )}
      {state && state.items.length > 0 && (
        <ul className="feedback-list">
          {state.items.map((f) => (
            <li key={f.id}>
              <div className="feedback-plain">“{f.plain}”</div>
              {f.plainNow && f.plainNow !== f.plain && <div className="faint small">Now reads: “{f.plainNow}”</div>}
              <div className="mono faint tiny">
                {f.kind} · {f.summary}
                {f.event?.paths.length ? ` · ${f.event.paths.join(", ")}` : ""}
                {f.event?.command ? ` · ${f.event.command}` : ""}
              </div>
              {f.note && <div className="faint small">Note: {f.note}</div>}
              <div className="faint small">{new Date(f.createdAt).toLocaleString()}</div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
