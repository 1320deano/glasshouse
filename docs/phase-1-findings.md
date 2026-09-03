# Phase 1 findings

Date: 3 September 2026. First live tile, end to end on Christopher's machine.

## Measured

| What | Result |
|---|---|
| Hook to screen delay | avg 49 ms, p95 59 ms over the first 10 events (local server) |
| Events lost | 0. Spool empty after every run. |
| Connector bundle | one 24 KB file, no dependencies to resolve at startup |
| Hooks picked up by a running session | yes: this authoring session appeared as a tile seconds after `connect` |

## Design changes from the plan

- **No daemon.** Each hook invocation writes its event to a spool folder and sends whatever is waiting.
  Nothing to keep running, no port to clash, and the offline case is the same code path as the online one.
  A long-running process returns in Phase 2 only for the folder watcher and the Codex log tailer.
- **Live updates use server-sent events from the Room's own server**, not Supabase Realtime yet.
  Realtime needs sign-in (row-level security) which is Phase 4. Ingest and storage do go to Supabase
  as soon as credentials exist; the store is swappable and the local file-backed one is used until then.
- **Hooks registered at user level** (`~/.claude/settings.json`), one registration for every folder.
  The hook works out which project an event belongs to from the folder Claude Code is running in.
  Unlinked folders cost one short-lived process per action and nothing else.

## Observed quirks

- `SessionEnd` did not fire for a headless (`claude -p`) session on the second run, for either the async
  connector hook or the synchronous recorder hook. It did fire on the first run. Treat it as best-effort:
  the Room already retires a session after 30 quiet minutes.
- Plug-in (MCP) tools arrive as `mcp__<server>__<tool>`. The normaliser now names the plug-in in words.
- `Bash.tool_input.description` is an excellent free ticker line ("Show pnpm version"): the agent wrote it.

## Not verified

- The Supabase store (`apps/web/src/lib/store/supabase.ts`) compiles and mirrors the memory store, but has
  not run against a database. First thing to do once the hosted project is linked.

## Exit test

The one that matters: does Christopher leave the tab open on the second monitor for a week without being
reminded? Started 3 September 2026. Record the days.
