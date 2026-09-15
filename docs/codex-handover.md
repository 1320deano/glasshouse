# Codex handover: 15 September 2026

## Starting point

Christopher moved development from Claude Code to Codex and asked for a full project orientation and durable guidance for future work. The starting commit was `4cf39b3` (the Phase 8 merge). The working tree had a personal `.claude/settings.local.json` and local nested Claude working copies. Their contents were preserved.

The current product is Deano, with Glasshouse and the Potting Shed. Features through Phase 8 are present in source. That is a statement about implementation, not a claim that every phase's real-world exit test or hosted integration has passed.

## What this handover changed

- Added root `AGENTS.md` as the canonical coding-agent guidance, covering Christopher's reporting preference, product rules, design constraints and architectural boundaries. Updated after his follow-up: replies should be short, simple and complete, understandable without technical knowledge, with no fixed opening marker.
- Replaced the long `CLAUDE.md` with a pointer/import to that shared guidance. The Phase 5 assertion that Room messages never reach agents is superseded by the explicit Phase 8 request flow. Both tools now have one place to maintain project instructions.
- Added `README.md` with requirements, commands, local/hosted distinctions, state locations and isolated demo instructions; added `docs/codebase-map.md` with source navigation, workflows and relevant checks.
- Added `pnpm check`, which runs the existing behaviour checks, TypeScript checks and ESLint in order. It does not install packages or change application data.
- Fixed two Windows assumptions in existing connector tests: the request test now expects a platform-native generated path; the unlinked-rollout test explicitly sets a recent file modification time after copying its old fixture.
- Excluded nested `.claude/worktrees` and `.codex/worktrees` from ESLint and Git discovery, and ignored the personal Claude settings file. The old working copies were causing 88 irrelevant lint errors under the current root configuration; they were not deleted.
- Excluded the local `.pnpm-store` package cache from Git and ESLint as well; the initial pnpm 11 attempt created a cache directory in this checkout.
- Updated both Windows launchers to select pnpm through Corepack and to direct Christopher to Codex on failure, without promising an unknown failure is harmless.
- Documented the optional local store path in `.env.example` without changing `.env.local`. An empty `GLASSHOUSE_LOCAL_STORE` is not the same as an unset one, because the store uses nullish fallback.
- Corrected the live setup guides to list all six database migrations, including helpers and Room requests. Older documents variously said four or seven.
- Marked the original product brief, phased plan and owner follow-ups as historical, with links to current guidance. This prevents the old "start Phase 0" line, daemon design and earlier watch-only rule from being mistaken for today's next task.
- Corrected the helper compiler's comment to describe the export it actually implements (Codex standing instructions), rather than claim Codex has no subagent configuration support.

No dependency versions, product AI provider, database schema, account settings or agent permissions were changed.

## Verified on this machine

Environment: Windows, PowerShell, Node **24.16.0**, Corepack-selected pnpm **10.34.5**. Installed versions included Vitest 3.2.7 and Next.js 15.5.25; consult the lockfile for exact dependencies.

| Check | Result |
| --- | --- |
| `corepack pnpm check` | Passed: **258 checks in 32 files**, TypeScript in all four packages, and ESLint |
| `corepack pnpm build` | Passed: shared-package validation, connector bundle, production web build |
| Isolated production server | Started on `127.0.0.1:3100`, AI off, Supabase disabled for that process, separate `.glasshouse/codex-preview.json` |
| `scripts/seed-demo.ts` against that address | Passed; example projects, activity and one helper created in the scratch record |
| Main server-rendered pages | HTTP 200 with HTML for `/`, `/landing`, `/glasshouse`, `/shed`, a project Room and Shed, digest, inbox, areas, account and admin |
| Room data | Seed produced 12 visible sessions, 30 story messages and 7 progress areas |
| Helper export | Seeded helper included compiled `AGENTS.md` output |
| Project chat | `Where are we?` addressed to Glasshouse returned a persisted template answer without AI |

The profile-failure test deliberately logs a missing `profiles` table error through a mocked store; its passing result verifies the fallback. It is not evidence that a hosted database was contacted. The build emitted webpack cache-size warnings but completed successfully.

The page checks were server/API smoke checks, not a browser interaction or visual audit. No real coding agent was launched, no hooks were installed, and no live Supabase, Anthropic or Stripe requests were needed for this verification. The scratch preview was stopped after checking it; demo data remains ignored under `.glasshouse`.

## Setup issues found and resolved

**Different pnpm on the Codex PATH.** Bare `pnpm` selected Codex's bundled 11.19.0 and attempted an automatic dependency reinstall before running `test`; it stopped with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. The existing dependency tree identifies itself as pnpm 10.34.5. `corepack pnpm` selected that exact pinned version and used the existing installation successfully. No forced purge or lockfile regeneration was needed.

**Windows sandbox access.** Direct Node/Corepack attempts could not read installed dependency/cache files (`EPERM`). Running the required commands through the environment's approved execution mechanism succeeded. This was an environment access issue; do not diagnose it as broken project code or turn off permissions globally.

**Linux-only test assumptions.** `requests.test.ts` expected `/tmp/runs/r1.mcp.json` even though `path.join` correctly returns backslashes on Windows. `watch.test.ts` copied a fixture last modified on 5 September; Windows preserved that date, so the tailer's 36-hour freshness filter excluded it before the test reached project filtering. The tests now construct their intended conditions on either platform; application behaviour was unchanged.

## Known implementation gaps for the next relevant task

These are source findings or explicitly unverified integrations. They were recorded to make future work concrete; they were not silently broadened into a hosted-backend rewrite during this handover.

### 1. Hosted ingestion needs idempotent task updates

In `apps/web/src/lib/store/supabase.ts`, `ingest` calls `applyEvent`, gathers AI triggers and may write a report **before** `events.upsert(... ignoreDuplicates: true)` rejects duplicate event IDs. The local store checks `eventIds` before reduction. A connector retry therefore has a source-visible path to counting the same action twice and repeating derived work in hosted mode, despite only one stored event row.

Also, session/task upserts supply `started_at: e.ts` on each batch; unlike the local store's create-once rows, this can overwrite the original start timestamp. Separate requests can read and replace task state concurrently.

Next validation: against a disposable Supabase database, submit one batch twice and concurrent batches for one task. Assert one factual application per event, stable start times and correct final state/report triggers. Fix the write ordering/atomicity with that behaviour as the contract. These effects were identified from code; this handover did not run that database experiment.

### 2. Hosted Room session history differs from local mode

`SupabaseStore.getRoom` selects only sessions whose `started_at` is within 24 hours and limits them to 12. `MemoryStore.getRoom` selects the 12 most recently active sessions without that initial 24-hour cutoff. The subsequent plan gate cannot restore older sessions already omitted by the hosted query, and a long-running session that began yesterday can disappear.

Next validation: compare both stores for a session started more than a day ago but active now, a completed older session and Free/Pro viewers. Align the intended history behaviour before advertising hosted full-history parity.

### 3. Real Codex/Cursor integration needs fresh evidence

The checked-in Codex hooks, Codex rollout, Cursor and Claude usage-limit examples are synthetic. There are earlier notes of real legacy Codex log keys in `docs/hooks-codex-cursor.md`, but personal logs were deliberately not committed. A successful synthetic replay does not prove today's tool format, hook trust flow, child-agent attribution or resume arguments work.

Phase 8 records real Claude request/question/resume verification on a prior Linux environment. It explicitly does not establish the Windows, Codex or Cursor launch paths. Current unit tests simulate child processes. Next step for that feature: use a purpose-made disposable project and the installed tool's current help/documentation, record a small consented run, redact it and check the full loop. Do not read/commit unrelated private Codex conversations to make fixtures.

The Shed currently exports Codex helpers as standing instruction sections. Supporting native Codex subagents would be a separate product/export change, including attribution and after-run checks; this handover does not change that format.

### 4. Hosted operation and paid services remain unverified here

- At the original handover, Supabase migrations, Auth cookies, ownership policies, concurrent claims and Stripe callbacks were not exercised against live services. The later Glasshouse opening repair below verifies the Phase 8 update and a signed-in Room read; ownership isolation, concurrent claims and Stripe callbacks remain unverified.
- Optional AI fallbacks work without a key, but this handover did not assess the quality or availability of the configured Anthropic model, API features or price constants.
- Background AI work and the live notification bus run inside the web process. There is no durable job queue or shared cross-instance bus. The existing Supabase publication is not used by the current browser as its live transport.
- Signup uses admin-created, already-confirmed accounts. The route itself notes that a public launch needs abuse controls; older phase notes about confirmation emails do not describe the current signup flow.
- The connector remains `private: true`, and the deployment/npm publishing/tester cohort/real usage-switch experiments are separate work. Historical owner checklists may contain items Christopher has since completed outside this repository; verify rather than assume.

### 5. Smaller maintenance seams

- The browser response-handling rule is a desired standard, not yet universal. For example `Room.tsx` polling still uses `res.json()` inside a catch. It silently retries; new interactive paths should use `lib/answer.ts` so failure details stay understandable.
- `start-watch.cmd` rebuilds only if the bundle is absent. After changing connector source, rebuild explicitly before using the launcher.
- Local JSON persistence is one-process storage. Running two web servers on the same file can overwrite records; use separate `GLASSHOUSE_LOCAL_STORE` paths.
- The existing automated checks do not cover live hosted parity. Add meaningful regression coverage when fixing the relevant store issue, rather than treating compilation as integration proof.

## Glasshouse opening repair: 15 September 2026

The local development app was connected to the hosted Supabase database, where the Phase 8 update had not been installed. Opening `/glasshouse` redirected to the project's Room and reproduced Next.js 15.5.25's opaque `{code: ..., details: Null, hint: ..., message: ...}` runtime error. Direct, read-only database checks identified missing `requests` and `request_questions` tables (`PGRST205`) and the missing `projects.listening_at` column (`42703`).

After Christopher signed in to the Supabase dashboard, the existing `supabase/migrations/20260914000000_phase8.sql` was applied through its SQL editor in one transaction. The transaction also recorded version `20260914000000`, name `phase8`, and the migration SQL in `supabase_migrations.schema_migrations`, then notified PostgREST to reload its schema. No application code change was needed.

Verified against the live database and the running app:

- Both new tables have row-level security enabled and their owner-read policies installed; `projects.listening_at` and the migration record exist.
- The project count remained one before and after the repair. The update contains no deletion or rewriting of existing project/activity records.
- REST reads selecting the app's fields from `projects`, `requests`, and `request_questions` all returned HTTP 200 after failing before the update. These checks requested zero rows and did not print credentials or private records.
- The signed-in browser opened `/glasshouse`, reached the existing project's Room, and displayed its recorded story and progress without the runtime error. No browser console errors were captured.

This verifies opening the Room against the hosted store. It does not verify agent launching, question/answer round trips, ownership isolation between accounts, or the other hosted-store gaps above. No agents were launched or test requests added. Builds and unit tests were not rerun for this database-only repair and documentation update.

The CLI was neither signed in nor linked on this checkout, so it was not used to apply the update. The database's earlier migration versions/names differ from the checked-in filenames: `20260904232745 phase0_init`, `20260904232836 phase2_understanding`, `20260904232857 phase3_memory`, `20260904232910 phase4_other_people`, `20260904233035 lock_down_trigger_function`, and `20260912010335 phase6_potting_shed`. Those records were preserved. Inspect and reconcile that older history before a future CLI `db push`; do not blindly replay the earlier migrations.

## How future tasks should keep this useful

Maintain durable rules in `AGENTS.md`, commands in README, and source navigation in the codebase map. Keep dated measurements here or in a new phase finding. When a listed gap is verified/fixed, annotate it with the date and evidence so it does not remain a permanent warning. Avoid duplicating instructions into personal Codex settings or a second long `CLAUDE.md`.

`AGENTS.md` is Codex's standard project instruction file; ordinary documents such as `CLAUDE.md` can still be read as files, but are not its default project instruction filename. A fresh task/session is the reliable way to pick up changed startup guidance. [Official OpenAI instruction documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
