# Landing page findings: the page shows the product

Built on 14 September 2026 from a one-line brief: pick the one area of the website that most needs it and improve
it drastically. The landing page was chosen because it is the sign-up funnel (the brief's target is 5% of visitors),
it is the first thing a Product Hunt visitor sees, and it was the one screen that had not kept up with the product:
the Room had become a three-column, real-logo, story-and-progress control room, while the landing page still showed
one small Phase 4 tile with a coloured dot, floating in an oversized grey box beside a mostly empty terminal. The
credit-switch moment that the brief calls "the part nobody else can show" played somewhere in a loop that nothing
framed, and the three things that make the product different were three short paragraphs.

## What the page is now

- **The demo is the product, framed.** `components/Demo.tsx` replaces the old mock tile. It is still the two recorded
  sessions replayed through the real store (`lib/demo.ts`), and now every frame carries what the real Room would show:
  the agent cards in the Room's own classes (real tool marks, status, headline, where and why, parts touched, the
  verified "not touched" line, the ticker), the story column's lines from `lib/story.ts` with the same badges, and the
  "This is the moment" callout from `lib/moment.ts`. The terminal on the other monitor is written from the recorded
  event's own fields (the prompt, the file, the command, the test counts, the closing words), not from a caption typed
  beside it, and it says `$ codex` when Codex starts rather than `$ claude`.
- **Five chapters, turned by the record.** It reads first, it changes Login, credits run out, Codex carries on, the
  report card: the brief's thirty-second demo (section 15). Which frame belongs to which chapter is decided by the
  recorded event (the first edit, the usage limit, the first Codex event, the stop), never by a hand-placed marker.
  The strip above the stage is a scrubber: click a chapter to jump there; the current chapter's fill is the one accent.
  A caption under the stage says, in the owner's terms, what that chapter shows. Under reduced motion nothing plays
  by itself: the stage rests on the final frame and the chapters still answer a click.
- **A finished card folds to a line** once a later agent is on screen, as it does in the Room, so the Codex card has
  the room while Claude Code's stopped card stays as one line above it. The story and the terminal read top down until
  they overflow, then keep the newest line in view.
- **Three proofs, each with the product's own output beside it.** "The moment you would have missed" shows the real
  `firstMoment` over the recording; "Reassurance you can check" shows the real report card (touched, verified not
  touched, checks, risk, needs you); "One story, whichever tool you pick up" shows the stopped card and the card that
  continued from it. None of these is typed in: they are read off the same frames the demo plays.
- **The Potting Shed section shows its moat**: the two helpers the Shed's own `suggestHelpers` proposes from those two
  sessions alone ("Login guard": agents changed files in Login in 2 tasks; "Handover notes": 1 task carried on in a
  different tool), each with the count it rests on. Rule 2 holds on the landing page too.
- The rest: the hero with the makers' real marks in the works-with line and three checkable facts under the form; the
  Room in six lines; setup beside "what leaves your computer" (always sent, only for a report card, never sent); the
  two plans with a button each and the upgrade triggers in the order the brief expects; six questions; the closing line.
  The header sticks so sign-in is always one click away.

## What was found

- **A usage-limit stop was being read as a question the owner had been asked.** The Shed's suggestion engine and its
  per-box evidence counted any "blocked" card as a decision, so the demo record produced a "House rules" helper on the
  strength of "You were asked to decide 1 time", which is false: nobody asked anything, Claude Code ran out. Both now
  skip tasks that ended for a usage limit (`lib/shed/suggest.ts`, `lib/shed/evidence.ts`), and the rehearsal no longer
  offers to answer that "question". Found only because the landing page put the suggestion engine's output somewhere
  it had to be right.
- **A client component may not import a value from `lib/demo.ts`**: it pulls the store, and `node:crypto`, into the
  browser bundle and the page fails to build. The demo's shapes and chapter words now live in `lib/demo-chapters.ts`,
  which has no server code behind it; `lib/demo.ts` re-exports them.
- **The old `.tile` styles were only ever used by the mock tile**, so they went with it; the Room's own card classes
  (`room.css`) draw the demo instead, which is what keeps it from drifting.
- **`flex: 1` overrides `height`** on a column flex item, so the Room pane on the stage grew with its content until
  its basis was set to auto. Worth remembering: the stage is meant to be a fixed 640px on wide screens so the page
  below never jumps while the demo plays.
- **Hiding the chapter titles with `display: none` on phones removed the tabs' names.** They are clipped instead, so
  a reader still hears "It changes Login" and the strip still fits at 390px.
- The screenshot script's `landing` scene, the contrast audit and the console check pass at 390px and 1440px.

## What only Christopher can do

- Read the page as a customer. The chapter titles and captions (`DEMO_CHAPTERS` in `lib/demo-chapters.ts`), the three
  proofs and the six questions (`components/Landing.tsx`) are the product's pitch now; any line that reads wrongly is
  one string.
- The "What does it run on?" answer says Windows needs Git Bash. That is what the Phase 0 open question implies; if
  the connector's hooks turn out to work without it, soften the line.
- The measured sign-up rate is on `/admin`; the target is 5% of landing views.
