"use client";

import { useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { askServer } from "@/lib/answer";
import { UPGRADE_REASONS } from "@/lib/plan";
import { briefFromChoices, CARE_IDS, choicesForKind, choicesFromBrief, describeChoices, DUTIES, HELPER_TOOL_IDS, KIND_BY_ID, KINDS, nameFor, stopOptionsFor, VOICES, type Choices, type HelperToolId, type KindId } from "@/lib/shed/build";
import { CARE_TEXT, compileHelper, type CompiledFile } from "@/lib/shed/compile";
import type { BoxEvidence } from "@/lib/shed/evidence";
import { rehearse } from "@/lib/shed/rehearse";
import { slugify } from "@/lib/shed/slug";
import type { HelperSuggestion } from "@/lib/shed/suggest";
import type { HelperView, ShedView } from "@/lib/shed/view";
import type { HelperCare, HelperEvidence, HelperRule } from "@/lib/store/types";
import type { Area } from "@glasshouse/schema";
import { ArrowLeft, Book, Check, ChevronRight, Copy, Fence, Hand, Handoff, Info, Plus, Screen, Sparkle, Sprout, Trash } from "./icons";
import { TOOL_NAMES, ago, clip, dayLabel } from "./labels";
import { ToolLogo } from "./ToolLogo";

/**
 * The Potting Shed: one page, built around one card.
 *
 *   Get started    pick what kind of helper you need (six tiles, each saying what the record has
 *                  seen), or take one your project suggests from what actually happened.
 *   The helper     one tap later the helper is finished and readable: each question shows the
 *                  facts chosen, with a Change button that opens its boxes. Every box carries
 *                  what the record says about it ("3 tasks were called finished with checks still
 *                  failing"), with the tasks one tap away.
 *   Try it         beside the helper, what it would have done on last week's tasks, computed from
 *                  its rules and the record. Then "Grow it": only the ticked sentences are stored.
 *   Describe it    the same card for people who would rather say it in a sentence.
 *   Your helpers   below the card: one tile each, with the fact of whether it kept to its patch.
 *
 * Nothing typed here reaches an agent. The Shed writes nothing into the project folder itself;
 * the owner runs one command, and the files appear.
 */

const POLL_MS = 30000;

type Mode = "tick" | "describe";
type SectionId = "kind" | "does" | "where" | "stops" | "care" | "voice" | "knows" | "tools" | "own";
const SECTIONS: SectionId[] = ["kind", "does", "where", "stops", "care", "voice", "knows", "tools", "own"];

/** A helper being made or changed. Words only: the ticks, and anything typed. */
interface Build {
  id?: string;
  /** The name as typed, or "" to use the one made from the choices. */
  name: string;
  choices: Choices;
  grownFrom: string;
  evidence?: HelperEvidence;
  /** What the AI did with the owner's words, if anything. */
  aiNote?: string;
  /** Which questions are open for changing. Everything else shows its facts as a line. */
  open: Partial<Record<SectionId, boolean>>;
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

const KIND_ICON: Record<KindId, (p: { size?: number }) => ReactElement> = {
  checker: (p) => <Check {...p} />,
  guard: (p) => <Hand {...p} />,
  specialist: (p) => <Fence {...p} />,
  rules: (p) => <Book {...p} />,
  handover: (p) => <Handoff {...p} />,
  own: (p) => <Sparkle {...p} />,
};

/** A name for words typed without an AI key: the part of the app the words mention, or the plain fallback. */
function nameFromWords(words: string, areas: Area[]): string {
  const lower = words.toLowerCase();
  const hit = areas
    .filter((a) => a.name.length > 2 && lower.includes(a.name.toLowerCase()))
    .sort((a, b) => lower.indexOf(a.name.toLowerCase()) - lower.indexOf(b.name.toLowerCase()))[0];
  if (hit) return /\b(check|test|verify)/.test(lower) ? `${hit.name} checker` : /\b(never|guard|protect|keep out|don't touch|do not touch)/.test(lower) ? `${hit.name} guard` : `${hit.name} helper`;
  return "";
}

const listWords = (items: string[]) => (items.length <= 1 ? items.join("") : items.length === 2 ? `${items[0]} and ${items[1]}` : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

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
function Files({ files }: { files: CompiledFile[] }) {
  return (
    <div className="files">
      {files.map((f) => (
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

function Evidence({ e, projectId, short }: { e: HelperEvidence; projectId: string; short?: boolean }) {
  return (
    <p className="evidence">
      <Sparkle size={12} />
      <span>
        {e.text}
        {e.taskIds.length > 0 && (
          <>
            {" "}
            <a className="link-underline" href={`/room/${projectId}#task-${e.taskIds[0]}`}>
              {short ? "See" : e.taskIds.length === 1 ? "See the task" : `See the first of ${e.taskIds.length} tasks`}
            </a>
          </>
        )}
      </span>
    </p>
  );
}

/** One box to tick: a label the owner reads, what the record says about it, and (behind the toggle) the sentence it becomes. */
function Tick({ on, label, sentence, evidence, projectId, technical, onChange }: { on: boolean; label: string; sentence?: string; evidence?: HelperEvidence; projectId: string; technical?: boolean; onChange: () => void }) {
  return (
    <label className="tick" data-on={on ? "yes" : "no"} data-seen={evidence ? "yes" : "no"}>
      <input type="checkbox" checked={on} onChange={onChange} />
      <span className="tick-body">
        <span className="tick-label">{label}</span>
        {evidence && <Evidence e={evidence} projectId={projectId} short />}
        {technical && sentence && <span className="tick-sentence">“{sentence}”</span>}
      </span>
    </label>
  );
}

/**
 * One question of the helper. Closed, it is the answer in plain words with a Change button;
 * open, it is the boxes. The helper reads as a document either way.
 */
function Section({ id, title, summary, open, onToggle, verb = "Change", children }: { id: SectionId; title: string; summary: ReactNode; open: boolean; onToggle: (id: SectionId) => void; verb?: "Change" | "Add"; children: ReactNode }) {
  return (
    <section className="hsec" data-open={open ? "yes" : "no"} aria-labelledby={`hsec-${id}`}>
      <div className="hsec-head">
        <h3 id={`hsec-${id}`}>{title}</h3>
        <button type="button" className="msg-link hsec-toggle" aria-expanded={open} aria-controls={`hsec-${id}-body`} onClick={() => onToggle(id)}>
          {open ? "Done" : verb}
          <ChevronRight size={12} className="hsec-chevron" />
        </button>
      </div>
      {open ? (
        <div id={`hsec-${id}-body`} className="hsec-body">
          {children}
        </div>
      ) : (
        <button type="button" className="hsec-summary" onClick={() => onToggle(id)} title={`${verb} this`}>
          {summary}
        </button>
      )}
    </section>
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
  const lines = describeChoices(choicesFromBrief(helper.brief, helper.grownFrom), areas);
  return (
    <article className={`helper-card${open ? " open" : ""}`} id={`helper-${helper.id}`}>
      <div className="helper-head">
        <span className="helper-tools">
          {helper.brief.tools.map((t) => (
            <span key={t} className="helper-tool" title={TOOL_NAMES[t]}>
              <ToolLogo tool={t} size={13} />
            </span>
          ))}
        </span>
        {helper.placedAt ? (
          <span className="pill sm" data-tone="positive" title={`Placed ${new Date(helper.placedAt).toLocaleString()}`}>
            <Check size={10} /> In your project
          </span>
        ) : (
          <span className="pill sm">Not placed yet</span>
        )}
      </div>
      <h3 className="helper-name">{helper.name}</h3>
      <ul className="helper-lines">
        {lines.slice(0, open ? lines.length : 3).map((l, i) => (
          <li key={i}>{l}</li>
        ))}
        {!open && lines.length > 3 && <li className="faint">and {lines.length - 3} more</li>}
      </ul>
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
      {technical && (
        <p className="mono small faint">
          {helper.slug} · {helper.check.runs} run{helper.check.runs === 1 ? "" : "s"} matched by that name
        </p>
      )}
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
          <Files files={helper.files} />
        </div>
      )}
    </article>
  );
}

function SuggestionCard({ s, projectId, onUse, canGrow }: { s: HelperSuggestion; projectId: string; onUse: () => void; canGrow: boolean }) {
  return (
    <article className="suggest-card" data-kind={s.kind}>
      <span className="suggest-kind">{s.starter ? "A starter" : KIND_TEXT[s.kind]}</span>
      <h3 className="suggest-name">{s.name}</h3>
      <p className="suggest-summary">{s.summary}</p>
      <Evidence e={s.evidence} projectId={projectId} />
      {s.grownAs ? (
        <a className="msg-link" href={`#helper-${s.grownAs.id}`}>
          <Check size={12} /> Grown as {s.grownAs.name}
        </a>
      ) : (
        <button className="button sm" type="button" onClick={onUse} disabled={!canGrow}>
          <Sprout size={12} /> Use this
        </button>
      )}
    </article>
  );
}

/** Which questions start open: the ones the owner has to answer before the helper makes sense. */
function openAtStart(c: Choices, forChanging: boolean): Partial<Record<SectionId, boolean>> {
  if (forChanging) return {};
  const out: Partial<Record<SectionId, boolean>> = {};
  if (c.duties.length === 0 && !c.ownWords.trim()) out.does = true;
  if (KIND_BY_ID.get(c.kind)?.wantsArea && c.mayTouch.length === 0) out.where = true;
  return out;
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
  fromTask,
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
  /** A task id from the Room: open the suggestion that task is part of. */
  fromTask?: string;
}) {
  const [view, setView] = useState<ShedView>(initial);
  const [build, setBuild] = useState<Build | null>(null);
  const [entry, setEntry] = useState<Mode>("tick");
  const [words, setWords] = useState("");
  const [busy, setBusy] = useState<"draft" | "save" | null>(null);
  const [note, setNote] = useState<{ text: string; tone?: "attention" | "critical" | "positive"; upgrade?: boolean } | null>(null);
  const [technical, setTechnical] = useState(false);
  const [justGrown, setJustGrown] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date(initial.generatedAt).getTime());
  const projectId = view.project.id;
  const areas = view.areas;
  const seen: BoxEvidence = view.boxEvidence ?? {};

  const refresh = useCallback(async () => {
    const a = await askServer<ShedView>(() => fetch(`/api/shed/${projectId}`, { cache: "no-store" }), "Could not refresh the Shed.");
    if (a.data && !a.problem) setView(a.data);
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

  const scrollTo = (id: string) => setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);

  const open = useCallback((b: Omit<Build, "open">) => {
    setBuild({ ...b, open: openAtStart(b.choices, Boolean(b.id)) });
    setNote(null);
    setJustGrown(null);
    scrollTo("builder");
  }, []);

  const startKind = useCallback((kind: KindId) => open({ name: "", choices: choicesForKind(kind, areas), grownFrom: `kind:${kind}` }), [areas, open]);

  const takeSuggestion = useCallback((s: HelperSuggestion) => open({ name: s.name, choices: choicesFromBrief(s.brief, s.id), grownFrom: s.id, evidence: s.evidence }), [open]);

  const changeHelper = useCallback((h: HelperView) => open({ id: h.id, name: h.name, choices: choicesFromBrief(h.brief, h.grownFrom), grownFrom: h.grownFrom }), [open]);

  useEffect(() => {
    const s = startWith ? initial.suggestions.find((x) => x.id === startWith) : fromTask ? initial.suggestions.find((x) => !x.grownAs && x.evidence.taskIds.includes(fromTask)) : undefined;
    if (s) takeSuggestion(s);
  }, [startWith, fromTask, initial.suggestions, takeSuggestion]);

  /** Describe it: the owner's words become the helper's own words, tidied by the AI when there is one. */
  async function draftFromWords() {
    const w = words.trim();
    if (w.length < 3 || busy) return;
    setBusy("draft");
    setNote(null);
    setJustGrown(null);
    const choices = choicesForKind("own", areas);
    const sensitive = areas.filter((a) => a.sensitive);
    let b: Omit<Build, "open"> = {
      name: nameFromWords(w, areas),
      choices: { ...choices, ownWords: w, mustNotTouch: sensitive.map((a) => a.id), stops: sensitive.map((a) => `Before changing anything in ${a.name}`) },
      grownFrom: "owner",
    };
    const a = await askServer<{ draft: { name: string; job: string; mayTouch: string[]; mustNotTouch: string[]; stopAndAsk: string[]; care: HelperCare } | null; reason?: string }>(
      () => fetch("/api/shed/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, words: w }) }),
      "Could not reach the Shed for a tidy-up.",
    );
    if (a.data?.draft) {
      const d = a.data.draft;
      b = { ...b, name: d.name, choices: { ...b.choices, ownWords: d.job, mayTouch: d.mayTouch, mustNotTouch: d.mustNotTouch.filter((id) => !d.mayTouch.includes(id)), stops: d.stopAndAsk, care: d.care }, aiNote: "Tidied into a first draft by AI from your words. Change any line, and tick anything else it should do." };
    } else b = { ...b, aiNote: a.problem ? `${a.problem} Your words are used as typed.` : (a.data?.reason ?? "Your words are used as typed.") };
    setWords("");
    setBusy(null);
    open(b);
    setBuild((cur) => (cur ? { ...cur, open: { does: true } } : cur));
  }

  const name = build ? build.name.trim() || nameFor(build.choices, areas) : "";
  const brief = useMemo(() => (build ? briefFromChoices(build.choices) : null), [build]);
  const rehearsal = useMemo(() => (build ? rehearse(build.choices, view.recent ?? [], areas) : null), [build, view.recent, areas]);
  const previewFiles = useMemo(() => (build && brief && technical ? compileHelper({ slug: slugify(name), name, brief }, areas) : []), [build, brief, technical, name, areas]);

  async function save() {
    if (!build || !brief || busy) return;
    if (brief.job.trim().length < 3) {
      setNote({ text: "Tick at least one thing it should do, or say it in your own words.", tone: "attention" });
      setBuild((b) => (b ? { ...b, open: { ...b.open, does: true } } : b));
      return;
    }
    if (brief.tools.length === 0) {
      setNote({ text: "Pick at least one tool for it to work in.", tone: "attention" });
      setBuild((b) => (b ? { ...b, open: { ...b.open, tools: true } } : b));
      return;
    }
    setBusy("save");
    setNote(null);
    const a = await askServer<{ helper?: HelperView; shed?: ShedView; upgrade?: string }>(
      () =>
        fetch(`/api/shed/${projectId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: build.id, name: name || "Helper", grownFrom: build.grownFrom, brief }),
        }),
      "Could not save the helper.",
    );
    setBusy(null);
    if (a.problem || !a.data?.shed) {
      setNote({ text: a.problem ?? "Could not save the helper.", tone: "critical", upgrade: Boolean(a.data?.upgrade) });
      return;
    }
    setView(a.data.shed);
    setJustGrown(a.data.helper?.id ?? null);
    setBuild(null);
    setEntry("tick");
    setNote(null);
    scrollTo(`helper-${a.data.helper?.id}`);
  }

  async function remove(h: HelperView) {
    const a = await askServer<{ shed?: ShedView }>(() => fetch(`/api/shed/${projectId}?id=${encodeURIComponent(h.id)}`, { method: "DELETE" }), "Could not remove the helper.");
    if (a.data?.shed && !a.problem) setView(a.data.shed);
    if (build?.id === h.id) setBuild(null);
  }

  const setChoices = (patch: Partial<Choices>) => setBuild((b) => (b ? { ...b, choices: { ...b.choices, ...patch } } : b));
  const toggleIn = <T extends string>(list: T[], item: T): T[] => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const toggleSection = (id: SectionId) => setBuild((b) => (b ? { ...b, open: { ...b.open, [id]: !b.open[id] } } : b));
  const openAll = (on: boolean) => setBuild((b) => (b ? { ...b, open: Object.fromEntries(SECTIONS.map((s) => [s, on])) } : b));

  const switchKind = (kind: KindId) =>
    setBuild((b) => {
      if (!b) return b;
      const fresh = choicesForKind(kind, areas);
      const choices = { ...fresh, knows: b.choices.knows, ownWords: b.choices.ownWords, tools: b.choices.tools };
      return { ...b, name: "", grownFrom: b.id ? b.grownFrom : `kind:${kind}`, evidence: undefined, choices, open: { ...b.open, ...openAtStart(choices, false) } };
    });

  const stopOptions = useMemo(() => {
    const opts = stopOptionsFor(areas);
    for (const s of build?.choices.stops ?? []) if (!opts.includes(s)) opts.push(s);
    return opts;
  }, [areas, build?.choices.stops]);

  const grownHere = justGrown ? view.helpers.find((h) => h.id === justGrown) : undefined;
  const placedCount = view.helpers.filter((h) => h.placedAt).length;
  const unplaced = view.helpers.length - placedCount;
  const kind = build ? KIND_BY_ID.get(build.choices.kind) : undefined;
  const byId = new Map(areas.map((a) => [a.id, a.name]));
  const areaNames = (ids: string[]) => ids.map((id) => byId.get(id)).filter((n): n is string => Boolean(n));
  const allOpen = build ? SECTIONS.every((s) => build.open[s]) : false;

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
      <a className="skip-link" href="#builder">
        Skip to the builder
      </a>
      <main className="shed-page" data-building={build ? "yes" : "no"}>
        <header className="room-head">
          <div className="room-head-left">
            <a className="back-link head-back" href="/" title={`Leave ${shedName} and go back to ${siteName}'s two products`}>
              <ArrowLeft />
              <span>Products</span>
            </a>
            <span className="crumb-sep" aria-hidden="true">
              /
            </span>
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

        <div className="shed-body">
          <div className="shed-hero">
            <div className="shed-hero-text">
              <h1 className="story-title">{view.project.name}</h1>
              <p className="story-sub">
                {view.helpers.length === 0 ? "No helpers yet. " : `${view.helpers.length} helper${view.helpers.length === 1 ? "" : "s"} grown${placedCount ? `, ${placedCount} in your project` : ""}. `}
                A helper is a set of standing instructions for Claude Code, Codex and Cursor. Pick one, read it, change any line, and it becomes a real file each tool reads.
              </p>
            </div>
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
                <span>It is not in your project yet. Open a terminal in the project folder and run this once; it writes the helper's files and nothing else. From then on Glasshouse shows it at work.</span>
                <span className="command-row">
                  <code>{helpersCommand}</code>
                  <CopyButton text={helpersCommand} className="button sm" />
                </span>
              </div>
            </div>
          )}

          <section className="builder" id="builder" aria-label="Grow a helper">
            <div className="builder-head">
              <div className="builder-head-text">
                <span className="section-label">{build?.id ? "Changing a helper" : build ? "Your helper" : view.helpers.length === 0 ? "Get started" : "Grow another helper"}</span>
                <h2 className="builder-title">{build ? (build.id ? name : `Here is your ${kind?.id === "own" ? "helper" : (kind?.name.toLowerCase() ?? "helper")}. Read it through.`) : entry === "tick" ? "What kind of helper do you need?" : "Say what you need, in a sentence"}</h2>
                <p className="builder-sub">
                  {build
                    ? "Every line is one plain sentence the helper will be told, and nothing else is added. Change any line you disagree with, then grow it."
                    : entry === "tick"
                      ? "Pick one and it is ready to read a moment later. You can change every line of it before anything is written."
                      : "For when you would rather describe it. Your words land in the same card, so you can still change anything."}
                </p>
              </div>
              {!build ? (
                <div className="segmented" role="tablist" aria-label="How to start">
                  <button type="button" role="tab" aria-selected={entry === "tick"} onClick={() => setEntry("tick")}>
                    Pick a kind
                  </button>
                  <button type="button" role="tab" aria-selected={entry === "describe"} onClick={() => setEntry("describe")}>
                    Describe it
                  </button>
                </div>
              ) : (
                <button type="button" className="button subtle sm" onClick={() => openAll(!allOpen)}>
                  {allOpen ? "Close every question" : "Open every question"}
                </button>
              )}
            </div>

            {!build && entry === "tick" && (
              <>
                <div className="kinds" role="group" aria-label="Kinds of helper">
                  {KINDS.map((k) => {
                    const Icon = KIND_ICON[k.id];
                    const e = seen[`kind:${k.id}`];
                    return (
                      <button key={k.id} type="button" className="kind" data-seen={e ? "yes" : "no"} onClick={() => startKind(k.id)} disabled={!view.canGrow}>
                        <span className="kind-icon">
                          <Icon size={18} />
                        </span>
                        <span className="kind-name">{k.name}</span>
                        <span className="kind-blurb">{k.blurb}</span>
                        {e && (
                          <span className="kind-seen">
                            <Sparkle size={11} /> {e.text}
                          </span>
                        )}
                        <span className="kind-go" aria-hidden="true">
                          <ChevronRight size={14} />
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="from-project">
                  <div className="from-head">
                    <h3 className="from-title">
                      <Sparkle size={14} /> Or take one your project suggests
                    </h3>
                    <p className="faint small">
                      {view.evidence.tasks === 0
                        ? "Nothing recorded yet. These are starters; once agents have worked here, the suggestions come from what actually happened."
                        : `Computed from ${view.evidence.tasks} task${view.evidence.tasks === 1 ? "" : "s"} since ${new Date(view.evidence.since).toLocaleDateString(undefined, { day: "numeric", month: "short" })}. Every count links to the tasks behind it.`}
                    </p>
                  </div>
                  <div className="suggest-grid">
                    {view.suggestions.map((s) => (
                      <SuggestionCard key={s.id} s={s} projectId={projectId} canGrow={view.canGrow} onUse={() => takeSuggestion(s)} />
                    ))}
                  </div>
                </div>
              </>
            )}

            {!build && entry === "describe" && (
              <form
                className="describe"
                onSubmit={(e) => {
                  e.preventDefault();
                  void draftFromWords();
                }}
              >
                <label className="visually-hidden" htmlFor="helper-words">
                  Describe your helper
                </label>
                <textarea
                  id="helper-words"
                  className="field describe-field"
                  rows={4}
                  value={words}
                  onChange={(e) => setWords(e.target.value)}
                  placeholder="e.g. Check the checkout still works before anything is called finished, and never touch payments without asking me"
                  maxLength={1200}
                  disabled={busy === "draft" || !view.canGrow}
                />
                <div className="describe-row">
                  <span className="faint small">{view.canGrow ? "With an AI key set, your words are tidied into a first draft; without one they are used exactly as typed. Either way you read and change everything before it is grown." : UPGRADE_REASONS.helpers}</span>
                  <button className="button primary" type="submit" disabled={busy === "draft" || words.trim().length < 3 || !view.canGrow}>
                    {busy === "draft" ? <span className="spinner" /> : <Sprout size={14} />}
                    Draft it
                  </button>
                </div>
              </form>
            )}

            {build && brief && rehearsal && (
              <form
                className="builder-grid"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <div className="builder-steps helper-doc">
                  {build.evidence && <Evidence e={build.evidence} projectId={projectId} />}
                  {build.aiNote && (
                    <p className="faint small">
                      <Sparkle size={12} /> {build.aiNote}
                    </p>
                  )}

                  <Section id="kind" title="What kind of helper" open={Boolean(build.open.kind)} onToggle={toggleSection} summary={<span>{kind?.name}. {kind?.blurb}</span>}>
                    {build.id && <p className="sheet-hint">Changing the kind resets the ticks to that kind's usual ones; your own words and things it knows are kept.</p>}
                    <div className="chips" role="group" aria-label="Kind of helper">
                      {KINDS.map((k) => (
                        <button key={k.id} type="button" className="chip" data-state={build.choices.kind === k.id ? "may" : "none"} aria-pressed={build.choices.kind === k.id} onClick={() => build.choices.kind !== k.id && switchKind(k.id)}>
                          {build.choices.kind === k.id && <Check size={11} />}
                          {k.name}
                        </button>
                      ))}
                    </div>
                  </Section>

                  <Section
                    id="does"
                    title="What it does"
                    open={Boolean(build.open.does)}
                    onToggle={toggleSection}
                    verb={build.choices.duties.length || build.choices.ownWords.trim() ? "Change" : "Add"}
                    summary={
                      build.choices.duties.length || build.choices.ownWords.trim() ? (
                        <ul className="hsec-lines">
                          {DUTIES.filter((d) => build.choices.duties.includes(d.id)).map((d) => (
                            <li key={d.id}>{d.label}</li>
                          ))}
                          {build.choices.ownWords.trim() && <li>In your words: “{clip(build.choices.ownWords, 140)}”</li>}
                        </ul>
                      ) : (
                        <span className="hsec-empty">Nothing yet. Tick what it should do.</span>
                      )
                    }
                  >
                    <p className="sheet-hint">Tick everything that applies. Each tick is one plain sentence the helper is told, word for word. Where your project has seen the problem, the box says so.</p>
                    <div className="ticks">
                      {DUTIES.map((d) => (
                        <Tick key={d.id} on={build.choices.duties.includes(d.id)} label={d.label} sentence={d.sentence} evidence={seen[`duty:${d.id}`]} projectId={projectId} technical={technical} onChange={() => setChoices({ duties: toggleIn(build.choices.duties, d.id) })} />
                      ))}
                    </div>
                  </Section>

                  <Section
                    id="where"
                    title="Where it may work"
                    open={Boolean(build.open.where)}
                    onToggle={toggleSection}
                    summary={
                      areas.length === 0 ? (
                        <span className="hsec-empty">No parts of your app are mapped yet, so it may work anywhere.</span>
                      ) : (
                        <span>
                          {build.choices.mayTouch.length ? `Works in ${listWords(areaNames(build.choices.mayTouch))}. ` : "May work anywhere in your app. "}
                          {build.choices.mustNotTouch.filter((id) => !build.choices.mayTouch.includes(id)).length ? `Never changes ${listWords(areaNames(build.choices.mustNotTouch.filter((id) => !build.choices.mayTouch.includes(id))))}.` : "Nothing is off limits."}
                        </span>
                      )
                    }
                  >
                    {areas.length === 0 ? (
                      <p className="faint small">Connect the project and the map of its parts arrives with it; until then the helper may work anywhere.</p>
                    ) : (
                      <div className="where">
                        <p className="sheet-hint">{kind?.wantsArea && build.choices.mayTouch.length === 0 ? "A specialist wants a part to specialise in. Tick the one it should know best." : "Tick the parts it works in, and the parts it must never change. Parts marked sensitive start out off limits. The count is how many tasks changed that part."}</p>
                        <div className="where-group">
                          <span className="where-label">
                            <Fence size={12} /> Works in
                          </span>
                          <div className="chips" role="group" aria-label="Parts it works in">
                            {areas.map((a) => {
                              const on = build.choices.mayTouch.includes(a.id);
                              const e = seen[`area:${a.id}`];
                              return (
                                <button key={a.id} type="button" className="chip" data-state={on ? "may" : "none"} aria-pressed={on} title={e ? `${a.description || a.name}. ${e.text}` : a.description || a.name} onClick={() => setChoices({ mayTouch: toggleIn(build.choices.mayTouch, a.id), mustNotTouch: build.choices.mustNotTouch.filter((id) => id !== a.id) })}>
                                  {on && <Check size={11} />}
                                  {a.name}
                                  {e && <span className="chip-count">{e.taskIds.length}</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="where-group">
                          <span className="where-label">
                            <Hand size={12} /> Never changes
                          </span>
                          <div className="chips" role="group" aria-label="Parts it must never change">
                            {areas.map((a) => {
                              const on = build.choices.mustNotTouch.includes(a.id) && !build.choices.mayTouch.includes(a.id);
                              const e = seen[`area:${a.id}`];
                              return (
                                <button key={a.id} type="button" className="chip" data-state={on ? "not" : "none"} aria-pressed={on} title={e ? `${a.description || a.name}. ${e.text}` : a.description || a.name} onClick={() => setChoices({ mustNotTouch: toggleIn(build.choices.mustNotTouch.filter((id) => !build.choices.mayTouch.includes(id)), a.id), mayTouch: build.choices.mayTouch.filter((id) => id !== a.id) })}>
                                  {on && <Hand size={11} />}
                                  {a.name}
                                  {a.sensitive && <span className="chip-note">sensitive</span>}
                                  {e && <span className="chip-count">{e.taskIds.length}</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        {technical && (
                          <p className="mono small faint">
                            {brief.mayTouch.length > 0 && `may: ${areas.filter((a) => brief.mayTouch.includes(a.id)).flatMap((a) => a.prefixes).join(", ")}`}
                            {brief.mustNotTouch.length > 0 && ` · never: ${areas.filter((a) => brief.mustNotTouch.includes(a.id)).flatMap((a) => a.prefixes).join(", ")}`}
                          </p>
                        )}
                      </div>
                    )}
                  </Section>

                  <Section
                    id="stops"
                    title="When it must stop and ask you"
                    open={Boolean(build.open.stops)}
                    onToggle={toggleSection}
                    verb={build.choices.stops.length ? "Change" : "Add"}
                    summary={
                      build.choices.stops.length ? (
                        <ul className="hsec-lines">
                          {build.choices.stops.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="hsec-empty">Never. It will get on with the job without asking.</span>
                      )
                    }
                  >
                    <div className="ticks">
                      {stopOptions.map((opt) => (
                        <Tick key={opt} on={build.choices.stops.includes(opt)} label={opt} evidence={seen[`stop:${opt}`]} projectId={projectId} onChange={() => setChoices({ stops: toggleIn(build.choices.stops, opt) })} />
                      ))}
                    </div>
                    <AddLine placeholder="Another moment, e.g. Before sending any email" onAdd={(t) => setChoices({ stops: [...build.choices.stops, t] })} />
                  </Section>

                  <Section id="care" title="How carefully" open={Boolean(build.open.care)} onToggle={toggleSection} summary={<span>{CARE_TEXT[build.choices.care].label}: {CARE_TEXT[build.choices.care].owner}</span>}>
                    <div className="segmented" role="tablist" aria-label="How carefully it works">
                      {CARE_IDS.map((c) => (
                        <button key={c} type="button" role="tab" aria-selected={build.choices.care === c} onClick={() => setChoices({ care: c })}>
                          {CARE_TEXT[c].label}
                        </button>
                      ))}
                    </div>
                    <p className="sheet-hint">{CARE_TEXT[build.choices.care].owner}</p>
                  </Section>

                  <Section
                    id="voice"
                    title="How it talks"
                    open={Boolean(build.open.voice)}
                    onToggle={toggleSection}
                    verb={build.choices.voices.length ? "Change" : "Add"}
                    summary={build.choices.voices.length ? <span>{listWords(VOICES.filter((v) => build.choices.voices.includes(v.id)).map((v, i) => (i === 0 ? v.label : v.label.charAt(0).toLowerCase() + v.label.slice(1))))}.</span> : <span className="hsec-empty">However the tool talks by default.</span>}
                  >
                    <p className="sheet-hint">How it speaks to you, whatever it is doing.</p>
                    <div className="ticks">
                      {VOICES.map((v) => (
                        <Tick key={v.id} on={build.choices.voices.includes(v.id)} label={v.label} sentence={v.sentence} projectId={projectId} technical={technical} onChange={() => setChoices({ voices: toggleIn(build.choices.voices, v.id) })} />
                      ))}
                    </div>
                  </Section>

                  <Section
                    id="knows"
                    title="Things it should already know"
                    open={Boolean(build.open.knows)}
                    onToggle={toggleSection}
                    verb={build.choices.knows.length ? "Change" : "Add"}
                    summary={
                      build.choices.knows.length ? (
                        <ul className="hsec-lines">
                          {build.choices.knows.map((r, i) => (
                            <li key={i}>{clip(r.text, 140)}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="hsec-empty">Nothing yet. Anything you have had to tell an agent more than once belongs here.</span>
                      )
                    }
                  >
                    <p className="sheet-hint">Your standing answers. Write each one once; no agent asks it again.</p>
                    {build.choices.knows.length > 0 && (
                      <ul className="rules">
                        {build.choices.knows.map((r, i) => (
                          <li key={i}>
                            <div className="rule-row">
                              <label className="visually-hidden" htmlFor={`rule-${i}`}>
                                Thing {i + 1}
                              </label>
                              <input id={`rule-${i}`} className="field" value={r.text} maxLength={400} onChange={(e) => setChoices({ knows: build.choices.knows.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                              <button type="button" className="icon-button" aria-label="Remove this" onClick={() => setChoices({ knows: build.choices.knows.filter((_, j) => j !== i) })}>
                                <Trash size={14} />
                              </button>
                            </div>
                            {r.evidence && <Evidence e={r.evidence} projectId={projectId} />}
                          </li>
                        ))}
                      </ul>
                    )}
                    <AddLine placeholder="e.g. Prices are shown in pounds, never pence" onAdd={(t) => setChoices({ knows: [...build.choices.knows, { text: t } satisfies HelperRule] })} />
                  </Section>

                  <Section id="tools" title="Which tools" open={Boolean(build.open.tools)} onToggle={toggleSection} summary={brief.tools.length ? <span>Written for {listWords(brief.tools.map((t) => TOOL_NAMES[t]))}.</span> : <span className="hsec-empty">Pick at least one tool.</span>}>
                    <p className="sheet-hint">One helper, written once, for every tool you use. In Codex it becomes a standing instruction the agent reads at the start of each session.</p>
                    <div className="chips" role="group" aria-label="Tools">
                      {HELPER_TOOL_IDS.map((t: HelperToolId) => {
                        const on = build.choices.tools.includes(t);
                        return (
                          <button key={t} type="button" className="chip tool-chip" data-state={on ? "may" : "none"} aria-pressed={on} onClick={() => setChoices({ tools: toggleIn(build.choices.tools, t) })}>
                            <ToolLogo tool={t} size={13} />
                            {TOOL_NAMES[t]}
                            {on && <Check size={11} />}
                          </button>
                        );
                      })}
                    </div>
                  </Section>

                  <Section id="own" title="Anything else, in your own words" open={Boolean(build.open.own)} onToggle={toggleSection} verb={build.choices.ownWords.trim() ? "Change" : "Add"} summary={build.choices.ownWords.trim() ? <span>“{clip(build.choices.ownWords, 200)}”</span> : <span className="hsec-empty">Nothing. Optional: whatever you write here is told to the helper exactly as typed.</span>}>
                    <label className="visually-hidden" htmlFor="own-words">
                      Anything else, in your own words
                    </label>
                    <textarea id="own-words" className="field own-field" rows={3} value={build.choices.ownWords} maxLength={1200} onChange={(e) => setChoices({ ownWords: e.target.value })} placeholder="e.g. Our customers are schools, so every message they might see must be plain and polite." />
                  </Section>

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
                </div>

                <aside className="builder-preview" aria-label="Grow it, and try it on last week">
                  <div className="preview-card">
                    <label className="section-label" htmlFor="helper-name">
                      Its name
                    </label>
                    <input id="helper-name" className="preview-name" value={build.name} onChange={(e) => setBuild((b) => (b ? { ...b, name: e.target.value } : b))} maxLength={80} placeholder={nameFor(build.choices, areas)} />
                    <div className="preview-actions">
                      <button className="button primary block" type="submit" disabled={busy === "save" || brief.job.trim().length < 3}>
                        {busy === "save" ? <span className="spinner" /> : <Sprout size={14} />}
                        {build.id ? "Save the changes" : "Grow it"}
                      </button>
                      <button className="button quiet block" type="button" onClick={() => setBuild(null)}>
                        {build.id ? "Leave it as it was" : "Start again"}
                      </button>
                    </div>
                    <p className="faint small">Only the lines on the left are stored. Nothing reaches an agent until you run one command in your project folder.</p>
                  </div>

                  <div className="preview-card rehearsal" aria-live="polite">
                    <span className="section-label">
                      <Sparkle size={12} /> Tried on your recent tasks
                    </span>
                    {rehearsal.total === 0 ? (
                      <p className="faint small">Nothing has been recorded in this project yet, so there is nothing to try it on. Once agents have worked here, this shows what the helper would have done on each task.</p>
                    ) : rehearsal.lines.length === 0 ? (
                      <p className="faint small">
                        On {rehearsal.total === 1 ? "the last task" : `the last ${rehearsal.total} tasks`}, none of these lines would have changed anything. That may be fine, or a sign it needs a stop-and-ask moment or a part it must never change.
                      </p>
                    ) : (
                      <>
                        <ul className="rehearsal-list">
                          {rehearsal.lines.slice(0, 4).map((l) => (
                            <li key={l.taskId}>
                              <a className="rehearsal-task link-underline" href={`/room/${projectId}#task-${l.taskId}`} title="Open this task in Glasshouse">
                                {clip(l.headline, 70)}
                              </a>
                              <span className="rehearsal-when">{dayLabel(l.at, now)}</span>
                              <ul className="rehearsal-would">
                                {l.would.map((w, i) => (
                                  <li key={i}>{w}</li>
                                ))}
                              </ul>
                            </li>
                          ))}
                        </ul>
                        <p className="faint small">
                          {rehearsal.lines.length > 4 ? `${rehearsal.lines.length - 4} more task${rehearsal.lines.length - 4 === 1 ? "" : "s"} where it would have stepped in. ` : ""}
                          {rehearsal.quiet > 0 ? `On ${rehearsal.quiet === 1 ? "1 other task" : `${rehearsal.quiet} other tasks`} nothing would have changed.` : ""}
                          {" Every line is a rule of this helper held against what that task actually did."}
                        </p>
                      </>
                    )}
                  </div>

                  <ol className="preview-next">
                    <li>
                      <strong>Grow it.</strong> Only these words are stored.
                    </li>
                    <li>
                      <strong>Run one command</strong> in your project folder. The helper appears for every tool you ticked.
                    </li>
                    <li>
                      <strong>Watch it in Glasshouse.</strong> The story says when it starts, and whether it kept to its patch, from the files it changed.
                    </li>
                  </ol>
                  {technical && previewFiles.length > 0 && (
                    <details className="preview-files">
                      <summary>The files it becomes</summary>
                      <Files files={previewFiles} />
                    </details>
                  )}
                </aside>

                {/* Phones: the helper's name and the one button stay within a thumb's reach while the lines scroll by. */}
                <div className="build-bar">
                  <span className="build-bar-text">
                    <strong>{name}</strong>
                    <span>
                      {rehearsal.lines.length > 0 ? `Would have stepped in on ${rehearsal.lines.length} recent task${rehearsal.lines.length === 1 ? "" : "s"}` : `${describeChoices(build.choices, areas).length} lines`} ·{" "}
                      <a className="link-underline" href="#helper-name">
                        see
                      </a>
                    </span>
                  </span>
                  <button className="button primary" type="submit" disabled={busy === "save" || brief.job.trim().length < 3}>
                    {busy === "save" ? <span className="spinner" /> : <Sprout size={14} />}
                    {build.id ? "Save" : "Grow it"}
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="shed-section" id="helpers" aria-label="Your helpers">
            <div className="section-head">
              <h2 className="section-title">
                Your helpers
                {view.helpers.length > 0 && <span className="count">{view.helpers.length}</span>}
              </h2>
              {view.helpers.length > 0 && <span className="faint small">{placedCount === view.helpers.length ? "All in your project" : `${unplaced} not placed yet`}</span>}
            </div>

            {unplaced > 0 && !grownHere && (
              <div className="notice dashed">
                <Info />
                <div className="notice-body">
                  <span>
                    {unplaced === 1 ? "One helper is" : `${unplaced} helpers are`} not in your project yet. Open a terminal in the project folder and run this once; it writes their files and nothing else.
                  </span>
                  <span className="command-row">
                    <code>{helpersCommand}</code>
                    <CopyButton text={helpersCommand} className="button sm" />
                  </span>
                </div>
              </div>
            )}

            {view.helpers.length === 0 ? (
              <div className="empty">
                <Sprout size={22} className="empty-icon" />
                <h2>No helpers yet.</h2>
                <p>Pick a kind above, or take one your project suggests. Each helper becomes a real file that Claude Code, Codex or Cursor reads, and Glasshouse shows it at work and checks that it kept to its patch.</p>
              </div>
            ) : (
              <div className="helpers-grid">
                {view.helpers.map((h) => (
                  <HelperCard key={h.id} helper={h} areas={areas} technical={technical} onChange={() => changeHelper(h)} onRemove={() => void remove(h)} projectId={projectId} helpersCommand={helpersCommand} />
                ))}
              </div>
            )}

            <div className="shed-foot">
              <span>Checked {ago(view.generatedAt, now)}</span>
              <span>{view.areaMapSource ? `Parts of your app named ${view.areaMapSource === "ai" ? "by AI" : "from folder names"}.` : "No map of your app yet."}</span>
              <a className="link-underline" href={`/room/${projectId}/areas`}>
                Rename the parts
              </a>
              {build && (
                <button type="button" className="link-button" onClick={() => setBuild(null)}>
                  See what your project suggests
                </button>
              )}
            </div>
          </section>
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
