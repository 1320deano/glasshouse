# Phase 0 findings

Date: 3 September 2026. Recorded from Claude Code 2.1.259 on Windows 11, using the zero-dependency
recorder in `fixtures/record-hook.mjs` wired through `.claude/settings.json`.

## What a real Claude Code session gives us (observed, not from docs)

Every hook payload carries: `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `permission_mode`,
and, from the first prompt onwards, `prompt_id`. Sub-agent activity adds `agent_id` and `agent_type`.

| Product need | Where it comes from | Note |
|---|---|---|
| Task boundaries (prompt -> stop) | `prompt_id` is on every event after `UserPromptSubmit`; `Stop` fires when the turn ends | Better than the brief assumed. A task is simply everything sharing a `prompt_id`. |
| "Why" (the user's prompt) | `UserPromptSubmit.prompt` | Prompt text travels to the cloud by design (see privacy). |
| What it read | `PostToolUse` with `tool_name: Read`, `tool_input.file_path` | `tool_response.file.content` is the WHOLE FILE. The connector must drop it before upload. |
| What it searched | `Grep` / `Glob` with `tool_input.pattern`, `glob` | Response lists matched files: useful for "where it looked". |
| What it changed | `Write` / `Edit` with `tool_input.file_path`; `tool_response.structuredPatch` | The diff is available locally per edit. Report cards can be built from hook data alone, no git needed. |
| What it ran | `Bash` with `tool_input.command`, `tool_input.description`; response `stdout`, `stderr`, `interrupted` | Test runs and installs are detected by classifying the command (`packages/translate`). `description` is a free plain-English line the agent wrote itself: use it in the ticker. |
| Failures | `PostToolUseFailure` with `error`, `is_interrupt` | Feeds stuck detection ("same error three times"). |
| Sub-agents | `SubagentStart` / `SubagentStop`; `agent_id`, `agent_type` on their tool events | Show as a nested line under the parent tile, not a new tile. |
| Turn finished | `Stop` with `last_assistant_message` | The agent's own closing message is a ready-made first draft of the report headline. |
| Session ended | `SessionEnd` with `reason` (observed: `other`) | See usage-limit note below. |
| Timing | `duration_ms` on every PostToolUse | Free latency data for the "nothing for minutes" stuck rule. |

Hooks configured in project `.claude/settings.json` were picked up by the already-running session
without a restart, so recording starts immediately after `glasshouse connect`.

## Privacy rules the connector must enforce (from what the payloads contain)

- Strip `tool_response.file.content` from Read events. Keep the path only.
- Strip `tool_input.content` from Write events; keep `structuredPatch` only while a report is pending,
  and only for files that are not secrets (`.env*`, key files, anything matching a token pattern).
- Never forward `transcript_path` contents. The path itself is harmless.
- Bash `stdout` / `stderr`: keep the first few hundred characters for the technical-detail toggle
  after redaction; enough to show a failing test name, not enough to leak data dumps.

## Open questions carried into Phase 1

- Usage-limit detection: ANSWERED. Claude Code fires `StopFailure` (matcher `rate_limit`) instead of `Stop` when the turn ends on a usage limit. Not yet observed in a recording; the recorder now listens for it. See `docs/hooks-claude-code.md`.
- Windows hook commands run with `$CLAUDE_PROJECT_DIR` expanded correctly under this install.
  Confirm on a machine without Git Bash before Phase 4 testers.
