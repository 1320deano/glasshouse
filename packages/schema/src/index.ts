/**
 * The one event schema. Every agent (Claude Code, Codex, Cursor, folder watcher)
 * is normalised into this shape by the connector before anything reaches the web app.
 *
 * Rule 3 of the product: every plain-English line links to the real action underneath.
 * That is why `raw` and `sourceEvent` are always kept.
 */
import { z } from "zod";

export const AgentTool = z.enum(["claude-code", "codex", "cursor", "watcher"]);
export type AgentTool = z.infer<typeof AgentTool>;

/** What the agent just did, in the ~10 kinds we can translate from templates. */
export const EventKind = z.enum([
  "session_start", // agent session opened
  "prompt", // user submitted a prompt (starts a task)
  "read", // read a file
  "search", // grep / glob / semantic search
  "edit", // wrote or changed a file
  "command", // ran a shell command that is not a test run or install
  "test_run", // ran tests (detected from the command)
  "install", // added a dependency
  "web", // fetched a URL or searched the web
  "plan", // wrote a plan / todo list
  "subagent_start",
  "subagent_stop",
  "permission_wait", // waiting for the user to approve something
  "permission_denied", // the user said no
  "idle", // agent finished its turn and is waiting for input
  "error", // a tool call failed
  "commit", // git commit landed
  "stop", // agent finished its turn (ends a task)
  "usage_limit", // agent stopped because credits ran out
  "session_end",
  "unknown",
]);
export type EventKind = z.infer<typeof EventKind>;

/** Stages, never percentages. */
export const Stage = z.enum([
  "investigating",
  "planning",
  "building",
  "testing",
  "done",
  "stuck",
  "waiting", // waiting for you
]);
export type Stage = z.infer<typeof Stage>;

export const RiskLevel = z.enum(["low", "medium", "high"]);
export type RiskLevel = z.infer<typeof RiskLevel>;

export const NormalisedEvent = z.object({
  /** Connector-generated UUID; the server de-duplicates on it. */
  id: z.string().uuid(),
  /** Set by the connector from the linked project. */
  projectId: z.string().uuid(),
  /** The agent's own session id (Claude Code session_id, etc.). */
  sessionId: z.string().min(1),
  /** Sub-agent id when the event came from a sub-agent, else undefined. */
  agentId: z.string().optional(),
  /** The source tool's own task/turn id (Claude Code prompt_id, Codex turn_id, Cursor generation_id). */
  taskKey: z.string().optional(),
  tool: AgentTool,
  kind: EventKind,
  /** ISO 8601, when the agent did it (hook time). */
  ts: z.string().datetime({ offset: true }),
  /** Files involved, relative to the project root. Empty when none. */
  paths: z.array(z.string()).default([]),
  /** The shell command, for command / test_run / install. */
  command: z.string().optional(),
  /** Prompt text for `prompt` events. */
  prompt: z.string().optional(),
  /** One raw line describing the action, before translation. e.g. "Read auth/session.py" */
  summary: z.string().min(1),
  /** Whether the action succeeded, when known. */
  success: z.boolean().optional(),
  /** The hook event name at the source, e.g. "PostToolUse". */
  sourceEvent: z.string().min(1),
  /** The source tool name at the source, e.g. "Bash", "Edit". */
  sourceTool: z.string().optional(),
  /** The untouched original payload (for the technical-detail toggle). */
  raw: z.unknown(),
});
export type NormalisedEvent = z.infer<typeof NormalisedEvent>;

/** What the connector posts to the ingest API. */
export const EventBatch = z.object({
  connectorVersion: z.string(),
  events: z.array(NormalisedEvent).min(1).max(500),
});
export type EventBatch = z.infer<typeof EventBatch>;

/** A recorded hook payload as written by the fixture recorder. */
export const RecordedHook = z.object({
  receivedAt: z.string(),
  tool: AgentTool,
  hookEvent: z.string(),
  payload: z.unknown(),
});
export type RecordedHook = z.infer<typeof RecordedHook>;
