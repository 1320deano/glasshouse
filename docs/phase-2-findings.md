# Phase 2 findings

Date: 4 September 2026. The tile speaks owner language, knows the app, and the other tools show up.

## What was built

| Piece | Where | What it does |
|---|---|---|
| Area map as data | `packages/translate/src/areas.ts`, `apps/web/src/lib/ai/area-map.ts`, `/api/projects/tree`, `/room/<id>/areas` | The connector sends the file tree (paths only, plus manifest heads and a scrubbed README head). A heuristic map from folder names is built at once so tiles speak in areas immediately; with an API key the AI names and describes the areas in the background. Rename and merge on the settings page; corrections are marked and survive every refresh. A refresh runs when the tree changes materially (15% churn or a new top-level group). |
| Template translator | `packages/translate/src/templates.ts`, `files.ts` | Every event kind rendered in owner language using area names and per-file nouns ("Looking at the session part of Login"). Per-file descriptions are written lazily by the AI, once per file, and cached; without AI a heuristic noun is used. Every line keeps the event id, and the technical toggle shows the raw action and payload. |
| Stage machine and stuck | `packages/translate/src/stage.ts` | Investigating → Planning → Building → Testing → Done; Waiting for you on a permission or idle prompt, resuming where it left off. Stuck is computed at read time (same error three times, or nothing for 5 minutes while working), never stored. The folder watcher is never "stuck". |
| Headline, two speeds | `packages/translate/src/headline.ts`, `apps/web/src/lib/ai/headline.ts` | A template headline is written immediately on each meaning change (new prompt, stage change, area change, first edit after a run of reads, error, finish, waiting). The AI headline replaces it in the background, debounced to one call per 20 s and at most 12 per task; endings always get one. |
| Risk badge | `packages/translate/src/risk.ts` | From facts only: sensitive areas changed (login, payments, settings, database…), secrets or settings files, database layout, dependency installs, number of files, number of areas. Every reason is shown on hover and in the expanded view. |
| Expanded view | `apps/web/src/components/TaskPanel.tsx` | Why (prompt, the agent's plan, the closing message), Where (areas touched, files behind the toggle, **Not changed** computed from the changed-files list), What it's changed so far (behaviour-first lines per file), the live stream newest first, and the technical-detail toggle on every line. |
| Codex | `normalise/codex.ts`, `normalise/codex-rollout.ts`, `packages/connector/src/codex-tailer.ts` | Hooks (same shape as Claude Code, `turn_id`) and the rollout log tailer. The tailer is the usage-limit truth: `token_count.rate_limits` at 100% or `rate_limit_reached_type`. Hooks alone can only say "possibly a usage limit". |
| Cursor | `normalise/cursor.ts` | `conversation_id` / `generation_id`, camelCase events, file contents and shell output stripped. Tiles carry a "standard view" label. |
| Folder and git watcher | `packages/connector/src/watch.ts`, `git.ts` | `glasshouse watch` turns saves into `edit` events and commits into `commit` events (one "Folder watcher" tile per day, "basic view"). A save the Room already saw from an agent within 15 s is dropped as a duplicate. |
| Continuity | `packages/translate/src/continuity.ts` | When a task ends (usage limit, or simply stopped) and a task in another tool starts within 6 hours in the same area or with matching instructions, the new tile shows "Continuing from Claude Code: …" and the old one "Continued in Codex". The reason for the link is stored and shown. |
| Cost logging | `apps/web/src/lib/ai/client.ts`, `ai_calls` | Every AI call logs model, tokens and cost in GBP. `/api/stats/<id>` reports the count and total. |

## Measured

| What | Result |
|---|---|
| Tests | 121 across schema, translate, connector and web (was 38). All replay recorded or synthetic fixtures. |
| Connector bundle | one 75 KB file (was 24 KB), still no runtime dependencies |
| AI calls per task | 0 without an API key. With one: at most 12 headline calls (usually 3 to 5), plus one file-description call per batch of up to 30 new files, plus one area-map call per project per material tree change. |
| Template translation | zero AI calls, as designed |

## Design changes from the plan

- **Plain-English lines are computed when read, not stored.** The `events.plain` column from Phase 0 is dropped. Translation is cheap, and computing at read time means a renamed area is right everywhere at once, including old events.
- **Task facts live in one `state` object** (mirrored into readable columns in Supabase). The local and Supabase stores share every rule through `apps/web/src/lib/store/derive.ts`; neither store contains product logic.
- **Heuristic first, AI second.** The Room never waits for an AI call. Folder names give a usable map in milliseconds; the AI upgrades it in the background and the page refreshes itself.
- **Codex: rollout tailer built first, hooks second**, as Phase 0 advised. The tailer runs inside `glasshouse watch`, the one long-running process (Phase 1 had none). Hooks and the tailer feed the same session, because both carry the same session id.
- **The prompt travels with its event** (in `text`) so the stream can say "You asked: …" without a join.

## Honest gaps (read these)

- **No real Codex or Cursor session has been recorded.** Their normalisers, fixtures and hook registration were written from the documented shapes (`docs/hooks-codex-cursor.md`). The fixtures are labelled `-synthetic`. The first real session of each will almost certainly show a field name that differs; the code treats every field as optional and never guesses, so a mismatch shows up as a thinner tile, not a crash. Record one of each (`glasshouse record codex <event>` and Cursor's hooks) and replace the fixtures.
- **The Claude Code `StopFailure` payload is still unobserved.** The usage-limit fixture is synthetic too.
- **The Supabase store is still unverified** against a live database. The new migration (`20260904000000_phase2.sql`) has not been applied anywhere.
- **AI naming has not been run against a real key** in this session (none available). The prompts, JSON parsing and validation are tested only in the sense that the code paths compile and fail safe; the first real run should be watched.
- **Background work runs in the web server process.** On a laptop with `pnpm room` that is fine. On a serverless host it would be cut off; Phase 4 or 5 should move it to a queue.
- **Cursor's hooks may overlap with Claude Code's** (the docs say Cursor reads `settings.json`). Not verified. If a Cursor session appears twice, register Cursor with `--tools claude-code` only.

## Exit test

Switch from Claude Code to Codex mid-task; the Room shows it as one continuous story. Verified with fixtures
(`apps/web/src/lib/store/memory.test.ts`, "the credit-switch story"): the Claude Code tile ends "Stopped: usage limit reached"
in Login at high risk; the Codex tile that follows reads "Continuing from Claude Code: Stopped: usage limit reached", finishes
with "Ran the checks: all 6 passed", and the Claude Code tile gains "Continued in Codex". The live version of this test is
Christopher's next real credit switch.
