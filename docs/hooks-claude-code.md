# Claude Code hooks: reference for the connector

Sources: official docs (https://code.claude.com/docs/en/hooks) via research on 3 September 2026,
cross-checked against real payloads recorded from Claude Code 2.1.259 (`fixtures/sessions/claude-code-basic.jsonl`).
**Where the docs and the recordings disagree, the recordings win** and are marked OBSERVED below.

## Events the connector listens to (all as passive `type: "command"` hooks, exit 0, no stdout)

| Hook event | Maps to event kind | Notes |
|---|---|---|
| SessionStart | `session_start` | OBSERVED payload adds `source` ("startup", "resume", ...). |
| UserPromptSubmit | `prompt` | `prompt` text. OBSERVED: `prompt_id` appears here and on every later event: this is the task id. |
| PreToolUse | (not stored; used only to start the "in progress" timer) | Fires before the tool; carries `tool_use_id`. |
| PostToolUse | `read` / `search` / `edit` / `command` / `test_run` / `install` / `web` / `plan` / `subagent_start` | By `tool_name`, see mapping below. OBSERVED: `duration_ms` present. |
| PostToolUseFailure | `error` | OBSERVED: `error` (string), `is_interrupt` (bool), `duration_ms`. |
| PermissionRequest | `permission_wait` | Fires when a permission dialog would show. This is "Waiting for you". |
| PermissionDenied | (annotates the pending `permission_wait`) | User said no. |
| Notification | `permission_wait` (permission_prompt) / `idle` (idle_prompt) | `notification_type`, `message`, `title`. Docs: the permission_prompt payload does not name the tool; correlate with the last PreToolUse. |
| SubagentStart / SubagentStop | `subagent_start` / `subagent_stop` | `agent_id`, `agent_type`. Tool events from inside a sub-agent also fire with `agent_id` set (OBSERVED). Render nested under the parent tile. |
| Stop | `stop` | OBSERVED: `last_assistant_message` (the agent's closing words: first draft of the report headline), `stop_hook_active`. Ends the task. |
| **StopFailure** | `usage_limit` when matcher is `rate_limit`; `error` for `overloaded` / `billing_error` | **This is how a usage limit surfaces.** Fires instead of Stop when the turn ends on an API error. Matchers: `rate_limit`, `overloaded`, `billing_error`. Docs-sourced, not yet observed: record one when a limit is next hit. |
| SessionEnd | `session_end` | OBSERVED: `reason` field exists (`"other"` seen). Docs say it is undocumented; treat values as free text. |
| PreCompact / PostCompact | (ignored) | Context summarisation; no product meaning. |
| TaskCreated / TaskCompleted | (Phase 2: background tasks) | Task metadata. |

Not listened to: Setup, InstructionsLoaded, UserPromptExpansion, PostToolBatch, MessageDisplay, TeammateIdle,
FileChanged, ConfigChange, Worktree*, CwdChanged, *ModelSwitch, Elicitation*. Revisit if a product need appears.

## Fields on every payload (OBSERVED)

`session_id`, `transcript_path`, `cwd`, `hook_event_name`, `permission_mode`, `prompt_id` (from the first prompt on),
`effort` ({level}). Inside sub-agents: `agent_id`, `agent_type`. On tool events: `tool_name`, `tool_input`, `tool_use_id`.
Seen in some sessions: `scratchpad_dir`. No `timestamp` field: the connector stamps `receivedAt` itself.

## Tool name -> event kind, and what to keep (OBSERVED shapes)

| tool_name | kind | Keep from `tool_input` | Keep from `tool_response` | Strip before upload |
|---|---|---|---|---|
| Read | `read` | `file_path` | `file.numLines`, `file.totalLines` | `file.content` (whole file) |
| Glob | `search` | `pattern`, `path` | match count | file list beyond first 20 |
| Grep | `search` | `pattern`, `glob`, `path` | `numFiles`, `numLines` | `content` |
| Edit | `edit` | `file_path` | `structuredPatch` (only while the report is pending, never for secret files) | `old_string`, `new_string` |
| Write | `edit` | `file_path` | `type` ("create"/"update"), `structuredPatch` | `content`, `originalFile` |
| Bash | classify(`command`) -> `command` / `test_run` / `install` / `commit` | `command`, `description` | `interrupted`, first ~500 chars of `stdout`/`stderr` after redaction | the rest of stdout/stderr. NOTE: no `exit_code` observed; success = PostToolUse fired rather than PostToolUseFailure. |
| WebFetch / WebSearch | `web` | `url` / `query` | nothing | fetched content |
| TodoWrite / plan-mode tools | `plan` | todo titles | nothing | |
| Agent / Task | `subagent_start` | `description`, `subagent_type` | nothing | `prompt` (may be long) |
| ToolSearch, mcp__* and unknown | `unknown` | `tool_name` only | nothing | everything |

`Bash.tool_input.description` is a plain-English line the agent wrote itself ("Show pnpm version").
Use it as the ticker text for commands before any AI translation.

## Detecting the four things the tile needs

- **Task boundary**: group by `prompt_id`. Task starts at UserPromptSubmit, ends at Stop / StopFailure / SessionEnd.
- **Waiting for you**: PermissionRequest, or Notification with `permission_prompt`. Clears on the next PreToolUse.
- **Stuck**: three PostToolUseFailure events with the same `error` in one task, or no events for N minutes while the task is open.
- **Usage limit**: StopFailure with `rate_limit`. Fallback: SessionEnd whose transcript tail contains a usage-limit error.

## Configuration the connector writes

Into `.claude/settings.json` (project, committed) or `~/.claude/settings.json` (user):

```json
{
  "hooks": {
    "PostToolUse": [{ "hooks": [{ "type": "command", "command": "glasshouse hook claude-code PostToolUse", "timeout": 5, "async": true }] }]
  }
}
```

One entry per event above. `async: true` so the agent never waits on us. Exit 0 always; print nothing to stdout
(stdout is parsed for control decisions and we make none). Hooks added to settings are picked up by a running
session (OBSERVED), so recording starts without a restart.

## Settings precedence (docs)

Managed > `.claude/settings.local.json` > `.claude/settings.json` > plugin hooks > `~/.claude/settings.json`.
