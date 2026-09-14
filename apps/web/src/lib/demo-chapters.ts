/**
 * The demo's words and shapes, with no server code behind them, so the landing page's player
 * (a client component) can import them without pulling the store into the browser bundle.
 * The frames themselves are computed in lib/demo.ts, on the server, from the recordings.
 */
export type DemoChapterId = "reads" | "login" | "limit" | "handoff" | "report";

export interface DemoChapter {
  id: DemoChapterId;
  /** Two or three words on the chapter strip. */
  title: string;
  /** One sentence under the stage, said in the owner's terms. */
  caption: string;
}

/** The five beats, in order. Static words; which frame belongs to which is computed from the record. */
export const DEMO_CHAPTERS: readonly DemoChapter[] = [
  { id: "reads", title: "It reads first", caption: "Every action becomes one plain line. The headline only changes when the meaning does." },
  { id: "login", title: "It changes Login", caption: "You asked about the dashboard. It changed how people log in. The Room says so the moment it happens, in your own words." },
  { id: "limit", title: "Credits run out", caption: "Claude Code stops mid-task. The card says exactly where it got to, and what it verifiably did not touch." },
  { id: "handoff", title: "Codex carries on", caption: "You open a different tool. The story does not start again: the new card says it is continuing from Claude Code." },
  { id: "report", title: "The report card", caption: "Touched, not touched, checks, risk, and whether it needs you. All computed from the files that changed." },
];

export interface DemoTile {
  tool: "claude-code" | "codex" | "cursor" | "watcher";
  headline: string;
  location?: string;
  prompt?: string;
  stage: string;
  risk: "low" | "medium" | "high";
  riskReasons: string[];
  ticker: string;
  continuedFrom?: string;
  /** Parts of the app the task has changed, and parts it has only looked at, so far. */
  touched: string[];
  looked: string[];
  /** Parts with no changed file, from the changed-files list. Empty until something has changed. */
  notTouched: string[];
  card?: { headline: string; touched: string[]; notTouched: string[]; needsYou: string; needsYouDetail?: string; checks?: string; risk: "low" | "medium" | "high"; riskReason?: string };
  endReason?: string;
}

/** One line of the Room's story as the demo shows it. The text is the real template's. */
export interface DemoStoryLine {
  id: string;
  kind: "started" | "handoff" | "waiting" | "stuck" | "finished" | "limit" | "helper-started" | "helper-finished";
  tool: DemoTile["tool"];
  text: string;
  badge?: { text: string; tone: "attention" | "critical" | "info" | "positive" };
  touched?: string[];
  notTouched?: string[];
  checks?: string;
  risk?: "low" | "medium" | "high";
  needsYouDetail?: string;
}

export interface DemoFrame {
  /** What the terminal on the other monitor is showing, from the recorded event. */
  terminal: string;
  tiles: DemoTile[];
  story: DemoStoryLine[];
  /** The first thing the owner would have missed, once the record holds one (lib/moment.ts). */
  moment?: { fact: string; why: string };
  chapter: DemoChapterId;
  /** How long to hold this frame, in ms. */
  holdMs: number;
}

/** A helper the Potting Shed would propose from these two sessions alone, with the fact it rests on. */
export interface DemoSuggestion {
  id: string;
  kind: string;
  name: string;
  summary: string;
  evidence: string;
  tasks: number;
}
