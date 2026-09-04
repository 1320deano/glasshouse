"use client";

import { useState } from "react";

/** "Something's wrong": the tester's one-click way to tell us what broke, with where they were. */
export function ReportProblem({ projectId }: { projectId?: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  if (state === "sent") return <span className="muted small">Thanks, noted.</span>;
  if (!open)
    return (
      <button className="link-button" onClick={() => setOpen(true)}>
        Something’s wrong?
      </button>
    );
  return (
    <form
      className="problem"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("sending");
        try {
          const res = await fetch("/api/notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note, page: window.location.pathname, projectId }) });
          setState(res.ok ? "sent" : "failed");
        } catch {
          setState("failed");
        }
      }}
    >
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you expect, and what did you see instead?" rows={3} maxLength={2000} />
      <div className="settings-actions">
        <button className="button" type="submit" disabled={state === "sending" || note.trim().length < 2}>
          {state === "sending" ? "Sending…" : "Send"}
        </button>
        <button className="button subtle" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
        {state === "failed" && <span className="error small">Could not send. Try again.</span>}
      </div>
    </form>
  );
}
