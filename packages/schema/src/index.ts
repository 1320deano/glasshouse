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
  "reasoning", // the agent explained its thinking (Codex rollout, Cursor afterAgentThought)
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
  /**
   * Short human text attached to the event when the source gives us one: a commit message,
   * a plan or todo list, the agent's own reasoning summary, an error message. Never file contents.
   */
  text: z.string().max(4000).optional(),
  /** Test counts parsed from the runner's output, for `test_run` events. A fact, not a guess. */
  tests: z.object({ passed: z.number().int().nonnegative().optional(), failed: z.number().int().nonnegative().optional() }).optional(),
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

/**
 * The area map: the user's app described in their own words. Built once from the file tree,
 * corrected by the user, refreshed when the tree changes materially. Corrections always win.
 */
export const Area = z.object({
  id: z.string().min(1),
  /** "Login", "Image generation". Owner language, never a folder name if we can help it. */
  name: z.string().min(1).max(80),
  /** One plain-English line. */
  description: z.string().max(300).default(""),
  /** Path prefixes (relative, forward slashes, no trailing slash) or exact file paths. Longest match wins. */
  prefixes: z.array(z.string()).default([]),
  /** Set when the user renamed or merged this area. Refreshes never overwrite it. */
  userCorrected: z.boolean().default(false),
  /** Where the current name and description came from. */
  source: z.enum(["ai", "heuristic", "user"]).default("heuristic"),
  /** Areas the risk badge treats as sensitive (login, payments, settings). Computed from the name and paths. */
  sensitive: z.boolean().default(false),
});
export type Area = z.infer<typeof Area>;

export const AreaMap = z.object({
  areas: z.array(Area),
  /** Fingerprint of the file tree the map was built from. */
  treeHash: z.string().optional(),
  generatedAt: z.string().optional(),
  /** How the last refresh was produced. */
  source: z.enum(["ai", "heuristic"]).optional(),
});
export type AreaMap = z.infer<typeof AreaMap>;

/** What `glasshouse connect` sends about a project: paths only, plus the heads of a few manifests. Never file contents. */
export const ManifestHead = z.object({
  path: z.string(),
  name: z.string().optional(),
  description: z.string().max(500).optional(),
  /** Script names only (no bodies) for package.json-style manifests. */
  scripts: z.array(z.string()).max(50).optional(),
  /** Dependency names only. */
  dependencies: z.array(z.string()).max(200).optional(),
});
export type ManifestHead = z.infer<typeof ManifestHead>;

export const ProjectTree = z.object({
  /** Relative paths with forward slashes. Ignored folders (node_modules, .git, build output) are left out. */
  paths: z.array(z.string()).max(20000),
  /** True when the scan hit its limit and paths were left out. */
  truncated: z.boolean().default(false),
  manifests: z.array(ManifestHead).max(40).default([]),
  /** First lines of the README, if any, with anything secret-looking removed. */
  readmeHead: z.string().max(2000).optional(),
  scannedAt: z.string(),
});
export type ProjectTree = z.infer<typeof ProjectTree>;

export const Risk = z.object({
  level: RiskLevel,
  /** Checkable facts, in owner language: "Touches Login", "Adds a new dependency". */
  reasons: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

/** A recorded hook payload as written by the fixture recorder. */
export const RecordedHook = z.object({
  receivedAt: z.string(),
  tool: AgentTool,
  hookEvent: z.string(),
  payload: z.unknown(),
});
export type RecordedHook = z.infer<typeof RecordedHook>;
