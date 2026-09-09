# Competitive analysis and the moat plan

Written for Christopher on 9 September 2026, in answer to: "I am worried there are too many competitors to us.
T3 Code seems very similar. Analyse our product and its goals, research the competitors, and plan how to widen the
moat or add things that greatly separate us."

Every claim about a competitor below came from that competitor's own site, docs, code repository or a dated article,
checked on 9 September 2026. Where something could not be confirmed it says so. Sources are listed at the end.

---

## 1. The answer in one page

**The crowd is real, but it is standing somewhere else.** Nearly forty products now put "many AI coding agents on one
screen". Almost all of them are the same kind of thing: a **launcher** for developers, which starts Claude Code or
Codex itself, shows the code changes as diffs, and lets the developer chat, approve and open pull requests. T3 Code is
the most popular of these (22,000 GitHub stars, a claimed 200,000 users, free and open source). It is very good at that
job. It is not our job.

Deano is the opposite kind of thing on every axis that matters:

| Axis | The crowd (T3 Code, Conductor, Superset, Emdash, Vibe Kanban, the labs' own apps) | Deano |
|---|---|---|
| Who it is for | Developers who read diffs | The owner who will never open the code |
| What it does with the agent | Launches it, controls it, chats with it | Watches it; never touches it |
| What it can see | Only sessions it started itself | Anything with a hook, a log, a folder or a GitHub push, whoever started it |
| What it shows | Files, branches, tokens, diffs, terminal | Parts of *your* app, in your words, with the real action one click away |
| What it promises | "Here is what the agent said" | "Here is what is checkably true: touched, not touched, kept to its patch" |
| What it remembers | Threads inside that one tool | One story of the project across every tool you have used |
| Business model | Free, open source, subsidised (two of them have already shut down for lack of money) | Paid for the record, not the launcher |

After checking the whole field, **no shipped product was found that does any one of these four things**, let alone all
of them: narrates agent work in owner language by part of the app; computes a "not touched" list from facts; keeps one
project story across Claude Code, Codex, Cursor and GitHub; or proposes helpers from what agents actually did in your
project and checks afterwards that they kept to their patch.

So the honest position is:

1. **The moat is not a feature. It is the record.** Six months of one owner's corrected area map, verified history and
   grown helpers is something no launcher and no lab can copy, because none of them is watching across tools.
2. **Today that moat is empty**, because the product has never run against a hosted database and has no users. The
   biggest competitive risk is not T3 Code copying us; it is us never shipping to ten real people. Every week without
   real records is a week the moat does not deepen.
3. **The plan below widens the gap in three directions** the crowd structurally cannot follow: verified promises across
   every tool (watch-only guardrails), continuity that agents themselves can use, and a record wide enough to include
   the agents that never touch a terminal.

---

## 2. What Deano is, and what state it is actually in

### 2.1 The two products

| | Glasshouse (the Room) | Potting Shed (the Shed) |
|---|---|---|
| One line | Watch-only control room narrating, in plain English, what every agent is doing, which part of the app, and why | Raise helpers (agents and sub-agents) for a project by answering six plain questions, proposed from the record |
| Sources | Claude Code hooks (deep), Codex hooks and logs, Cursor hooks, folder and git watcher | The same record |
| What is computed, never guessed | Stage, location, risk, "not touched", stuck, waiting, continuity across tools | Suggestions with counts, boundaries compiled from the area map, "kept to its patch" from changed files |
| Business rule | Free: one project, one agent, 24 hours. Pro: everything | Free: two helpers per project |

### 2.2 Honest state on 9 September 2026

| Fact | Consequence for competitiveness |
|---|---|
| Phases 0 to 6 built; 186 automatic checks pass; typecheck, lint and build pass | The product exists end to end on one computer |
| Never run against a hosted Supabase; not deployed; no public address | Nobody outside this computer can use it. Zero users, zero records, zero moat in practice |
| Codex and Cursor listeners written from documentation; their recordings are synthetic | Two of the four "works with" claims are unproven in the real world |
| No Anthropic key configured; everything runs from templates | The AI-written headline, cards and digest have never been read critically |
| T3 Code, by comparison, ships a release most days to a claimed 200,000 users | Their velocity is a real threat; our unshipped state is a bigger one |

---

## 3. The field, in five groups

### 3.1 Launchers and control planes (the crowd)

These start the agents themselves, usually one per git worktree, and give a developer a place to chat, review diffs and
open pull requests. They cannot see a session they did not start.

| Product | Maker | Agents | Runs or watches? | Audience | Plain English? | Cross-tool project story? | Verified facts? | Price | Traction / status |
|---|---|---|---|---|---|---|---|---|---|
| **T3 Code** | T3 Tools (Theo Browne) | Codex, Claude Code, Cursor, Grok, OpenCode, Antigravity | Runs (child processes) | Developers | No | Threads it started, in its own database only | No | Free, open source, "will not monetise usage" | 22.2k stars, ~200k users claimed, v0.0.40 on 8 Sep 2026, iOS and Android apps |
| Conductor | Conductor (YC) | Claude Code, Codex, Cursor | Runs (worktrees) | Developers | No | No | No | Free local; Pro $50/mo; Teams $60/user | $22M Series A |
| Superset | Superset (YC S26) | Claude Code, Codex, Cursor, Gemini, any CLI | Runs | Developers | No | No | No | Desktop free; cloud paid | ~12k stars |
| Emdash | General Action (YC W26) | 34 CLI providers | Runs | Developers | No | No | No | Free, open source | ~5k stars |
| Vibe Kanban | Bloop, now community | Nine agents | Runs | Developers | No | Board only | No | Free | Company shut down 10 Apr 2026: "couldn't find a business model" |
| Claude Squad | smtg-ai | Six agents | Runs (tmux) | Developers | No | No | No | Free | ~8.5k stars |
| Terragon | Terragon Labs | Claude Code, Codex | Ran in cloud | Developers | No | No | No | Shut down Feb 2026 | Insufficient traction |
| Warp Oz | Warp | Claude Code, Codex, Warp Agent | Runs in its cloud | Developers, teams | No | "Cross-harness memory", but only for agents it launched | No | Credits, enterprise | Launched Feb 2026 |
| Augment Intent | Augment | Its own agents, orchestrates Claude Code | Runs | Developers | Living specs | Spec history | No | ~$100/mo | Launched Apr 2026 |
| Factory Droids, Devin, Cline, Amp, opencode, Kilo | various | Their own agent | Runs | Developers | No | Own tool only | No | $0 to $200/mo | Kilo bought by Anaconda Jul 2026 |

### 3.2 The labs' own screens (the platform risk)

| Product | Shipped | Sees other vendors' agents? | Owner language? | Story across tools? | Nearest overlap with Deano |
|---|---|---|---|---|---|
| Claude Code desktop redesign: sessions sidebar, status filters, diff viewer, a "Summary" verbosity mode | 14 Apr 2026 | No | Partly (a summary mode, written for developers) | No; each surface keeps its own history | The summary mode is the closest any lab has come to plain English |
| Claude Code Agent View: one AI-written line per session, grouped Needs input / Working / Done | 11 May 2026 | No | Status line only | No | Overlaps the tile's headline and the "waiting for you" badge, for Claude only |
| Claude Code Remote Control: mirror a session to phone | 25 Feb 2026 | No | No | No | Phone access |
| Codex app, now inside the ChatGPT desktop app | Feb, merged 9 Jul 2026 | No | No (diffs) | No | Parallel threads |
| GitHub Agent HQ / Mission Control: Copilot, Claude and Codex in one place | GA 4 Feb 2026 | **Yes**, but only agents launched through GitHub; never a local Claude Code or Cursor session | No (developer session logs) | Yes, tied to the repo and pull request | The only true multi-vendor view; repo-scoped and developer-voiced |
| Cursor 3 Agents window | 2 Apr 2026 | No | No | Cursor only | List of running agents |
| Google Antigravity Manager, Jules | May 2026 | No | Jules shows a plan | Own tool only | Plan text |

Also checked: none of the labs' non-developer products (Claude Cowork, "Codex for every role", Cursor Design Mode)
computes "what changed and what was not touched". GitHub Spark was shut down on 31 August 2026.

### 3.3 Watch-only observers (our actual neighbours)

These use the same hooks we do. All are developer tools showing raw events; none translates, maps to parts of the app
or verifies anything.

| Product | Agents | Plain English? | Cross-tool story? | Audience | Price / traction |
|---|---|---|---|---|---|
| disler's hooks observability (and its forks) | Claude Code | No (raw events in swim lanes) | No | Developers | Free, ~1.5k stars |
| agents-observe | Claude Code (Codex planned) | No | No | Developers | Free, 669 stars |
| claude-watch | Claude Code | File map plus AI search | No | Developers | Free, 62 stars |
| cot. | Claude Code, Cursor, Codex | No (traces, timelines) | Local traces across three tools | Developers | Unverified |
| claude-command-center | Eight tools' state files and hooks | No | Local session list | Developers | Source-available, 149 stars |
| vibe-log, ccusage | Logs of Claude Code, Codex, Cursor | Session summaries for productivity scoring | Dashboard across tools | Developers | Free |

### 3.4 Tools for people who cannot read code, and change explainers

| Product | Narrates what changed, by part of the app? | "Not touched" report? | Risk flag? | Works with the owner's own Claude Code / Codex / Cursor sessions? | Price |
|---|---|---|---|---|---|
| Lovable | Chat per edit; history shows code diffs | No | Yes, a security scan on publish | Only via GitHub sync, not narrated | Free; Pro $25; Business $50 |
| Bolt.new | Diff per generation | No | Yes, security audit on publish (Jul 2026) | No | Free; Pro |
| Replit Agent 4 | Agent narrates its steps in chat | No | No | No | $20 to $95/mo |
| v0, Base44, Emergent, Databutton | Chat narration, checkpoints | No | No | No | $20 to $200/mo |
| The Code Registry | Monthly plain summary of code changes for boards | No | No | GitHub only, monthly | Not published |
| What The Diff | Plain summaries of pull requests for stakeholders | No | No | GitHub pull requests only | $19 to $199/mo |
| Macroscope, CodeRabbit, Greptile, Bugbot, Copilot review | Technical pull-request summaries and reviews | No | Code-level findings | GitHub only | $12 to $48 per developer |
| "Vibe coding safety" scanners (VibeWrench, CheckVibe, Vibe App Scanner) | No; they scan the live website | No | Yes | No | Free scan, then paid |

An open feature request on the Claude Code repository asks for exactly what the Room does ("report session progress so
non-technical stakeholders can follow"). Nobody has shipped it.

### 3.5 Agent and helper builders

| Product | Who for | Starts from a blank prompt, or from evidence? | One definition written for every tool? | Checks afterwards that the agent kept to its patch? |
|---|---|---|---|---|
| Claude Code `/agents`, Skills, `/init`, auto memory | Developers | Mostly blank; auto memory saves corrections; `/init` reads the code | No (Claude reads CLAUDE.md, not AGENTS.md) | No |
| Cursor rules and subagents | Developers | Blank; auto-proposed "Memories" were removed in 2026 | No, but Cursor now reads `.claude/agents/` directly | No |
| Codex AGENTS.md, skills and `.codex/agents/*.toml` subagents (Mar 2026) | Developers | Blank | AGENTS.md is the shared instructions standard | No |
| Ruler | Developers | Blank Markdown | Yes, to 30+ tools | No ("distributing instructions only") |
| claude-doctor | Developers | **From transcripts**: spots edit loops and repeated corrections, emits rule lines | No | No |
| Deeplake Hivemind | Unclear | From session traces, writes skills | Claims three tools | No (unverified beyond its own page) |
| agent-guardrails | Developers | Declared plan vs git diff | No | **Yes**, but as a developer command line, before-and-after a single task |
| OpenAI Agent Builder, Copilot Studio, Lindy, Relevance, Zapier, n8n | Business users | Blank canvas | No; not for coding agents | No (Agent Builder shuts 30 Nov 2026) |
| **Potting Shed** | The owner | **From the record, with counts and links to the tasks** | Yes: Claude Code sub-agent, Cursor rule, AGENTS.md section | **Yes, from the files its runs changed, in owner language** |

Two small developer tools do half of what the Shed does (rules from transcripts; a scope check). None combines evidence,
owner language, every tool, and the after-the-fact check, and none is watching the project.

---

## 4. T3 Code head to head

Christopher's specific worry, taken concept by concept.

| Concept | T3 Code | Deano | Same or different? |
|---|---|---|---|
| Many agents on one screen | Yes | Yes | **Same idea, different room**: they sit in the driver's seat, we sit at the window |
| Who starts the agent | T3 Code does; it spawns the process | The owner does, in the tool's own window; Deano only listens | Different |
| Sessions started elsewhere (terminal, Cursor, GitHub) | Invisible | Visible, through hooks, logs, folder and git | Different |
| Plain-English narration | No; agent chat, tool calls, diffs, terminal. Theo's own advice is to ask the agent for a summary | Yes; every action, by template, with the real action one click away | Different |
| "Which part of my app" | No; file-level diffs | Yes; the area map, corrected by the owner | Different |
| "Not touched" and other computed facts | No | Yes, from the changed-files list | Different |
| Stage (investigating, building, testing) | No | Yes; stages, never percentages | Different |
| Stuck detection | No | Yes, from the same error three times or silence | Different |
| "Waiting for you" | Yes: inbox sorted by urgency, desktop and phone push | Yes: the one badge that lights up; no phone push yet | **Same idea; they are ahead on the phone** |
| Report card per task | No; auto-written pull-request text is the nearest | Yes | Different |
| Daily digest | No; token and cost dashboard only | Yes | Different |
| Story when you switch tools | Threads persist in its database for the six providers it launched; nothing from anywhere else | One story across tools, including a "continued in Codex" link | Different |
| Helper builder | No; reuses Claude skill folders | The Shed | Different |
| Control actions | Chat, approve, revert, commit, open PR; "Full access" is the default | None, by rule | Different |
| Audience and words | "Over 200,000 developers"; needs Node 22, git, `claude auth login` | The owner who never opens the code | Different |
| Price | Free, open source, run at a loss | Paid for the record | Different |
| Hooks | Does not use them; user hooks are a known source of bugs for it | Built on them | Different |

**Two of sixteen rows overlap.** The overlap is the shallow one (a list of agents and a needs-you inbox). Everything
that makes Deano trustworthy to an owner, T3 Code has not built and its roadmap does not mention. Its stated remaining
roadmap is generic agent protocol support, sub-agent visualisation, multi-harness orchestration, task grouping and a
plugin system, all for developers.

**What to respect about T3 Code:** its speed (a release most days, 114 contributors), its distribution (Theo's audience),
its phone app, and the expectation it sets that a control layer costs nothing. Any owner-facing summary feature it
added would ship to 200,000 people in a week. That is why the plan below does not try to out-build it on shared ground.

---

## 5. Where the moat is, and where it is not

| Source of defensibility | Strength today | Why the crowd cannot follow | What deepens it |
|---|---|---|---|
| **The record**: one owner's project history across every tool | Zero (no users) | Launchers only record what they launch; labs only record their own agent | Users, time, and every correction the owner makes |
| **The corrected area map**: the app in the owner's words | Zero (no users) | Nobody else has a map of the app that the owner has corrected for months | Every rename and merge; every helper compiled from it |
| **Verified facts** ("not touched", "kept to its patch", stuck detected) | Built | It is culture, not code: the crowd shows what the agent said | Extending verification to owner-stated promises across every tool (M2) |
| **Owner language** | Built | The labs' buyer is the developer; every launcher speaks developer | Discipline; the thumbs-down review loop |
| **Neutrality and continuity** | Built (proven with recordings, not yet live) | Anthropic will never smooth a move to Codex; OpenAI will never smooth a move back | The handover and "who can work now" (M3), agent-readable memory (M7) |
| **Watch-only** | Built | Launchers cannot become watchers without abandoning their core; labs will not watch rivals | Phone-first "waiting for you" (M4); GitHub source (M5) |
| **The closed loop** watch, grow, place, check | Built | Only a watcher can close it | Outcomes as counts (M8), lessons (M9) |
| Speed and taste | Real but unmeasured | One person with agents ships in days | Only counts once the product is in front of people |

What is **not** a moat: the connector, the hooks, the tile layout, the templates. All of those are a fortnight's work for
anyone. The plan therefore spends its effort on the rows above, not on polishing what is copyable.

---

## 6. Threats, ranked

| Rank | Threat | Likelihood | Early warning | Answer in the plan |
|---|---|---|---|---|
| 1 | We never ship to real people; the record stays empty | High (the product has never touched a hosted database) | Weeks without a hosted deployment | M1 |
| 2 | Anthropic's Summary mode and Agent View grow into a plain-English story for Claude Code, and single-tool owners stop needing us | Medium | Active users mostly single-tool | M3, M5, M7: be the only place the whole project lives |
| 3 | GitHub Agent HQ adds Jules and Devin and becomes the true multi-vendor view | Medium; announced, not yet live | GitHub changelog | M5: watch Agent HQ's own output too; stay owner-voiced |
| 4 | T3 Code (or Conductor) adds an owner summary feature | Low today, possible in a week if they choose | Their changelog | M2, M6, M8: verified facts and history they would have to rebuild from scratch |
| 5 | Codex's hash-bound hook trust silently disables our listener after every connector update | Certain unless designed around | "My Codex tile is blank" | M11 |
| 6 | Sub-agent file formats converge and "one helper, every tool" loses value | Medium for instructions and skills (already converged); low for sub-agents (four formats) | agents.md and agentskills.io | M10: the value is the words from the record, not the file conversion |
| 7 | Free launchers set the price expectation at zero | Certain | "Why pay?" | Section 8: charge for the record, never for the launcher |

---

## 7. The plan: widen the gap where nobody can follow

Every item names the checkable fact behind it and confirms the five non-negotiables. Effort is in days for one person
with agents. Order matters: M1 comes before everything, because nothing else deepens the moat without records.

### Tier 1: make the moat real (weeks 1 to 4)

| # | Move | What the owner sees | The fact underneath | Why the crowd cannot | Effort |
|---|---|---|---|---|---|
| **M1** | **Ship to ten people.** Hosted Supabase, a public address, the Anthropic key, one real Codex and one real Cursor recording, the tester cohort from `docs/tester-cohort.md` | A working product | Real records | Not a feature; the precondition for every moat row | Christopher's list in `docs/what-christopher-needs-to-do.md`, then five days of watching |
| **M2** | **Promises, checked after every task.** The owner states house rules for the whole project in the Shed's own words ("Never change Payments without asking me", "Always run the checks before saying done"). After every task, from every tool, the Room says whether each promise was kept, on the card and in the digest | "Promises kept: 3 of 3" or "Broke a promise: changed Payments (2 files)" with "Needs you" raised | The changed-files list and the test-run events, against the area map. Extends `lib/shed/verify.ts` from helpers to all tasks | Watch-only guardrails: nothing is blocked (rule 4), yet the owner gets what agent-guardrails gives a developer, in owner language, across every tool. No launcher can check a session it did not launch; no lab checks rivals | 4 to 6 days |
| **M3** | **The handover, and who can work now.** When a tool stops (usage limit, error, or the owner closes it), the Room writes a handover note from the record: what was asked, what changed, what is unfinished, what failed. "Copy for the next tool" puts it on the clipboard. A small strip shows which tools are paused by a usage limit and until when | "Claude Code: paused until 14:00. Codex: free." and one button to carry the task over | `usage_limit` events with their reset time; the task's own events | The labs will never smooth a move to a rival. T3 Code's threads do not leave T3 Code. This is the credit-switch moat made usable, and the demo's second 18 | 3 to 4 days |
| **M4** | **"Waiting for you" on the phone.** Installable web app plus push notification for the one badge that lights up, and for "broke a promise" | A phone buzz that says "Codex is waiting for a decision on Login" | The same waiting and needs-you facts | T3 Code has phone push, so this is table stakes. But a watch-only product is the safest possible thing to put on a phone: nothing can be pressed by mistake | 3 days |

### Tier 2: widen the record (weeks 5 to 10)

| # | Move | What the owner sees | The fact underneath | Why the crowd cannot | Effort |
|---|---|---|---|---|---|
| **M5** | **GitHub as a first-class source.** A GitHub App that reads commits and pull requests, so agents that never touch a terminal appear in the same story: Codex cloud, Claude Code on the web, Copilot's coding agent, Devin, Jules, and the GitHub sync from Lovable, Bolt and Replit | "A pull request from Codex (cloud) changed Login; not touched: Payments" | Commit and pull-request diffs against the area map | Reaches the non-technical founders on Lovable and Replit that the brief put in v2, hedges any future hook change, and makes Deano the only view that spans Agent HQ *and* local sessions | 6 to 8 days |
| **M6** | **The project story, and a shareable one.** A living page: what the app is now (the area map with each part's plain description and the concepts the app has learned), and the timeline of every task by every tool. Exportable. A read-only share link and a weekly client report for freelancers building for non-technical clients (the Studio tier) | "Your app, as of today" and "This week, for your client" | The record, cut to the plan's history window | Six months of owner-language history is the asset. Nobody else can produce it because nobody else recorded it. The freelancer-to-client use is a whole segment no launcher serves | 6 to 8 days |
| **M7** | **Read-only memory for agents.** A small local server, in the standard agents already speak (MCP), that lets any agent *read* the record: "what happened to the storyboard fix?", "which parts are sensitive?", "what did the last tool leave unfinished?" The owner turns it on per project | "Codex read the handover notes before starting" in the ticker | The record itself; every read is logged as an event | Continuity becomes something the agents use, not only the owner. Warp Oz has cross-tool memory only for agents inside its cloud. Rule 4 is kept: the server only answers questions the agent chooses to ask, exactly as AGENTS.md is only read if the tool reads it; nothing is injected, blocked or altered | 5 days |

### Tier 3: close the Shed's loop (weeks 8 to 14)

| # | Move | What the owner sees | The fact underneath | Why the crowd cannot | Effort |
|---|---|---|---|---|---|
| **M8** | **Helper outcomes as counts.** Each helper's card shows what changed in the record since it was placed: stuck moments in its patch, promises broken, tasks called done with failing checks. Before and after, as counts, never a percentage | "Since the Dashboard checker was placed: stuck moments 3, then 0" | Counts over events before and after the placed date | Only a watcher can measure whether a helper helped | 3 days |
| **M9** | **Lessons.** Repeated corrections (the same thumbs-down, the same question answered twice, the same promise broken twice) become proposed house rules with their counts and the tasks behind them | "You have answered this twice. Make it a rule?" | Feedback and needs-you events | claude-doctor does a developer version for Claude Code only; ours is owner-language, every tool, and checked afterwards by M2 | 3 days |
| **M10** | **More helper targets.** Codex now has real sub-agents (`.codex/agents/*.toml`, March 2026), so a Codex helper can be checked afterwards after all; Copilot custom agents (`.github/agents/*.agent.md`); and skills as `SKILL.md`, the one format every tool now reads. Cursor already reads `.claude/agents/` directly, so that target may shrink to nothing | "In your project" for four tools | The connector's own report of the files it wrote | Correction to Phase 6: `docs/phase-6-findings.md` says Codex has no sub-agents; that was true when written and is no longer. The moat is not the file conversion; it is the words coming from the record | 3 to 4 days |

### Tier 4: hedges (small, do early)

| # | Move | Why |
|---|---|---|
| **M11** | Make the Codex hook definition a thin, unchanging shim that calls the connector, so Codex's hash-bound `/hooks` trust is granted once and survives every connector update | Otherwise every update silently blanks the Codex tile until the user re-trusts it |
| **M12** | Accept Claude Code's OpenTelemetry export as an alternative feed for teams that already run one | A second source if hooks ever change; Claude Code only, no patches, so hooks stay primary |
| **M13** | Keep the free tier a taster and never charge for the launcher-shaped parts (tiles, ticker) | Two launchers shut down on free users. The paid thing is history, digest, promises, sharing and memory |

### What not to build

| Tempting | Why not |
|---|---|
| Launching agents, worktrees, chat with the agent, approve buttons, "open a pull request" | This is where thirty free tools and four labs fight, and it breaks rule 4. The moment Deano launches an agent it becomes a worse T3 Code |
| Diffs as the main view | Owners do not read diffs. Diffs stay behind the Details toggle |
| A percentage of anything | Rule 1 |
| A helper marketplace or template library | Every other builder starts from a blank box or a template. The Shed's whole point is that it starts from the record |

---

## 8. Positioning and price

| Question | Answer |
|---|---|
| First line on the landing page | "Works with Claude Code, Codex, Cursor and anything on GitHub. Watches; never touches." |
| The demo's moment | Second 18: the usage-limit stop, the handover, and Codex carrying on in the same part of the app (M3) |
| Against "T3 Code is free" | T3 Code is the driver's seat, free, for developers. Deano is the window, for the owner, and what you pay for is the one place your whole project's story lives |
| What is Pro | History beyond a day, the digest, the inbox, promises (M2), the handover (M3), sharing (M6), agent memory (M7) |
| What stays free | The live Room for one project and one day: enough for the "I'd have missed that" moment |

---

## 9. How we will know it is working

| Horizon | Measure | Target |
|---|---|---|
| Week 2 | Hosted, ten testers connected, one real Codex and one real Cursor recording replacing the synthetic ones | Done or not |
| Week 4 | Testers still with the tab open on day five | 7 of 10 |
| Week 6 | First "broke a promise" line shown to a real owner (M2) | One, and it was true |
| Week 8 | A real credit switch carried over with the handover (M3) | One, on video |
| Month 3 | Pro users who used two or more tools | 40% |
| Month 3 | Records older than 30 days per Pro user (the moat, measured) | Rising every week |
| Month 6 | Wrong-translation reports | Falling |

---

## 10. Sources checked on 9 September 2026

T3 Code: github.com/pingdotgg/t3code (releases, docs/user, docs/internals/providers.md, issue 2653), t3.codes,
flaviocopes.com/t3-code (28 Aug 2026), betterstack.com/community/guides/ai/t3-code, continuumcode.ai/guides/what-is-t3-code,
enterprisedna.co (8 Aug 2026, pricing stance), apps.apple.com (T3 Code Remote), Theo's 22 Jul and 29 Jul 2026 streams,
dev.to hands-on comparison of Agent Orchestrator, T3 Code, Symphony and cmux.

Launchers and observers: conductor.build/pricing, github.com/BloopAI/vibe-kanban and nimbalyst.com (Bloop shutdown),
github.com/terragon-labs/terragon-oss, github.com/superset-sh/superset, github.com/generalaction/emdash,
github.com/smtg-ai/claude-squad, warp.dev (multi-harness, May 2026), zed.dev/docs/ai/external-agents,
github.com/disler/claude-code-hooks-multi-agent-observability, github.com/simple10/agents-observe,
github.com/NirDiamant/claude-watch, cot.run, github.com/amirfish1/claude-command-center, github.com/aannoo/hcom,
github.com/ryoppippi/ccusage, vibe-log.dev, anaconda.com (Kilo acquisition, 15 Jul 2026).

Labs: code.claude.com/docs/en/hooks, /changelog, /memory, /sub-agents, /monitoring-usage, /analytics,
/claude-code-on-the-web; claude.com/blog (desktop redesign 14 Apr 2026, Agent View 11 May 2026); learn.chatgpt.com/docs/hooks
and /changelog; developers.openai.com/codex/subagents; openai.com (Codex app; "Codex for every role", 2 Jun 2026);
github.blog (Agent HQ GA 4 Feb 2026; Copilot app 17 Jun 2026; Spark deprecation 4 Aug 2026); cursor.com (hooks, Cursor 3,
Agents window, subagents, Design Mode, Bugbot billing); antigravity.google (I/O 2026); agents.md; agentskills.io;
simonwillison.net (Codex subagents, 16 Mar 2026); JetBrains developer survey (Aug 2026); explainx.ai and implicator.ai
(Claude limit timeline, 14 Sep 2026 change); 9to5mac.com (Codex limits restored, 24 Aug 2026).

Owner-facing and builders: lovable.dev, docs.lovable.dev, bolt.new/blog/security-audit-on-publish,
blog.replit.com (Agent 4), vercel.com (deepsec), thecoderegistry.com, whatthediff.ai, macroscope.com,
github.com/intellectronica/ruler, github.com/millionco/claude-doctor, deeplake.ai (Hivemind),
github.com/logi-cmd/agent-guardrails, github.com/anthropics/skills, therouter.ai (Agent Builder wind-down),
github.com/anthropics/claude-code/issues/17203.

Not verified: T3 Code's 200,000-user figure (Theo's own claim); whether Jules or Devin are live on Agent HQ; Deeplake
Hivemind beyond its own page; Superset's cloud pricing; cot.'s maker and pricing.
