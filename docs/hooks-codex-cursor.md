# Codex and Cursor hooks: reference for the connector

Researched 3 September 2026 from official docs (Codex: https://learn.chatgpt.com/docs/hooks, Cursor: https://cursor.com/docs/hooks)
and changelogs. Nothing here is observed yet: record a real session of each before relying on field names.

## The good news

Both systems copied Claude Code's shape: a JSON config keyed by event name, one JSON payload on stdin,
exit 0 to observe, exit 2 to block. The connector's `glasshouse hook <tool> <event>` handler works for all
three; only the normaliser differs per tool.

## Depth per tool (matches the brief's "standard view")

| | Claude Code | Codex CLI | Cursor |
|---|---|---|---|
| Session id | `session_id` | `session_id` (thread id) | `conversation_id` |
| Task/turn id | `prompt_id` | `turn_id` | `generation_id` |
| Prompt text | UserPromptSubmit | UserPromptSubmit | beforeSubmitPrompt (IDE; may be missing in CLI) |
| Reads | Read | Read (uncertain how often; mostly apply_patch/Bash) | beforeReadFile |
| Edits | Edit/Write + structuredPatch | `apply_patch` tool | afterFileEdit with `edits[{old_string,new_string}]` |
| Commands | Bash | Bash | beforeShellExecution / afterShellExecution (full output) |
| Failures | PostToolUseFailure | (none documented) | postToolUseFailure with `failure_type` |
| Waiting for you | PermissionRequest / Notification | PermissionRequest | preToolUse returning "ask" is the hook's own choice; no inbound signal. Infer from gaps. |
| Reasoning | transcript only | transcript only | afterAgentThought.text (the only tool that exposes thinking via hooks) |
| Turn end | Stop + `last_assistant_message` | Stop + `last_assistant_message` | stop with `status` completed/aborted/error |
| Usage limit | StopFailure `rate_limit` | none; infer from turn ending without Stop, or rollout JSONL `token_count.rate_limits` | none; `stop.status: "error"` or `sessionEnd.reason: "error"` + `error_message` |
| Sub-agents | SubagentStart/Stop | SubagentStart/Stop | subagentStart/Stop with `modified_files[]` |

## Codex CLI (0.153 at time of writing)

- Enable: `[features] hooks = true` in `~/.codex/config.toml` (set it explicitly; default is uncertain).
- Config: `~/.codex/hooks.json` (user) or `<repo>/.codex/hooks.json` (project). Same shape as Claude Code.
- **Trust step**: non-managed hooks are skipped until the user opens `/hooks` in the Codex TUI and trusts them.
  Onboarding must say this, or the Codex tile stays blank.
- Windows: hooks run under PowerShell; use `commandWindows` for the Windows command. Payload via stdin only
  (argv has a ~32 KB limit).
- Events: SessionStart(`source`), SessionEnd(`reason`), UserPromptSubmit(`prompt`), PreToolUse/PostToolUse
  (`tool_name`, `tool_use_id`, `tool_input`, `tool_response`), PermissionRequest, PreCompact/PostCompact,
  SubagentStart/Stop, Stop(`stop_hook_active`, `last_assistant_message`), Interrupt (0.150+).
- Common fields: `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `model`, `permission_mode`, `turn_id` on turn events.
- Tool names: `Bash`, `apply_patch`, `Read`, `Write`, `Edit`, `update_plan`, `mcp__<server>__<tool>`.
- Fallback when hooks are untrusted or regress: tail `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`.
  Line: `{timestamp, type, payload}`; first line `session_meta` with `id` equal to the hook `session_id`.
  `event_msg` of type `token_count` carries `rate_limits.primary.used_percent`: the only place a usage limit is
  visible. Files can reach gigabytes; tail incrementally.
- Simpler always-on signal: `notify = ["cmd"]` in config.toml fires on `agent-turn-complete` with
  `thread-id`, `turn-id`, `cwd`, `last-assistant-message`. No trust step. Good enough for a report card even if hooks are off.

## Cursor (IDE 3.14, CLI)

- Config: `~/.cursor/hooks.json` or `<repo>/.cursor/hooks.json`, `{"version": 1, "hooks": {...}}`.
  Cursor also reads Claude Code `settings.json` hooks, so one registration may cover both. Verify.
- Windows: no shebang scripts; give an explicit interpreter (`node C:/.../hook.mjs`).
- Common fields: `conversation_id`, `generation_id`, `model`, `hook_event_name`, `cursor_version`, `workspace_roots`, `transcript_path`.
- Events to register: sessionStart, sessionEnd, beforeSubmitPrompt, preToolUse, postToolUse, postToolUseFailure,
  afterFileEdit, afterShellExecution, afterAgentThought, afterAgentResponse, subagentStart, subagentStop, preCompact, stop.
- Coverage differs by surface: the IDE fires everything; the CLI fires a subset (no beforeSubmitPrompt as of mid-2026);
  cloud agents fire command hooks only and `stop` unreliably. Label the tile "standard view" and expect gaps.
- `afterShellExecution.output` is the full terminal output and `beforeReadFile.content` is the whole file:
  strip both before upload, same rule as Claude Code Read.
- Env: `CURSOR_PROJECT_DIR` (and `CLAUDE_PROJECT_DIR` alias) available to hook commands.

## Mapping into the one event schema

| Source | kind |
|---|---|
| Codex Bash / Cursor afterShellExecution | classify(command) -> `command` / `test_run` / `install` / `commit` |
| Codex apply_patch, Edit, Write / Cursor afterFileEdit | `edit` (paths from the patch or `file_path`) |
| Codex Read / Cursor beforeReadFile | `read` |
| Codex update_plan | `plan` |
| Cursor afterAgentThought | (not stored as an event; attach to the task as "reasoning" for the Why panel) |
| Codex Interrupt / Cursor stop status aborted | `stop` with `end_reason: "interrupted"` |
| Codex/Cursor stop with error status | `error` then `stop`; mark task `end_reason: "error"`; usage-limit is a guess and must be labelled as one |

Rule 2 applies: for Codex and Cursor the tile may say "Stopped: possibly a usage limit", never "Stopped: usage limit",
unless the rollout JSONL confirms `rate_limit_reached_type`.

## Phase 1 and 2 to-dos that came out of this

1. Record a real Codex session and a real Cursor session into `fixtures/raw/` before writing their normalisers.
2. Confirm whether Cursor picks up Claude Code `settings.json` hooks on this machine (would halve the setup).
3. Codex onboarding copy must include the `/hooks` trust step.
4. Build the Codex rollout tailer as the fallback and the source of usage-limit truth.

## OBSERVED: Codex rollouts on Christopher's machine (3 September 2026)

The Codex desktop app is installed (no `codex` CLI on PATH). 14 rollout files found under `~/.codex/sessions/YYYY/MM/DD/`
and `~/.codex/archived_sessions/`, written by CLI versions 0.146 and 0.148, all in `history_mode: legacy`.
Not copied into fixtures: they contain personal sessions. Record a fresh, purpose-made Codex session in Phase 2 instead.

| Observed | Meaning for the connector |
|---|---|
| `session_meta` keys: `session_id`, `id`, `timestamp`, `cwd`, `originator`, `cli_version`, `source`, `model_provider`, `base_instructions`, `history_mode`, `multi_agent_version`, `context_window` | `cwd` links a rollout to a project without hooks. |
| `event_msg / task_started`, `task_complete`, `user_message`, `agent_message`, `agent_reasoning` | Task boundaries and the Why panel come straight from the rollout in legacy mode. |
| `event_msg / turn_aborted` (3 seen) | Interrupted or failed turns. Check `reason`. |
| `event_msg / token_count` (269 seen) | Carries `rate_limits`: the only usage-limit truth for Codex. |
| `event_msg / patch_apply_end` (7), `mcp_tool_call_end` (43), `web_search_end` (4) | Edit, MCP and web completions with results. |
| `response_item / custom_tool_call` names: `exec` (199), `shell_command` (10), `wait` (9), `apply_patch` (3) | Real tool names. Docs say `Bash`; the rollout says `exec` / `shell_command`. Map both. |
| `response_item / function_call` (19) | Function-style tools (MCP etc.). |
| `world_state`, `thread_settings_applied`, `compacted` | Ignore. |
| `~/.codex/config.toml` already has `notify = [...]` set by the desktop app | The connector must not overwrite `notify`; use hooks. `[features] hooks` is not set yet. |

Conclusion: for Codex, the rollout tailer is not just a fallback. It is the richer source (reasoning, token counts,
rate limits) and needs no trust step. Hooks add live timing. Build the tailer first in Phase 2.
