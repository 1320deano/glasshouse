# Running the Room on your computer

Everything runs on your own machine for now. Nothing leaves it unless you add an AI key (see the end).

## Every day

1. Double-click `start-room.cmd` in the project folder. A black window opens and stays open; your browser opens
   the Room at http://localhost:3000. Put that tab on your second monitor.
   The window spends a few seconds saying "Getting Deano ready" first. That step rebuilds the Room from the
   current code every time it starts, so after an update you are never shown yesterday's version of the product
   by mistake. If your browser opens before the Room is up, wait a moment and reload the page.
2. Use Claude Code, Codex or Cursor as normal, in any folder you have connected.
3. Double-click `start-watch.cmd` too (or, in a second terminal, run `node .../packages/connector/dist/cli.js watch`).
   This one process notices plain file saves, commits, and Codex's own logs (which is how Codex usage limits are
   seen), and it is what lets you start and talk to agents from the Room's chat: it asks the Room every few seconds
   whether you have asked for anything, and starts it here. Ctrl+C, or closing its window, stops it; the Room then
   says "Your computer is not listening" next to the box, and anything you send waits (ten minutes at most) instead
   of running.
4. Closing the black window stops the Room. Everything it saw is kept and comes back next time.

## Asking for things from the Room (the chat)

The story in the middle of Glasshouse is also the project's group chat. The box at the bottom is yours.

- **With no one named, it is a question to Glasshouse**, answered from the record on the spot. "Where are we?",
  "What should we do next?" and "How is each agent getting on?" need no AI key. Anything else needs one, and the
  answer says so if there is none.
- **Type `@` to name someone.** The list shows Glasshouse, every agent in the Room today (working, or finished and
  able to pick up where it left off), and "New Claude Code", "New Codex", "New Cursor". Pick one, say what you want,
  press Enter. The line shows as yours with a pill that follows it: Sent, Starting, Started, Finished, or what went
  wrong in plain words. The agent's card appears on the left as soon as it starts, exactly as if you had started it
  in a terminal. "Talk to it" on any card names that agent in the box.
- **The To box goes back to Glasshouse after each message to an agent**, so the next thing you type is a question,
  not a new run. Name the agent again for a follow-up.
- **An agent working in its own window cannot be reached from here.** The box says so, and Send copies your words
  for you to paste into that window instead.
- **Ready-made lines** sit under the box: "Unstick it", "Fix the failing checks", "Answer its question", "Pick it up
  with Codex", "Check it over", "Carry on from here", "Write checks for it", "Run <helper>". Each is computed from
  what the record shows for a task and says so when you hover. Tap one and it fills the box; change the words if you
  like, then send.
- **"Asks before commands" / "Runs commands freely"** is how freely the agent may act. With the first, Claude Code may
  change files, and anything else (a command, an install) is put to you in the Room, on the card and in the story,
  with Allow and Don't allow; it waits up to thirty minutes for your tap. Its own multiple-choice questions come the
  same way, with the options as buttons. Codex and Cursor cannot ask you from a run: Codex works inside its sandbox
  and Cursor only runs commands it is already allowed to. With the second setting, none of the three waits for you.
- **When it finishes, its closing words appear in the chat as its own message**, under its maker's mark, and the report
  card follows as usual. Tick "Technical detail" to see the real command that was run under any line.
- To refuse requests on this computer altogether, start the watcher with `--no-requests`.

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
- **When a task finishes, its tile turns into a report card**: what changed and why, **Not touched** (worked out from the
  list of files it changed), the evidence (checks run, new tools added, settings or secrets touched), the risk, and
  **Needs you** (nothing, review recommended, decision needed, or blocked, with the specific question). "Open the report"
  shows the full card, the stream and an **Ask** box for questions about that task; every answer says which actions it is
  based on. Without an AI key the card is written from the record alone and Ask says so.
- **Since you last checked** (top of the Room) opens the digest: what finished, what is still going, what needs you, what
  is new in your app, and which tools did what, since you last opened that page (or today, or this week).
- **Needs you** (top of the Room, lights up amber) is the inbox: every finished task flagged for review, a decision or
  blocked, in one list. Clear each one once you have dealt with it.
- A 👎 next to any line in an expanded tile records that the description was wrong or unclear. `/room/<id>/feedback`
  lists them with the real action behind each, for the weekly review.

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
names the parts of your app properly, describes files in plain English ("how logged-in users are identified"), writes
the words on each report card (including a before/after line), opens the digest with a short summary, and answers
questions in the Ask box. The facts on a card (touched, not touched, evidence, risk) never come from the AI.

Put `ANTHROPIC_API_KEY=...` in `apps/web/.env.local` and restart the Room. What is sent: file names, commands, the
kinds of actions, your prompt text, and the first lines of the README. Never file contents. Every call and its cost
in pounds is recorded; `http://localhost:3000/api/stats/<project id>` shows the running total. For a report card the
diff of the files that task changed is also sent, once, and only for that card and for Ask; never for other files.

## Signing in while you test (the test account)

Once the Room is using Supabase, it asks you to sign in with an email and a password. Making an account takes one
press of a button and sends no email. For testing there is a ready-made account, so you need not invent one:

```
pnpm dev:account          make it (or repair it), on the Pro plan
pnpm dev:account --free   move the same account to Free, to see the upgrade gates
```

Then either open `http://localhost:3000/api/auth/dev`, or go to the sign-in page and click
**sign in as the test account** at the bottom. Both put you straight in.

- The account is `dev@glasshouse.test`. It is a real account in Supabase, marked verified, on the Pro plan, on the
  invite list, and allowed into `/admin`. Nothing is ever emailed to it; the address does not need to exist.
- Its password lives in `apps/web/.env.local` next to `GLASSHOUSE_DEV_EMAIL`. That file is never committed.
- The one-click way in only works when `GLASSHOUSE_DEV_LOGIN=1` is set **and** the page is opened on this computer.
  Leave all three `GLASSHOUSE_DEV_*` lines blank anywhere the Room is published, or anyone could use them.
- Sign out from `/account` to go back to being a stranger and check what a new visitor sees.

## Previewing the free tier

Start the Room with `GLASSHOUSE_PLAN=free` (for example `GLASSHOUSE_PLAN=free pnpm room`) to see what a free user
sees: one project, one agent at a time, the last 24 hours, and the digest, inbox and Ask replaced by a plain
explanation of what Pro adds. Nothing is deleted; switch back and it is all there.

## The landing page

`http://localhost:3000/landing` shows the public page with the live tile replaying the recorded sessions. In hosted
mode it is what signed-out visitors see at the front door.

## Moving to Supabase later

When the hosted Supabase project exists (`docs/supabase-setup.md`), apply all four migrations, fill in `apps/web/.env.local`
and restart. The Room then stores everything in Supabase instead of the local file, and sign-in switches on: each person
sees their own projects, "New project" gives a one-time code for `glasshouse connect --code …`, and plans apply
(`/account`). `GLASSHOUSE_ADMIN_EMAILS` names who may open `/admin` (testers, invites, what broke).
