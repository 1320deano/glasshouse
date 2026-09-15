# Deano: project instructions

This is the canonical guidance for this repository. Read it before changing code. It applies to the entire project. `CLAUDE.md` points here so the two tools share one set of instructions.

## Working with Christopher

Christopher is non-technical. Keep replies short, simple and understandable without technical knowledge. Use everyday language, explain what the work means for the product, and replace jargon or explain it on first use. Give concise progress updates while working. Do not use a fixed opening or completion marker.

Include every detail of what changed, what was found, what was checked, anything left undone or blocked and why, and any decision or action Christopher needs to take. Keep the wording concise by removing repetition and filler, not details. Do not imply a build or automatic check proves a live integration works.

## Start here

1. Check `git status --short`; preserve existing user changes and personal settings.
2. Read [README.md](README.md) for verified setup and commands.
3. Read [docs/codebase-map.md](docs/codebase-map.md) for the relevant workflow and source files.
4. Read [docs/codex-handover.md](docs/codex-handover.md) for the dated baseline, known gaps, and documentation corrections. Recheck status before treating an old gap as current.
5. For visual changes, read [docs/design-system.md](docs/design-system.md). For Room requests, read [docs/phase-8-findings.md](docs/phase-8-findings.md); for the current Shed, read [docs/phase-7-findings.md](docs/phase-7-findings.md).

The product brief (`control-room-product-report.md`) and phased plan (`glasshouse-phased-plan.md`) explain intent and history. Later implemented phases supersede earlier descriptions. In particular, Phase 8 explicitly allows owner-requested agent runs from the Room.

## What the product is

**Deano** is the website. **Glasshouse** is its Room: a plain-English view of what coding agents are doing, the parts of the owner's app they touch, and what needs attention. **Potting Shed** grows helpers from that same project's actual history, turns their instructions into files for each coding tool, and checks their later runs against their boundaries.

The signed-in/local front door is `/`, with links to both products. Signed-out hosted visitors see the landing page there; `/landing` always shows it. `/glasshouse` and `/shed` choose a project; the actual screens are `/room/[projectId]` and `/shed/[projectId]`. Each product has a way back to Products. Brand strings live in `apps/web/src/lib/brand.ts`.

Switching the development assistant to Codex does not change the product's optional Anthropic service or remove Claude Code/Cursor support.

## Product rules

1. **Stages, never completion percentages.** Investigating, planning, building, testing, done, stuck, waiting. Counts are fine. Stuck is a computed overlay (repeated errors or prolonged inactivity), not an AI declaration.
2. **Reassurance needs evidence.** Touched/not touched, risk, checks, progress, helper verdicts, suggestions, and rehearsals come from recorded facts. A read is not a change. Never invent behaviour from a filename or let an AI claim an unobserved change.
3. **Keep the underlying action.** Every event retains `sourceEvent` and a privacy-stripped `raw` payload; technical detail must be traceable. A continuation across tools is a heuristic with its reason shown, not certainty.
4. **Observation is passive; requests are explicit.** Agent hooks always exit 0, write no stdout, and contain their own errors. They must not alter/block the observed agent. Separately, an owner's Room message can create a recorded request for a named tool; their local connector launches it. The web server never launches an agent. The question bridge waits for the owner's answer and never approves on their behalf.
5. **Owner language by default.** Explain actions and parts of the app in plain English. Paths, commands and implementation detail belong behind Details/Technical detail. Tool identities may appear where the owner needs to identify or address an agent.

## Architecture rules

- Node 20+, TypeScript, pnpm workspaces. `package.json` pins **pnpm 10.34.5**. On this Windows Codex host use `corepack pnpm ...`; bare `pnpm` may select the bundled pnpm 11 and try to reinstall dependencies. Do not force that reinstall to run a check.
- `packages/schema`: the Zod event/tree/area contracts. Keep changes compatible with stored records and connector inputs.
- `packages/translate`: pure transformations; no filesystem/network/database dependencies. Preserve injectable clocks/IDs in normalisers and deterministic fixture replay. Package imports use `.js` suffixes; Next's extension aliases resolve these to TypeScript.
- `packages/connector`: Node CLI, bundled by tsup into `dist/cli.js`. Rebuild after source changes before testing the CLI. Hooks spool one event file and attempt a flush; there is no hook daemon. `watch` is the long-running process for folder saves, Git commits, Codex rollout logs, and Room requests.
- `apps/web`: Next.js App Router, React, ordinary CSS. Browser imports use `@/` for `apps/web/src`. Keep server credentials and AI/database code on the server.
- Supabase is the selected hosted backend (Postgres/Auth/Realtime/Storage). Keep the existing local file store for laptop use. Do not add another database, auth provider or realtime service without a product reason from the task.
- `lib/store/types.ts` is the shared store interface. Implement behaviour in **both** `memory.ts` and `supabase.ts`; task reduction/view derivation belongs in `derive.ts`. Do not equate interface parity with proven database parity; see the handover's identified gaps.
- Persist task facts in `TaskState`. Compute plain lines, location, risk, touched/not touched and stuck status at read time against the current area map. User-corrected area names survive refreshes. `fullState` supports records written by older versions.
- Keep the `getStore()` hot-reload guard based on supported methods, not `instanceof`: Next development routes can have different copies of the same class. Use a separate local store per server process; two processes must not share the same JSON file.
- Reports store words; report facts are rebuilt by `translate/report.ts`. AI may raise `needsYou`, never lower the facts' requirement, and cannot introduce untouched areas. Digests follow the same pattern; AI adds an opening only.
- `lib/auth.ts` controls project/task access. Connector bearer tokens determine project identity; ignore an uploaded event's claimed project ID. `lib/plan.ts` enforces Free/Pro on the server. A failed profile write must not block sign-in; an unreadable hosted plan falls back to Free. Only billing or the admin switch changes a hosted plan.
- `lib/ai/client.ts` is the sole entry point for optional Anthropic calls and cost logging. Keep template/folder-name fallbacks when no key is present or `GLASSHOUSE_AI=off`. Calls improve meaning-level summaries, never every action. Model/pricing constants describe this implementation; verify provider documentation before changing them.
- Use `readAnswer`/`askServer` from `lib/answer.ts` for browser requests to our server. Translate invalid/empty/HTML replies into owner language. A few older polling paths still call `res.json()` inside catches; do not copy that pattern into new UI actions.
- Live updates currently use the in-process `lib/bus.ts`, `/api/live` server-sent events, and periodic browser refreshes. Supabase publication setup alone does not make that bus cross-process.

## Room and request rules

- Three desktop columns: agents, story, progress. Below 960px use Agents/Story/Progress tabs. Side widths/folds, density and section folds live in browser storage, never in project facts.
- Cards keep the order: tool/status, headline, where/why, needs-you, touched/not touched, ticker, details. Finished cards collapse; previous days sit behind Show earlier.
- The story changes when meaning changes; the ticker carries individual actions. Progress shows stages and counts. Only Waiting for you should demand the owner's attention.
- `lib/requests/*` owns the chat model. Untargeted messages go to Glasshouse. After sending to an agent, reset the target to Glasshouse. An active agent in its own window gets a copy-for-pasting path, not an injected message.
- Suggestions come from facts and fill the composer for editing; they never send themselves. Ordinary project summary/next-step/agent-status questions have template answers. General AI questions use the Ask plan gate.
- Request stages are separate from task stages. Keep the ten-minute queue expiry, atomic take, first-answer-wins, and follow-up serialisation for a session. `watch --no-requests` observes only. Agent launching is currently available on Free and Pro.
- `requests.ts` launches the tool's non-interactive CLI. Claude has an MCP question bridge (`mcp.ts`); the current Codex/Cursor adapters do not provide that bridge. Keep the per-tool explanation of the two care settings accurate. Do not silently upgrade a request from `ask` to `free`.

## Shed rules

- One card, not the Room's grid. Six kinds: Checker, Guard, Specialist, House rules, Handover notes, Something else. The owner answers ordinary questions; they need not write prompts.
- `lib/shed/build.ts` maps checkboxes to fixed sentences in `HelperBrief` and back. Changing these strings can break reopening existing helpers: preserve exact matching and the owner's free text.
- `evidence.ts`, `suggest.ts` and `rehearse.ts` use actual task facts, with task references. Rehearsal checks recent tasks; it does not run an agent or predict success.
- Store words only. Compile files at read time against the latest area map. Current targets: `.claude/agents/<slug>.md`, marked sections in `AGENTS.md`, `.cursor/rules/<slug>.mdc`.
- `glasshouse helpers` explicitly places files and reports placement. Preserve owner-written text outside the `deano:helper` sections and remove only previously managed content. Keep this repository's guidance outside helper sections.
- Derive helper runs from sub-agent events and changed paths. `verify.ts` says kept/strayed/unclear; task-wide fallback cannot accuse a particular helper. The current Codex helper export is standing instructions, not a native Codex subagent configuration.

## Visual rules

Follow the existing design system: warm ivory/white, black accent, no orange or dark mode. Progress uses the established blue family; green/red carry factual status. Geist is the UI font; Source Serif 4 is for greeting titles. Use the token scale, 8pt spacing and AA text contrast; do not dim text with opacity. CSS import order is `tokens`, `base`, `components`, `screens`, `room`, `deano`.

Reuse `Loading.tsx` (one wheel, no skeletons), `icons.tsx` (no emoji) and the official paths in `ToolLogo.tsx`. Respect reduced motion, visible keyboard focus, labels and skip links. Landing demos reuse the Room's classes and fixtures. Check affected screens at 390px and 1440px, including empty/loading/error states, after visible changes.

## Checks and local data

```text
corepack pnpm check              # behaviour checks + TypeScript + ESLint
corepack pnpm build              # all packages and production web build
corepack pnpm connector:build    # connector only
corepack pnpm exec vitest run packages/connector/src/watch.test.ts
```

Use focused checks during work and the relevant full checks before handoff. `next build` skips ESLint, so it does not replace `check`. For documentation-only changes, verify paths, examples and the diff; do not add tests that only repeat the text. Record what actually ran and any limitations.

Use scratch paths for test/demo data. `GLASSHOUSE_LOCAL_STORE` selects the web JSON file; `GLASSHOUSE_HOME` selects connector data. These are separate settings. The default web file is the owner's `~/.glasshouse/local-store.json`; never seed it as a test. `seed-demo.ts` writes through `SEED_BASE`, so check that address is the isolated local server.

`connect` changes agent settings and uploads project metadata; `watch` can execute queued owner requests; `helpers` writes instruction files. Use these when the task calls for their effects, not as harmless setup checks. Do not overwrite the user's Codex config, hooks or `notify` setting when working on registration.

Keep `.env.local`, connector tokens, raw session recordings and personal agent settings out of Git and tool output. Redact before upload; retain only permitted changed-file patches for reports/Ask. Raw fixtures can contain private text. Codex/Cursor and usage-limit synthetic fixtures are examples, not live verification.

When changing an architectural boundary, command, workflow or verified limitation, update the relevant guide in the same change. Keep this file focused on durable rules; put dated results in the handover or phase findings.
