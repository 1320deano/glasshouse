# Glasshouse

A watch-only control room for AI coding agents. It shows, in plain English, what every agent
is doing right now, which part of the user's app it is touching, and why, across Claude Code,
Codex, Cursor and anything that saves to GitHub. It keeps one continuous story of the project
when the user switches tools.

Brief: `control-room-product-report.md`. Phased plan: `glasshouse-phased-plan.md`. Research: `docs/`.
Phases 0 to 4 are built; findings per phase in `docs/phase-N-findings.md`. What only Christopher can do is listed in
`docs/what-christopher-needs-to-do.md`.

## Reporting to Christopher (every finished task)

Christopher is non-technical. When a task is finished and it is time for him to read what happened,
the reply must start with this exact line on its own:

```
-- FINISHED TASK --
```

Then explain what was done in plain, non-technical language, leaving nothing out. Rules:

- Include every detail of what was built, changed, found, or left undone. Completeness matters more than brevity.
- Never assume a term is understood. Words like "tests", "typecheck", "lint", "migration", "schema", "hook",
  "API", "daemon" or "repo" must be explained in everyday terms the first time they appear, or replaced with
  a plain description. Example: "tests" are small automatic checks that prove a piece of the product still
  behaves the way it should; "typecheck" and "lint" are spell-check-style scans of the code for mistakes.
- Say what each thing means for the product, not just what it is.
- Say plainly what needs Christopher's decision or action, and what was skipped or blocked and why.
- Mid-task progress updates do not use the marker; only the final report does.

## Non-negotiables (apply to every change)

1. **Stages, never percentages.** An agent can say it is testing. It cannot say it is 68% done.
2. **Every reassuring statement is backed by a checkable fact.** "Not touched: Payments" is computed
   from the changed-files list. Never generated, never guessed.
3. **Every plain-English line links to the real action underneath.** Keep `raw` and `sourceEvent`
   on every event. The technical-detail toggle must always be able to show the truth.
4. **Watch-only.** No pause, approve, send, or control actions. Hooks and connectors never block or
   alter the agent: always exit 0, never print to stdout in a hook, swallow your own errors.
5. **Owner language.** Every word in the UI, digest and report is for someone who will never open
   the code. No file paths, tool names or jargon in the default view. Say "Looking at how logged-in
   users are identified", not "Reading auth/session.py". Code and paths live behind the toggle.

## Design rules for the Room

- Readable from two metres. Glanced at, not leaned into.
- Two speeds: the headline changes only when the *meaning* changes; the ticker carries every action.
- Tile order is fixed: header, headline, location, stage, risk badge, ticker.
- "Stuck" is detected (same error three times, nothing for minutes), never declared.
- "Waiting for you" is the one badge allowed to light up.

## Stack

- pnpm monorepo, TypeScript everywhere. Node 20+.
- `apps/web`: Next.js (App Router). The Room, reports, digest, inbox, settings, ingest API.
- `packages/connector`: the `glasshouse` CLI. Registers hooks, spools events to disk, uploads. No daemon.
- `packages/schema`: the one normalised event model (Zod). Every agent maps into it.
- `packages/translate`: pure functions only, no I/O. Templates, stage machine, stuck detection.
- `fixtures/`: recorded real hook payloads. Tests replay them.
- **Supabase for all backend needs**: Postgres, Auth, Realtime, Storage. Migrations in `supabase/migrations`.
  Do not introduce other databases, auth providers or realtime layers.
- Store layer in `apps/web/src/lib/store`: `MemoryStore` (local file) or `SupabaseStore`, chosen by env. Same behaviour; task/stage derivation lives in `derive.ts` and is shared.
- The connector has no daemon for hooks: each hook spools one event file and flushes the spool. See `docs/phase-1-findings.md`.
  `glasshouse watch` is the one long-running process, only for sources without hooks (folder saves, git, Codex logs).
- Plain-English lines, location, risk and "not touched" are computed at read time from the current area map
  (`derive.ts`), never stored, so a renamed area is right everywhere at once. Task facts live in one `state` object.
- Report cards store words only (headline, before/after, the AI's reasons, needs-you and its question). Touched, not
  touched, evidence and risk are recomputed on read (`packages/translate/src/report.ts`). The AI may raise "needs you",
  never lower it, and may not name a part the changed-files list does not. The digest is built the same way
  (`digest.ts`); the AI only adds an opening summary.
- Claude API for the expensive calls only: headline on meaning change, area map, file descriptions, one report card
  per finished task, one digest opening per window while the facts change, and Ask. All through
  `apps/web/src/lib/ai/client.ts`, which logs every call to `ai_calls`.
  Without `ANTHROPIC_API_KEY` everything must still work from templates and folder names.
- Codex and Cursor normalisers were written from documented shapes; their fixtures are `-synthetic`. Replace them
  with real recordings before trusting a field name. See `docs/phase-2-findings.md`.
- The design system is `apps/web/src/styles/{tokens,base,components,screens}.css`, in that order, imported by
  `globals.css`. One accent colour, status colour only where it carries a fact, an 8pt grid, AA contrast
  everywhere, motion only to say "this arrived" or "this opened". Rules and the QA loop: `docs/design-system.md`.
- People and plans (Phase 4): local mode has one implicit person ("local") and no sign-in. Hosted mode uses Supabase
  Auth; `apps/web/src/lib/auth.ts` decides who may read what, `lib/plan.ts` is the one Free/Pro rule (applied on the
  server, never in the browser), and only the Stripe webhook or the admin switch may change a plan. The product name
  lives in `lib/brand.ts`.

## Commands

```
pnpm install
pnpm test          # vitest across packages
pnpm typecheck
pnpm lint
pnpm dev           # web app, development
pnpm room          # web app, production build + start (or double-click start-room.cmd)
pnpm connector:build                          # bundle the connector to packages/connector/dist/cli.js
node packages/connector/dist/cli.js connect   # link the current folder, register hooks (Claude Code, Codex, Cursor), send the file map
node packages/connector/dist/cli.js map       # resend the file map
node packages/connector/dist/cli.js watch     # follow saves, commits and Codex logs (long-running)
node packages/connector/dist/cli.js status

pnpm tsx scripts/seed-demo.ts              # fill a local Room with every state, for looking at the design
node scripts/design-screenshots.mjs out/   # every screen at 390px and 1440px + a WCAG AA contrast audit
```

## Cost and privacy

- Template translation costs nothing. AI calls are per task, not per action.
- Always sent: event kind, paths, commands, tool names, timestamps, prompt text.
- Sent only for the report card and the Ask box: the diff of files changed in that task (rebuilt from the patches on
  Claude Code edit events; never for secret files).
- Never sent: other file contents, secrets. The connector redacts before upload.
