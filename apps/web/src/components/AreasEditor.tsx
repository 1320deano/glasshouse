"use client";

import { useState } from "react";
import type { Area, AreaMap } from "@glasshouse/schema";
import { askServer } from "@/lib/answer";
import type { ProjectSummary } from "@/lib/store/types";
import { Alert, Layers } from "./icons";
import { PageHeader } from "./PageHeader";

/**
 * The area map, editable. Every tile, report and digest uses these names, so getting them right
 * is the one bit of setup worth a minute. Rename, merge, refresh. Corrections stick.
 */
export function AreasEditor({ project, initial, files, scannedAt, aiEnabled }: { project: ProjectSummary; initial: AreaMap | null; files: number; scannedAt?: string; aiEnabled: boolean }) {
  const [map, setMap] = useState<AreaMap | null>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFolders, setShowFolders] = useState(false);

  async function send(body: Record<string, unknown>, label: string) {
    setBusy(label);
    setError(null);
    const { data, problem } = await askServer<{ map?: AreaMap; error?: string }>(
      () => fetch(`/api/areas/${project.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      "That change was not saved.",
    );
    if (problem || !data?.map) setError(problem ?? "That change was not saved.");
    else setMap(data.map);
    setBusy(null);
  }

  return (
    <main className="page">
      <PageHeader back={`/room/${project.id}`} title={project.name} />

      <div className="page-intro">
        <h1>Parts of your app</h1>
        <p>
          These are the parts of your app as Glasshouse understands them. Every tile says “Working in <em>Login</em>” using these names, so rename anything that is not how you would say it. Your
          changes stick, even when the map is refreshed.
        </p>
        <p className="faint small">
          {files > 0 ? `Built from ${files} files${scannedAt ? `, last mapped ${new Date(scannedAt).toLocaleString()}` : ""}.` : "No file map has been sent yet: run `glasshouse map` in the project folder."}
          {map?.source === "ai" ? " Names written by AI." : map ? " Names taken from folder names; AI naming runs when an API key is configured." : ""}
        </p>
      </div>

      <div className="toolbar">
        <button className="button" disabled={busy !== null || files === 0} onClick={() => send({ action: "refresh" }, "refresh")}>
          {busy === "refresh" ? <span className="spinner" /> : null}
          {busy === "refresh" ? "Refreshing" : aiEnabled ? "Refresh the map with AI" : "Refresh the map"}
        </button>
        <label className="switch">
          <input type="checkbox" checked={showFolders} onChange={(e) => setShowFolders(e.target.checked)} />
          Show the folders behind each part
        </label>
      </div>
      {error && (
        <div className="notice critical" role="alert">
          <Alert />
          <div className="notice-body">{error}</div>
        </div>
      )}

      {!map || map.areas.length === 0 ? (
        <div className="empty">
          <Layers size={22} className="empty-icon" />
          <h2>No parts yet.</h2>
          <p>
            Connect the project with the connector, or run <code>glasshouse map</code> inside the folder, and this page fills in.
          </p>
        </div>
      ) : (
        <ul className="area-list">
          {map.areas.map((a) => (
            <AreaRow
              key={a.id}
              area={a}
              others={map.areas.filter((o) => o.id !== a.id)}
              busy={busy !== null}
              showFolders={showFolders}
              onRename={(name, description) => send({ action: "rename", id: a.id, name, description }, a.id)}
              onMerge={(into) => send({ action: "merge", from: a.id, into }, a.id)}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function AreaRow({ area, others, busy, showFolders, onRename, onMerge }: { area: Area; others: Area[]; busy: boolean; showFolders: boolean; onRename: (name: string, description: string) => void; onMerge: (into: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(area.name);
  const [description, setDescription] = useState(area.description);
  const [mergeInto, setMergeInto] = useState("");

  return (
    <li className={`area-row${area.sensitive ? " sensitive" : ""}`}>
      <div className="area-main">
        {editing ? (
          <form
            className="area-form"
            onSubmit={(e) => {
              e.preventDefault();
              onRename(name, description);
              setEditing(false);
            }}
          >
            <label className="visually-hidden" htmlFor={`name-${area.id}`}>
              Name for this part, in your words
            </label>
            <input id={`name-${area.id}`} className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Name, in your words" autoFocus />
            <label className="visually-hidden" htmlFor={`desc-${area.id}`}>
              One line on what this part does
            </label>
            <input id={`desc-${area.id}`} className="field" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder="One line on what this part does" />
            <button className="button primary" type="submit" disabled={busy || !name.trim()}>
              Save
            </button>
            <button className="button subtle" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <>
            <div className="area-name">
              {area.name}
              {area.userCorrected && <span className="badge sm plain">your name</span>}
              {area.sensitive && (
                <span className="badge sm plain" title="Changes here always count as high risk">
                  <span className="dot" style={{ color: "var(--warn)" }} aria-hidden="true" />
                  high risk when changed
                </span>
              )}
            </div>
            <div className="area-desc">{area.description || "No description yet."}</div>
            {showFolders && <div className="area-prefixes">{area.prefixes.map((p) => (p === "." ? "(top-level files)" : p)).join(" · ")}</div>}
          </>
        )}
      </div>
      {!editing && (
        <div className="area-actions">
          <button className="button subtle" disabled={busy} onClick={() => setEditing(true)}>
            Rename
          </button>
          {others.length > 0 && (
            /* The picker and its button wrap as one, so "Merge" never lands alone on a phone. */
            <span className="merge-group">
              <label className="visually-hidden" htmlFor={`merge-${area.id}`}>
                Merge {area.name} into another part
              </label>
              <select id={`merge-${area.id}`} className="field" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} disabled={busy}>
                <option value="">Merge into…</option>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <button className="button subtle" disabled={busy || !mergeInto} onClick={() => onMerge(mergeInto)}>
                Merge
              </button>
            </span>
          )}
        </div>
      )}
    </li>
  );
}
