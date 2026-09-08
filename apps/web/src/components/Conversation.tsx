"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AskAnswer } from "@/lib/ai/ask";
import type { RoomState, StoryMessage } from "@/lib/store/types";
import { ArrowUp, Check, ChevronRight, Copy, Mark } from "./icons";
import { NEEDS_YOU_TEXT, RISK_TEXT, TOOL_NAMES, clip, clock, dayLabel } from "./labels";

/**
 * The middle column (Phase 5): the Room's running story, and a place to ask it questions.
 *
 * Every Glasshouse message is a template over the record (lib/story.ts): a task started, is
 * waiting, looks stuck, or finished, with the verified facts underneath. The reply box asks
 * about one task through the existing Ask, which answers only from that task's record and names
 * the actions it rests on. Nothing typed here reaches an agent (rule 4): the one "for the agent"
 * action copies words to the clipboard for the owner to paste themselves.
 *
 * Laid out like a Claude transcript: the Room's own lines sit flush on the page under a small
 * mark, your questions sit in a quiet capsule on the right, and the reply box is the one white
 * thing that floats.
 */

interface ChatLine {
  id: string;
  at: string;
  question: string;
  taskLabel: string;
  answer?: AskAnswer;
  /** Set when the Ask itself could not be made (plan, network). */
  note?: string;
  upgrade?: boolean;
}

type Line = { kind: "story"; at: string; m: StoryMessage } | { kind: "chat"; at: string; c: ChatLine };

const BADGE: Partial<Record<StoryMessage["kind"], { text: string; tone: string }>> = {
  waiting: { text: "Waiting for you", tone: "attention" },
  stuck: { text: "Looks stuck", tone: "critical" },
  limit: { text: "Stopped", tone: "critical" },
};

function badgeFor(m: StoryMessage): { text: string; tone: string } | null {
  if (BADGE[m.kind]) return BADGE[m.kind]!;
  if (m.kind === "finished" && m.needsYou && m.needsYou !== "nothing") return { text: NEEDS_YOU_TEXT[m.needsYou], tone: m.needsYou === "review" ? "info" : "attention" };
  return null;
}

function CopyForAgent({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="msg-link"
      title="Copies these words so you can paste them into the agent's own window. Nothing is sent from here."
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          /* clipboard blocked: the text is visible below anyway */
        }
      }}
    >
      {done ? <Check /> : <Copy />}
      {done ? "Copied" : "Copy a message for the agent"}
    </button>
  );
}

function Bubble({ who, at, badge, children }: { who: "glasshouse" | "you"; at: string; badge?: { text: string; tone: string } | null; children: ReactNode }) {
  return (
    <div className={`msg ${who}`}>
      {who === "glasshouse" && (
        <span className="msg-avatar" aria-hidden="true">
          <Mark size={16} />
        </span>
      )}
      <div className="msg-body">
        <div className="msg-head">
          <span className="msg-who">{who === "glasshouse" ? "Glasshouse" : "You"}</span>
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

function StoryLine({ m, onOpenTask }: { m: StoryMessage; onOpenTask: (taskId: string) => void }) {
  const facts = (m.kind === "finished" || m.kind === "limit") && (m.touched?.length || m.notTouched?.length || m.checks || m.risk);
  return (
    <Bubble who="glasshouse" at={m.at} badge={badgeFor(m)}>
      <p className="msg-text">{m.text}</p>
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
        <button className="msg-link" data-task={m.taskId} onClick={() => onOpenTask(m.taskId)}>
          {m.kind === "finished" || m.kind === "limit" ? "Open the report" : "Show the card"}
          <ChevronRight size={12} />
        </button>
        {m.suggestedReply && <CopyForAgent text={m.suggestedReply} />}
      </div>
      {m.suggestedReply && <p className="msg-suggest">“{m.suggestedReply}”</p>}
    </Bubble>
  );
}

function ChatLineView({ c, technical }: { c: ChatLine; technical: boolean }) {
  return (
    <>
      <Bubble who="you" at={c.at}>
        <p className="msg-text">{c.question}</p>
        <p className="msg-about">About: {c.taskLabel}</p>
      </Bubble>
      <Bubble who="glasshouse" at={c.at} badge={c.answer?.unsure ? { text: "Not sure", tone: "attention" } : null}>
        {!c.answer && !c.note && (
          <p className="msg-text loading-row">
            <span className="spinner" /> Reading the record
          </p>
        )}
        {c.note && (
          <p className="msg-text muted">
            {c.note}
            {c.upgrade && (
              <>
                {" "}
                <a className="link-accent link-underline" href="/account">
                  See plans
                </a>
              </>
            )}
          </p>
        )}
        {c.answer && (c.answer.answer ? <p className="msg-text">{c.answer.answer}</p> : <p className="msg-text muted">{c.answer.reason ?? "No answer."}</p>)}
        {c.answer && c.answer.basedOn.length > 0 && (
          <p className="msg-based">
            Based on: {c.answer.basedOn.map((e) => e.plain).join(" · ")}
            {technical && <span className="mono block">{c.answer.basedOn.map((e) => `${e.summary}${e.paths.length ? ` (${e.paths.join(", ")})` : ""}`).join(" · ")}</span>}
          </p>
        )}
      </Bubble>
    </>
  );
}

export function Conversation({
  state,
  now,
  onOpenTask,
  head,
  intro,
  active = true,
}: {
  state: RoomState;
  now: number;
  onOpenTask: (taskId: string) => void;
  head?: ReactNode;
  intro?: ReactNode;
  active?: boolean;
}) {
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [question, setQuestion] = useState("");
  const [about, setAbout] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [technical, setTechnical] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);

  // Every task in the Room the owner may ask about: the ones with a card, live ones first.
  const askable = useMemo(() => {
    const live = state.sessions.filter((s) => s.task && !s.endedAt);
    const rest = state.sessions.filter((s) => s.task && s.endedAt);
    return [...live, ...rest].map((s) => ({ id: s.task!.id, label: `${TOOL_NAMES[s.tool]} · ${clip(s.task!.report?.headline ?? s.task!.headline, 48)}` }));
  }, [state.sessions]);
  const aboutId = askable.some((t) => t.id === about) ? about : (askable[0]?.id ?? "");

  const lines = useMemo<Line[]>(() => {
    const all: Line[] = [...state.story.map((m): Line => ({ kind: "story", at: m.at, m })), ...chat.map((c): Line => ({ kind: "chat", at: c.at, c }))];
    return all.sort((a, b) => a.at.localeCompare(b.at));
  }, [state.story, chat]);

  // Newest at the bottom: scroll there when a line arrives, and again when the column becomes visible (phone tabs).
  const count = lines.length;
  useEffect(() => {
    if (!active) return;
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count, busy, active]);

  async function ask() {
    const q = question.trim();
    if (q.length < 2 || busy || !aboutId) return;
    const id = `chat-${Date.now()}`;
    const label = askable.find((t) => t.id === aboutId)?.label ?? "this task";
    setChat((h) => [...h, { id, at: new Date().toISOString(), question: q, taskLabel: label }]);
    setQuestion("");
    setBusy(true);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId: aboutId, question: q }) });
      const data = (await res.json()) as AskAnswer & { error?: string; upgrade?: string };
      setChat((h) =>
        h.map((c) =>
          c.id !== id ? c : res.ok ? { ...c, answer: data } : { ...c, note: data.error ?? "Could not ask right now.", upgrade: Boolean(data.upgrade) },
        ),
      );
    } catch {
      setChat((h) => h.map((c) => (c.id !== id ? c : { ...c, note: "Could not reach the Room." })));
    } finally {
      setBusy(false);
    }
  }

  let lastDay = "";

  return (
    <section className="chat" aria-label="The story of this project">
      <div className="chat-scroll" ref={scroller}>
        <div className="chat-inner">
          {head}
          {intro}
          {lines.length === 0 && !intro && (
            <div className="chat-empty">
              <p className="muted">Nothing has happened yet. When an agent starts, finishes, gets stuck or needs you, it is written here in plain English, and you can ask about any of it.</p>
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
              <div key={l.kind === "story" ? l.m.id : l.c.id}>
                {divider}
                {l.kind === "story" ? <StoryLine m={l.m} onOpenTask={onOpenTask} /> : <ChatLineView c={l.c} technical={technical} />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="composer-wrap">
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
        >
          <label className="visually-hidden" htmlFor="ask-question">
            Your question
          </label>
          <input
            id="ask-question"
            className="composer-field"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={askable.length === 0 ? "Ask once an agent has started" : "Ask about this task. Did it change how people log in?"}
            maxLength={600}
            disabled={busy || askable.length === 0}
            autoComplete="off"
          />
          <div className="composer-row">
            <label className="visually-hidden" htmlFor="ask-about">
              Which task the question is about
            </label>
            <select id="ask-about" className="composer-about" value={aboutId} onChange={(e) => setAbout(e.target.value)} disabled={askable.length === 0} title="Which task the question is about">
              {askable.length === 0 ? <option value="">No task to ask about yet</option> : askable.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <label className="switch tiny composer-switch">
              <input type="checkbox" checked={technical} onChange={(e) => setTechnical(e.target.checked)} />
              Technical detail
            </label>
            <button className="composer-send" type="submit" aria-label="Ask" title="Ask" disabled={busy || question.trim().length < 2 || !aboutId}>
              {busy ? <span className="spinner" /> : <ArrowUp size={16} />}
            </button>
          </div>
        </form>
        <p className="composer-note">Answers come only from this task&apos;s own record. Nothing you type here reaches an agent.</p>
      </div>
    </section>
  );
}
