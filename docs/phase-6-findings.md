# Phase 6 findings: Deano, and the Potting Shed

Built overnight on 8 to 9 September 2026 from Christopher's brief: a second product, an agent builder, "revolutionarily
simple, user friendly and non-technical", living on the same website as Glasshouse, with a moat no other agent builder has.

## The names

| Thing | Name | Why |
| --- | --- | --- |
| The website | **Deano** | Christopher's instruction. `NEXT_PUBLIC_SITE_NAME` changes it. |
| The control room | **Glasshouse** | Unchanged. Now a product inside Deano, not the site. `NEXT_PUBLIC_PRODUCT_NAME`. |
| The agent builder | **Potting Shed** | The place next to a glasshouse where you raise young plants before they go out. It says what the product does (you raise helpers here, then place them in the project) in the same garden as Glasshouse, and it is not a name any agent builder on the market uses. `NEXT_PUBLIC_SHED_NAME` changes it. Short form in the UI: "the Shed". |
| An agent or sub-agent | **a helper** | Owner language. "Sub-agent", the file name and the tool's own word live behind the Technical detail toggle. |

Both product names are working names, like Glasshouse was in Phase 4 (`docs/name-decision.md`). Nothing about them is
baked in.

## The moat: the only agent builder that has watched your project

Every agent builder on the market (OpenAI's Agent Builder, Copilot Studio, Relevance, Lindy, Zapier Agents, n8n, the
sub-agent generators inside Claude Code and Cursor) starts from a blank box: describe the agent, pick tools, write or
generate a prompt, test it in a chat window. None of them has a record of what agents actually did in *this* project,
because none of them is watching. Glasshouse is. So the Shed can do four things nobody else can:

1. **Helpers grown from the record.** The right-hand column proposes helpers from what has actually happened: a
   *checker* for the part of the app where an agent got stuck (same error three times), a *guard* for a sensitive part
   that agents changed, *house rules* built from the questions the owner has had to answer, a *finisher* when tasks were
   called done with failing checks, *handover notes* when work was carried between tools, a *specialist* for the busiest
   part. Every suggestion carries the count it rests on and links to the tasks behind it. Nothing is generated or
   guessed; with an empty record the two starters say "not from your record" out loud. (`lib/shed/suggest.ts`)
2. **Rules from your own answers.** "Things it should already know" is pre-filled from the decisions the owner was asked
   for, each with the task it came from. The owner writes the answer once; no agent asks it again.
3. **Boundaries in the owner's own words, compiled to real folders.** "May work in Checkout. Must never change Payments
   or Login" is chosen by tapping the parts of the app from the area map, and compiles to the actual path prefixes in
   the file each tool reads. A renamed part is right in every helper at once, because the files are compiled when read,
   never stored. (`lib/shed/compile.ts`)
4. **Checked afterwards.** Once a helper has run, its card says whether it kept to its patch: "Ran 3 times; went outside
   its patch once (Payments)". That is computed from the files its runs actually changed (sub-agent start events name the
   helper; edits carry the agent id), never from what the helper said. When a tool does not say which agent made an
   edit, the whole task's changes stand in; if they are clean the helper's must be too, and if not the card says
   "unclear" rather than accuse. (`lib/shed/runs.ts`, `lib/shed/verify.ts`)

The loop is: watch → grow → place → watch again. Only a product that watches can close it.

## Simplicity

- **No prompt writing.** The owner types one sentence in the same reply box the Room uses ("Check the checkout still
  works before anything is called finished") or taps "Grow this" on a suggestion. That becomes a **sheet** with six plain
  questions in a fixed order: what it does, where it may work (tap a part once to allow, twice to forbid), when it must
  stop and ask you (checkboxes), how carefully (Careful / Balanced / Quick, three stages, never a number), things it
  should already know, which tools. Then "Grow it".
- **One helper, every tool.** Written once, compiled for Claude Code (`.claude/agents/<name>.md`, a real sub-agent),
  Cursor (`.cursor/rules/<name>.mdc`, scoped to the helper's folders) and Codex (a marked section of `AGENTS.md`, which
  Codex reads at the start of every session; Codex has no sub-agent files, and the sheet says so).
- **One command to place them.** `npx glasshouse helpers` in the project folder writes the files and tells the Shed they
  are in place. The Shed never writes into a folder itself, so the agents' side of the product stays watch-only.
- **The truth is one toggle away.** "Details" on a helper card shows the exact file each tool will read, with a Copy
  button, plus every run and its verdict. "Technical detail" shows the slug and the folder prefixes.
- **With no AI key everything works from the owner's words as typed.** With a key, the one AI call in the Shed
  (`lib/ai/helper.ts`, purpose `helper`, logged like every other call) tidies the typed sentence into a name, a clearer
  job and a first guess at the boundaries, choosing only from parts the map actually has. The AI proposes; the owner
  decides; nothing is saved until "Grow it".

## Deano: the site around the two products

- `/` signed in (or in local mode) is the **front door**: the two products side by side in the Room's own chrome, each
  with one live fact computed from the record ("3 agents working now · 1 waiting for you"; "1 helper grown, 1 placed").
  Signed out, `/` is still the landing page, which now has a "Two products, one record" section.
- `/glasshouse` is the Room's door (your projects; straight into the Room with one project). `/shed` is the Shed's door.
- Every product screen has the **way out** in the top-left corner: a labelled "Products" link before the product's
  name, which goes back to the front door; the front door has a "Landing page" link in the same place, so the owner can
  back out all the way. (The first version used an icon-only grid button; Christopher asked for something visible.)
  The product name itself goes to that product's door. The Shed also carries "Watch in
  Glasshouse" for the same project, and the Room's project links reach the Shed through the front door.
- The pages around the products (account, connect, testers, sign in, not found) carry the site's name, so their brand
  link goes to the front door.
- Plans: Free grows two helpers per project, Pro as many as you like (`lib/plan.ts`, applied on the server in the save
  route, never in the browser). Everything else about plans is unchanged.

## What is where

- `apps/web/src/lib/brand.ts` — site, product and command names, and the two product cards' words.
- `apps/web/src/components/ProductPicker.tsx`, `app/page.tsx` — the front door and its facts.
- `apps/web/src/app/glasshouse/page.tsx`, `app/shed/page.tsx` — the two doors.
- `apps/web/src/components/Shed.tsx`, `app/shed/[projectId]/page.tsx` — the builder. Same grid, header, columns, tabs
  and composer classes as the Room, so the two products cannot drift apart visually.
- `apps/web/src/lib/shed/` — `compile.ts` (words to files), `suggest.ts` (the record to suggestions), `runs.ts` (sub-agent
  runs from events), `verify.ts` (kept to its patch), `view.ts` (the Shed for one viewer), `slug.ts`, `input.ts`;
  `shed.test.ts` covers all of them and the store.
- `apps/web/src/app/api/shed/[projectId]` (GET, POST, DELETE), `api/shed/draft` (the optional AI tidy-up), `api/shed/pull`
  (the connector's side, project token only).
- `apps/web/src/lib/store/types.ts` — `HelperRecord`, `HelperBrief`, `HelperRun` and the six store methods, in both
  stores. `supabase/migrations/20260909000000_phase6.sql` adds the `helpers` table and an index on events for the runs.
- `packages/translate/src/helper-files.ts` — the marked-section merge shared by the web app and the connector.
- `packages/connector/src/helpers.ts` — `glasshouse helpers`: pull, write, merge, remove what a deleted helper left,
  report placed. `helpers.test.ts` covers writing, merging into an existing AGENTS.md, and never removing a section it
  did not write.
- `apps/web/src/styles/deano.css` — the sixth layer: the picker and the Shed's own cards, sheet and chips.

## What was found

- **The folder-name heuristic names `src/checkout` "Payments".** In the demo seed both `checkout` and `payments` became
  "Payments" and "Payments (src)". The area editor fixes it in one rename, and the Shed reads the rename at once, but a
  helper grown before the rename would have said "Payments (`src/checkout/`)" in its file. The heuristic's word list is
  the place to fix it (Phase 2's `areas.ts`).
- **Only Claude Code names the helper that ran.** Its SubagentStart hook carries `agent_type` and `agent_id`, and its edit
  hooks carry the same `agent_id`, so the after-the-fact check is exact there. Cursor sends a `subagent_id` but not the
  type (the check falls back to the whole task and says "unclear" when the task strayed). Codex has no sub-agents at all,
  so a Codex helper is standing guidance and is never "checked afterwards"; the sheet says so. Replace the synthetic
  Cursor fixture with a real recording before trusting the Cursor half.
- **The check names a helper by its file name.** If the owner renames a helper, its slug changes and earlier runs stop
  matching. Runs before the rename are still in the record, just not on the card. Keeping the old slugs on the record
  would fix it; left for the first real use to decide whether it matters.
- **Placing is by hand, on purpose.** It would be one line to have the `watch` process pull helpers every few minutes.
  It was not done: an agent's instructions changing under it without the owner's hand on the command is exactly the kind
  of thing rule 4 exists to stop. The command prints every file it wrote.
- **The hosted store's helper methods have not run against a real database**, like the rest of the Supabase store
  (`docs/supabase-setup.md`). The migration is written to the same pattern as the Phase 4 one.
- **The Room's story does not yet mention helpers.** "Started a helper (checkout-checker)" is in the ticker and the
  record; a story line "The checkout checker started" with the verdict on finish would close the loop in the place the
  owner looks first. One template in `lib/story.ts`; left for Phase 7.
