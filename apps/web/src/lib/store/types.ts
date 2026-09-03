import type { AgentTool, NormalisedEvent, Stage } from "@glasshouse/schema";

export interface ProjectSummary {
  id: string;
  name: string;
  rootHint?: string;
  createdAt: string;
}

export interface EventView {
  id: string;
  kind: string;
  ts: string;
  receivedAt: string;
  summary: string;
  paths: string[];
  command?: string;
  sourceEvent: string;
  sourceTool?: string;
  agentId?: string;
  success?: boolean;
  /** The stripped original payload, for the technical-detail toggle. */
  raw?: unknown;
}

export interface TaskView {
  id: string;
  externalKey?: string;
  prompt?: string;
  headline?: string;
  location?: string;
  stage: Stage;
  endReason?: string;
  startedAt: string;
  endedAt?: string;
  lastEventAt?: string;
  eventCount: number;
}

export interface SessionView {
  id: string;
  tool: AgentTool;
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
  generatedAt: string;
}

export interface Stats {
  sessions: number;
  tasks: number;
  events: number;
  /** Hook time to server receipt, over the most recent events. */
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
}

export interface IngestResult {
  inserted: number;
  duplicates: number;
}

export interface Store {
  readonly mode: "local" | "supabase";
  createProject(input: { name: string; rootHint?: string }): Promise<{ project: ProjectSummary; token: string }>;
  resolveToken(token: string): Promise<ProjectSummary | null>;
  listProjects(): Promise<ProjectSummary[]>;
  getProject(id: string): Promise<ProjectSummary | null>;
  ingest(projectId: string, events: NormalisedEvent[]): Promise<IngestResult>;
  getRoom(projectId: string): Promise<RoomState | null>;
  getStats(projectId: string): Promise<Stats>;
}
