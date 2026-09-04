/**
 * Pure functions only. No I/O. Everything here must be testable by replaying fixtures.
 *
 * - classify: what kind of shell command was that?
 * - normalise/*: one file per agent, turning its hook payloads (or log lines) into the one event shape.
 * - areas: the area map as data (lookup, heuristic build, merge with corrections).
 * - files: plain-English nouns for files.
 * - templates: the ~10 action kinds rendered in owner language.
 * - stage: the stage state machine and stuck detection.
 * - risk: the risk badge from facts.
 * - headline: when the headline may change, and the zero-cost headline text.
 * - continuity: linking a task in one tool to the task it picked up from another.
 * - report: the report card for a finished task (facts computed, words templated, AI merged).
 * - digest: what all the agents did over a window.
 */
export { classifyCommand } from "./classify.js";
export { parseTestOutput, type TestCounts } from "./tests-output.js";
export { normaliseClaudeCode, normaliseHook, relativePath, stripPayload, toSlashes, type NormaliseContext } from "./normalise/claude-code.js";
export { normaliseCodex } from "./normalise/codex.js";
export { normaliseCodexRollout, createRolloutState, type RolloutState } from "./normalise/codex-rollout.js";
export { normaliseCursor } from "./normalise/cursor.js";
export { watcherEditEvent, watcherCommitEvent, watcherSessionId, watcherTaskKey } from "./normalise/watcher.js";
export {
  ROOT_PREFIX,
  areaForPath,
  areasForPaths,
  buildHeuristicAreaMap,
  groupPathsByFolder,
  humaniseFolder,
  isSensitiveArea,
  mergeAreaMaps,
  mergeAreas,
  ownerWordsFor,
  renameArea,
  treeChangedMaterially,
  treeHash,
} from "./areas.js";
export { describeFile, fileWords, shortFileLabel } from "./files.js";
export { locationFor, nounFor, packagesFromCommand, translateEvent, translateEvents, type TranslateContext, type Translation } from "./templates.js";
export { DEFAULT_IDLE_MS, STAGE_LABELS, detectStuck, displayStage, errorSignature, stageAfter, type StageState, type StuckInput, type StuckVerdict } from "./stage.js";
export { RISK_LABELS, assessRisk, sensitiveFiles, type RiskFacts } from "./risk.js";
export { headlineTrigger, nextTriggerState, templateHeadline, type HeadlineFacts, type HeadlineTrigger, type TriggerState } from "./headline.js";
export { DEFAULT_WINDOW_MS, findContinuation, promptOverlap, type ContinuationLink, type EndedTask, type FreshTask } from "./continuity.js";
export {
  NEEDS_YOU,
  NEEDS_YOU_LABELS,
  diffFromEvents,
  higherNeed,
  mergeAiReport,
  needsYouFloor,
  notTouchedAreas,
  patchFromRaw,
  questionIn,
  reportCard,
  reportEvidence,
  templateReportHeadline,
  templateReportText,
  touchedAreas,
  type AiReportReply,
  type DiffText,
  type NeedsYou,
  type ReportCard,
  type ReportEvidence,
  type ReportFacts,
  type ReportText,
  type TouchedArea,
} from "./report.js";
export {
  TOOL_WORDS,
  buildDigest,
  digestCounts,
  digestWindow,
  type Digest,
  type DigestDone,
  type DigestGoing,
  type DigestNeed,
  type DigestNewInApp,
  type DigestTask,
  type DigestTool,
  type DigestWindow,
  type DigestWindowKind,
} from "./digest.js";
