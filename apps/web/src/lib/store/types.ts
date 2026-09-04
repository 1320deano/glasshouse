import type { AgentTool, Area, AreaMap, EventKind, NormalisedEvent, ProjectTree, Risk, Stage } from "@glasshouse/schema";
import type { HeadlineTrigger } from "@glasshouse/translate";

export interface ProjectSummary {
  id: string;
  name: string;
  rootHint?: string;
  createdAt: string;
}

/** One action, as the Room shows it. `plain` is computed from the current area map, never stored. */
export interface EventView {
  id: string;
  kind: EventKind;
  tool: AgentTool;
  ts: string;
  receivedAt: string;
  /** Owner-language line (rule 5). */
  plain: string;
  /** The raw one-liner from the normaliser (rule 3: always available behind the toggle). */
  summary: string;
  paths: string[];
  command?: string;
  text?: string;
  tests?: { passed?: number; failed?: number };
  sourceEvent: string;
  sourceTool?: string;
  agentId?: string;
  success?: boolean;
  areaId?: string;
  areaName?: string;
  /** The stripped original payload, for the technical-detail toggle. */
  raw?: unknown;
}

export interface AreaTouched {
  id: string;
  name: string;
  description: string;
  /** Files in this area the task changed (not just read). */
  changed: string[];
  /** Files in this area the task only looked at. */
  looked: string[];
}

export interface ContinuationView {
  taskId: string;
  tool: AgentTool;
  headline?: string;
  prompt?: string;
  reason: string;
}

export interface TaskView {
  id: string;
  sessionId: string;
  tool: AgentTool;
  externalKey?: string;
  prompt?: string;
  /** The agent's own plan or todo list, when the tool exposes it. */
  plan?: string;
  headline: string;
  headlineSource: "template" | "ai";
  /** "Login → session" */
  location?: string;
  /** Stage to show: the stored stage with the stuck overlay applied. */
  stage: Stage;
  /** The stage the state machine actually holds (never "stuck"). */
  storedStage: Stage;
  stuckReason?: string;
  risk: Risk;
  endReason?: string;
  usageLimitConfirmed?: boolean;
  startedAt: string;
  endedAt?: string;
  lastEventAt?: string;
  eventCount: number;
  changedPaths: string[];
  touchedPaths: string[];
  areas: AreaTouched[];
  /** Areas of the project that this task has verifiably not changed (computed from changedPaths). */
  notTouched: string[];
  installs: number;
  lastTests?: { passed?: number; failed?: number };
  closingMessage?: string;
  continuedFrom?: ContinuationView;
  continuedBy?: { taskId: string; tool: AgentTool };
}

/** One changed file, behaviour-first, for the "What it's changed so far" panel. */
export interface ChangeLine {
  path: string;
  plain: string;
  areaName?: string;
  times: number;
  kind: "added" | "changed" | "deleted";
}

export interface TaskDetail extends TaskView {
  /** Newest first. */
  events: EventView[];
  changes: ChangeLine[];
  projectId: string;
}

/** How much of the picture the tool gives us (brief section 6.2). */
export type ViewDepth = "full" | "standard" | "basic";

export interface SessionView {
  id: string;
  tool: AgentTool;
  depth: ViewDepth;
  externalId: string;
  startedAt: string;
  endedAt?: string;
  lastEventAt?: string;
  task: TaskView | null;
  /** Newest first. */
  recentEvents: EventView[];
}

export interface RoomState {
  project: ProjectSummary;
  sessions: SessionView[];
  areas: Area[];
  areaMapSource?: "ai" | "heuristic";
  generatedAt: string;
}

export interface Stats {
  sessions: number;
  tasks: number;
  events: number;
  /** Hook time to server receipt, over the most recent events. */
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  aiCalls: number;
  aiCostGbp: number;
}

export interface HeadlineRequest {
  taskId: string;
  trigger: HeadlineTrigger;
}

export interface IngestResult {
  inserted: number;
  duplicates: number;
  /** Tasks whose meaning changed: the AI headline worker looks at these. */
  headlineRequests: HeadlineRequest[];
  /** Paths seen for the first time that have no plain-English description yet. */
  undescribedPaths: string[];
}

export interface AiCallLog {
  projectId: string;
  taskId?: string;
  purpose: "headline" | "why" | "report" | "digest" | "area_map" | "ask" | "file_descriptions";
  model: string;
  inputTokens: number;
  outputTokens: number;
  costGbp: number;
}

export interface Store {
  readonly mode: "local" | "supabase";
  createProject(input: { name: string; rootHint?: string }): Promise<{ project: ProjectSummary; token: string }>;
  resolveToken(token: string): Promise<ProjectSummary | null>;
  listProjects(): Promise<ProjectSummary[]>;
  getProject(id: string): Promise<ProjectSummary | null>;
  ingest(projectId: string, events: NormalisedEvent[]): Promise<IngestResult>;
  getRoom(projectId: string): Promise<RoomState | null>;
  getTask(taskId: string): Promise<TaskDetail | null>;
  /** Written by the AI headline worker. */
  setHeadline(taskId: string, headline: string, source: "ai" | "template"): Promise<void>;
  getStats(projectId: string): Promise<Stats>;

  getAreaMap(projectId: string): Promise<AreaMap | null>;
  saveAreaMap(projectId: string, map: AreaMap): Promise<void>;
  getTree(projectId: string): Promise<ProjectTree | null>;
  saveTree(projectId: string, tree: ProjectTree): Promise<void>;
  getFileDescriptions(projectId: string): Promise<Record<string, string>>;
  saveFileDescriptions(projectId: string, descriptions: Record<string, string>): Promise<void>;

  logAiCall(call: AiCallLog): Promise<void>;
}
