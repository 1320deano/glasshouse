# Running the Room on your computer

Everything runs on your own machine for now. Nothing leaves it unless you add an AI key (see the end).

## Every day

1. Double-click `start-room.cmd` in the project folder. A black window opens and stays open; your browser opens
   the Room at http://localhost:3000. Put that tab on your second monitor.
2. Use Claude Code, Codex or Cursor as normal, in any folder you have connected.
3. Optional: in a second terminal run `node .../packages/connector/dist/cli.js watch`. This one process notices
   plain file saves, commits, and Codex's own logs (which is how Codex usage limits are seen). Ctrl+C stops it.
4. Closing the black window stops the Room. Everything it saw is kept and comes back next time.

## Connecting a project (once per folder)

In a terminal, inside the folder you want to watch:

```
node C:/Users/chris/Downloads/monitorappidea/packages/connector/dist/cli.js connect
```

What happens:
- The Room gets a link for that project.
- Listeners are added to Claude Code's settings (`~/.claude/settings.json`), and to Codex (`~/.codex/hooks.json`) and
  Cursor (`~/.cursor/hooks.json`) if those are installed. A backup of each file is written beside it first.
- **Codex only:** open Codex, type `/hooks` and trust the Glasshouse hooks. Until you do, Codex is followed through
  its logs by `glasshouse watch` instead, which is a little slower but complete.
- The folder is mapped: the list of file names (never their contents) is sent to the Room, which groups them into
  parts of your app with plain names ("Login", "Payments"). Open **Parts of your app** at the top of the Room to
  rename or merge them. Your names stick.

Other commands:

```
... cli.js map           send the file list again (after big changes to the project)
... cli.js watch         follow file saves, commits and Codex logs (keep it running)
... cli.js status        what is connected, whether anything is waiting to be sent
... cli.js disconnect    stop watching the current folder
... cli.js connect --tools claude-code     connect for one tool only
```

## What you are looking at

- One tile per agent session. **Headline**: what it is doing, in plain English; it changes only when the meaning changes.
  **Working in**: the part of your app, then the file, e.g. "Login → session". **Stage**: Investigating, Planning,
  Building, Testing, Waiting for you, Stuck, Done. **Risk badge**: Low, Medium or High, from facts (hover to see them).
  Bottom line: the latest action.
- "Continuing from Claude Code: …" on a tile means this agent picked up where another tool stopped.
- Codex and Cursor tiles say "standard view": they show a little less than Claude Code. The folder watcher's tile says
  "basic view": it only sees saves and commits.
- **Expand** opens the full picture: why (your instruction and the agent's plan), where in your app (with "Not changed"
  worked out from the list of files it changed), what it has changed so far, and every action newest first.
  "Show technical detail" reveals the real file names, commands and the original payload behind any line.
- Sessions with no activity for 30 minutes move to "Earlier".

## If the Room is not running

Your agents carry on as normal. The connector keeps every action in a folder (`~/.glasshouse/spool`) and
sends them all the next time the Room is up. Nothing is lost and nothing slows down.

## Where things live

| Thing | Place |
|---|---|
| Connected folders and their keys | `~/.glasshouse/projects.json` |
| Events waiting to be sent | `~/.glasshouse/spool/` |
| Where `watch` got to (last commit, Codex log positions) | `~/.glasshouse/watch-state.json` |
| Everything the Room has seen (local mode) | `~/.glasshouse/local-store.json` |
| Connector problems, if any | `~/.glasshouse/connector.log` |
| Claude Code hook settings | `~/.claude/settings.json` (backup: `settings.json.glasshouse-backup`) |
| Codex hook settings | `~/.codex/hooks.json`, and `hooks = true` under `[features]` in `~/.codex/config.toml` |
| Cursor hook settings | `~/.cursor/hooks.json` |

## Turning on AI naming (optional)

Without a key, everything works from templates and folder names. With a key, the Room also writes better headlines,
names the parts of your app properly, and describes files in plain English ("how logged-in users are identified").

Put `ANTHROPIC_API_KEY=...` in `apps/web/.env.local` and restart the Room. What is sent: file names, commands, the
kinds of actions, your prompt text, and the first lines of the README. Never file contents. Every call and its cost
in pounds is recorded; `http://localhost:3000/api/stats/<project id>` shows the running total.

## Moving to Supabase later

When the hosted Supabase project exists (`docs/supabase-setup.md`), apply both migrations, fill in `apps/web/.env.local`
and restart. The Room then stores everything in Supabase instead of the local file; nothing else changes.
