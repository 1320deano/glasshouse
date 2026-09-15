/**
 * A request as the Room shows it (Phase 8): the stored record, plus what the record links it to,
 * computed when read and never stored. Both stores feed this the same way they feed `viewTask`.
 *
 *   - the Room session and task the run became, found by the tool's own session id;
 *   - each question the tool asked, translated into the owner's words with the current area map
 *     ("Wants to change how logged-in users are identified"), the raw action kept underneath (rule 3);
 *   - the actions a Glasshouse answer rests on, as plain lines.
 */
import type { AgentTool, EventKind } from "@glasshouse/schema";
import type { TranslateContext } from "@glasshouse/translate";
import { viewEvent } from "../store/derive";
import type { EventView, RequestQuestion, RequestRecord, RequestView } from "../store/types";

export { LISTENING_FRESH_MS, isListening } from "./story";

/** How long a request may wait in the queue before the Room stops it from ever running (nobody was listening). */
export const REQUEST_QUEUE_MAX_MS = 10 * 60 * 1000;
/** How many of the week's requests the Room carries. */
export const ROOM_REQUESTS = 60;

export interface RequestLookups {
  /** The Room session (and its most recent task started at or after `since`) for a tool's own session id. */
  sessionFor(tool: AgentTool, externalId: string, since: string): { sessionId: string; taskId?: string } | undefined;
  /** The task a Room session is on now. */
  taskOfSession(sessionId: string, since: string): string | undefined;
  eventById(id: string): Omit<EventView, "plain" | "areaId" | "areaName"> | undefined;
  ctx: TranslateContext;
}

/**
 * The lines the templates write start with a verb in one of three forms: "Running the checks",
 * "Ran the checks", or the agent's own imperative description ("Run the test suite"). Each maps
 * to the plain form after "Wants to".
 */
const VERB: Record<string, string> = {
  looking: "look", changing: "change", adding: "add", removing: "remove", running: "run", installing: "install", searching: "search", reading: "read",
  fetching: "fetch", using: "use", starting: "start", updating: "update", creating: "create", deleting: "delete", writing: "write", checking: "check",
  opening: "open", making: "make", moving: "move", copying: "copy", building: "build", testing: "test", saving: "save", thinking: "think", sending: "send",
  ran: "run", changed: "change", added: "add", removed: "remove", installed: "install", searched: "search", read: "read", fetched: "fetch", used: "use",
  started: "start", updated: "update", created: "create", deleted: "delete", wrote: "write", checked: "check", opened: "open", made: "make", moved: "move",
  copied: "copy", built: "build", tested: "test", saved: "save", sent: "send", looked: "look",
};

/**
 * "Running the checks" -> "Wants to run the checks"; "Ran the checks" the same; "Run the test suite"
 * (the agent's own description) -> "Wants to run the test suite". A line that does not start with
 * a verb is quoted as it is.
 */
export function wantsTo(plain: string): string {
  const one = plain.replace(/\s+/g, " ").trim();
  const m = /^([A-Za-z]+)(\b.*)$/.exec(one);
  if (!m) return `Wants to go ahead with: ${one}`;
  const first = m[1]!.toLowerCase();
  const base = VERB[first];
  if (base) return `Wants to ${base}${m[2]}`;
  if (/^(the|a|an|it|its|you|your|this|that|something|nothing|waiting|finished|thinking)$/.test(first) || /ing$/.test(first) || /ed$/.test(first)) return `Wants to go ahead with: ${one.charAt(0).toLowerCase()}${one.slice(1)}`;
  return `Wants to ${first}${m[2]}`;
}

/** The owner-language line for a question, from the same templates every other line uses. */
export function questionPlain(q: RequestQuestion, tool: AgentTool, ctx: TranslateContext): string {
  if (q.kind === "choice") {
    const first = q.choices?.[0]?.question?.trim();
    const more = (q.choices?.length ?? 0) - 1;
    return first ? `Asks: ${first}${more > 0 ? ` (and ${more} more question${more === 1 ? "" : "s"})` : ""}` : "Asks you a question.";
  }
  const kind: EventKind = q.eventKind ?? "unknown";
  const row = { id: q.id, kind, tool, ts: q.askedAt, receivedAt: q.askedAt, summary: q.summary, paths: q.paths, command: q.command, sourceEvent: "PermissionRequest", sourceTool: q.toolName, raw: q.raw };
  const plain = viewEvent(row, ctx).plain;
  return wantsTo(plain);
}

export function viewRequest(r: RequestRecord, lookups: RequestLookups): RequestView {
  const tool: AgentTool = r.tool === "glasshouse" ? "claude-code" : r.tool;
  let sessionId: string | undefined;
  let taskId: string | undefined;
  if (r.continues) {
    sessionId = r.continues.sessionId;
    taskId = lookups.taskOfSession(r.continues.sessionId, r.createdAt);
  } else if (r.externalSessionId && r.tool !== "glasshouse") {
    const found = lookups.sessionFor(tool, r.externalSessionId, r.createdAt);
    sessionId = found?.sessionId;
    taskId = found?.taskId;
  }
  const { questions, answer, ...rest } = r;
  return {
    ...rest,
    sessionId,
    taskId,
    questions: questions.map((q) => ({ ...q, plain: questionPlain(q, tool, lookups.ctx) })),
    answer: answer
      ? {
          ...answer,
          basedOn: answer.basedOn
            .map((id) => lookups.eventById(id))
            .filter((e): e is NonNullable<typeof e> => Boolean(e))
            .map((e) => {
              const v = viewEvent(e, lookups.ctx);
              return { id: v.id, plain: v.plain, summary: v.summary, paths: v.paths };
            }),
        }
      : undefined,
  };
}

