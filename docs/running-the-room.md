# Running the Room on your computer

Everything runs on your own machine for now. Nothing leaves it.

## Every day

1. Double-click `start-room.cmd` in the project folder. A black window opens and stays open; your browser opens
   the Room at http://localhost:3000. Put that tab on your second monitor.
2. Use Claude Code as normal, in any folder you have connected.
3. Closing the black window stops the Room. Everything it saw is kept and comes back next time.

## Connecting a project (once per folder)

In a terminal, inside the folder you want to watch:

```
node C:/Users/chris/Downloads/monitorappidea/packages/connector/dist/cli.js connect
```

You get a link to that project's Room. The connector adds its listeners to Claude Code's settings
(`~/.claude/settings.json`; a backup is written beside it first). Claude Code picks them up immediately,
even in sessions that are already running.

Other commands:

```
... cli.js status        what is connected, whether anything is waiting to be sent
... cli.js disconnect    stop watching the current folder
```

## What you are looking at

- One tile per Claude Code session. **Headline**: what it is doing. **Working in**: the last file it touched.
  **Stage**: Investigating, Planning, Building, Testing, Waiting for you, Done. Bottom line: the latest action.
- "Show technical detail" opens the full list of actions with file names and how many milliseconds each took
  to reach the screen.
- Sessions with no activity for 30 minutes move to "Earlier".

## If the Room is not running

Claude Code carries on as normal. The connector keeps every action in a folder (`~/.glasshouse/spool`) and
sends them all the next time the Room is up. Nothing is lost and nothing slows down.

## Where things live

| Thing | Place |
|---|---|
| Connected folders and their keys | `~/.glasshouse/projects.json` |
| Events waiting to be sent | `~/.glasshouse/spool/` |
| Everything the Room has seen (local mode) | `~/.glasshouse/local-store.json` |
| Connector problems, if any | `~/.glasshouse/connector.log` |
| Claude Code hook settings | `~/.claude/settings.json` (backup: `settings.json.glasshouse-backup`) |

## Moving to Supabase later

When the hosted Supabase project exists (`docs/supabase-setup.md`), fill in `apps/web/.env.local` and restart.
The Room then stores everything in Supabase instead of the local file; nothing else changes.
