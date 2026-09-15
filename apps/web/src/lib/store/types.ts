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

/** One line of the Room's running story: a meaning change, written from the record (Phase 5). */
export interface StoryMessage {
  id: string;
  /** When the thing it describes happened. */
  at: string;
  kind: "started" | "handoff" | "waiting" | "stuck" | "finished" | "limit" | "helper-started" | "helper-finished";
  taskId: string;
  tool: AgentTool;
  /** The plain-English line. */
  text: string;
  /** A helper grown in the Potting Shed that started or finished on this task; the verdict is computed from the files its run changed. */
  helper?: { id: string; name: string; verdict?: "kept" | "strayed" | "unclear"; outside?: string[] };
  /** Verified facts for a finished task, computed from the changed-files list. */
  touched?: string[];
  notTouched?: string[];
  needsYou?: NeedsYou;
  needsYouDetail?: string;
  risk?: Risk["level"];
  /** "All 24 checks passed" / "2 of 26 checks failed" / undefined when none ran. */
  checks?: string;
  /** A message the owner may copy into the agent's own window. Never sent by us (rule 4). */
  suggestedReply?: string;
}

/** How far one part of the app has got this week, as stages (never percentages). */
export interface AreaProgress {
  id: string;
  name: string;
  sensitive: boolean;
  /** The furthest stage any task touching this part has reached; null when nothing touched it. */
  stage: Stage | null;
  /** Something in this part needs the owner, or is stuck. */
  attention?: "waiting" | "stuck";
  running: number;
  finished: number;
  filesChanged: number;
  /** The most recent test counts from a task that changed this part. */
  checks?: { passed?: number; failed?: number };
  lastTouchedAt?: string;
  tools: AgentTool[];
}

/** Actions per hour over the window, by tool. Hours are ISO strings truncated to the hour, in UTC; the page buckets them in local time. */
export interface ActivityView {
  since: string;
  hours: Record<string, Partial<Record<AgentTool, number>>>;
  total: number;
  byTool: Record<AgentTool, number>;
}

/** One run of a helper as the Room shows it: a verdict on a task, computed from the files it changed. */
export interface RoomHelperRun {
  taskId: string;
  at: string;
  endedAt?: string;
  tool: AgentTool;
  verdict: "kept" | "strayed" | "unclear";
  outside: string[];
}

/** A helper grown in the Potting Shed, as the Room sees it. Words and computed runs; nothing stored. */
export interface RoomHelper {
  id: string;
  name: string;
  slug: string;
  tools: AgentTool[];
  /** One line saying what it does, from its ticked sentences. */
  job: string;
  placedAt?: string;
  /** Its runs in the Room's window, newest first. */
  runs: RoomHelperRun[];
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
  /** The conversation column: every meaning change over the last week, oldest first. */
  story: StoryMessage[];
  /** The progress column. */
  progress: AreaProgress[];
  activity: ActivityView;
  /** The helpers grown for this project and how they did this week. Absent from a server older than Phase 7. */
  helpers?: RoomHelper[];
  /** What the owner asked for from the Room this week, oldest first (Phase 8). Absent from a server older than Phase 8. */
  requests?: RequestView[];
  /** When the owner's own connector last asked the Room for requests. Absent when it never has. */
  listeningAt?: string;
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

// -- Phase 6: the Potting Shed -----------------------------------------------------------------

/** How carefully a helper works: three stages, never a number. */
export type HelperCare = "careful" | "balanced" | "quick";

/** Where a rule or a suggestion came from in the record. Rule 3: every line links to the real moment. */
export interface HelperEvidence {
  kind: "asked" | "stuck" | "checks" | "sensitive" | "handoff" | "busy" | "owner";
  /** Tasks the fact was computed from. */
  taskIds: string[];
  /** One plain sentence saying what happened and how often. */
  text: string;
}

export interface HelperRule {
  text: string;
  evidence?: HelperEvidence;
}

/** The words of a helper. Files for each tool are compiled from these at read time (lib/shed/compile.ts). */
export interface HelperBrief {
  /** One or two plain sentences: the job. */
  job: string;
  /** Area ids the helper may work in. Empty means anywhere that is not forbidden. */
  mayTouch: string[];
  /** Area ids the helper must never change. */
  mustNotTouch: string[];
  /** Moments at which it must stop and ask the owner. */
  stopAndAsk: string[];
  care: HelperCare;
  /** Things it should already know: the owner's standing answers. */
  rules: HelperRule[];
  /** Which tools it is written for. */
  tools: AgentTool[];
}

export interface HelperRecord {
  id: string;
  projectId: string;
  ownerId?: string | null;
  /** File-safe name, e.g. "checkout-checker". Unique within a project. */
  slug: string;
  /** What the owner calls it, e.g. "Checkout checker". */
  name: string;
  brief: HelperBrief;
  /** The suggestion it was grown from, or "owner" when typed from scratch. */
  grownFrom: string;
  createdAt: string;
  updatedAt: string;
  /** When `glasshouse helpers` last wrote this helper into the folder. */
  placedAt?: string;
}

/** One time a helper actually ran, as the record shows it (a sub-agent start with this helper's name). */
export interface HelperRun {
  taskId: string;
  tool: AgentTool;
  agentId?: string;
  agentType: string;
  startedAt: string;
  endedAt?: string;
  /** Files edited by that sub-agent, when the tool told us which agent edited them. */
  changedPaths: string[];
  /** True when the tool does not say which agent made which edit; the check then uses the whole task. */
  taskWide: boolean;
}

// -- Phase 8: asking from the Room -------------------------------------------------------------

/** Who a message in the Room's chat is for: one of the three tools, or Glasshouse itself. */
export type RequestTool = "claude-code" | "codex" | "cursor" | "glasshouse";

/**
 * Where a request is on its way from the owner's words to a running agent. Stages, never a
 * percentage (rule 1).
 *   queued     waiting for the owner's own connector to ask for it
 *   taken      the connector has it and is starting the tool
 *   running    the tool has started
 *   finished   the tool's run ended and it said so
 *   failed     the tool could not be started, or its run ended badly; `result.reason` says why
 *   expired    nobody was listening within the time allowed, so it was never run
 *   withdrawn  the owner took it back before anyone took it
 *   answered   a question Glasshouse answered itself, from the record
 */
export type RequestStatus = "queued" | "taken" | "running" | "finished" | "failed" | "expired" | "withdrawn" | "answered";

/**
 * How freely the agent may act, in the owner's words. "ask": it may change files, and anything
 * else (a command, an install) is put to the owner in the Room first. "free": it may do anything
 * the tool allows without asking.
 */
export type RequestCare = "ask" | "free";

/** Where the words came from (rule 3): typed by the owner, or a ready-made line computed from a task. */
export interface RequestOrigin {
  kind: "typed" | "suggested";
  suggestionId?: string;
  taskId?: string;
}

/** One question a running tool put to the owner through the Room: may it do something, or which way should it go. */
export interface RequestQuestion {
  id: string;
  askedAt: string;
  /** "permission": may it do this action. "choice": the agent's own multiple-choice question. */
  kind: "permission" | "choice";
  /** The tool's own name for the action, e.g. "Bash". Behind the toggle. */
  toolName: string;
  /** What kind of action it is, in the record's own vocabulary, so the same templates translate it. */
  eventKind?: EventKind;
  /** The tool's own one-line description of the action, when it gave one. */
  description?: string;
  /** The raw one-liner for the action, e.g. "Ran: pnpm test" (rule 3). */
  summary: string;
  paths: string[];
  command?: string;
  /** For "choice": the questions and their options exactly as the tool sent them. */
  choices?: Array<{ question: string; header?: string; options: Array<{ label: string; description?: string }>; multiSelect?: boolean }>;
  /** The stripped input the tool sent, for the technical-detail toggle. */
  raw?: unknown;
  answer?: RequestAnswer;
}

export interface RequestAnswer {
  allow: boolean;
  /** For a "choice": the chosen label per question, keyed by the question text. */
  answers?: Record<string, string>;
  at: string;
  by?: string;
}

/** What happened when the connector ran the tool. Facts from the process, never a mood. */
export interface RequestResult {
  ok: boolean;
  /** One plain line for the owner when it did not go well. */
  reason?: string;
  /** The tool's closing words, clipped. */
  closing?: string;
  exitCode?: number;
  /** The command the connector ran, for the technical-detail toggle. */
  command?: string;
  /** The tail of what the tool wrote to its error stream, clipped. */
  stderr?: string;
  costUsd?: number;
  durationMs?: number;
  turns?: number;
}

export interface RequestRecord {
  id: string;
  projectId: string;
  ownerId?: string | null;
  createdAt: string;
  tool: RequestTool;
  /** The owner's words, exactly as sent. */
  text: string;
  /** A follow-up to an agent already in the Room: the Room's session id and the tool's own id for it. */
  continues?: { sessionId: string; externalId: string };
  origin: RequestOrigin;
  care: RequestCare;
  status: RequestStatus;
  statusAt: string;
  /** The tool's own session id for the run. Claude Code's is chosen before it starts; the others report theirs. */
  externalSessionId?: string;
  result?: RequestResult;
  questions: RequestQuestion[];
  /** Glasshouse's own answer, when the request was a question to it. `basedOn` holds event ids. */
  answer?: { text: string; basedOn: string[]; unsure: boolean; source: "template" | "ai" };
}

/** A request as the Room shows it: the record plus what the record links it to, computed when read. */
export interface RequestView extends Omit<RequestRecord, "questions" | "answer"> {
  /** The Room session the run became (or continues), once its first action arrived. */
  sessionId?: string;
  taskId?: string;
  questions: Array<RequestQuestion & { plain: string }>;
  answer?: { text: string; basedOn: Array<Pick<EventView, "id" | "plain" | "summary" | "paths">>; unsure: boolean; source: "template" | "ai" };
}

export interface AiCallLog {
  projectId: string;
  taskId?: string;
  purpose: "headline" | "why" | "report" | "digest" | "area_map" | "ask" | "file_descriptions" | "helper";
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

  // -- Phase 6: the Potting Shed ------------------------------------------------------------------
  listHelpers(projectId: string): Promise<HelperRecord[]>;
  getHelper(id: string): Promise<HelperRecord | null>;
  /** Create or update. The slug must be unique within the project; the store renames on collision. */
  saveHelper(record: Omit<HelperRecord, "createdAt" | "updatedAt"> & { createdAt?: string }): Promise<HelperRecord>;
  deleteHelper(id: string): Promise<void>;
  /** The connector pulled every helper of the project into the folder. */
  markHelpersPlaced(projectId: string, at: string): Promise<void>;
  /** Every time a sub-agent started in this project, newest first, with what it changed. */
  helperRuns(projectId: string, opts: { since: string }): Promise<HelperRun[]>;

  // -- Phase 8: asking from the Room -------------------------------------------------------------
  createRequest(input: Omit<RequestRecord, "id" | "createdAt" | "statusAt" | "questions"> & { id?: string; createdAt?: string }): Promise<RequestRecord>;
  getRequest(id: string): Promise<RequestRecord | null>;
  /** Requests made at or after `since`, newest first. */
  listRequests(projectId: string, opts: { since: string; limit?: number }): Promise<RequestRecord[]>;
  /** The oldest queued request for the connector to take, or null. Anything queued longer than `maxAgeMs` is marked expired first. */
  nextRequest(projectId: string, now: string, maxAgeMs: number): Promise<RequestRecord | null>;
  /** queued -> taken, atomically. Null when it was not queued (someone else took it, or the owner withdrew it). */
  takeRequest(id: string, at: string): Promise<RequestRecord | null>;
  /** queued -> withdrawn, atomically: the owner took it back. Null when it was no longer queued. */
  withdrawRequest(id: string, at: string): Promise<RequestRecord | null>;
  updateRequest(id: string, patch: Partial<Pick<RequestRecord, "status" | "externalSessionId" | "result" | "answer">> & { statusAt?: string }): Promise<RequestRecord | null>;
  addQuestion(requestId: string, question: RequestQuestion): Promise<RequestQuestion | null>;
  answerQuestion(requestId: string, questionId: string, answer: RequestAnswer): Promise<RequestQuestion | null>;
  /** The connector asked for requests: the Room can say the owner's computer is listening. */
  markListening(projectId: string, at: string): Promise<void>;
}
