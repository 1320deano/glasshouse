# The Control Room — Product Report

**Prepared for:** Christopher
**Date:** 3 September 2026
**Basis:** your original vision document, the competitive review, and your answers to 12 clarifying questions

---

## 0. What your answers changed

| # | Question | Your answer | What it means for the product |
|---|---|---|---|
| 1 | First paying user | Me and builders like me — semi-technical, running Claude Code / Codex | Build for yourself first. Every design decision below is tested against "would Christopher use this at 11pm?" |
| 2 | Where it lives | Web app first, then desktop and mobile | A browser tab on the second monitor. Needs a small connector on your computer that sends what the agents are doing up to the web. |
| 3 | Two-second glance, ranked | 1. What it's doing now · 2. Which part of my app · 3. Stuck / needs me · 4. Risk | The tile layout is now fixed by this order. Risk is a badge, not a headline. |
| 4 | What you do today when you don't understand a change | **Trust it and move on** | The most important answer of the twelve. Your pain is *latent*, not acute — you don't currently check. So the product must be zero-effort and ambient, or you won't use it either. |
| 5 | Narration frequency | Every single action, as a live stream | The room is a live feed, not a status board. Must be designed so it's a calm feed, not a wall of noise — and cheap enough to run all day. |
| 6 | Expand depth | Plain English, with an optional "show me the technical detail" | Two layers, always. Plain English is the default; code is one click away for when you want to learn. |
| 7 | Agents on day one | Claude Code, Codex, Cursor, and anything that saves to GitHub | All three big terminal agents now offer plug-in "hooks", so this is achievable — but with different depth per agent (see section 6). |
| 8 | How often you run 2+ agents at once | Rarely — mostly Claude Code; **switch tools when credits run out** | Multi-agent for you is *sequential*, not parallel. The killer feature isn't conflict detection — it's **continuity when you switch tools**. Nobody else will help you move from Claude Code to Codex mid-project. |
| 9 | Act or watch | Watch only | Simpler, safer, no permissions to manage, and it keeps the product neutral. You act in the agent's own window. |
| 10 | What you'd pay £20/month for, ranked | 1. The live room · 2. The history · 3. Risk flags & inbox · 4. Sharing | The room is the paid product. History is the reason to stay. This is the reverse of my earlier recommendation, and I've changed it (section 12). |
| 11 | Relationship to Seatbelt | Separate products; could share plumbing later | Treated as separate throughout. One note on future overlap in section 11. |
| 12 | Biggest reason it could fail | Anthropic, OpenAI or GitHub build it into their own tools | Section 10 is entirely about this. |

---

## 1. The product

**One sentence**
> A live control room, in a browser tab on your second monitor, that shows in plain English what every AI coding agent you're running is doing right now, which part of your app it's touching, and why — no matter which tool it's running in — and keeps the story of your project when you switch tools.

**One paragraph**
> You prompt your agents on one screen. On the other, the control room narrates. Each agent gets a tile: what it's doing this second, which part of your app that is, whether it's stuck or waiting for you. Expand a tile and you get the full live stream in plain English — what it's reading, what it's changing, what it's testing, and why, with the real technical detail one click away if you want to learn. When an agent finishes a task the tile turns into a report card, and every morning you get a digest of what all your agents did collectively. Because it's neutral across Claude Code, Codex, Cursor and anything that saves to GitHub, it becomes the one continuous record of your project even as you swap tools when credits run out. You never act from it — you just finally understand.

**What it is not**
- Not another coding agent.
- Not a place to assign tasks or control agents (v1 is watch-only, by design).
- Not a wall of logs with nicer fonts.
- Not a security scanner (that's Seatbelt).

---

## 2. Who it's for

### 2.1 The first user: the semi-technical builder

| Trait | Detail |
|---|---|
| Who | Founders, apprentices, PMs, designers, analysts, indie hackers who run Claude Code, Codex or Cursor from a terminal or their desktop apps |
| Can they read code? | A bit. They can recognise a file name and guess what it does. They cannot review 28 changed files. |
| What they do today | Prompt, wait, **trust it and move on** |
| What they fear | "It said it's done. Is it? What did it touch? Did it break something I'm not looking at?" |
| Why they don't check | Checking is effort. Reading code is slow. The agent's own window is noise. |
| What they'll use | Something that runs by itself on a second screen and needs zero effort |

### 2.2 The insight hidden in "trust it and move on"

You don't currently look, because looking costs more than it returns. That has three consequences for the product:

| Consequence | Design rule |
|---|---|
| It must cost zero effort | Install once. Opens in a tab. Never needs a click to be useful. If it needs you to do something to get value, you'll stop doing it — you already stopped reading code. |
| It must prove itself in the first session | The first time it shows you something you'd have missed ("the agent changed how logins work while fixing the dashboard"), you'll believe in it. Design the onboarding to make that moment happen fast. |
| It converts blind trust into informed trust | You'll still trust and move on — but now you'll be *right* to, and you'll know the exceptions. That's the whole pitch. |

### 2.3 Later users (not day one)

| Group | When | Why later |
|---|---|---|
| Freelancers and agencies showing clients | v2 | Needs the shareable view and clean history; you ranked sharing last for yourself |
| Non-technical founders on Lovable / Replit | v2–v3 | Reachable only through GitHub-synced projects; shallower live view |
| Small mixed-skill teams | v3 | Needs multi-user, multi-agent, permissions |

---

## 3. The three zoom levels

Everything in the product is the same stream of agent activity, viewed at three distances.

| Zoom | Name | What you see | When | Effort from you |
|---|---|---|---|---|
| **Now** | The Room | One tile per agent, live. Headline of what it's doing, which part of the app, stuck/needs-you badge. Expand for the plain-English stream. | Constantly, on the second monitor | None — it's ambient |
| **Just finished** | The Report | The tile turns into a card: what changed, why, what it touched, what it verifiably didn't, tests, risk, anything needing you. | Each time an agent completes a task | Read it or don't; it's saved either way |
| **Over time** | The Digest | What all your agents did collectively: today, this week, or "since you last opened this". What shipped, what's still open, what needs you. | Daily / weekly / on return | A two-minute read |

The Room is what you pay for. The Report and the Digest are what make you stay.

---

## 4. The Room — design

### 4.1 The tile (collapsed)

Laid out in the exact order you ranked. Top to bottom, biggest to smallest.

| Zone | What it shows | Example |
|---|---|---|
| **Header** | Agent name + tool logo + colour | "Claude Code · Storyboard consistency" |
| **Headline** (largest text) | What it's doing right now, one sentence, plain English | "Rewriting the part that turns a script into scenes" |
| **Location** | Which part of your app that is | "Storyboard generation → Scene builder" |
| **Stage** | Investigating · Planning · Building · Testing · Done · Stuck · Waiting for you | "Testing" |
| **Badge** (small, corner) | Risk level of the current work | Low / Medium / High |
| **Ticker** (one line, scrolling) | The latest action, in plain English | "Ran the scene tests — 12 passed, 1 failed" |

Design rules:
- Readable from two metres away. This is a monitor you glance at, not lean into.
- The headline changes only when the *meaning* changes, not every action. The ticker carries every action. That's how you get "every single action, live" without the headline flickering into noise.
- Stages, never percentages. An agent can't tell you it's 68% done. It can tell you it's testing.
- "Stuck" is detected, not declared: same error three times, or nothing touched for several minutes, or waiting on a permission prompt in its own window. "Waiting for you" is the one that should light up.

### 4.2 The tile (expanded)

| Panel | Content | Technical detail (one click) |
|---|---|---|
| **What it's doing** | The live stream — every action, in plain English, newest at top. "Looked at how scenes are described. Changed the format each scene uses. Ran the tests. One test failed. Fixing it." | The actual file names, commands and outputs |
| **Why** | Your original prompt, and the agent's own plan if it wrote one. "You asked for consistent storyboards. It decided the scene format was the cause." | The agent's full reasoning where the tool exposes it |
| **Where in your app** | The areas touched so far, and what each one does in *your* project | The files in each area |
| **What it's changed so far** | Running list of changes, behaviour-first: "Scenes now always include a location." | The code changes themselves |
| **Ask** | A question box scoped to this task: "What's a scene format? Why did the test fail?" Answered using your project, not a textbook | — |

### 4.3 Keeping a live stream calm and affordable

You asked for every single action. That's the right call for trust — hiding actions is how tools become black boxes. But two things go wrong if it's done naively: it becomes the wall of logs your document warned about, and every plain-English line costs an AI call, which could cost more than the subscription.

| Problem | Solution | In plain terms |
|---|---|---|
| Noise | Two speeds: headline + ticker | Like a news channel. The headline stays steady; the ticker scrolls underneath. Expand to read the ticker's history. |
| Cost | Most actions are one of about ten kinds (reading a file, changing a file, running a command, running tests, searching, installing something). Translate those instantly from a template, using your project's area map for the nouns. | "Reading `auth/session.py`" becomes "Looking at how logged-in users are identified" without asking an AI each time. |
| The expensive bits | Use the strong AI only for: the *why*, the headline when meaning changes, the report card, and the digest. | A handful of AI calls per task instead of hundreds. |
| Wrongness | Every plain-English line keeps a link to the real action behind it. | If a translation ever looks off, the truth is one click away — which is also how you learn. |

### 4.4 The area map (the quiet engine of "which part of my app")

Your #2 glance need — "which part of my app is it touching" — only works if the product knows your app in *your* terms. So on connecting a project, it builds a map once:

| Step | What happens | You see |
|---|---|---|
| Connect | Point it at your repository | "Reading your project…" (one-off, a minute or two) |
| Map | It groups the files into product areas and names them in plain English | "Login · Accounts · Payments · Dashboard · Storyboard generation · Image generation · Upload" |
| Correct | You can rename or merge areas | "That's not 'Media', that's 'Image generation'" |
| Use | Every tile, report and digest uses these names | "Working in: Image generation" |
| Improve | Refreshes as the project changes; your corrections stick | Gets better every week. Nobody else has this map of your app. |

The *visual* map — areas drawn as a diagram with agents shown inside them — is v2. The map as data is v1, because the tiles can't work without it.

---

## 5. The Report and the Digest

### 5.1 The Report (per finished task)

| Field | Content | Rule |
|---|---|---|
| Headline | "Storyboard consistency fixed" | One sentence, behaviour not code |
| Before / After | "Previously scenes with no location failed. Now every scene gets a default location." | — |
| Touched | Storyboard generation · Scene builder — with the reason for each | Derived from the real changed files |
| **Not touched** | Payments ✓ · Login ✓ · Upload ✓ | **Verified from the changed-files list. Never guessed.** |
| Evidence | Tests run and results. New dependencies. Config or secrets touched: yes/no. | Facts, then explanation |
| Risk | Low / Medium / High + one-line reason | — |
| Needs you? | Nothing · Review recommended · Decision needed · Blocked — with the specific question | Feeds the inbox |
| Ask | Question box scoped to this task | — |

### 5.2 The Digest (per interval)

| Section | Content |
|---|---|
| Since you last checked / Today / This week | Selectable window |
| Done | Each finished task, one line each, linking to its report |
| Still going | Tiles currently active |
| Needs you | Anything flagged — the only section you *must* read |
| New in your app | New areas, new dependencies, new concepts introduced ("Roles: your app now knows the difference between Owner and Member") |
| Tools used | "Claude Code: 6 tasks · Codex: 2 tasks (after credits ran out on Tuesday)" |
| Delivery | In-app; email every morning; optional shareable link (v2) |

---

## 6. Which agents, and how it connects

### 6.1 How it connects, in plain English

The big agents now all have a plug-in system called **hooks**: a way for the agent to tell an outside program "I just started a task", "I just changed a file", "I just ran a test", "I'm waiting for permission". You install a small connector once (one command), it registers with each agent, and from then on it sends those events up to your control room tab as they happen. Your code stays on your machine; only descriptions of actions travel, unless you turn on "technical detail".

For anything without hooks, the fallback is watching the project folder and GitHub: you see files changing and commits landing, but not the agent's reasoning.

### 6.2 Depth per agent on day one

| Agent | How rich the live view can be | What you'll see | What you won't |
|---|---|---|---|
| **Claude Code** | Richest — about 30 event types, including task created / task completed, file changed, sub-agent started, waiting for permission | Full tiles: stage, headline, location, ticker, why, stuck detection | — |
| **Cursor** | Rich — about 20 event types, including file edited, command run, agent responded, stop | Nearly full tiles; stage inferred rather than announced | Explicit task boundaries |
| **Codex** | Standard — five event types: session start, prompt submitted, before/after each action, stop | Headline, location, ticker, why (from the prompt); stage inferred | Task boundaries, sub-agents |
| **Anything via GitHub / folder watching** | Basic — you see files change and commits land | Location and a slower ticker; a report at each commit | Why, stage, stuck detection |

Honest note: doing all four *well* on day one is a lot. My recommendation is that all four **work** on day one, but Claude Code is the one that's beautiful, because it's what you actually use. Codex and Cursor tiles show a small "standard view" label so expectations are set.

### 6.3 The credit-switch feature nobody else will build

You said you switch tools when credits run out. That's an incredibly common pattern and no lab will ever help you do it — Anthropic won't smooth your move to Codex, OpenAI won't smooth your move back. This product will:

| Moment | What the control room does |
|---|---|
| You hit your Claude Code limit mid-task | The tile shows "Stopped — usage limit" and the report card records exactly where the task got to |
| You open Codex to continue | The new Codex tile picks up in the same area of the map. The digest shows "Task continued in Codex" |
| Later, you ask "what happened to the storyboard fix?" | One continuous story across both tools |
| A month later | Your history is the only place the whole project's evolution exists — regardless of which tools you used |

This is a genuine moat, and it falls straight out of being neutral. Make it a headline feature.

---

## 7. Watch-only: what you gain by not acting

| Benefit | Why it matters |
|---|---|
| Simpler to build | No permission systems, no "did the pause actually work", no differences between how each tool accepts commands |
| Safer | A watch-only tool can't break anything. Easy to trust, easy to install at a company later. |
| Neutral | The labs can reasonably block a tool that *controls* their agent. They have little reason to block one that only listens. |
| Focused | You act in the agent's own window, where you already are. The room stays a room. |

Control (pause, approve, ask another agent to review) can come in v3 if users ask. Don't promise it on the landing page.

---

## 8. The visual map and multi-agent (v2 and v3)

| Version | Adds | Why then |
|---|---|---|
| **v2** | The map drawn as a diagram: your product areas, how they connect, recent changes glowing, active agents shown inside the area they're working in. "Explain this part of my app." | The map data exists from v1; drawing it is the demo everyone will share. |
| **v3** | Multiple agents in parallel: overlap warnings ("both agents are in Accounts"), downstream impact ("Storyboard changed its format — Image generation may need updating"). | You rarely run agents in parallel today. Build it when you and your users do. |

---

## 9. Money

### 9.1 What's paid, following your ranking

You'd pay for the room itself. Good — but remember the lesson from the most popular open-source agent dashboard, which had thousands of daily users and shut its company down because almost nobody paid. The difference between that and this: their room was for developers, who have free alternatives everywhere. Yours is for people who *can't* use those alternatives.

| Tier | Price | What you get | Why the line is here |
|---|---|---|---|
| **Free** | £0 | 1 project · 1 agent at a time · the live room · last 24 hours of history · no digest | Enough to have the "I'd have missed that" moment. Not enough to live on. |
| **Pro** | ~£15–20 / month | Unlimited projects and agents · full history · daily and weekly digests · risk flags and "needs you" inbox · ask-about-this | The room plus the reasons to stay. |
| **Studio** (v2) | ~£40 / month | Pro + shareable read-only views for clients or co-founders · branded digests | For freelancers and agencies. |
| **Team** (v3) | Per seat | Multi-user, parallel agents, overlap warnings | Later. |

Upgrade triggers, in order of when they'll bite: second project → history beyond a day → the morning digest → the inbox.

### 9.2 Keeping it profitable

| Cost driver | Control |
|---|---|
| Live translation of every action | Templates for the ~10 common action types; AI only when meaning changes |
| Report cards | One strong AI call per finished task |
| Digests | One call per interval per project |
| Target | Well under £5/month in AI costs per active Pro user, leaving room at £15–20 |

---

## 10. The big-player risk (your biggest fear)

You're right to name it. Anthropic, OpenAI and GitHub will each keep improving the view of what *their* agent is doing. Assume they'll build 60% of your feature list for their own tool within 18 months. Your product is the other 40%, plus the thing they structurally can't do.

### 10.1 What they will and won't build

| | Will they build it? | Why / why not |
|---|---|---|
| A nicer live view of their own agent | **Yes** | Obvious, cheap, good for retention |
| Plain-English narration for engineers | Probably | Their users are engineers; "plain English" is a nice-to-have for them |
| A view across *competitors'* agents | **No** (except GitHub) | Anthropic will not build a Codex tile. OpenAI will not build a Claude tile. |
| Continuity when you switch to a competitor because you ran out of credits | **Never** | It's against their interest |
| A product written for the owner who can't read code | Not soon | Their buyer is the developer. Their copy, docs and design all speak developer. |
| A permanent plain-English history of your product independent of the tool | Unlikely | Lock-in favours keeping history inside their tool |

GitHub is the exception — its mission control is already cross-agent. But it lives inside GitHub's developer workflow (issues, pull requests, code review), it speaks developer, it's designed to *assign* work, and it favours Copilot. It is not a second monitor for a non-engineer.

### 10.2 Your defences, strongest first

| Defence | How to build it |
|---|---|
| **Neutrality** | Support every agent equally; never favour one. Make "works with Claude Code, Codex, Cursor and anything on GitHub" the first line of the landing page. |
| **Continuity across tools** | The credit-switch story (section 6.3). Show it in the demo video. |
| **Owner language** | Every word in the product is written for someone who won't open the code. This is culture, not a feature — and it's why the labs won't copy it well. |
| **The area map** | Your product knows the user's app in *their* words, corrected by them over months. Switching tools loses it. |
| **History** | Six months of plain-English project history is worth more than any single feature. |
| **Speed and taste** | You're one person with agents; you can ship in days. The room should look and feel better than anything a lab ships as a side feature. |
| **Being bought is not failing** | If a lab or GitHub wants this badly enough to buy it, that's an outcome, not a loss. |

### 10.3 Pre-mortem: if this fails in 12 months, it was most likely because…

| Cause | Early warning sign | Prevention |
|---|---|---|
| A lab shipped "good enough" for its own agent and single-tool users didn't need you | Your active users mostly use one agent | Lean harder into multi-tool users and the credit-switch story; broaden to GitHub-synced projects |
| People loved it and didn't pay | Free-to-Pro conversion under 3% | Keep the free tier a taster; move history and digests firmly behind Pro |
| The live feed was flaky across tools | Support tickets about "my Codex tile is blank" | Claude Code perfect first; label the others "standard view"; fall back to folder watching |
| Translations were wrong and someone got burned | Thumbs-down rate on plain-English lines above ~5% | Keep the real action one click away; review the worst translations weekly |
| You spread across three startups | Weeks with no commits here | Section 11 and 12 |

---

## 11. Seatbelt

Your call: separate products. Respected throughout this document. One observation for later, not now:

| Shared | Different |
|---|---|
| Both connect to the same repository | Seatbelt asks "is it safe?" — a scan |
| Both need to know which files are which part of the app | The control room asks "what's happening and why?" — a feed |
| Both are for people who can't read the code | Seatbelt's output is a badge and a fix list; the room's output is understanding |

If both exist in a year, the obvious link is: Seatbelt's findings appear as the risk badge on the room's tiles and reports. Separate products, one plug. Don't design for it now.

---

## 12. Where I pushed back, and where I've changed my mind

| Topic | I said | You said | Where we've landed |
|---|---|---|---|
| Lead feature | A report card, not a live room | The live room; reports underneath | **You're right for this user.** The room is ambient and zero-effort, which is the only thing a "trust it and move on" user will actually keep open. Reports and digests still exist, one level down. |
| What's paid | History and risk flags, not "monitoring" | The room itself | **Changed my mind, with one condition:** the free tier must be a taster, not a home. Free users get the room for one project and one day of history. |
| Every action live | Meaningful moments only | Every single action | **Met in the middle:** every action is in the ticker and the expanded view; the headline only changes when meaning changes; common actions are translated by template so it's affordable. |
| Agents on day one | Claude Code + GitHub | All four | **All four work; Claude Code is the beautiful one.** Codex and Cursor get a "standard view" label. |
| Multi-agent | v3 | Rarely run in parallel; switch when credits run out | **Reframed:** the real multi-agent feature is *continuity when switching*, not conflict detection. That's v1 and it's a moat. Conflicts stay v3. |
| Name | Drop "mission control"; use a clerk-of-works metaphor | You like the control room | **Keep the room feel, lose GitHub's words.** Options in section 13. |
| Seatbelt | Merge | Separate | **Separate.** |

Still holding firm on three things: stages not percentages; every reassuring statement backed by a checkable fact; and the plain-English line always linking to the real action underneath. Those three are what make it trustworthy, and trust is the product.

---

## 13. Names that keep the control-room feel

"Mission control" belongs to GitHub and "command center" to OpenAI. These keep the *feeling* of a room you watch from, without borrowing their words. Check domain and trademark availability before choosing — several will be taken.

| Name | Feel | Tagline sketch |
|---|---|---|
| **Glasshouse** | From your "black box → glass box" line. A place you can see into. | "See what your AI agents are doing." |
| **Lookout** | A high point you watch from. Short, friendly. | "Your second screen for AI agents." |
| **The Bridge** | A ship's bridge — the room where the crew's work is visible. | "The bridge for your AI crew." |
| **Sitewatch** | Construction nod; watching the site while the contractors work. | "Watch your AI build." |
| **Overlook** | Calm, elevated. | "Understand everything your agents are doing." |
| **Second Screen** | Literal, memorable, describes the habit. | "The other monitor." |

Favourites: **Glasshouse** (owns your best idea) and **Lookout** (owns the second-monitor habit).

---

## 14. Build order and the first 30 days

### 14.1 What v1 contains

| In | Out (later) |
|---|---|
| Web app, one project | Desktop and mobile apps |
| Connector for Claude Code (deep), Codex and Cursor (standard), folder/GitHub watching (basic) | More agents |
| Tiles with headline · location · stage · badge · ticker | Visual map |
| Expanded view: live stream · why · where · changes · ask · technical detail toggle | Parallel-agent overlap warnings |
| Area map as data, with rename/merge | Any control actions |
| Report card per finished task | Shareable client views |
| "Since you last checked" and daily digest | Team features |
| "Needs you" inbox | — |
| Continuity across tools in the history | — |

### 14.2 Thirty days

| Days | Do | Test |
|---|---|---|
| 1–3 | Landing page with the two-monitor story and a mock tile. Pick a name. Price shown. | Do people sign up? (target 5% of visitors) |
| 3–7 | Connector for Claude Code sending events to a plain web page that shows one tile with headline, location and ticker. Ugly is fine. | Do *you* leave it open on the second monitor for a week without being reminded? |
| 8–14 | Area map, expanded view, technical-detail toggle. Add Codex and Cursor standard tiles. | Does switching tools mid-task show up as one story? |
| 15–21 | Report card on task finish. "Since you last checked." | Does the first report show you something you'd have missed? |
| 22–26 | Give it to 10 semi-technical builders. Watch them use it for five days. | 7 of 10 still have the tab open on day five. 3+ say "I'd pay." |
| 27–30 | Fix the three worst things they hit. Decide on the launch date and write the demo video script (section 15). | — |

The test on day 7 is the one that matters. If you don't keep the tab open, nobody will.

---

## 15. The demo (for Product Hunt and everywhere else)

Thirty seconds, split screen, no voiceover needed.

| Second | Left (your prompting monitor) | Right (the room) |
|---|---|---|
| 0–5 | Terminal: Claude Code churning, unreadable | One tile: "Fixing storyboard consistency · Storyboard generation · Building" — ticker scrolling calm plain English |
| 5–12 | Terminal: "Modified auth/session.py" | Tile headline changes: "Changing how logged-in users are identified" · Location: **Login** · Badge flips to **High** |
| 12–18 | — | Cursor clicks the tile. "Why?" panel: "Your dashboard needs to know which organisation a user is in. It changed the login session to carry that. Affects everyone who logs in." |
| 18–24 | Terminal: "Usage limit reached" | Tile: "Stopped — usage limit." A second tile appears: **Codex** — same area, same task: "Continuing: login session change" |
| 24–28 | — | Report card slides in. Touched: Login. **Not touched:** Payments ✓ Upload ✓ Storyboards ✓. Needs you: review recommended. |
| 28–30 | — | "Two tools. One story. You never opened the code." |

The credit-switch moment at second 18 is the part nobody else can show.

---

## 16. Success measures

| Horizon | Measure | Target |
|---|---|---|
| Week 1 | You keep it open on the second monitor | 5+ days of 7 |
| Month 1 | Testers still using it on day 5 | 7 of 10 |
| Month 2 | First paying users | 10 |
| Month 3 | Free → Pro conversion | 5%+ |
| Month 6 | Users who've used it across 2+ tools | 40% of Pro users |
| Month 6 | Days since a user reported a wrong translation | Rising |
| Month 6 | Paying users | 100 |

---

## 17. The idea in your voice

> I prompt agents on one screen. On the other, I finally see what they're doing — every action in plain English, which part of my app they're in, and why — whichever tool I'm using that day. When I run out of credits and switch tools, the story carries on. I never read the code. I still know exactly what happened.
