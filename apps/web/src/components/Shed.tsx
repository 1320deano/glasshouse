"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { UPGRADE_REASONS } from "@/lib/plan";
import { CARE_TEXT } from "@/lib/shed/compile";
import type { HelperSuggestion } from "@/lib/shed/suggest";
import type { HelperView, ShedView } from "@/lib/shed/view";
import type { HelperBrief, HelperCare, HelperEvidence, HelperRule } from "@/lib/store/types";
import type { Area, AgentTool } from "@glasshouse/schema";
import { ArrowUp, Book, Check, ChevronRight, Copy, Fence, Grid, Hand, Info, PanelLeft, PanelRight, Plus, Screen, Sparkle, Sprout, Trash } from "./icons";
import { TOOL_NAMES, ago } from "./labels";

/**
 * The Potting Shed: three columns, laid out exactly like the Room so the two products feel like
 * one place.
 *   left    your helpers: one card each, with the fact of whether it kept to its patch
 *   middle  the builder: say what you need in the box at the bottom, then answer a few plain
 *           questions on one sheet. No prompt writing, no file names, no settings.
 *   right   what the record suggests growing next, each with the count it rests on
 * Nothing typed here reaches an agent. The Shed writes nothing into the project folder itself;
 * the owner runs one command, and the files appear.
 */

const LAYOUT_KEY = "deano.shed.layout";
const POLL_MS = 30000;

type Tab = "helpers" | "build" | "grown";
type HelperToolId = Exclude<AgentTool, "watcher">;
const TOOLS: HelperToolId[] = ["claude-code", "codex", "cursor"];
const CARES: HelperCare[] = ["careful", "balanced", "quick"];

interface Layout {
  helpers: "open" | "rail";
  grown: "open" | "closed";
}
const DEFAULT_LAYOUT: Layout = { helpers: "open", grown: "open" };

/** A helper being written or changed. Words only. */
interface Draft {
  id?: string;
  name: string;
  brief: HelperBrief;
  grownFrom: string;
  evidence?: HelperEvidence;
  /** The words the owner typed, kept so the sheet can say where the draft came from. */
  fromWords?: string;
  /** What the AI did with those words, if anything. */
  aiNote?: string;
}

const KIND_TEXT: Record<HelperEvidence["kind"], string> = {
  stuck: "From a stuck moment",
  asked: "From questions you were asked",
  checks: "From failing checks",
  sensitive: "From a sensitive part being changed",
  handoff: "From a handover between tools",
  busy: "From the busiest part of your app",
  owner: "Your own idea",
};

function nameFromWords(words: string): string {
  const w = words
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((x) => !/^(a|an|the|to|and|of|for|in|on|it|is|that|this|before|when|any|all|our|my|your|please|make|sure|should|be)$/i.test(x))
    .slice(0, 3)
    .join(" ");
  const s = w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : "New helper";
  return s.length > 40 ? `${s.slice(0, 40).trim()}` : s;
}

function stopAndAskOptions(areas: Area[]): string[] {
  const base = ["Before installing anything new", "Before deleting files", "When the same check fails twice", "Before changing how the app looks to customers"];
  const sensitive = areas.filter((a) => a.sensitive).map((a) => `Before changing anything in ${a.name}`);
  return [...sensitive, ...base];
}

function CopyButton({ text, label = "Copy", done: doneLabel = "Copied", className = "button sm" }: { text: string; label?: string; done?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          /* clipboard blocked: the text is on screen anyway */
        }
      }}
    >
      {done ? <Check /> : <Copy />}
      {done ? doneLabel : label}
    </button>
  );
}

/** The technical truth behind a helper: the very files a tool will read. */
function Files({ helper }: { helper: HelperView }) {
  return (
    <div className="files">
      {helper.files.map((f) => (
        <div className="file" key={f.path}>
          <div className="file-head">
            <span className="file-tool">{TOOL_NAMES[f.tool]}</span>
            <code className="file-path">{f.path}</code>
            {f.mode === "section" && <span className="badge sm plain">a section of this file</span>}
            <CopyButton text={f.body} className="button sm quiet" />
          </div>
          <pre className="file-body">{f.body}</pre>
        </div>
      ))}
    </div>
  );
}

function Evidence({ e, projectId }: { e: HelperEvidence; projectId: string }) {
  return (
    <p className="evidence">
      <Sparkle size={12} />
      <span>
        {e.text}
        {e.taskIds.length > 0 && (
          <>
            {" "}
            <a className="link-underline" href={`/room/${projectId}#task-${e.taskIds[0]}`}>
              {e.taskIds.length === 1 ? "See the task" : `See the first of ${e.taskIds.length} tasks`}
            </a>
          </>
        )}
      </span>
    </p>
  );
}

function HelperCard({ helper, areas, technical, onChange, onRemove, projectId, helpersCommand }: { helper: HelperView; areas: Area[]; technical: boolean; onChange: () => void; onRemove: () => void; projectId: string; helpersCommand: string }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const byId = new Map(areas.map((a) => [a.id, a.name]));
  const may = helper.brief.mayTouch.map((id) => byId.get(id)).filter(Boolean) as string[];
  const not = helper.brief.mustNotTouch.map((id) => byId.get(id)).filter(Boolean) as string[];
  const check = helper.check;
  const tone = check.runs === 0 ? undefined : check.strayed > 0 ? "critical" : check.unclear > 0 ? "attention" : "positive";
  return (
    <article className={`helper-card${open ? " open" : ""}`} id={`helper-${helper.id}`}>
      <div className="helper-head">
        <span className="helper-tools">{helper.brief.tools.map((t) => TOOL_NAMES[t]).join(" · ")}</span>
        {helper.placedAt ? (
          <span className="pill sm" data-tone="positive" title={`Placed ${new Date(helper.placedAt).toLocaleString()}`}>
            <Check size={10} /> In your project
          </span>
        ) : (
          <span className="pill sm">Not placed yet</span>
        )}
      </div>
      <h3 className="helper-name">{helper.name}</h3>
      <p className="helper-job">{helper.brief.job}</p>
      {(may.length > 0 || not.length > 0) && (
        <dl className="helper-facts">
          {may.length > 0 && (
            <div>
              <dt>
                <Fence size={12} /> Works in
              </dt>
              <dd>{may.join(" · ")}</dd>
            </div>
          )}
          {not.length > 0 && (
            <div>
              <dt>
                <Hand size={12} /> Never changes
              </dt>
              <dd>{not.join(" · ")}</dd>
            </div>
          )}
        </dl>
      )}
      <p className="helper-check" data-tone={tone} title="Computed from the files its runs changed, never from what it said">
        {tone === "positive" && <Check size={12} />}
        {check.line}
      </p>
      {technical && <p className="mono small faint">{helper.slug} · {helper.check.runs} run{helper.check.runs === 1 ? "" : "s"} matched by that name</p>}
      <div className="helper-actions">
        <button className="msg-link" type="button" onClick={onChange}>
          Change <ChevronRight size={12} />
        </button>
        <button className="msg-link" type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "Hide details" : "Details"}
        </button>
        {!confirm ? (
          <button className="msg-link danger" type="button" onClick={() => setConfirm(true)}>
            <Trash size={12} /> Remove
          </button>
        ) : (
          <span className="confirm">
            Remove {helper.name}?{" "}
            <button className="msg-link danger" type="button" onClick={onRemove}>
              Yes, remove
            </button>
            <button className="msg-link" type="button" onClick={() => setConfirm(false)}>
              Keep
            </button>
          </span>
        )}
      </div>
      {open && (
        <div className="helper-details">
          {!helper.placedAt && (
            <div className="notice dashed">
              <Info />
              <div className="notice-body">
                <span>To put it in your project, open a terminal in the project folder and run this once. It writes the files below and nothing else.</span>
                <span className="command-row">
                  <code>{helpersCommand}</code>
                  <CopyButton text={helpersCommand} className="button sm" />
                </span>
              </div>
            </div>
          )}
          {helper.brief.rules.length > 0 && (
            <div className="helper-rules">
              <span className="section-label">
                <Book size={12} /> Things it knows
              </span>
              <ul>
                {helper.brief.rules.map((r, i) => (
                  <li key={i}>
                    {r.text}
                    {r.evidence && <Evidence e={r.evidence} projectId={projectId} />}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {check.verdicts.length > 0 && (
            <div className="helper-runs">
              <span className="section-label">Checked afterwards</span>
              <ul>
                {check.verdicts.slice(0, 6).map((v, i) => (
                  <li key={i} data-verdict={v.verdict}>
                    <span>{new Date(v.run.startedAt).toLocaleString()}</span>
                    <span>{v.verdict === "kept" ? "Kept to its patch" : v.verdict === "strayed" ? `Changed ${v.outside.join(", ")}` : `Unclear: the task changed ${v.outside.join(", ")} and the tool did not say who`}</span>
                    <a className="link-underline" href={`/room/${projectId}#task-${v.run.taskId}`}>
                      See the task
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <span className="section-label">The files each tool reads</span>
          <Files helper={helper} />
        </div>
      )}
    </article>
  );
}

function SuggestionCard({ s, projectId, onGrow, canGrow }: { s: HelperSuggestion; projectId: string; onGrow: () => void; canGrow: boolean }) {
  return (
    <article className="suggest-card" data-kind={s.kind}>
      <span className="suggest-kind">{KIND_TEXT[s.kind]}</span>
      <h3 className="suggest-name">{s.name}</h3>
      <p className="suggest-summary">{s.summary}</p>
      <Evidence e={s.evidence} projectId={projectId} />
      {s.grownAs ? (
        <a className="msg-link" href={`#helper-${s.grownAs.id}`}>
          <Check size={12} /> Grown as {s.grownAs.name}
        </a>
      ) : (
        <button className="button sm" type="button" onClick={onGrow} disabled={!canGrow}>
          <Sprout size={12} /> Grow this
        </button>
      )}
    </article>
  );
}

export function Shed({
  initial,
  mode,
  shedName,
  siteName,
  helpersCommand,
  viewer,
  projects,
  startWith,
}: {
  initial: ShedView;
  mode: "local" | "supabase";
  shedName: string;
  siteName: string;
  helpersCommand: string;
  viewer: { email?: string; admin: boolean; local: boolean };
  projects: Array<{ id: string; name: string }>;
  /** A suggestion id to open straight away (from a link). */
  startWith?: string;
}) {
  const [view, setView] = useState<ShedView>(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [words, setWords] = useState("");
  const [busy, setBusy] = useState<"draft" | "save" | null>(null);
  const [note, setNote] = useState<{ text: string; tone?: "attention" | "critical" | "positive"; upgrade?: boolean } | null>(null);
  const [technical, setTechnical] = useState(false);
  const [tab, setTab] = useState<Tab>("build");
  const [layout, setLayoutState] = useState<Layout>(DEFAULT_LAYOUT);
  const [justGrown, setJustGrown] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date(initial.generatedAt).getTime());
  const projectId = view.project.id;

  const setLayout = useCallback((patch: Partial<Layout>) => {
    setLayoutState((l) => {
      const next = { ...l, ...patch };
      try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
      } catch {
        /* no storage */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "null") as Partial<Layout> | null;
      if (saved) setLayoutState({ ...DEFAULT_LAYOUT, ...saved });
    } catch {
      /* ignore */
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/shed/${projectId}`, { cache: "no-store" });
      if (res.ok) setView((await res.json()) as ShedView);
    } catch {
      /* next poll */
    }
  }, [projectId]);

  useEffect(() => {
    setNow(Date.now());
    const poll = setInterval(() => void refresh(), POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  const growFrom = useCallback((s: HelperSuggestion) => {
    setDraft({ name: s.name, brief: { ...s.brief, rules: s.brief.rules.map((r) => ({ ...r })) }, grownFrom: s.id, evidence: s.evidence });
    setNote(null);
    setJustGrown(null);
    setTab("build");
    setTimeout(() => document.getElementById("sheet")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, []);

  useEffect(() => {
    if (!startWith) return;
    const s = initial.suggestions.find((x) => x.id === startWith);
    if (s) growFrom(s);
  }, [startWith, initial.suggestions, growFrom]);

  const changeHelper = useCallback((h: HelperView) => {
    setDraft({ id: h.id, name: h.name, brief: { ...h.brief, rules: h.brief.rules.map((r) => ({ ...r })) }, grownFrom: h.grownFrom });
    setNote(null);
    setJustGrown(null);
    setTab("build");
    setTimeout(() => document.getElementById("sheet")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, []);

  /** The composer: the owner's words become a draft, tidied by the AI when there is one. */
  async function startFromWords() {
    const w = words.trim();
    if (w.length < 3 || busy) return;
    setBusy("draft");
    setNote(null);
    setJustGrown(null);
    const sensitive = view.areas.filter((a) => a.sensitive).map((a) => a.id);
    let d: Draft = {
      name: nameFromWords(w),
      brief: { job: w, mayTouch: [], mustNotTouch: sensitive, stopAndAsk: sensitive.length ? view.areas.filter((a) => a.sensitive).map((a) => `Before changing anything in ${a.name}`) : [], care: "balanced", rules: [], tools: [...TOOLS] },
      grownFrom: "owner",
      fromWords: w,
    };
    try {
      const res = await fetch("/api/shed/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, words: w }) });
      const data = (await res.json()) as { draft: { name: string; job: string; mayTouch: string[]; mustNotTouch: string[]; stopAndAsk: string[]; care: HelperCare } | null; reason?: string };
      if (data.draft) {
        d = { ...d, name: data.draft.name, brief: { ...d.brief, job: data.draft.job, mayTouch: data.draft.mayTouch, mustNotTouch: data.draft.mustNotTouch, stopAndAsk: data.draft.stopAndAsk, care: data.draft.care }, aiNote: "Tidied into a first draft by AI from your words. Change anything." };
      } else d = { ...d, aiNote: data.reason };
    } catch {
      d = { ...d, aiNote: "Could not reach the Shed for a tidy-up; your words are used as typed." };
    }
    setDraft(d);
    setWords("");
    setBusy(null);
    setTab("build");
  }

  async function save() {
    if (!draft || busy) return;
    if (draft.brief.job.trim().length < 3) {
      setNote({ text: "Say what the helper should do first.", tone: "attention" });
      return;
    }
    if (draft.brief.tools.length === 0) {
      setNote({ text: "Pick at least one tool for it to work in.", tone: "attention" });
      return;
    }
    setBusy("save");
    setNote(null);
    try {
      const res = await fetch(`/api/shed/${projectId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: draft.id, name: draft.name.trim() || "Helper", grownFrom: draft.grownFrom, brief: { ...draft.brief, stopAndAsk: draft.brief.stopAndAsk.filter((s) => s.trim()), rules: draft.brief.rules.filter((r) => r.text.trim()) } }),
      });
      const data = (await res.json()) as { helper?: HelperView; shed?: ShedView; error?: string; upgrade?: string };
      if (!res.ok || !data.shed) {
        setNote({ text: data.error ?? "Could not save the helper.", tone: "critical", upgrade: Boolean(data.upgrade) });
        return;
      }
      setView(data.shed);
      setJustGrown(data.helper?.id ?? null);
      setDraft(null);
      setNote(null);
      setLayout({ helpers: "open" });
      setTab("helpers");
      setTimeout(() => document.getElementById(`helper-${data.helper?.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch {
      setNote({ text: "Could not reach the Shed. Nothing was saved.", tone: "critical" });
    } finally {
      setBusy(null);
    }
  }

  async function remove(h: HelperView) {
    try {
      const res = await fetch(`/api/shed/${projectId}?id=${encodeURIComponent(h.id)}`, { method: "DELETE" });
      const data = (await res.json()) as { shed?: ShedView };
      if (res.ok && data.shed) setView(data.shed);
      if (draft?.id === h.id) setDraft(null);
    } catch {
      /* the poll will tell the truth */
    }
  }

  const update = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const updateBrief = (patch: Partial<HelperBrief>) => setDraft((d) => (d ? { ...d, brief: { ...d.brief, ...patch } } : d));

  const cycleArea = (id: string) => {
    if (!draft) return;
    const may = new Set(draft.brief.mayTouch);
    const not = new Set(draft.brief.mustNotTouch);
    if (may.has(id)) {
      may.delete(id);
      not.add(id);
    } else if (not.has(id)) not.delete(id);
    else may.add(id);
    updateBrief({ mayTouch: [...may], mustNotTouch: [...not] });
  };

  const askOptions = useMemo(() => {
    const opts = stopAndAskOptions(view.areas);
    for (const s of draft?.brief.stopAndAsk ?? []) if (!opts.includes(s)) opts.push(s);
    return opts;
  }, [view.areas, draft?.brief.stopAndAsk]);

  const helpersFolded = layout.helpers === "rail";
  const grownFolded = layout.grown === "closed";
  const grownHere = justGrown ? view.helpers.find((h) => h.id === justGrown) : undefined;
  const placedCount = view.helpers.filter((h) => h.placedAt).length;

  const switcher =
    projects.length > 1 ? (
      <>
        <label className="visually-hidden" htmlFor="project-switch">
          Switch project
        </label>
        <select id="project-switch" className="field project-switch" value={projectId} onChange={(e) => (window.location.href = `/shed/${e.target.value}`)}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </>
    ) : (
      <span className="page-title">{view.project.name}</span>
    );

  return (
    <>
      <a className="skip-link" href="#sheet">
        Skip to the builder
      </a>
      <main className="room shed" data-tab={tab} data-agents={layout.helpers} data-progress={layout.grown}>
        <header className="room-head">
          <div className="room-head-left">
            <a className="icon-button head-out" href="/" aria-label={`Leave ${shedName} and choose a product`} title={`Back to ${siteName}: choose a product`}>
              <Grid size={16} />
            </a>
            <a className="brand" href="/shed">
              <Sprout size={18} />
              <span>{shedName}</span>
            </a>
            <span className="crumb-sep" aria-hidden="true">
              /
            </span>
            {switcher}
          </div>
          <nav className="room-nav" aria-label="This project">
            <a className="nav-link" href={`/room/${projectId}`} title="Watch this project's agents">
              <Screen size={14} /> Watch in Glasshouse
            </a>
            {!viewer.local && (
              <a className="nav-link" href="/account">
                {view.plan === "pro" ? "Pro" : "Free"}
              </a>
            )}
            <span className="live-state" title={mode === "local" ? "Running on this computer" : "Hosted"}>
              {view.helpers.length === 0 ? "No helpers yet" : `${view.helpers.length} helper${view.helpers.length === 1 ? "" : "s"}${placedCount > 0 ? `, ${placedCount} placed` : ""}`}
            </span>
          </nav>
        </header>

        <nav className="room-tabs" aria-label="Sections">
          <button role="tab" aria-selected={tab === "helpers"} onClick={() => setTab("helpers")}>
            Helpers
            {view.helpers.length > 0 && <span className="nav-count">{view.helpers.length}</span>}
          </button>
          <button role="tab" aria-selected={tab === "build"} onClick={() => setTab("build")}>
            Build
          </button>
          <button role="tab" aria-selected={tab === "grown"} onClick={() => setTab("grown")}>
            From your project
            {view.suggestions.filter((s) => !s.grownAs && !s.starter).length > 0 && <span className="nav-count">{view.suggestions.filter((s) => !s.grownAs && !s.starter).length}</span>}
          </button>
        </nav>

        <div className="room-grid">
          <aside className="room-col agents" id="helpers" aria-label="Your helpers" data-active={tab === "helpers"}>
            <div className="rail" aria-hidden={!helpersFolded}>
              <button className="icon-button rail-open" aria-label="Show your helpers" title="Show your helpers" onClick={() => setLayout({ helpers: "open" })}>
                <PanelLeft size={16} />
              </button>
            </div>
            <div className="col-body">
              <div className="col-head">
                <button className="icon-button col-fold" aria-label="Fold the helpers away" aria-pressed title="Fold the helpers away" onClick={() => setLayout({ helpers: "rail" })}>
                  <PanelLeft size={16} />
                </button>
                <h2 className="col-title">
                  Your helpers
                  {view.helpers.length > 0 && <span className="count">{view.helpers.length}</span>}
                </h2>
                <label className="switch tiny">
                  <input type="checkbox" checked={technical} onChange={(e) => setTechnical(e.target.checked)} />
                  Technical detail
                </label>
              </div>

              {!view.canGrow && (
                <div className="notice dashed">
                  <Info />
                  <div className="notice-body">
                    <span>{UPGRADE_REASONS.helpers}</span>
                    <a className="link-accent link-underline" href="/account">
                      See plans
                    </a>
                  </div>
                </div>
              )}

              {grownHere && (
                <div className="notice attention" role="status">
                  <Sprout />
                  <div className="notice-body">
                    <strong>{grownHere.name} is grown.</strong>
                    <span>It is not in your project yet. Open a terminal in the project folder and run this once; it writes the helper's files and nothing else.</span>
                    <span className="command-row">
                      <code>{helpersCommand}</code>
                      <CopyButton text={helpersCommand} className="button sm" />
                    </span>
                  </div>
                </div>
              )}

              {view.helpers.length === 0 && (
                <div className="empty">
                  <Sprout size={22} className="empty-icon" />
                  <h2>No helpers yet.</h2>
                  <p>Say what you need in the box, or take one your project suggests on the right. Each helper becomes a real file that Claude Code, Codex or Cursor reads.</p>
                </div>
              )}

              <div className="agents-list">
                {view.helpers.map((h) => (
                  <HelperCard key={h.id} helper={h} areas={view.areas} technical={technical} onChange={() => changeHelper(h)} onRemove={() => void remove(h)} projectId={projectId} helpersCommand={helpersCommand} />
                ))}
              </div>

              {view.helpers.length > 0 && (
                <div className="col-foot">
                  <span>Checked {ago(view.generatedAt, now)}</span>
                  <span>{placedCount === view.helpers.length ? "All in your project" : `${view.helpers.length - placedCount} not placed yet`}</span>
                </div>
              )}
            </div>
          </aside>

          <section className="room-col story" aria-label="The builder" data-active={tab === "build"}>
            <div className="chat">
              <div className="chat-scroll">
                <div className="chat-inner">
                  <div className="story-head">
                    <h1 className="story-title">{view.project.name}</h1>
                    <p className="story-sub">
                      {view.helpers.length === 0 ? "No helpers yet. " : `${view.helpers.length} helper${view.helpers.length === 1 ? "" : "s"} grown. `}
                      {view.evidence.tasks === 0 ? "Nothing has been recorded in this project yet, so the suggestions are starters." : `Read from ${view.evidence.tasks} task${view.evidence.tasks === 1 ? "" : "s"} over the last two weeks.`}
                    </p>
                  </div>

                  {!draft && (
                    <div className="sheet intro" id="sheet">
                      <h2 className="sheet-title">Grow a helper</h2>
                      <ol className="steps">
                        <li>
                          <strong>Say what you need</strong> in the box below, in your own words. “Check the checkout still works before anything is called finished.”
                        </li>
                        <li>
                          <strong>Answer a few plain questions</strong> on one sheet: where it may work, when it must stop and ask you, how careful to be.
                        </li>
                        <li>
                          <strong>Run one command</strong> in your project folder. The helper appears for Claude Code, Codex and Cursor at once, and Glasshouse checks afterwards that it kept to its patch.
                        </li>
                      </ol>
                      <p className="faint small">
                        Or start from what your project has already taught us: the column on the right proposes helpers from real stuck moments, questions you were asked, and parts that were changed when they should not have been.
                      </p>
                    </div>
                  )}

                  {draft && (
                    <form
                      className="sheet"
                      id="sheet"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void save();
                      }}
                    >
                      <div className="sheet-head">
                        <span className="suggest-kind">{draft.id ? "Changing a helper" : draft.evidence ? KIND_TEXT[draft.evidence.kind] : "Your own idea"}</span>
                        <label className="visually-hidden" htmlFor="helper-name">
                          Name
                        </label>
                        <input id="helper-name" className="sheet-name" value={draft.name} onChange={(e) => update({ name: e.target.value })} maxLength={80} placeholder="Name it by its job" />
                        {draft.evidence && <Evidence e={draft.evidence} projectId={projectId} />}
                        {draft.aiNote && (
                          <p className="faint small">
                            <Sparkle size={12} /> {draft.aiNote}
                          </p>
                        )}
                      </div>

                      <section className="sheet-section">
                        <h3>
                          <span className="step">1</span> What it does
                        </h3>
                        <label className="visually-hidden" htmlFor="helper-job">
                          The job
                        </label>
                        <textarea id="helper-job" className="field sheet-text" rows={4} value={draft.brief.job} onChange={(e) => updateBrief({ job: e.target.value })} maxLength={1200} placeholder="In your own words. What should it do, and when?" />
                      </section>

                      <section className="sheet-section">
                        <h3>
                          <span className="step">2</span> Where it may work
                        </h3>
                        {view.areas.length === 0 ? (
                          <p className="faint small">No parts of your app are mapped yet. Connect the project and the map arrives with it; until then the helper may work anywhere.</p>
                        ) : (
                          <>
                            <p className="sheet-hint">Tap a part once to let it work there, twice to keep it out, a third time to say nothing. Parts marked sensitive start out kept out.</p>
                            <div className="chips" role="group" aria-label="Parts of your app">
                              {view.areas.map((a) => {
                                const state = draft.brief.mayTouch.includes(a.id) ? "may" : draft.brief.mustNotTouch.includes(a.id) ? "not" : "none";
                                return (
                                  <button key={a.id} type="button" className="chip" data-state={state} onClick={() => cycleArea(a.id)} aria-pressed={state !== "none"} title={a.description || a.name}>
                                    {state === "may" ? <Check size={11} /> : state === "not" ? <Hand size={11} /> : null}
                                    {a.name}
                                    {a.sensitive && <span className="chip-note">sensitive</span>}
                                  </button>
                                );
                              })}
                            </div>
                            <p className="chips-legend">
                              <span data-state="may">May work here</span>
                              <span data-state="not">Must never change</span>
                              <span data-state="none">No rule</span>
                            </p>
                            {technical && (
                              <p className="mono small faint">
                                {draft.brief.mayTouch.length > 0 && `may: ${view.areas.filter((a) => draft.brief.mayTouch.includes(a.id)).flatMap((a) => a.prefixes).join(", ")}`}
                                {draft.brief.mustNotTouch.length > 0 && ` · never: ${view.areas.filter((a) => draft.brief.mustNotTouch.includes(a.id)).flatMap((a) => a.prefixes).join(", ")}`}
                              </p>
                            )}
                          </>
                        )}
                      </section>

                      <section className="sheet-section">
                        <h3>
                          <span className="step">3</span> When it must stop and ask you
                        </h3>
                        <div className="checks">
                          {askOptions.map((opt) => {
                            const on = draft.brief.stopAndAsk.includes(opt);
                            return (
                              <label key={opt} className="check-row">
                                <input type="checkbox" checked={on} onChange={() => updateBrief({ stopAndAsk: on ? draft.brief.stopAndAsk.filter((s) => s !== opt) : [...draft.brief.stopAndAsk, opt] })} />
                                {opt}
                              </label>
                            );
                          })}
                        </div>
                        <AddLine placeholder="Another moment, e.g. Before sending any email" onAdd={(t) => updateBrief({ stopAndAsk: [...draft.brief.stopAndAsk, t] })} />
                      </section>

                      <section className="sheet-section">
                        <h3>
                          <span className="step">4</span> How carefully
                        </h3>
                        <div className="segmented" role="tablist" aria-label="How carefully it works">
                          {CARES.map((c) => (
                            <button key={c} type="button" role="tab" aria-selected={draft.brief.care === c} onClick={() => updateBrief({ care: c })}>
                              {CARE_TEXT[c].label}
                            </button>
                          ))}
                        </div>
                        <p className="sheet-hint">{CARE_TEXT[draft.brief.care].owner}</p>
                      </section>

                      <section className="sheet-section">
                        <h3>
                          <span className="step">5</span> Things it should already know
                        </h3>
                        <p className="sheet-hint">Your standing answers. Anything you have had to tell an agent more than once belongs here.</p>
                        <ul className="rules">
                          {draft.brief.rules.map((r, i) => (
                            <li key={i}>
                              <div className="rule-row">
                                <label className="visually-hidden" htmlFor={`rule-${i}`}>
                                  Rule {i + 1}
                                </label>
                                <input id={`rule-${i}`} className="field" value={r.text} maxLength={400} onChange={(e) => updateBrief({ rules: draft.brief.rules.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                                <button type="button" className="icon-button" aria-label="Remove this rule" onClick={() => updateBrief({ rules: draft.brief.rules.filter((_, j) => j !== i) })}>
                                  <Trash size={14} />
                                </button>
                              </div>
                              {r.evidence && <Evidence e={r.evidence} projectId={projectId} />}
                            </li>
                          ))}
                        </ul>
                        <AddLine placeholder="e.g. Prices are shown in pounds, never pence" onAdd={(t) => updateBrief({ rules: [...draft.brief.rules, { text: t } satisfies HelperRule] })} />
                      </section>

                      <section className="sheet-section">
                        <h3>
                          <span className="step">6</span> Which tools
                        </h3>
                        <div className="chips" role="group" aria-label="Tools">
                          {TOOLS.map((t) => {
                            const on = draft.brief.tools.includes(t);
                            return (
                              <button key={t} type="button" className="chip" data-state={on ? "may" : "none"} aria-pressed={on} onClick={() => updateBrief({ tools: on ? draft.brief.tools.filter((x) => x !== t) : [...draft.brief.tools, t] })}>
                                {on && <Check size={11} />}
                                {TOOL_NAMES[t]}
                              </button>
                            );
                          })}
                        </div>
                        <p className="sheet-hint">One helper, written once, for every tool you use. In Codex it becomes a standing instruction the agent reads at the start of each session.</p>
                      </section>

                      {note && (
                        <div className={`notice ${note.tone ?? ""}`} role="alert">
                          <Info />
                          <div className="notice-body">
                            <span>{note.text}</span>
                            {note.upgrade && (
                              <a className="link-accent link-underline" href="/account">
                                See plans
                              </a>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="sheet-actions">
                        <button className="button primary" type="submit" disabled={busy === "save" || draft.brief.job.trim().length < 3}>
                          {busy === "save" ? <span className="spinner" /> : <Sprout size={14} />}
                          {draft.id ? "Save the changes" : "Grow it"}
                        </button>
                        <button className="button quiet" type="button" onClick={() => setDraft(null)}>
                          Discard
                        </button>
                        <span className="faint small">Nothing reaches an agent until you run the command in your project folder.</span>
                      </div>
                    </form>
                  )}
                </div>
              </div>

              {!draft && (
                <div className="composer-wrap">
                  <form
                    className="composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void startFromWords();
                    }}
                  >
                    <label className="visually-hidden" htmlFor="helper-words">
                      What should this helper do?
                    </label>
                    <input
                      id="helper-words"
                      className="composer-field"
                      value={words}
                      onChange={(e) => setWords(e.target.value)}
                      placeholder="What should this helper do? e.g. Check the checkout still works before anything is called finished"
                      maxLength={1200}
                      disabled={busy === "draft"}
                      autoComplete="off"
                    />
                    <div className="composer-row">
                      <span className="composer-note">{view.canGrow ? "Your words become a sheet you can change before anything is written." : UPGRADE_REASONS.helpers}</span>
                      <button className="composer-send" type="submit" aria-label="Start a helper" title="Start a helper" disabled={busy === "draft" || words.trim().length < 3 || !view.canGrow}>
                        {busy === "draft" ? <span className="spinner" /> : <ArrowUp size={16} />}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </section>

          <aside className="room-col progress-col" aria-label="From your project" data-active={tab === "grown"}>
            <div className="rail" aria-hidden={!grownFolded}>
              <button className="icon-button rail-open" aria-label="Show what your project suggests" title="Show what your project suggests" onClick={() => setLayout({ grown: "open" })}>
                <PanelRight size={16} />
              </button>
            </div>
            <div className="col-body">
              <div className="col-head">
                <h2 className="col-title">From your project</h2>
                <div className="col-tools">
                  <button className="icon-button col-fold" aria-label="Fold this away" aria-pressed title="Fold this away" onClick={() => setLayout({ grown: "closed" })}>
                    <PanelRight size={16} />
                  </button>
                </div>
              </div>
              <p className="faint small">
                {view.evidence.tasks === 0
                  ? "Nothing recorded yet. These two are starters; once agents have worked here, the suggestions come from what actually happened."
                  : `Computed from ${view.evidence.tasks} task${view.evidence.tasks === 1 ? "" : "s"} since ${new Date(view.evidence.since).toLocaleDateString(undefined, { day: "numeric", month: "short" })}. Every count links to the tasks behind it.`}
              </p>
              <div className="agents-list">
                {view.suggestions.map((s) => (
                  <SuggestionCard key={s.id} s={s} projectId={projectId} canGrow={view.canGrow} onGrow={() => growFrom(s)} />
                ))}
              </div>
              <div className="col-foot">
                <span>{view.areaMapSource ? `Parts of your app named ${view.areaMapSource === "ai" ? "by AI" : "from folder names"}.` : "No map of your app yet."}</span>
                <a className="link-underline" href={`/room/${projectId}/areas`}>
                  Rename the parts
                </a>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}

/** One line of text and an add button, for lists the owner grows. */
function AddLine({ placeholder, onAdd }: { placeholder: string; onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (!t) return;
    onAdd(t);
    setText("");
  };
  return (
    <div className="add-line">
      <input
        className="field"
        value={text}
        placeholder={placeholder}
        maxLength={400}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
      />
      <button type="button" className="button sm" onClick={add} disabled={!text.trim()}>
        <Plus size={12} /> Add
      </button>
    </div>
  );
}
