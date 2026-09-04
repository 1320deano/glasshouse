import type { AgentTool, Area, AreaMap, EventKind, NormalisedEvent, ProjectTree, Risk, Stage } from "@glasshouse/schema";
import type { Digest, DigestWindowKind, HeadlineTrigger, NeedsYou, ReportCard, ReportFacts, ReportText } from "@glasshouse/translate";

export interface ProjectSummary {
  id: string;
  name: string;
  rootHint?: string;
  createdAt: string;
  /** The signed-in person who connected it. "local" in local mode. Null for projects made before sign-in existed. */
  ownerId?: string | null;
}

// -- Phase 4: people, plans, onboarding, testers ------------------------------------------------

export type PlanName = "free" | "pro";

export interface Profile {
  userId: string;
  email?: string;
  plan: PlanName;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: string;
  planUpdatedAt?: string;
  createdAt: string;
  /** When the person last opened a Room page. */
  lastSeenAt?: string;
}

/** A one-time code the owner pastes into `glasshouse connect` so the project lands in their account. */
export interface LinkCode {
  code: string;
  ownerId: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  projectId?: string;
}

export interface Invite {
  email: string;
  note?: string;
  createdAt: string;
  /** Set when the invited person first signs in. */
  acceptedAt?: string;
}

/** "Something's wrong" from a tester, with where they were. */
export interface TesterNote {
  id: string;
  userId?: string;
  email?: string;
  projectId?: string;
  page: string;
  note: string;
  userAgent?: string;
  createdAt: string;
}

export type MetricEvent = "landing_view" | "signup_started" | "signup_completed" | "project_connected" | "first_session" | "upgrade_clicked";

export interface MetricCounts {
  /** Distinct visitors per event over the window. */
  byEvent: Record<MetricEvent, number>;
  days: number;
  /** signup_completed / landing_view, as a percentage, or null when there were no visitors. */
  signupRatePct: number | null;
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
  /** The report card, once the task has finished. Facts are recomputed against the current area map. */
  report?: ReportCard & { resolvedAt?: string; createdAt: string };
  /** Facts the digest needs that the tile does not show. */
  createdPaths: string[];
  installed: string[];
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
  /** The recorded facts the report card is computed from. */
  facts: ReportFacts;
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
  /** Open items in the needs-you inbox. */
  inboxOpen: number;
  lastCheckedAt?: string;
  /** Tasks finished, and flagged, since the owner last opened the digest. */
  sinceChecked: { done: number; needsYou: number };
}

/** The stored words of a report card. The facts are computed when read (derive.ts). */
export interface ReportRecord extends ReportText {
  taskId: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  /** Set when the owner clears it from the inbox. */
  resolvedAt?: string;
  /** How many events the task had when these words were written. */
  eventCount: number;
}

export interface InboxItem {
  taskId: string;
  tool: AgentTool;
  status: NeedsYou;
  detail?: string;
  headline: string;
  endedAt?: string;
  risk: Risk;
  resolvedAt?: string;
}

export interface FeedbackRecord {
  id: string;
  eventId: string;
  projectId: string;
  taskId?: string;
  /** The plain-English line exactly as it was shown when the owner disliked it. */
  plain: string;
  /** The raw one-liner it was translated from. */
  summary: string;
  kind: EventKind;
  note?: string;
  createdAt: string;
}

/** A disliked line with the event behind it, for the weekly review. */
export interface FeedbackView extends FeedbackRecord {
  event?: EventView;
  /** What the line reads today (the map may have changed since). */
  plainNow?: string;
}

export interface DigestCache {
  projectId: string;
  kind: DigestWindowKind;
  windowStart: string;
  windowEnd: string;
  fingerprint: string;
  body: Digest;
  createdAt: string;
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
  /** Tasks that ended in this batch: a template report card was written; the AI report worker looks at these. */
  finishedTasks: string[];
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
  createProject(input: { name: string; rootHint?: string; ownerId?: string | null }): Promise<{ project: ProjectSummary; token: string }>;
  resolveToken(token: string): Promise<ProjectSummary | null>;
  /** All projects, or only one person's. */
  listProjects(ownerId?: string): Promise<ProjectSummary[]>;
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

  // -- Phase 3: memory ---------------------------------------------------------------------
  /** Tasks with activity (or an end) at or after `since`, newest first, with their report cards. */
  listTasks(projectId: string, opts: { since: string; limit?: number }): Promise<TaskView[]>;
  getReport(taskId: string): Promise<ReportRecord | null>;
  /** Upsert the words of a card. Keeps `resolvedAt` unless the caller sets it. */
  saveReport(record: Omit<ReportRecord, "createdAt" | "updatedAt"> & { resolvedAt?: string }): Promise<void>;
  setReportResolved(taskId: string, resolved: boolean): Promise<void>;
  getLastChecked(projectId: string): Promise<string | undefined>;
  markChecked(projectId: string, at: string): Promise<void>;
  getDigestCache(projectId: string, kind: DigestWindowKind): Promise<DigestCache | null>;
  saveDigestCache(cache: DigestCache): Promise<void>;
  /** Null when the event is unknown, or when `projectId` is given and the event is not in that project. */
  addFeedback(input: { eventId: string; projectId?: string; note?: string }): Promise<FeedbackRecord | null>;
  listFeedback(projectId: string): Promise<FeedbackView[]>;

  // -- Phase 4: people, plans, onboarding, testers ---------------------------------------------
  getProfile(userId: string): Promise<Profile | null>;
  /** Create or update. `plan` and billing fields are only ever written by billing code. */
  upsertProfile(profile: Partial<Profile> & { userId: string }): Promise<Profile>;
  findProfileByCustomer(stripeCustomerId: string): Promise<Profile | null>;
  listProfiles(): Promise<Profile[]>;
  createLinkCode(ownerId: string, now?: string): Promise<LinkCode>;
  /** Marks the code used. Null when unknown, expired or already used. */
  consumeLinkCode(code: string, now?: string): Promise<LinkCode | null>;
  /** The code's outcome, for the connect page to poll. */
  getLinkCode(code: string): Promise<LinkCode | null>;
  /** Record which project a used code produced. */
  attachLinkCode(code: string, projectId: string): Promise<void>;
  addInvite(email: string, note?: string): Promise<Invite>;
  removeInvite(email: string): Promise<void>;
  isInvited(email: string): Promise<boolean>;
  markInviteAccepted(email: string, at: string): Promise<void>;
  listInvites(): Promise<Invite[]>;
  addTesterNote(note: Omit<TesterNote, "id" | "createdAt">): Promise<TesterNote>;
  listTesterNotes(limit?: number): Promise<TesterNote[]>;
  recordMetric(event: MetricEvent, visitorId: string, at?: string): Promise<void>;
  metricCounts(days: number, now?: string): Promise<MetricCounts>;
  /** Per-person activity for the tester dashboard: projects, sessions, last event. */
  ownerActivity(ownerId: string): Promise<{ projects: number; sessions: number; tasks: number; lastEventAt?: string }>;
}
