# Glasshouse — Phased Build Plan

## Context

The brief (`control-room-product-report.md`) describes a watch-only, agent-neutral "control room": a browser tab on the second monitor that narrates in plain English what each AI coding agent is doing, which part of the user's app it is touching, and why, and that keeps one continuous story of the project across Claude Code, Codex, Cursor and GitHub. First user is Christopher. The pain is latent ("trust it and move on"), so the product must be zero-effort and ambient, and it must prove itself in the first session.

This plan turns the brief into phases we can execute one at a time. Each phase has a goal, what gets built, and the exit test from the brief that decides whether we move on. When we start a phase, we write a detailed implementation plan for that phase alone; this document is the map, not the turn-by-turn directions.

Decisions already made:
- **Name:** Glasshouse as the working codename only. The Phase 0 check (`docs/name-check.md`) found it crowded (glasshouse.sh, Provn-Inc/glasshouse) and Lookout unusable. Final name is a Phase 4 decision before anything goes public.
- **Stack:** TypeScript everywhere. Next.js web app, Node connector installed with one `npx` command, Supabase (Postgres + Realtime + Auth), Claude API for the expensive AI calls.
- **Order:** working private prototype first, landing page in Phase 4. The day-7 "do I keep the tab open" test comes before any demand test.

Non-negotiables carried from the brief (apply to every phase):
1. Stages, never percentages.
2. Every reassuring statement is backed by a checkable fact (e.g. "Not touched" is derived from the changed-files list, never guessed).
3. Every plain-English line links to the real action underneath.
4. Watch-only. No control actions in v1.
5. Owner language everywhere: copy is written for someone who will never open the code.

---

## Architecture (fixed in Phase 0, reused by every phase)

```
Claude Code / Codex / Cursor hooks ─┐
Folder watcher + git ───────────────┼─▶ Connector daemon (local, Node) ─▶ Ingest API (Next.js route)
                                    │        buffers offline, redacts,          │
                                    │        normalises to one event schema     ▼
                                    │                                     Supabase Postgres
                                    │                                       │        │
                                    │                             Realtime  │        │ workers (translate, headline,
                                    │                                       ▼        ▼  report, digest, area map)
                                    └──────────────────────────────  The Room (Next.js, browser tab)
```

Monorepo (pnpm workspaces):
- `apps/web` — Next.js app: the Room, expanded view, reports, digest, inbox, settings; API routes for ingest and AI workers.
- `packages/connector` — the `glasshouse` CLI + daemon. `npx glasshouse connect` registers hooks for each installed agent, starts the daemon, links the project.
- `packages/schema` — the normalised event model shared by connector and web (Zod). One schema regardless of source agent.
- `packages/translate` — pure functions: template translation for the ~10 common action kinds, stage state machine, stuck/waiting detection. No I/O, fully unit-testable.
- `fixtures/` — recorded real hook payloads from each agent, used to replay sessions in tests and in the UI during development.

Core data model (Postgres):
- `projects` → `areas` (the area map: name, plain-English description, path prefixes/globs, user corrections) → `agents_sessions` → `tasks` (prompt → stop) → `events` (normalised, with `raw` payload kept for the technical-detail toggle) → `reports` (one per finished task) → `digests`.
- `tasks.continued_from` links a task in one tool to the task it picked up from another tool. This is the continuity feature as data.

Privacy model (decide and document in Phase 0):
- Always sent: event kind, file paths, commands, tool names, timestamps, prompt text.
- Sent only for the report card: the diff of changed files for that task (not the whole repo). Retained only as long as needed to generate the report unless technical detail is on.
- Never sent: file contents outside the diff, secrets (connector redacts `.env`-style values and known token patterns before upload).

Cost model:
- Template translation: zero AI calls.
- AI calls per task: headline (only on meaning change, debounced), "why" (once per prompt), report card (once per Stop), plus per-project digest per interval. Target well under £5/month per active Pro user; instrument from Phase 1 so we know the real number.

---

## Phase 0 — Foundations

**Goal:** a repo we can build in fast, and answers to the questions that would otherwise force rework later.

Build:
- Monorepo scaffold with the four packages above, lint/test/typecheck wired, Supabase project with the core tables and Realtime enabled.
- The normalised event schema in `packages/schema`. Kinds: `session_start`, `prompt`, `read`, `search`, `edit`, `command`, `test_run`, `install`, `subagent_start/stop`, `permission_wait`, `error`, `commit`, `stop`, `usage_limit`, `unknown`.
- Hook research spike (use the claude-code-guide agent): enumerate current Claude Code, Codex and Cursor hook events and payload shapes; record real payloads into `fixtures/`. Specifically find out how a usage-limit stop surfaces in Claude Code, because the credit-switch feature depends on it.
- Name check: domain and trademark availability for Glasshouse; record the outcome and fallback (Lookout).
- Write `CLAUDE.md` with the non-negotiables and owner-language rules so every future agent session follows them.

Exit: schema and fixtures exist, one real Claude Code session has been recorded end to end.

**Phase 0 outcome (3 September 2026): done.** Monorepo, schema, translate classifier, connector recorder, Supabase migration
and CLI, CLAUDE.md, 16 passing tests. One headless Claude Code session recorded and committed as a fixture. Findings in
`docs/phase-0-findings.md`, `docs/hooks-claude-code.md`, `docs/hooks-codex-cursor.md`, `docs/name-check.md`.
Three things Phase 0 changed:
- Usage limit in Claude Code surfaces as a `StopFailure` hook with a `rate_limit` matcher, not as Stop. The connector listens for it.
- Task boundaries are free: every Claude Code hook carries `prompt_id`. Edits carry a structured patch, so report cards need no git.
- For Codex, the rollout JSONL in `~/.codex/sessions` is the richer source (reasoning, token counts, rate limits) and needs no trust step. Build that tailer before the Codex hooks.
Still needed from Christopher: create the hosted Supabase project and link it (`docs/supabase-setup.md`).

---

## Phase 1 — The first tile

**Goal:** Claude Code events flowing live from Christopher's machine into one tile on the second monitor. Ugly is fine.

Build:
- `packages/connector`: hook registration for Claude Code (writes hook entries pointing at `glasshouse hook <event>`), local daemon on localhost that receives hook payloads, normalises them, buffers to disk when offline, and posts batches to the ingest API with a project token.
- Ingest API route: validate against schema, insert events, upsert session/task.
- The Room, minimal: one tile per active session showing header (agent + tool), headline (raw last action for now), location (raw file path), ticker (last event). Realtime subscription so it updates without refresh.
- Cost and latency instrumentation from day one: events per task, ms from hook to tile.

Exit test (the one that matters): Christopher leaves the tab open on the second monitor for a week without being reminded. Record actual days open.

**Phase 1 outcome (3 September 2026): built and running.** Connector (`glasshouse connect` / `hook`), spool with offline
retry, ingest API, local file-backed store plus an unverified Supabase store, the Room page with one tile per session
and a technical-detail toggle, live updates over server-sent events, latency stats. 38 tests. Measured hook-to-screen
delay about 50 ms. Design deviations and quirks in `docs/phase-1-findings.md`; daily use in `docs/running-the-room.md`.
The week-long tab test starts now.

---

## Phase 2 — Understanding

**Goal:** the tile speaks owner language and knows the app; the other tools show up; switching tools reads as one story.

Build:
- **Area map as data.** On connect, the connector sends the file tree (paths only, plus manifest heads such as `package.json`/`README`). One AI call groups files into product areas with plain-English names and one-line descriptions. Stored as path prefixes. Settings screen to rename and merge areas; corrections persist and win over refreshes. Refresh runs when the tree changes materially.
- **Template translator** (`packages/translate`): the ~10 action kinds rendered from templates using area names as nouns ("Looking at how logged-in users are identified"). Per-file descriptions generated lazily and cached so the template has a specific noun. Every translated line keeps a pointer to its raw event.
- **Stage state machine**: Investigating (reads/searches only) → Planning (plan mode, todo writes) → Building (edits) → Testing (test commands) → Done (stop). Stuck is detected: same error three times, or no events for N minutes. Waiting for you: permission or idle-prompt notification. "Waiting for you" is the badge that lights up.
- **Headline with two speeds**: the ticker carries every action; the headline is regenerated by AI only on a meaning-change trigger (new prompt, stage change, area change, first edit after a run of reads, error). Debounced so a task rarely costs more than a handful of headline calls.
- **Risk badge** (Low/Medium/High) from facts: areas touched (auth, payments, config flagged high), dependency installs, secrets/config files, number of files changed.
- **Expanded view**: live stream (newest first), Why (prompt + agent plan if exposed), Where (areas touched, files behind them), What it's changed so far (behaviour-first lines), and the technical-detail toggle that reveals the raw action for any line.
- **Codex and Cursor connectors** at standard depth, sharing the same daemon and schema, with a "standard view" label on their tiles. Stage inferred from tool kinds rather than announced. Codex: rollout tailer first (`~/.codex/sessions`), hooks second, and onboarding must include the `/hooks` trust step. Cursor: check whether it picks up the Claude Code hooks file before registering separately. Record a real session of each before writing its normaliser.
- **Folder/GitHub watcher** as the basic fallback: file changes and commits become `edit` and `commit` events with location and a slower ticker.
- **Continuity**: when a task ends with `usage_limit` (or is stopped) and a new session in another tool starts in the same areas within a window, link `continued_from` and show "Continuing: <task>" on the new tile.

Exit test: switch from Claude Code to Codex mid-task; the Room shows it as one continuous story.

**Phase 2 outcome (4 September 2026): built.** Area map (heuristic at once, AI in the background, rename/merge with
corrections that survive refreshes), template translator with per-file nouns, stage machine with stuck and waiting,
two-speed headline, risk badge from facts, expanded view with "Not changed" computed from the changed-files list,
Codex (hooks and rollout tailer) and Cursor normalisers, folder/git watcher, continuity across tools, and every AI
call logged with its cost. 121 tests. Findings, measurements and the honest gaps in `docs/phase-2-findings.md`.
Three things Phase 2 changed:
- Plain-English lines are computed when read, against the current area map, so a renamed area is right everywhere.
- The Room never waits for AI: folder names give a usable map in milliseconds and the AI upgrades it afterwards.
- `glasshouse watch` is the one long-running process, and only for sources with no hooks (folder, git, Codex logs).
Still needed from Christopher: record one real Codex and one real Cursor session (the normalisers are written from
docs), add an `ANTHROPIC_API_KEY` to see AI naming, and the Supabase project from Phase 0.
The exit test is proven with fixtures; the live version is the next real credit switch.

---

## Phase 3 — Memory

**Goal:** the reasons to stay: reports, the digest, the inbox, and the Ask box.

Build:
- **Report card on task finish**: one strong AI call over the task's events plus the diff of changed files. Fields per the brief: headline, before/after, touched (with reasons), **not touched** (computed from changed-files list against the area map, never from the AI), evidence (tests run and results, new dependencies, config/secrets touched yes/no), risk with one-line reason, needs-you status with the specific question. Tile turns into the card on completion; card is saved.
- **"Since you last checked"** and the **daily digest**: done / still going / needs you / new in your app / tools used (including "continued in Codex after credits ran out"). In-app first; email delivery in Phase 5.
- **Needs-you inbox**: everything flagged Review recommended / Decision needed / Blocked, in one list, cleared by the user.
- **Ask box** scoped to a task or report: answers grounded in that task's events, diff and the area map.
- **Translation feedback**: thumbs-down on any plain-English line, stored with the raw event so the worst translations can be reviewed weekly.

Exit test: the first report card shows Christopher something he would have missed.

**Phase 3 outcome (4 September 2026): built.** Report card written from the record the moment a task ends (the tile
turns into it), with "Not touched" computed from the changed-files list and the AI only ever improving the words; the
diff behind the card rebuilt from Claude Code's own edit patches; "Since you last checked", Today and This week digests
with a cached AI opening; the needs-you inbox with clear and put back; the Ask box that cites the actions it rests on;
thumbs-down on any line with a review page. 151 tests. Findings and the honest gaps in `docs/phase-3-findings.md`.
Three things Phase 3 changed:
- Cards store words, never facts: touched, not touched, evidence and risk are recomputed on read against the current map.
- "Needs you" has a fact-based floor (usage limit, unresolved error, a question in the closing words, failing checks, high risk) the AI may raise but never lower.
- "Since you last checked" is anchored to opening the digest page, not to the Room tab being open.
Still needed from Christopher: an `ANTHROPIC_API_KEY` to see AI-written cards and digest openings, and the exit test on a real finished task.

---

## Phase 4 — Other people

**Goal:** ten semi-technical builders using it for five days, and a way to pay.

Build:
- Auth (Supabase), multi-project, project tokens, connector onboarding flow that produces the "I'd have missed that" moment fast (first-session walkthrough that highlights the first high-risk or cross-area change).
- **Free/Pro gating**: Free = 1 project, 1 agent at a time, live room, 24 hours of history, no digest. Pro (£15–20) = unlimited, full history, digests, inbox, Ask. Stripe checkout and the upgrade triggers in the brief's order (second project → history → digest → inbox).
- **Name decision** first: commit to Glasshouse (backorder `useglasshouse.com`, take `getglasshouse` handles) or pick a fresh name and rerun `docs/name-check.md`.
- **Landing page** with the two-monitor story, a live mock tile driven by fixtures, "works with Claude Code, Codex, Cursor and anything on GitHub" as the first line, price shown, sign-up. Measure sign-up rate (target 5% of visitors).
- Tester cohort: recruit 10, watch them for five days, capture what breaks. Fix the three worst things.
- Decide the launch date and write the 30-second demo script (brief section 15), with the credit-switch moment at second 18.

Exit test: 7 of 10 testers still have the tab open on day five; 3 or more say "I'd pay".

**Phase 4 outcome (4 September 2026): built, not yet hosted.** Sign-in with magic links, projects per person, the
one-command onboarding with a link code, the first-session walkthrough that names the first change the owner would
have missed, Free and Pro gating as one pure rule, Stripe checkout and webhook, the landing page with a live tile
replayed from the recordings, sign-up rate metrics, and the tester dashboard (invites, day-five count, "what broke",
manual Pro, AI cost per person). 162 tests. Findings in `docs/phase-4-findings.md`; the name decision in
`docs/name-decision.md`; the demo in `docs/demo-script.md`; the test protocol in `docs/tester-cohort.md`.
Three things Phase 4 changed:
- Local mode is untouched: sign-in, plans and billing only exist when Supabase keys are present.
- The Stripe webhook (and the admin switch) are the only code that can change a plan.
- The landing page's demo is the real store replaying the real recordings, so it can never drift from the product.
Still needed from Christopher: everything in `docs/what-christopher-needs-to-do.md` (hosted Supabase, a deployment,
the name, Stripe, npm, ten testers). The exit test runs once those exist.

---

## Phase 5 — Launch and hardening

- Product Hunt launch with the split-screen demo video.
- Email digests every morning.
- Weekly review of thumbs-down translations; keep the rate under ~5%.
- Cost dashboard: AI spend per active Pro user, alert if it trends above £5.
- Reliability: connector auto-update, reconnect, offline buffer replay; support for "my Codex tile is blank" cases with folder-watch fallback.
- Targets: 10 paying users by end of month 2; 5%+ free-to-Pro conversion by month 3.

---

## Later versions (not planned in detail yet)

| Version | Adds | Trigger to start |
|---|---|---|
| v2 | Visual area map with agents drawn inside areas; "explain this part of my app"; Studio tier with shareable read-only views and branded digests; desktop app | Paying users exist and ask for sharing, or the map demo is needed for marketing |
| v3 | Parallel agents: overlap warnings, downstream impact; Team tier per seat; optional control actions if users ask | 40% of Pro users on 2+ tools and users running agents in parallel |
| Seatbelt link | Seatbelt findings feed the risk badge | Both products live for a year |

---

## Risks to watch (from the brief's pre-mortem)

| Risk | Early sign | What the plan does about it |
|---|---|---|
| Labs ship "good enough" for their own agent | Active users mostly single-tool | Continuity and neutrality are in Phase 2, not deferred; landing page leads with multi-tool |
| Loved but unpaid | Free→Pro under 3% | Free tier is a taster (24h history, no digest) from Phase 4 |
| Flaky feed across tools | "My Codex tile is blank" tickets | Claude Code deep first; standard-view label; folder-watch fallback |
| Wrong translations burn someone | Thumbs-down above 5% | Raw action one click away; feedback loop in Phase 3; weekly review in Phase 5 |
| Spread across three startups | Weeks without commits | Phase exit tests are short and dated; each phase ends with one checkable test |

---

## Verification

Per phase, the exit test above is the gate. Technically:
- `packages/translate` and the stage machine: unit tests over recorded fixtures (a fixture session must produce a deterministic sequence of tile states, headlines and stages).
- Connector: integration test that replays fixture hook payloads through the daemon to a local ingest API and asserts the stored events match the schema.
- End to end: run Claude Code in a small sample repo with the connector installed, confirm the tile updates live in the browser (use the Chrome tools to screenshot), then trigger a Stop and confirm a report card appears with a correct "Not touched" list.
- Cost: every AI call logged with task id and token count; a report per task shows call count and cost.

## Immediate next step

Start Phase 0: scaffold the monorepo, write the event schema, run the hook research spike, and record the first real Claude Code session into fixtures.
