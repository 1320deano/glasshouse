/**
 * The builder's vocabulary: everything a helper can be made of by ticking boxes, and the exact
 * two-way road between those ticks and the words a helper is stored as.
 *
 * The owner never writes a prompt. They pick a kind of helper, tick what it does, where it may
 * work, when it must stop and ask, how carefully, how it talks, what it should already know, and
 * which tools. Each tick is one fixed plain-English sentence, and the helper's stored brief is
 * those sentences and nothing else, so:
 *   - the preview on the page is the truth, not a paraphrase of it (rule 2);
 *   - a helper opened again for changing comes back with the same boxes ticked, exactly
 *     (`choicesFromBrief` matches sentences, never guesses);
 *   - a suggestion computed from the record opens as ticked boxes, because `suggest.ts` writes its
 *     jobs from these same sentences.
 * Anything the owner typed in their own words rides along untouched in `ownWords`.
 *
 * Pure. No I/O, no React.
 */
import type { AgentTool, Area } from "@glasshouse/schema";
import type { HelperBrief, HelperCare, HelperRule } from "../store/types";
import { CARE_TEXT } from "./compile";

export type HelperToolId = Exclude<AgentTool, "watcher">;
export const HELPER_TOOL_IDS: HelperToolId[] = ["claude-code", "codex", "cursor"];
export const CARE_IDS: HelperCare[] = ["careful", "balanced", "quick"];

/* --- What it does: one tick, one sentence in the file ------------------------------------- */

export type DutyId = "run-checks" | "stop-on-repeat" | "no-done-while-failing" | "stay-inside" | "smallest-change" | "ask-before-off-limits" | "apply-answers" | "ask-when-new" | "handover-note" | "explain-plainly";

export interface Duty {
  id: DutyId;
  /** The box the owner ticks. */
  label: string;
  /** The sentence the helper is told. */
  sentence: string;
}

export const DUTIES: Duty[] = [
  { id: "run-checks", label: "Runs the project's checks before anything is called finished", sentence: "Before any work is called finished, run the project's checks and read what failed properly." },
  { id: "stop-on-repeat", label: "Stops and asks instead of trying the same failing fix a third time", sentence: "If the same error appears a second time, stop, write down exactly what it says, and ask the owner rather than trying a third way." },
  { id: "no-done-while-failing", label: "Never calls a job done while a check is failing", sentence: "Never describe a job as done while any check is failing. Say exactly which checks failed and why; a job with a failing check is 'testing' at most." },
  { id: "stay-inside", label: "Keeps its changes inside the parts it is allowed to work in", sentence: "Keep every change inside the parts you are allowed to work in, and say so when a job would need to reach outside them." },
  { id: "smallest-change", label: "Makes the smallest change that does the job", sentence: "Make the smallest change that does the job. Do not tidy, rename or rework anything the job does not need." },
  { id: "ask-before-off-limits", label: "Asks before changing anything it has been told is off limits", sentence: "Treat the parts marked off limits as read-only: read them if you must, never change them without the owner's say-so. If the job seems to need a change there, stop and explain exactly what and why." },
  { id: "apply-answers", label: "Applies the answers you have already given, without asking again", sentence: "Carry the owner's standing answers into every task and act on them without asking again." },
  { id: "ask-when-new", label: "Stops and asks when something comes up that no answer covers", sentence: "When something comes up that none of the standing answers covers, stop and ask; the answer can then be added." },
  { id: "handover-note", label: "Leaves a plain-English handover note whenever it stops", sentence: "Whenever you stop for any reason (finished, out of usage, or asked to), write a short handover in plain English: what the job was, what is done, what is not, which checks passed, and the one next step. Put it where the next agent will read it first." },
  { id: "explain-plainly", label: "Explains what it changed, and why, when it finishes", sentence: "When you finish, say what you changed and why in plain English, part by part, before anything else." },
];

/* --- How it talks: one tick, one standing rule ---------------------------------------------- */

export type VoiceId = "plain" | "short" | "reasons" | "honest" | "one-question";

export interface Voice {
  id: VoiceId;
  label: string;
  sentence: string;
}

export const VOICES: Voice[] = [
  { id: "plain", label: "Plain English, no code words or file names", sentence: "Talk in plain English. No file names, folder names, tool names or code words unless the owner asks for them." },
  { id: "short", label: "Short and to the point", sentence: "Keep every message short: what you did, what is next, and nothing else." },
  { id: "reasons", label: "Gives the reason behind each change", sentence: "Give the reason behind each change in one plain sentence." },
  { id: "honest", label: "Says when it is unsure instead of guessing", sentence: "When you are not sure, say so plainly rather than guessing." },
  { id: "one-question", label: "Asks one question at a time", sentence: "When you need something from the owner, ask one question at a time, and say what you will do with the answer." },
];

/* --- When it must stop and ask: the standard moments; the owner can add their own ------------ */

export const STOP_OPTIONS = [
  "When the same check fails twice",
  "Before installing anything new",
  "Before deleting files",
  "Before changing how the app looks to customers",
  "Before spending money or using a paid service",
  "Before sending anything to a customer or an outside service",
];

/** The moments a project's own sensitive parts add, first. */
export function stopOptionsFor(areas: Area[]): string[] {
  return [...areas.filter((a) => a.sensitive).map((a) => `Before changing anything in ${a.name}`), ...STOP_OPTIONS];
}

/* --- Kinds: the first pick. Each is a set of ticks, nothing more ---------------------------- */

export type KindId = "checker" | "guard" | "specialist" | "rules" | "handover" | "own";

export interface Kind {
  id: KindId;
  name: string;
  /** One line under the name. */
  blurb: string;
  duties: DutyId[];
  care: HelperCare;
  voices: VoiceId[];
  stops: string[];
  /** Guards start with every sensitive part off limits. */
  guardsSensitive?: boolean;
  /** A specialist wants a part to specialise in. */
  wantsArea?: boolean;
  /** "Checkout checker", "Payments guard": how the name is made when the owner has not typed one. */
  suffix?: string;
}

const DEFAULT_VOICES: VoiceId[] = ["plain", "honest"];

export const KINDS: Kind[] = [
  { id: "checker", name: "Checker", blurb: "Makes sure the work really works before anyone calls it finished.", duties: ["run-checks", "stop-on-repeat", "no-done-while-failing"], care: "careful", voices: DEFAULT_VOICES, stops: ["When the same check fails twice"], guardsSensitive: true, suffix: "checker" },
  { id: "guard", name: "Guard", blurb: "Keeps agents out of the parts of your app you would rather they asked about first.", duties: ["ask-before-off-limits"], care: "careful", voices: DEFAULT_VOICES, stops: [], guardsSensitive: true, suffix: "guard" },
  { id: "specialist", name: "Specialist", blurb: "Knows one part of your app well and keeps its changes inside it.", duties: ["stay-inside", "smallest-change"], care: "balanced", voices: DEFAULT_VOICES, stops: [], guardsSensitive: true, wantsArea: true, suffix: "specialist" },
  { id: "rules", name: "House rules", blurb: "Carries the answers you have already given, so no agent asks you twice.", duties: ["apply-answers", "ask-when-new"], care: "balanced", voices: DEFAULT_VOICES, stops: [] },
  { id: "handover", name: "Handover notes", blurb: "Leaves a plain note of where it got to, so the next tool can carry on.", duties: ["handover-note"], care: "balanced", voices: DEFAULT_VOICES, stops: [] },
  { id: "own", name: "Something else", blurb: "Start from a blank sheet and tick what it should do.", duties: [], care: "balanced", voices: DEFAULT_VOICES, stops: [] },
];

export const KIND_BY_ID = new Map(KINDS.map((k) => [k.id, k]));
const DUTY_BY_ID = new Map(DUTIES.map((d) => [d.id, d]));
const DUTY_BY_SENTENCE = new Map(DUTIES.map((d) => [d.sentence, d.id]));
const VOICE_BY_ID = new Map(VOICES.map((v) => [v.id, v]));
const VOICE_BY_SENTENCE = new Map(VOICES.map((v) => [v.sentence, v.id]));

/* --- The choices themselves ------------------------------------------------------------------ */

export interface Choices {
  kind: KindId;
  duties: DutyId[];
  mayTouch: string[];
  mustNotTouch: string[];
  stops: string[];
  care: HelperCare;
  voices: VoiceId[];
  /** Things it should already know: the owner's standing answers, each with where it came from. */
  knows: HelperRule[];
  tools: HelperToolId[];
  /** Anything the owner said in their own words. Kept exactly as typed, after the ticked sentences. */
  ownWords: string;
}

/** The choices a kind starts with, on a project with these parts. */
export function choicesForKind(kindId: KindId, areas: Area[]): Choices {
  const kind = KIND_BY_ID.get(kindId) ?? KINDS[KINDS.length - 1]!;
  const sensitive = areas.filter((a) => a.sensitive);
  return {
    kind: kind.id,
    duties: [...kind.duties],
    mayTouch: [],
    mustNotTouch: kind.guardsSensitive ? sensitive.map((a) => a.id) : [],
    stops: [...(kind.guardsSensitive ? sensitive.map((a) => `Before changing anything in ${a.name}`) : []), ...kind.stops],
    care: kind.care,
    voices: [...kind.voices],
    knows: [],
    tools: [...HELPER_TOOL_IDS],
    ownWords: "",
  };
}

/** The job as the file will carry it: one ticked sentence per line, then the owner's own words. */
export function jobFrom(duties: DutyId[], ownWords = ""): string {
  const lines = DUTIES.filter((d) => duties.includes(d.id)).map((d) => d.sentence);
  const own = ownWords.trim();
  if (own) lines.push(own);
  return lines.join("\n");
}

/** The words that get stored. Nothing here is generated: every line is a tick or the owner's own. */
export function briefFromChoices(c: Choices): HelperBrief {
  const may = new Set(c.mayTouch);
  return {
    job: jobFrom(c.duties, c.ownWords),
    mayTouch: [...may],
    mustNotTouch: c.mustNotTouch.filter((id) => !may.has(id)),
    stopAndAsk: c.stops.map((s) => s.trim()).filter((s, i, all) => s && all.indexOf(s) === i),
    care: c.care,
    rules: [...VOICES.filter((v) => c.voices.includes(v.id)).map((v) => ({ text: v.sentence }) satisfies HelperRule), ...c.knows.filter((r) => r.text.trim())],
    tools: c.tools.length ? [...c.tools] : [...HELPER_TOOL_IDS],
  };
}

/** Which kind a suggestion or a saved helper belongs to, from where it was grown. */
export function kindFromGrownFrom(grownFrom: string): KindId | null {
  const head = grownFrom.split(":")[0];
  switch (head) {
    case "stuck":
    case "checks":
      return "checker";
    case "sensitive":
      return "guard";
    case "busy":
      return "specialist";
    case "asked":
      return "rules";
    case "handoff":
      return "handover";
    case "starter":
      return grownFrom === "starter:guard" ? "guard" : "checker";
    case "kind":
      return KIND_BY_ID.has(grownFrom.slice(5) as KindId) ? (grownFrom.slice(5) as KindId) : null;
    default:
      return null;
  }
}

/**
 * The same boxes ticked again from a stored brief. Sentences are matched exactly; anything that is
 * not one of ours is the owner's own words, kept as typed. The kind comes from where the helper
 * was grown, else from the ticks, else "Something else".
 */
export function choicesFromBrief(brief: HelperBrief, grownFrom = "owner"): Choices {
  const duties: DutyId[] = [];
  const own: string[] = [];
  for (const line of brief.job.split("\n")) {
    const id = DUTY_BY_SENTENCE.get(line.trim());
    if (id && !duties.includes(id)) duties.push(id);
    else if (line.trim()) own.push(line);
  }
  const voices: VoiceId[] = [];
  const knows: HelperRule[] = [];
  for (const r of brief.rules) {
    const id = VOICE_BY_SENTENCE.get(r.text.trim());
    if (id && !voices.includes(id)) voices.push(id);
    else knows.push({ ...r });
  }
  let kind = kindFromGrownFrom(grownFrom);
  if (!kind) kind = KINDS.find((k) => k.id !== "own" && k.duties.length > 0 && k.duties.every((d) => duties.includes(d)))?.id ?? "own";
  return {
    kind,
    duties: DUTIES.filter((d) => duties.includes(d.id)).map((d) => d.id),
    mayTouch: [...brief.mayTouch],
    mustNotTouch: brief.mustNotTouch.filter((id) => !brief.mayTouch.includes(id)),
    stops: [...brief.stopAndAsk],
    care: brief.care,
    voices,
    knows,
    tools: brief.tools.filter((t): t is HelperToolId => t !== "watcher"),
    ownWords: own.join("\n"),
  };
}

/** "Checkout checker", "Payments guard", "House rules". The owner can type over it. */
export function nameFor(c: Choices, areas: Area[]): string {
  const kind = KIND_BY_ID.get(c.kind);
  const byId = new Map(areas.map((a) => [a.id, a.name]));
  const first = (ids: string[]) => ids.map((id) => byId.get(id)).find(Boolean);
  if (!kind || kind.id === "own") {
    const part = first(c.mayTouch);
    return part ? `${part} helper` : "New helper";
  }
  if (!kind.suffix) return kind.name;
  const part = kind.id === "guard" ? first(c.mustNotTouch) : first(c.mayTouch);
  return part ? `${part} ${kind.suffix}` : kind.name;
}

/** The helper in the owner's words, as the page shows it while they tick. Every line is a fact of the choices. */
export function describeChoices(c: Choices, areas: Area[]): string[] {
  const byId = new Map(areas.map((a) => [a.id, a.name]));
  const names = (ids: string[]) => ids.map((id) => byId.get(id)).filter((n): n is string => Boolean(n));
  const out: string[] = [];
  for (const d of DUTIES) if (c.duties.includes(d.id)) out.push(d.label);
  if (c.ownWords.trim()) out.push(`In your words: “${c.ownWords.trim().replace(/\s+/g, " ").slice(0, 140)}${c.ownWords.trim().length > 140 ? "…" : ""}”`);
  const may = names(c.mayTouch);
  const not = names(c.mustNotTouch.filter((id) => !c.mayTouch.includes(id)));
  if (may.length) out.push(`Works in ${list(may)}`);
  if (not.length) out.push(`Never changes ${list(not)}`);
  if (!may.length && !not.length) out.push("May work anywhere in your app");
  const stops = c.stops.filter((s) => s.trim());
  if (stops.length) out.push(`Stops to ask you ${list(stops.map(lowerFirst))}`);
  out.push(`${CARE_TEXT[c.care].label}: ${lowerFirst(CARE_TEXT[c.care].owner)}`);
  const voices = VOICES.filter((v) => c.voices.includes(v.id)).map((v) => lowerFirst(v.label));
  if (voices.length) out.push(`Talks this way: ${list(voices)}`);
  const knows = c.knows.filter((r) => r.text.trim()).length;
  if (knows) out.push(`Already knows ${knows} thing${knows === 1 ? "" : "s"} you have told it`);
  return out;
}

export function dutyById(id: DutyId): Duty {
  return DUTY_BY_ID.get(id)!;
}
export function voiceById(id: VoiceId): Voice {
  return VOICE_BY_ID.get(id)!;
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
