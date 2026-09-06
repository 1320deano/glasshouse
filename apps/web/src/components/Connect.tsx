"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Check, Copy } from "./icons";
import { PageHeader } from "./PageHeader";

interface CodeState {
  code: string;
  expiresAt: string;
}

/**
 * Onboarding (brief 6.1): one command, then the tile appears. The code ties the project to the
 * person who is signed in. The page waits for the connector and then walks straight into the Room.
 */
export function Connect({ productName, connectCommand, server, local, plan, projectCount }: { productName: string; connectCommand: string; server: string; local: boolean; plan: "free" | "pro"; projectCount: number }) {
  const [code, setCode] = useState<CodeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const [project, setProject] = useState<{ id: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const getCode = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/projects/link-code", { method: "POST" });
      const data = (await res.json()) as CodeState & { error?: string; upgrade?: string };
      if (res.status === 402) {
        setUpgrade(true);
        setError(data.error ?? null);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? `${res.status}`);
      setCode(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not get a code.");
    }
  }, []);

  useEffect(() => {
    if (!local) void getCode();
  }, [local, getCode]);

  useEffect(() => {
    if (!code || project) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/link-code/${code.code}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { used: boolean; expired: boolean; project: { id: string; name: string } | null };
        if (data.project) setProject(data.project);
        else if (data.expired) setCode(null);
      } catch {
        /* next poll */
      }
    }, 2500);
    return () => clearInterval(poll);
  }, [code, project]);

  useEffect(() => {
    if (!local || project) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/projects/mine", { cache: "no-store" });
        const data = (await res.json()) as { projects: Array<{ id: string; name: string }> };
        if (data.projects.length > projectCount) setProject(data.projects[0]!);
      } catch {
        /* next poll */
      }
    }, 2500);
    return () => clearInterval(poll);
  }, [local, project, projectCount]);

  const command = local ? `${connectCommand}` : code ? `${connectCommand} --code ${code.code}` : "";
  const fullCommand = server && !server.includes("localhost") ? `${command} --server ${server}` : command;

  return (
    <main className="page narrow">
      <PageHeader brand={productName} title="Connect a project" right={local ? undefined : <span className="badge sm plain">{plan === "pro" ? "Pro" : "Free"}</span>} />

      <div className="page-intro">
        <h1>{projectCount === 0 ? "Connect your first project" : "Connect another project"}</h1>
        <p>Open a terminal inside the folder of the app you want to watch, and run this one command. It adds listeners to your agents and sends the list of file names (never their contents).</p>
      </div>

      {upgrade ? (
        <div className="notice attention">
          <Alert />
          <div className="notice-body">
            <span>{error}</span>
            <a className="link-underline" href="/account">
              See plans
            </a>
          </div>
        </div>
      ) : error ? (
        <div className="notice critical" role="alert">
          <Alert />
          <div className="notice-body">
            <span>{error}</span>
            <button className="link-button" onClick={() => void getCode()}>
              Try again
            </button>
          </div>
        </div>
      ) : null}

      {(local || code) && !project && (
        <div className="connect-box">
          <pre className="command">{fullCommand}</pre>
          <div className="toolbar">
            <button
              className="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(fullCommand);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  /* clipboard blocked */
                }
              }}
            >
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy the command"}
            </button>
            {code && <span className="faint small">This code works once and expires in 15 minutes.</span>}
          </div>
          <p className="muted waiting-dots">Waiting for the connector</p>
          <details>
            <summary>What happens next</summary>
            <ol className="steps">
              <li>The command links the folder and registers listeners for Claude Code, and for Codex and Cursor if they are installed.</li>
              <li>It sends the file map so the Room can name the parts of your app.</li>
              <li>Start your agent in that folder as usual. Its card appears here within a second or two.</li>
            </ol>
            <p className="faint small">Codex only: open Codex, type /hooks and trust the listeners. Until then it is followed through its logs by `glasshouse watch`.</p>
          </details>
        </div>
      )}

      {project && (
        <div className="notice" role="status">
          <Check />
          <div className="notice-body">
            <span>
              <strong>{project.name}</strong> is connected.
            </span>
            <a className="link-accent link-underline" href={`/room/${project.id}?welcome=1`}>
              Open its Room
            </a>
            <span>and start your agent in that folder.</span>
          </div>
        </div>
      )}

      {!local && !code && !project && !error && (
        <span className="loading-row">
          <span className="spinner" />
          Getting you a code
        </span>
      )}
    </main>
  );
}
