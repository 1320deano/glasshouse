"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { AgentTool } from "@glasshouse/schema";
import { askServer } from "@/lib/answer";
import { CARE_WORDS, careHint, filterOptions, mentionAt, mentionOptions, placeholderFor, targetLabel, withoutMention, type MentionOption, type Target } from "@/lib/requests/compose";
import { REQUEST_TOOL_NAMES, addressLine, isListening, openQuestions, requestLine } from "@/lib/requests/story";
import { GLASSHOUSE_QUESTIONS, suggestRequests, type RequestSuggestion } from "@/lib/requests/suggest";
import type { RequestCare, RequestOrigin, RequestQuestion, RequestRecord, RequestView, RoomState, StoryMessage } from "@/lib/store/types";
import { ArrowUp, Check, ChevronDown, ChevronRight, Copy, Mark, Sprout } from "./icons";
import { NEEDS_YOU_TEXT, RISK_TEXT, TOOL_NAMES, clock, dayLabel } from "./labels";
import { ToolLogo } from "./ToolLogo";

/**
 * The middle column (Phase 5, rebuilt in Phase 8 as the project's group chat).
 *
 * Every Glasshouse line is a template over the record (lib/story.ts): a task started, is waiting,
 * looks stuck, or finished, with the verified facts underneath. The box at the foot is for the
 * owner: with no one named, the words are a question to Glasshouse, answered from the record.
 * With an agent named ("@" opens the list), the words are an instruction, stored as a request
 * and started on the owner's own computer by their connector (packages/connector/src/requests.ts);
 * nothing here runs anything. Under the box sit ready-made lines computed from the record
 * (lib/requests/suggest.ts), each carrying the fact it rests on.
 *
 * A run started from here shows its questions here too (may it run this command, which way should
 * it go), answered with a tap; and its closing words, as its own message. Every line links to the
 * card and, behind the technical toggle, to the real command underneath (rule 3).
 */

type QuestionView = RequestQuestion & { plain: string };

type Line =
  | { kind: "story"; at: string; id: string; m: StoryMessage }
  | { kind: "request"; at: string; id: string; r: RequestView }
  | { kind: "question"; at: string; id: string; r: RequestView; q: QuestionView }
  | { kind: "closing"; at: string; id: string; r: RequestView };

const BADGE: Partial<Record<StoryMessage["kind"], { text: string; tone: string }>> = {
  waiting: { text: "Waiting for you", tone: "attention" },
  stuck: { text: "Looks stuck", tone: "critical" },
  limit: { text: "Stopped", tone: "critical" },
};

const CARE_KEY = "glasshouse.room.care";

function badgeFor(m: StoryMessage): { text: string; tone: string } | null {
  if (BADGE[m.kind]) return BADGE[m.kind]!;
  if (m.kind === "helper-finished" && m.helper?.verdict) return m.helper.verdict === "kept" ? { text: "Kept to its patch", tone: "positive" } : m.helper.verdict === "strayed" ? { text: "Outside its patch", tone: "critical" } : { text: "Unclear", tone: "attention" };
  if (m.kind === "helper-started") return { text: "Helper", tone: "info" };
  if (m.kind === "finished" && m.needsYou && m.needsYou !== "nothing") return { text: NEEDS_YOU_TEXT[m.needsYou], tone: m.needsYou === "review" ? "info" : "attention" };
  return null;
}

function CopyWords({ text, label = "Copy a message for the agent", title }: { text: string; label?: string; title?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="msg-link"
      title={title ?? "Copies these words so you can paste them into the agent's own window. Nothing is sent from here."}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          /* clipboard blocked: the text is visible anyway */
        }
      }}
    >
      {done ? <Check /> : <Copy />}
      {done ? "Copied" : label}
    </button>
  );
}

type Who = "glasshouse" | "you" | AgentTool;

function Bubble({ who, at, badge, children }: { who: Who; at: string; badge?: { text: string; tone: string } | null; children: ReactNode }) {
  const isYou = who === "you";
  const name = who === "glasshouse" ? "Glasshouse" : isYou ? "You" : TOOL_NAMES[who];
  return (
    <div className={`msg ${isYou ? "you" : who === "glasshouse" ? "glasshouse" : "from-agent"}`} data-tool={!isYou && who !== "glasshouse" ? who : undefined}>
      {!isYou && (
        <span className="msg-avatar" aria-hidden="true">
          {who === "glasshouse" ? <Mark size={16} /> : <ToolLogo tool={who} size={15} />}
        </span>
      )}
      <div className="msg-body">
        <div className="msg-head">
          <span className="msg-who">{name}</span>
          <time className="msg-time" dateTime={at}>
            {clock(at)}
          </time>
          {badge && (
            <span className="pill sm" data-tone={badge.tone}>
              {badge.text}
            </span>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

/** A moment the Potting Shed can grow a helper from: stuck, out of usage, a decision asked for, checks failing. */
function growable(m: StoryMessage): boolean {
  if (m.kind === "stuck" || m.kind === "limit") return true;
  if (m.kind === "finished") return (m.needsYou !== undefined && m.needsYou !== "nothing" && m.needsYou !== "review") || /failed/.test(m.checks ?? "");
  return false;
}

function StoryLine({ m, onOpenTask, projectId, fromRoom }: { m: StoryMessage; onOpenTask: (taskId: string) => void; projectId: string; fromRoom: boolean }) {
  const facts = (m.kind === "finished" || m.kind === "limit") && (m.touched?.length || m.notTouched?.length || m.checks || m.risk);
  const text = fromRoom && m.kind === "started" ? `${TOOL_NAMES[m.tool]} picked it up and started.` : m.text;
  return (
    <Bubble who="glasshouse" at={m.at} badge={badgeFor(m)}>
      <p className="msg-text">{text}</p>
      {m.needsYouDetail && <p className="msg-question">{m.needsYouDetail}</p>}
      {facts ? (
        <dl className="msg-facts">
          {m.touched && m.touched.length > 0 && (
            <div>
              <dt>Touched</dt>
              <dd>{m.touched.join(" · ")}</dd>
            </div>
          )}
          {m.touched && m.touched.length === 0 && (
            <div>
              <dt>Touched</dt>
              <dd>No part of the app was changed.</dd>
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
              <dd className={/failed/.test(m.checks) ? "error-text" : ""}>{m.checks}</dd>
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
      <div className="msg-actions">
        <button type="button" className="msg-link" data-task={m.taskId} onClick={() => onOpenTask(m.taskId)}>
          {m.kind === "finished" || m.kind === "limit" ? "Open the report" : "Show the card"}
          <ChevronRight size={12} />
        </button>
        {m.suggestedReply && <CopyWords text={m.suggestedReply} />}
        {growable(m) && (
          <a className="msg-link" href={`/shed/${projectId}?task=${encodeURIComponent(m.taskId)}`} title="Open the Potting Shed with a helper drawn from this moment">
            <Sprout size={12} /> Grow a helper from this
          </a>
        )}
        {m.kind === "helper-finished" && m.helper && (
          <a className="msg-link" href={`/shed/${projectId}#helper-${m.helper.id}`} title="See this helper in the Potting Shed">
            See the helper
          </a>
        )}
      </div>
      {m.suggestedReply && <p className="msg-suggest">“{m.suggestedReply}”</p>}
    </Bubble>
  );
}

/** The owner's own message and, straight under it, what became of it. */
function RequestLine({ r, listening, technical, onOpenTask, onWithdraw }: { r: RequestView; listening: boolean; technical: boolean; onOpenTask: (taskId: string) => void; onWithdraw: (id: string) => void }) {
  const line = requestLine(r, { listening });
  const glasshouse = r.tool === "glasshouse";
  const tone = line.tone === "neutral" ? "" : line.tone;
  return (
    <>
      <Bubble who="you" at={r.createdAt} badge={glasshouse ? null : { text: line.badge, tone }}>
        <p className="msg-text">{r.text}</p>
        <p className="msg-about">
          {addressLine(r)}
          {r.origin.kind === "suggested" ? " · from a ready-made line" : ""}
          {!glasshouse && line.text && line.tone !== "critical" ? ` · ${line.text}` : ""}
        </p>
        {(r.taskId || r.status === "queued" || (technical && r.result?.command)) && (
          <div className="msg-actions">
            {r.taskId && (
              <button type="button" className="msg-link" onClick={() => onOpenTask(r.taskId!)}>
                Show the card
                <ChevronRight size={12} />
              </button>
            )}
            {r.status === "queued" && (
              <button type="button" className="msg-link" onClick={() => onWithdraw(r.id)} title="Takes it back before your computer picks it up">
                Take it back
              </button>
            )}
          </div>
        )}
        {technical && r.result?.command && <span className="mono block msg-command">{r.result.command}</span>}
      </Bubble>
      {glasshouse && r.answer && (
        <Bubble who="glasshouse" at={r.createdAt} badge={r.answer.unsure ? { text: "Not sure", tone: "attention" } : null}>
          <p className="msg-text">{r.answer.text}</p>
          {r.answer.basedOn.length > 0 && (
            <p className="msg-based">
              Based on: {r.answer.basedOn.map((e) => e.plain).join(" · ")}
              {technical && <span className="mono block">{r.answer.basedOn.map((e) => `${e.summary}${e.paths.length ? ` (${e.paths.join(", ")})` : ""}`).join(" · ")}</span>}
            </p>
          )}
        </Bubble>
      )}
      {glasshouse && !r.answer && (
        <Bubble who="glasshouse" at={r.createdAt}>
          <p className="msg-text loading-row">
            <span className="spinner" /> Reading the record
          </p>
        </Bubble>
      )}
      {line.tone === "critical" && line.text && (
        <Bubble who="glasshouse" at={r.statusAt}>
          <p className="msg-text">{line.text}</p>
          {line.command && (
            <p className="msg-actions">
              <span className="mono msg-command">{line.command}</span>
              <CopyWords text={line.command} label="Copy the command" title="Copies the command to run in the project folder" />
            </p>
          )}
          {technical && r.result?.stderr && <span className="mono block msg-command">{r.result.stderr}</span>}
        </Bubble>
      )}
      {r.status === "queued" && !listening && line.command && (
        <Bubble who="glasshouse" at={r.createdAt}>
          <p className="msg-text">{line.text}</p>
          <p className="msg-actions">
            <span className="mono msg-command">{line.command}</span>
            <CopyWords text={line.command} label="Copy the command" title="Copies the command to run in the project folder" />
          </p>
        </Bubble>
      )}
    </>
  );
}

/** A question the run put to the owner: may it, or which way. Answered with a tap; the first answer stands. */
function QuestionLine({ r, q, technical, onAnswer }: { r: RequestView; q: QuestionView; technical: boolean; onAnswer: (requestId: string, questionId: string, allow: boolean, answers?: Record<string, string>) => Promise<void> }) {
  const tool: AgentTool = r.tool === "glasshouse" ? "claude-code" : r.tool;
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const open = !q.answer && (r.status === "running" || r.status === "taken");
  const answer = async (allow: boolean, answers?: Record<string, string>) => {
    setBusy(true);
    try {
      await onAnswer(r.id, q.id, allow, answers);
    } finally {
      setBusy(false);
    }
  };
  const choices = q.kind === "choice" ? (q.choices ?? []) : [];
  const allPicked = choices.length > 0 && choices.every((c) => picked[c.question]);
  const badge = q.answer ? { text: q.answer.allow ? (q.kind === "choice" ? "Answered" : "Allowed") : "Not allowed", tone: q.answer.allow ? "positive" : "" } : open ? { text: "Waiting for you", tone: "attention" } : { text: "No longer needed", tone: "" };
  return (
    <Bubble who={tool} at={q.askedAt} badge={badge}>
      <p className="msg-text">{q.plain}</p>
      {q.kind === "choice" &&
        choices.map((c) => (
          <div className="msg-choice" key={c.question}>
            {choices.length > 1 && <p className="msg-about">{c.question}</p>}
            <div className="msg-answer">
              {c.options.map((o) => {
                const chosen = q.answer ? q.answer.answers?.[c.question] === o.label : picked[c.question] === o.label;
                return (
                  <button
                    key={o.label}
                    type="button"
                    className={`button sm${chosen ? " selected" : " subtle"}`}
                    title={o.description}
                    disabled={!open || busy}
                    onClick={() => {
                      if (choices.length === 1) void answer(true, { [c.question]: o.label });
                      else setPicked((p) => ({ ...p, [c.question]: o.label }));
                    }}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      {open && q.kind === "choice" && choices.length > 1 && (
        <div className="msg-answer">
          <button type="button" className="button sm primary" disabled={!allPicked || busy} onClick={() => void answer(true, picked)}>
            Send the answers
          </button>
        </div>
      )}
      {open && q.kind === "permission" && (
        <div className="msg-answer">
          <button type="button" className="button sm primary" disabled={busy} onClick={() => void answer(true)}>
            Allow
          </button>
          <button type="button" className="button sm subtle" disabled={busy} onClick={() => void answer(false)}>
            Don’t allow
          </button>
        </div>
      )}
      {q.answer && q.kind === "choice" && q.answer.answers && choices.length > 1 && <p className="msg-about">You answered: {Object.values(q.answer.answers).join(", ")}</p>}
      {technical && (
        <span className="mono block msg-command">
          {q.toolName}: {q.summary}
          {q.command ? ` · ${q.command}` : ""}
          {q.paths.length ? ` · ${q.paths.join(", ")}` : ""}
        </span>
      )}
    </Bubble>
  );
}

/** The ready-made lines under the box: what the record suggests, each with the fact it rests on. */
function SuggestRow({ lines, onPick }: { lines: RequestSuggestion[]; onPick: (s: RequestSuggestion) => void }) {
  if (lines.length === 0) return null;
  return (
    <div className="suggest-row" aria-label="Ready-made lines from the record">
      <span className="suggest-label">From the record:</span>
      {lines.map((s) => (
        <button key={s.id} type="button" className="suggest-chip" data-kind={s.kind} title={`${s.because}\n\n“${s.text}”`} onClick={() => onPick(s)}>
          {s.kind === "stuck" || s.kind === "checks" || s.kind === "decision" || s.kind === "limit" ? <span className="dot" data-kind={s.kind} aria-hidden="true" /> : null}
          {s.label}
        </button>
      ))}
    </div>
  );
}

function asView(r: RequestRecord): RequestView {
  const { questions: _q, answer, ...rest } = r;
  return { ...rest, questions: [], answer: answer ? { ...answer, basedOn: [] } : undefined };
}

export function Conversation({
  state,
  now,
  onOpenTask,
  head,
  intro,
  status,
  active = true,
  target,
  onTarget,
  onRefresh,
  onAnswer,
}: {
  state: RoomState;
  now: number;
  onOpenTask: (taskId: string) => void;
  head?: ReactNode;
  intro?: ReactNode;
  /** What the agents are doing right now, shown on a card that rises out of the reply box. */
  status?: ReactNode;
  active?: boolean;
  /** Who the box is for. Lifted to the Room so a card's "Talk to it" can set it. */
  target: Target | null;
  onTarget: (t: Target | null) => void;
  /** Ask the Room to fetch itself again. */
  onRefresh: () => void;
  /** Answer a question a run asked. Resolves to a problem line, or null. */
  onAnswer: (requestId: string, questionId: string, allow: boolean, answers?: Record<string, string>) => Promise<string | null>;
}) {
  const [text, setText] = useState("");
  const [origin, setOrigin] = useState<RequestOrigin | undefined>(undefined);
  const [care, setCareState] = useState<RequestCare>("ask");
  const [busy, setBusy] = useState(false);
  const [technical, setTechnical] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState<RequestView[]>([]);
  const [menu, setMenu] = useState<{ query: string; mention: { start: number; query: string } | null; index: number } | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const field = useRef<HTMLTextAreaElement | null>(null);
  const projectId = state.project.id;
  const requests = useMemo(() => state.requests ?? [], [state.requests]);
  const listening = isListening(state.listeningAt, now);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CARE_KEY);
      if (saved === "ask" || saved === "free") setCareState(saved);
    } catch {
      /* no storage */
    }
  }, []);
  const setCare = (c: RequestCare) => {
    setCareState(c);
    try {
      localStorage.setItem(CARE_KEY, c);
    } catch {
      /* no storage */
    }
  };

  // The server's copy of a request replaces the one shown the moment it was sent.
  const shown = useMemo(() => {
    const ids = new Set(requests.map((r) => r.id));
    return [...requests, ...pending.filter((p) => !ids.has(p.id))];
  }, [requests, pending]);
  useEffect(() => {
    const ids = new Set(requests.map((r) => r.id));
    setPending((p) => (p.some((x) => ids.has(x.id)) ? p.filter((x) => !ids.has(x.id)) : p));
  }, [requests]);

  const requestByTask = useMemo(() => new Map(shown.filter((r) => r.taskId).map((r) => [r.taskId!, r])), [shown]);

  const lines = useMemo<Line[]>(() => {
    const all: Line[] = [];
    for (const m of state.story) {
      const r = requestByTask.get(m.taskId);
      // A run started from here asks its questions here: the question line is the waiting line.
      if (m.kind === "waiting" && r && openQuestions(r).length > 0) continue;
      all.push({ kind: "story", at: m.at, id: m.id, m });
    }
    for (const r of shown) {
      all.push({ kind: "request", at: r.createdAt, id: r.id, r });
      for (const q of r.questions) all.push({ kind: "question", at: q.askedAt, id: `${r.id}:${q.id}`, r, q });
      if (r.status === "finished" && r.result?.closing) all.push({ kind: "closing", at: r.statusAt, id: `${r.id}:closing`, r });
    }
    return all.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  }, [state.story, shown, requestByTask]);

  // Newest at the bottom: scroll there when a line arrives, and again when the column becomes visible (phone tabs).
  const count = lines.length;
  useEffect(() => {
    if (!active) return;
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count, busy, active]);

  // A card's "Talk to it" lands the owner in the box.
  useEffect(() => {
    if (target && target.kind !== "glasshouse") field.current?.focus();
  }, [target]);

  const options = useMemo(() => mentionOptions(state, now), [state, now]);
  const menuOptions = menu ? filterOptions(options, menu.query) : [];

  const focus = target?.kind === "session" ? { sessionId: target.sessionId, taskId: target.taskId } : target?.kind === "glasshouse" && target.taskId ? { taskId: target.taskId } : undefined;
  const suggestions = useMemo(() => {
    if (!target || target.kind === "glasshouse") return [...GLASSHOUSE_QUESTIONS, ...suggestRequests(state, now, focus, 3)];
    if (target.kind === "new") return suggestRequests(state, now, undefined, 4).filter((s) => s.tool === target.tool || !s.session);
    return suggestRequests(state, now, focus, 4);
  }, [state, now, target, focus]);

  const hasAgents = state.sessions.some((s) => s.tool !== "watcher" && s.task);

  const pick = (s: RequestSuggestion) => {
    setText(s.text);
    setOrigin({ kind: "suggested", suggestionId: s.id, taskId: s.taskId });
    if (s.tool === "glasshouse") onTarget({ kind: "glasshouse" });
    else if (s.session) {
      const session = state.sessions.find((x) => x.id === s.session!.id);
      const opt = options.find((o) => o.id === `session:${s.session!.id}`);
      if (session && opt) onTarget(opt.target);
      else onTarget({ kind: "new", tool: s.tool });
    } else onTarget({ kind: "new", tool: s.tool });
    setNote(null);
    setTimeout(() => field.current?.focus(), 0);
  };

  const choose = (o: MentionOption) => {
    if (menu?.mention) setText((t) => withoutMention(t, menu.mention!));
    onTarget(o.target);
    setMenu(null);
    setTimeout(() => field.current?.focus(), 0);
  };

  const onChange = (value: string, caret: number) => {
    setText(value);
    if (note) setNote(null);
    if (!value.trim()) setOrigin(undefined);
    const mention = mentionAt(value, caret);
    setMenu(mention ? { query: mention.query, mention, index: 0 } : null);
  };

  const grow = useCallback(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);
  useEffect(grow, [text, grow]);

  async function send() {
    const words = text.trim();
    if (!words || busy) return;
    const t: Target = target ?? { kind: "glasshouse" };
    if (t.kind === "session" && !t.reachable) {
      try {
        await navigator.clipboard.writeText(words);
        setNote(`Copied. Paste it into ${REQUEST_TOOL_NAMES[t.tool]}'s own window: ${t.reason ?? "words from here cannot reach it."}`);
      } catch {
        setNote(t.reason ?? "Words from here cannot reach this agent.");
      }
      return;
    }
    const body =
      t.kind === "glasshouse"
        ? { projectId, tool: "glasshouse", text: words, focusTaskId: t.taskId, origin }
        : t.kind === "new"
          ? { projectId, tool: t.tool, text: words, origin, care }
          : { projectId, tool: t.tool, text: words, continues: { sessionId: t.sessionId }, origin, care };
    setBusy(true);
    setMenu(null);
    const { data, problem } = await askServer<{ request?: RequestRecord; error?: string }>(
      () => fetch("/api/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      "That could not be sent.",
    );
    setBusy(false);
    if (problem || !data?.request) {
      setNote(problem ?? "That could not be sent.");
      return;
    }
    setPending((p) => [...p, asView(data.request!)]);
    setText("");
    setOrigin(undefined);
    // An agent is named per message: after words go to one, the box is Glasshouse's again, so the
    // next thing typed ("where are we?") is a question, not an instruction that starts another run.
    if (t.kind !== "glasshouse") onTarget(null);
    onRefresh();
  }

  const onKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (menu && menuOptions.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setMenu({ ...menu, index: (menu.index + step + menuOptions.length) % menuOptions.length });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        choose(menuOptions[menu.index] ?? menuOptions[0]!);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMenu(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const withdraw = async (id: string) => {
    const { problem } = await askServer<{ request?: RequestRecord; error?: string }>(() => fetch(`/api/requests/${id}/answer`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ withdraw: true }) }), "That could not be taken back.");
    if (problem) setNote(problem);
    onRefresh();
  };

  const answerQuestion = async (requestId: string, questionId: string, allow: boolean, answers?: Record<string, string>) => {
    const problem = await onAnswer(requestId, questionId, allow, answers);
    if (problem) setNote(problem);
  };

  let lastDay = "";
  const t = target ?? { kind: "glasshouse" as const };
  const startable = t.kind !== "glasshouse";

  return (
    <section className="chat" aria-label="The story of this project">
      <div className="chat-scroll" ref={scroller}>
        <div className="chat-inner">
          {head}
          {intro}
          {lines.length === 0 && !intro && (
            <div className="chat-empty">
              <p className="muted">Nothing has happened yet. When an agent starts, finishes, gets stuck or needs you, it is written here in plain English. Type @ below to start one from here, or ask Glasshouse anything about the project.</p>
            </div>
          )}
          {lines.map((l) => {
            const day = dayLabel(l.at, now);
            const divider =
              day !== lastDay ? (
                <div className="chat-day" key={`day-${day}`}>
                  <span>{day}</span>
                </div>
              ) : null;
            lastDay = day;
            return (
              <div key={l.id}>
                {divider}
                {l.kind === "story" && <StoryLine m={l.m} onOpenTask={onOpenTask} projectId={projectId} fromRoom={requestByTask.has(l.m.taskId)} />}
                {l.kind === "request" && <RequestLine r={l.r} listening={listening} technical={technical} onOpenTask={onOpenTask} onWithdraw={(id) => void withdraw(id)} />}
                {l.kind === "question" && <QuestionLine r={l.r} q={l.q} technical={technical} onAnswer={answerQuestion} />}
                {l.kind === "closing" && (
                  <Bubble who={l.r.tool === "glasshouse" ? "claude-code" : l.r.tool} at={l.at} badge={{ text: "Finished", tone: "positive" }}>
                    <p className="msg-text msg-closing">{l.r.result!.closing}</p>
                    {l.r.taskId && (
                      <div className="msg-actions">
                        <button type="button" className="msg-link" onClick={() => onOpenTask(l.r.taskId!)}>
                          Open the report
                          <ChevronRight size={12} />
                        </button>
                      </div>
                    )}
                  </Bubble>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="composer-wrap">
        {status && (
          <div className="composer-status" aria-live="polite">
            {status}
            <span className="pill sm listening" data-tone={listening ? "positive" : ""} title={listening ? "Your connector is asking the Room for requests: what you send here starts on your computer." : "Run `glasshouse watch` in the project folder and what you send here will start on your computer."}>
              <span className="dot" data-on={listening ? "yes" : "no"} aria-hidden="true" />
              {listening ? "Your computer is listening" : "Your computer is not listening"}
            </span>
          </div>
        )}
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="composer-top">
            <button type="button" className="composer-to" aria-haspopup="listbox" aria-expanded={Boolean(menu)} title="Who this message is for. Type @ in the box to change it." onClick={() => setMenu(menu ? null : { query: "", mention: null, index: 0 })}>
              To <strong>{targetLabel(target)}</strong>
              <ChevronDown size={12} />
            </button>
            {t.kind === "session" && !t.reachable && <span className="composer-note">{t.reason}</span>}
            {t.kind === "glasshouse" && t.taskId && (
              <button type="button" className="msg-link" onClick={() => onTarget({ kind: "glasshouse" })} title="Ask about the whole project instead">
                About the whole project
              </button>
            )}
          </div>
          <div className="mention-wrap">
            {menu && menuOptions.length > 0 && (
              <ul className="mention-menu" role="listbox" aria-label="Who this message is for">
                {menuOptions.map((o, i) => (
                  <li key={o.id} role="option" aria-selected={i === menu.index} data-active={i === menu.index}>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)}>
                      <span className="mention-name">
                        {o.target.kind === "glasshouse" ? <Mark size={14} /> : o.tool ? <ToolLogo tool={o.tool} size={14} /> : null}
                        {o.label}
                      </span>
                      <span className="mention-hint">{o.hint}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label className="visually-hidden" htmlFor="ask-question">
              Your message
            </label>
            <textarea
              id="ask-question"
              ref={field}
              className="composer-field"
              rows={1}
              value={text}
              onChange={(e) => onChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
              onKeyDown={onKey}
              onBlur={() => setTimeout(() => setMenu((m) => (m?.mention ? m : null)), 120)}
              placeholder={placeholderFor(target, hasAgents)}
              maxLength={4000}
              disabled={busy}
              autoComplete="off"
            />
          </div>
          <div className="composer-row">
            {startable && (
              <>
                <label className="visually-hidden" htmlFor="ask-care">
                  How freely the agent may act
                </label>
                <select id="ask-care" className="composer-about" value={care} onChange={(e) => setCare(e.target.value as RequestCare)} title={careHint(t.tool, care)}>
                  <option value="ask">{CARE_WORDS.ask}</option>
                  <option value="free">{CARE_WORDS.free}</option>
                </select>
              </>
            )}
            <label className="switch tiny composer-switch">
              <input type="checkbox" checked={technical} onChange={(e) => setTechnical(e.target.checked)} />
              Technical detail
            </label>
            {note && (
              <span className="composer-note" role="status">
                {note}
              </span>
            )}
            <button className="composer-send" type="submit" aria-label={startable ? "Send" : "Ask"} title={startable ? (t.kind === "session" && !t.reachable ? "Copy for the agent's window" : "Send to your computer") : "Ask Glasshouse"} disabled={busy || text.trim().length === 0}>
              {busy ? <span className="spinner" /> : <ArrowUp size={16} />}
            </button>
          </div>
        </form>
        <SuggestRow lines={suggestions} onPick={pick} />
      </div>
    </section>
  );
}
