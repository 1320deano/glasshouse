# Deano

Deano helps a project owner understand and direct work done by coding agents.

- **Glasshouse** shows agents, a shared project story, progress, task reports and things that need the owner. Its chat can answer questions about the record or ask an agent to work through a connector running on the owner's computer.
- **Potting Shed** turns lessons from that project history into helpers, exports their instructions for Claude Code, Codex and Cursor, and checks where their runs made changes.

## Project guides

| Guide | Use it for |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Instructions for coding agents: product rules, boundaries, working with Christopher |
| [Codebase map](docs/codebase-map.md) | Architecture, workflows, source navigation, tests |
| [Codex handover](docs/codex-handover.md) | Verified baseline, migration notes, known gaps and next investigations |
| [Running the Room](docs/running-the-room.md) | Everyday use and connecting a real project |
| [Design system](docs/design-system.md) | Appearance, interaction and visual checks |
| [Supabase setup](docs/supabase-setup.md) | Hosted database and sign-in setup |
| [Owner actions](docs/what-christopher-needs-to-do.md) | Earlier launch/account decisions; check the dated handover for context |

## Requirements

- Node.js 20 or newer. The Windows handover was checked with Node 24.16.0.
- pnpm **10.34.5**, pinned in `package.json`.
- Git (also used by the connector's automatic checks).
- Supabase, an Anthropic key and Stripe are optional for local development.

This Windows Codex environment exposes pnpm 11 through its fallback command. Use Corepack to select the pinned project version:

```powershell
node --version
corepack pnpm --version
corepack pnpm install --frozen-lockfile
corepack pnpm check
corepack pnpm dev
```

The version command should print `10.34.5`. Installation is for a fresh checkout or changed dependencies; skip it when the existing installation is usable. If Corepack is unavailable, install/use the exact pinned pnpm version and run the equivalent `pnpm` commands.

If a bare `pnpm test` tries to reinstall packages or reports `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`, check the selected pnpm version first. Do not force a dependency purge to run tests. A Windows sandbox `EPERM` reading an installed dependency is a permission problem, not a test failure; use the available approval mechanism for that check.

## Starting the app

`corepack pnpm dev` starts the development server, normally at [localhost:3000](http://localhost:3000). For everyday use, `corepack pnpm room` builds the latest web code and starts it. `start-room.cmd` is the Windows double-click launcher; both Windows launchers use Corepack to select the project's pinned pnpm.

For a fresh local setup, no settings file is required. Without the Supabase URL and service-role key, the app uses a local JSON file and an implicit local owner. Local mode defaults to Pro; `GLASSHOUSE_PLAN=free` previews the Free tier.

For configured services, copy `apps/web/.env.example` to `apps/web/.env.local` **only if the latter does not already exist**, then fill in the settings you need. The template explains each setting. Restart after changing server environment settings. Public `NEXT_PUBLIC_*` values are included in builds, so rebuild production output when changing them.

The app's Anthropic key is separate from the coding assistant you use. Codex can develop this project while the app continues using Anthropic for optional summaries.

## Commands

Run from the repository root. `corepack pnpm` below can be replaced with `pnpm` when the latter already selects 10.34.5.

| Command | Purpose |
| --- | --- |
| `corepack pnpm check` | Run all existing behaviour checks, TypeScript checks and ESLint in order; stop on failure |
| `corepack pnpm test` | Run the Vitest suite |
| `corepack pnpm test:watch` | Rerun checks as files change |
| `corepack pnpm typecheck` | Check TypeScript across all four packages |
| `corepack pnpm lint` | Scan the current source for code-quality errors |
| `corepack pnpm build` | Check shared packages, bundle the connector, build the production web app |
| `corepack pnpm dev` | Web development server |
| `corepack pnpm room` | Production web build followed by server start |
| `corepack pnpm connector:build` | Rebuild `packages/connector/dist/cli.js` |
| `corepack pnpm exec vitest run packages/connector/src/watch.test.ts` | Run one check file |
| `corepack pnpm dev:account` | Create/update the hosted test account; this writes account/settings data, see the everyday-use guide |

The web build deliberately skips ESLint. Run `check` as well as `build` when verifying code changes.

## Connecting a real project

Build the connector first. Start the Room, then run the built CLI from **the folder you want to observe**. For this repository itself:

```powershell
corepack pnpm connector:build
node packages/connector/dist/cli.js connect
node packages/connector/dist/cli.js status
node packages/connector/dist/cli.js watch
```

For a different folder, use the absolute path to this checkout's built `cli.js`. Hosted connections use the command with a one-time code shown on `/connect`.

`connect` registers listeners and uploads the file map. `watch` follows saves, Git commits and Codex logs; it also takes requests sent from the Room. `watch --no-requests` follows activity without taking requests. `start-watch.cmd` is the Windows launcher; it only builds when the bundle is missing, so rebuild after connector source changes.

`node packages/connector/dist/cli.js helpers` places helpers grown in the Shed into the current linked project. For Codex it merges marked sections into `AGENTS.md`, preserving the existing project guidance around them.

The connector package is private in this checkout. Use the built CLI; do not assume the example `npx glasshouse` command on a page refers to a published version of this project.

## Isolated local preview and demo data

Use this when inspecting the app without adding demo records to your everyday Room. Run in a **separate PowerShell terminal** from the repository root:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL=''
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY=''
$env:SUPABASE_SERVICE_ROLE_KEY=''
$env:GLASSHOUSE_AI='off'
$env:GLASSHOUSE_LOCAL_STORE=Join-Path (Get-Location) '.glasshouse/codex-preview.json'
corepack pnpm --filter @glasshouse/web dev --hostname 127.0.0.1 --port 3100
```

The three blank Supabase values keep this process in local mode even if `.env.local` configures hosting. The environment changes apply to that terminal and its child processes; close it when finished. Do not run a second web process against the same JSON file or a development server and production build against the same `.next` output at once.

In another terminal, seed only that isolated address:

```powershell
$env:SEED_BASE='http://127.0.0.1:3100'
corepack pnpm exec tsx scripts/seed-demo.ts
```

The seed creates example projects and replays recorded/synthetic activity. It writes through the server; setting a file path in the seed terminal alone does not isolate anything. Open [the preview](http://127.0.0.1:3100) and use its product picker. Do not start a real connector watcher just to inspect demo data.

For visual changes, the existing design audit takes phone/desktop screenshots and checks text contrast:

```powershell
$env:SHOT_BASE='http://127.0.0.1:3100'
node scripts/design-screenshots.mjs .glasshouse/shots
```

It uses `playwright-core` and needs a compatible Chromium installation. Set `CHROME` to its executable if the script's default path is wrong. See the script and [design system](docs/design-system.md) for its coverage; browser-tool restrictions of your agent environment still apply. No UI redesign was part of the Codex handover.

## Where state lives

| State | Default / setting |
| --- | --- |
| Web app local record | `~/.glasshouse/local-store.json`; override with `GLASSHOUSE_LOCAL_STORE` |
| Connector links/tokens, spool, logs, watcher offsets, helper placement tracking | `~/.glasshouse/`; override with `GLASSHOUSE_HOME` |
| Codex logs read by the connector | `~/.codex/sessions/`; honours the existing `CODEX_HOME` |
| Hosted data | Supabase; six checked-in SQL migrations, in filename order |
| Browser layout preferences | `glasshouse.room.*` in browser storage |

`GLASSHOUSE_HOME` does not relocate the web store. Keep secrets, private recordings and local state out of commits. The local JSON store is for one web process; hosted behaviour needs verification against Supabase.

## Working with Codex

Open this repository as the Codex project. `AGENTS.md` is the standard project instruction file Codex discovers; start a new task/session after instruction changes if an existing session still reflects old guidance. The codebase map and handover are linked from it for targeted reading. [Official instruction discovery documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

There is no required custom Codex model setting, plugin or global permission change. Keep product changes and new findings reflected in the linked guides so the next task has an accurate starting point.
