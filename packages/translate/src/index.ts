/**
 * Pure functions only. No I/O. Everything here must be testable by replaying fixtures.
 *
 * - classify: what kind of shell command was that?
 * - normalise/*: one file per agent, turning its hook payloads into the one event shape.
 *
 * Phase 2 adds template translation, the stage state machine, and stuck / waiting detection.
 */
export { classifyCommand } from "./classify.js";
export { normaliseClaudeCode, relativePath, stripPayload, type NormaliseContext } from "./normalise/claude-code.js";
