# Phase 7 findings: the Potting Shed rebuilt, and helpers inside Glasshouse

Built on 12 September 2026 from Christopher's brief, in two passes. First: the Shed had come out as a replica of
Glasshouse (three columns, a conversation in the middle) and was not the product he had pictured; the two products
should be completely different, and the Shed should let a person who will never open the code put an agent together
by ticking boxes, "super, super, super easy in a revolutionary way", with the conversational way in kept for the more
technical. Second, after his review: give it everything, argue with every decision, make it something the market has
not seen, and carry the helpers over into Glasshouse.

## The argument with the first pass

The first pass was six tiles and then a form: eight numbered steps, thirty boxes. Tidy, but a questionnaire. Three
things were wrong with it, and each became a feature of the second pass:

1. **It was still a form.** A non-technical person should be *finished* one tap after picking a kind, and only change a
   line they disagree with. So the helper is now a document, not a form: each question shows its answer in plain words
   with a Change button; the boxes open only for that question. "Here is your checker. Read it through."
2. **The record was blind inside the builder.** Suggestions used it, the boxes did not. Every other builder on the market
   starts from a blank box. This one has watched the project, so each box now carries what the record says about it.
3. **You could not try a helper before growing it.** A person cannot judge a set of rules by reading them, but the record
   can replay them. So beside the helper sits "Tried on your recent tasks".

And the fourth gap: **Glasshouse did not know helpers existed.** Now it does, both ways.

## What the Shed is now

- **One page, one card.** The Room's header (the way out, the product, the project, "Watch in Glasshouse") and its
  materials; none of its grid, tabs or reply box. `main.shed-page` in `styles/deano.css`; `Shed.tsx` rewritten twice.
- **Get started: six tiles**, Checker, Guard, Specialist, House rules, Handover notes, Something else. Each tile that the
  record has a reason for says so on the tile ("1 stuck moment and 1 task finished with failing checks in your
  project"). Under them, the record-driven suggestions from Phase 6, now "Use this".
- **The helper as a document** (`Section` in `Shed.tsx`): what kind, what it does, where it may work, when it must stop
  and ask you, how carefully, how it talks (new: plain English, short, gives reasons, says when unsure, one question at
  a time), things it should already know, which tools, anything else in your own words. Closed, each is its answer in
  plain words; "Change" opens its boxes; "Open every question" for the person who wants the whole form.
- **Every box knows what happened.** `lib/shed/evidence.ts` computes, from the same task rows the Room shows, an
  entry per box: `duty:run-checks` carries "3 tasks were called finished with checks still failing", `stop:Before
  installing anything new` carries "2 tasks added something new", `area:<id>` carries how many tasks changed that part
  (shown as a count on the chip), `kind:<id>` the tile lines. Each entry links to the first task behind it. A box the
  record has seen a reason for, and which is not ticked, has a dashed accent edge.
- **Tried on your recent tasks.** `lib/shed/rehearse.ts` holds the helper's rules against each of the last twelve tasks:
  "Would have stopped before changing Payments and asked you first" (a part it must never change was changed); "Would
  not have called it finished: 2 checks were still failing"; "Would have stopped at the second time the same error came
  up"; "Would have asked you before adding something new"; "Was asked ‘…’: write the answer under Things it should
  already know and it will not ask again"; "Would have left a handover note for Codex to pick up". Tasks where nothing
  would have changed are counted, not narrated. A silence-type stuck moment claims nothing: a helper can stop retrying,
  it cannot fill a silence. It recomputes on every tick, in the browser, from the compact task list the page arrived with.
- **Every tick is one sentence, and the stored brief is those sentences and nothing else** (`lib/shed/build.ts`):
  `briefFromChoices` writes it, `choicesFromBrief` reads it back by matching sentences exactly, so "Change" reopens a
  helper with the same boxes ticked and never guesses. `suggest.ts` writes every job from the same sentences, so
  "Use this" opens as ticks. The owner's own words ride along untouched.
- **Describe it** stays: a sentence, tidied into a first draft by the one AI call when there is a key, used as typed
  when there is not, landing in the same card with "What it does" open.
- **Phones:** one column, the document first, then the name and button, then the rehearsal; a sticky bar carries the
  name, "Would have stepped in on 3 recent tasks", and the one button.
- **Your helpers** is a grid under the card, same facts as before, plus the one command when any is not placed.
- Every reply from the server is read through `askServer` (`lib/answer.ts`), as the rule requires.

## Helpers inside Glasshouse

- **The Room knows them.** `RoomState.helpers` (`lib/shed/room.ts`, computed in both stores' `getRoom` from the
  helpers table and the week's sub-agent runs): each helper's name, tools, one line of what it does, whether it is
  placed, and its runs this week judged with the same `judgeRun` the Shed uses. The plan gate cuts the runs to the
  plan's window like everything else.
- **The story says so.** Two new story kinds, merged into the same timeline: "Claude Code handed part of this task to
  your helper Dashboard checker" and "Your helper Dashboard checker finished and kept to its patch" / "… finished but
  changed Payments, outside its patch" / "… unclear: the task changed Payments and Cursor did not say which agent did".
  The verdict is the badge (green only when verified, red only when it strayed, amber when unclear), with "See the
  helper" back to the Shed.
- **A "Your helpers" panel** in the progress column: one row per helper with the tool marks, the name (a link to the
  Shed), what it does, and the one line that matters, computed from the files its runs changed; "Grow" in the corner;
  and, for a placed Claude Code helper, "Copy a line that asks for it", which copies "Please use the dashboard-checker
  sub-agent for this." to paste into Claude Code's own window. Copied, never sent (rule 4). An empty panel says how to
  grow one.
- **From trouble to a helper.** A stuck moment, an out-of-usage stop, a decision asked for, or checks failing carries
  "Grow a helper from this" in the story and on the task's panel. It opens the Shed with the suggestion that task is part
  of already read through (`?task=<id>`; the Shed finds the suggestion whose evidence names the task).
- **The header** of the Room carries "Potting Shed" beside "Live", mirroring the Shed's "Watch in Glasshouse".

The loop the brief asked for is now walkable end to end without leaving the two pages: a stuck moment in the story ->
"Grow a helper from this" -> the helper read through, tried on that very task ("would have stopped at the second time
the same error came up") -> Grow it -> one command -> the story says the helper started and whether it kept to its patch.

## What was found

- **Old helpers reopen as "Something else".** A helper grown before the rebuild has a prose job; it reopens with no
  boxes ticked and its whole job in "own words", exactly as stored. Nothing is lost.
- **A job can now be longer than 1,200 characters**, so the input limit is 3,000; the database column is free text.
- **The rehearsal can only replay what the record holds.** It knows changed parts, checks, repeated errors, installs,
  the question asked, and handovers. It cannot know whether a helper's *voice* would have helped, so "How it talks"
  never appears in it. Rule 2 kept it honest rather than clever.
- **The AI draft does not tick boxes.** Mapping the owner's sentence to duties would be a guess; the owner ticks.
- **A green pill on the story's ground was 4.47:1**, a hair under AA. `--positive-ink` (a shade deeper) was added for
  text on the green tint, the way `--accent-ink` already existed; the audit is clean on every screen.
- **The demo seed now grows a helper** (`scripts/seed-demo.ts`): from the stuck suggestion, placed, run twice by a
  Claude Code sub-agent, once inside its patch and once straying into Payments, so every new screen has something real
  to show and the "went outside its patch" line is exercised.
- **Only Claude Code names the helper that ran** (unchanged from Phase 6): Cursor runs judge "unclear" when the task
  strayed, Codex helpers are never "checked afterwards". The story's unclear line names the tool so the owner knows why.
- **The screenshot script's Shed scenes were rewritten**: the card, a kind picked, a suggestion taken, the describe-it
  way in, a helper's details, the empty project, the checked project.
