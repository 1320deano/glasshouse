# Phase 7 findings: the Potting Shed, rebuilt around one card

Built on 12 September 2026 from Christopher's brief: the Shed had come out as a replica of Glasshouse (three columns, a
conversation in the middle) and was not the product he had pictured. The two products should look and feel completely
different. The Shed is for building agents, above all for people who will never open the code, and it should be
"super, super, super easy in a revolutionary way": a get-started card, boxes to tick that decide what the agent does and
how it talks. The conversational way in stays for people who want a more advanced helper.

## What changed

- **One page, one card, no columns.** The Room's grid, tabs and reply box are gone from the Shed. What remains of the
  Room is the header (the way out, the product name, the project switcher, "Watch in Glasshouse") and the materials.
  `main.shed-page` is its own layout in `styles/deano.css`; `Shed.tsx` was rewritten.
- **Get started: pick a kind.** Six tiles: Checker, Guard, Specialist, House rules, Handover notes, Something else. Under
  them, "Or take one your project suggests": the record-driven suggestions from Phase 6, unchanged in what they compute,
  now with "Use this".
- **Then tick boxes.** Picking a kind unfolds the card into steps on the left and "Your helper so far" on the right:
  1. what kind (a row of chips, so the owner can change their mind);
  2. what it does: ten boxes, each one plain sentence the helper is told;
  3. where it may work: "Works in" chips and "Never changes" chips, sensitive parts already in the second;
  4. when it must stop and ask you: the project's sensitive parts, then the standard moments, plus the owner's own;
  5. how carefully: Careful, Balanced, Quick (three stages, never a number);
  6. **how it talks**: five boxes (plain English, short, gives reasons, says when unsure, one question at a time). New,
     asked for in the brief;
  7. things it should already know;
  8. which tools (with the makers' marks);
  and, last and optional, "Anything else, in your own words".
- **The preview is the truth.** `lib/shed/build.ts` holds the vocabulary. `briefFromChoices` writes the stored brief as
  exactly the ticked sentences plus the owner's own words; `describeChoices` writes the card beside the boxes from the
  same choices; `choicesFromBrief` reads a stored brief back into ticks by matching sentences exactly, so "Change" on a
  helper reopens it with the same boxes ticked and never guesses. Under Technical detail every box also shows the
  sentence it becomes, and the card shows "The files it becomes", compiled live.
- **Suggestions open as ticks.** `suggest.ts` now writes every job from the same sentences (`jobFrom`), so "Use this"
  lands in the builder with the right boxes ticked rather than a paragraph of prose. Its counts and evidence are
  unchanged and still tested.
- **Describe it.** A segmented switch at the top of the card. The owner writes a sentence; with an AI key it is tidied
  into a first draft (name, boundaries, stop-and-ask moments, care), without one it is used as typed. Either way it lands
  in the same card, in the "own words" box, with the kind set to Something else, and the owner can tick from there.
- **Your helpers is a grid** under the card, with the same facts as before: tools, placed or not, what it does (from the
  ticks), works in, never changes, kept to its patch. One command notice when any helper is not yet placed.
- **Phones.** One column; a sticky bar at the bottom carries the helper's name, how many things it will do, and the one
  button, so the owner never scrolls a long form hunting for Grow it.
- **Answers are read safely.** The Shed now reads every reply through `askServer` (`lib/answer.ts`), as the rule requires;
  the old version called `res.json()` directly.

## What was found

- **Old helpers reopen as "Something else".** A helper grown before this rebuild has a prose job; nothing in it matches a
  ticked sentence, so it reopens with no boxes ticked and its whole job in "own words", exactly as stored. Nothing is
  lost, and the owner can tick boxes and remove the prose at their own pace. The two starters and every suggestion are
  written from the new sentences, so anything grown from now on round-trips exactly.
- **A job can now be longer than 1,200 characters.** Ten ticked sentences and a paragraph of own words pass that, so the
  input limit is 3,000. The database column is free text, so nothing else changes.
- **The "Stops to ask you" line can be long.** A checker on a project with four sensitive parts starts with five moments,
  and the preview lists them all. It is a list of facts and was left whole rather than counted; if it proves tiring, the
  card could name the first two and count the rest.
- **The AI draft does not tick boxes.** With a key, "Describe it" fills the name, boundaries, stop moments and care from
  the AI's reply, and puts its rewritten job in "own words". Mapping the owner's sentence to duties would be a guess, and
  the rules say nothing is guessed; the owner ticks.
- **The screenshot script's Shed scenes were rewritten** (`scripts/design-screenshots.mjs`): the card, a kind picked, a
  suggestion taken, the describe-it way in, a helper's details, the empty project, the checked project. The phone tab
  scenes are gone with the tabs.
