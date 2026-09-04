# Phase 3 findings

Date: 4 September 2026. Memory: the reasons to keep the tab open after the agents have gone quiet.

## What was built

| Piece | Where | What it does |
|---|---|---|
| Report card on task finish | `packages/translate/src/report.ts`, `apps/web/src/lib/ai/report.ts`, `components/ReportCard.tsx`, `/api/report/<task>` | The moment a task ends (stop, usage limit, session closed) the store writes a card from the record, at zero cost. The tile turns into the card: headline, before/after, **Touched** (with the reason per part), **Not touched** (computed from the changed-files list against the map, never guessed), **Evidence** (checks run and results, new tools added, settings or secrets touched yes/no, files changed, checkpoints, errors), risk with a one-line reason, and **Needs you** with the specific question. With an API key, one strong AI call per finished task improves the words only; `mergeAiReport` drops any part the AI names that the changed-files list does not, and never lets it lower the needs-you level the facts set. |
| The diff behind the card | `diffFromEvents` in `report.ts` | Rebuilt from the patches Claude Code carries on each edit (`structuredPatch`, already kept by the Phase 0 privacy rules and never for secret files). Sent only for the report card and the Ask box, never stored on its own. Codex and Cursor edits carry no patch, so their cards are written from the actions alone and say so. |
| Needs you, from facts | `needsYouFloor` in `report.ts` | Blocked: usage limit, or ended on an unresolved error. Decision: the agent's closing words asked the owner a question (the sentence is quoted). Review: checks failing at the end, or high risk. Otherwise nothing. The AI may raise the level and phrase the question; it may never lower it. |
| Since you last checked, and the digest | `packages/translate/src/digest.ts`, `apps/web/src/lib/ai/digest.ts`, `/room/<id>/digest`, `/api/digest/<id>` | Three windows: since you last checked (from the moment the digest page was last open for a few seconds; the last 24 hours on the first look), today, this week. Sections: Needs you (live tiles waiting or stuck, plus flagged cards), Done (one line per finished task with its card headline and risk), Still going, New in your app (parts not on the map at the previous digest, tools added, files created and where), Tools used (with "1 task picked up after Claude Code ran out of credits"). Every list is from the record. With an API key the AI writes a two-sentence opening; it is cached against a fingerprint of the facts so reopening the page while nothing changed costs nothing. The Room header shows "Since you last checked (3 done, 2 need you)". |
| Needs-you inbox | `/room/<id>/inbox`, `/api/inbox/<id>` | Everything a card flagged Review recommended, Decision needed or Blocked, in one list, blockers first, over the last 30 days. Clear an item once dealt with; put it back if not. The Room header lights "Needs you (n)" in amber while anything is open. A new ending on the same task makes a new card and clears the old mark. |
| Ask box | `apps/web/src/lib/ai/ask.ts`, `/api/ask`, in the expanded tile | A question about one task, answered only from its record: the instruction, every action (with a short id), the parts touched, the checks, the diff. The answer names the actions it rests on ("Based on: …") and the technical toggle shows the raw action behind each, so rule 3 holds for answers too. Without a key the box says plainly that Ask needs one. |
| Translation feedback | 👎 on every stream line, `/api/feedback`, `/room/<id>/feedback` | Stores the plain-English line exactly as shown, the raw one-liner, the kind and the event id, so the weekly review (Phase 5) can see what went wrong even after the map changed. The review page shows each disliked line, what it reads today, and the real action, with the dislike rate over all recorded actions. |
| Supabase | `supabase/migrations/20260905000000_phase3.sql`, `store/supabase.ts` | `reports` gains the stored words (`touched_reasons`, `source`, `event_count`), `digests` gains `kind` and `fingerprint`, `translation_feedback` gains the line as shown, `projects` gains `last_checked_at`. The fact columns on `reports` are readable snapshots; the Room recomputes them on read. |

## Measured

| What | Result |
|---|---|
| Tests | 151 across schema, translate, connector and web (was 121). The new ones replay the recorded fixtures through the card, the inbox, the digest and feedback. |
| AI calls per task | Unchanged without a key: 0. With one: the Phase 2 calls plus one report call per finished task (at most one per ending; a stop followed by a session close is one ending), plus one digest call per window while the facts change, plus one Ask call per question. |
| Diff budget | 14,000 characters per report call, 10,000 per Ask; the card says when it was cut. |
| End to end | The built Room was seeded with the three recorded sessions and screenshotted: the tile turns into the card, the header counts match the inbox and the digest, and "Not touched" on every card agrees with the changed-files list. |

## Design decisions

- **Words are stored, facts are not.** A card row keeps only what was written (headline, before/after, the AI's reasons per part, the risk line, needs-you and its question). Touched, not touched, evidence and risk are recomputed on read from the task's record and the current map, like every other line in the Room. Rename "Login" to "Signing in" and every card, digest line and inbox item follows. Template reasons per part are not stored at all for the same reason.
- **The card exists before the AI does anything.** The template card is written inside ingest, in the same step that closes the task, so the tile turns into a card within the usual 50 ms. The AI call runs afterwards in the background and replaces the words when it lands.
- **The AI never sets a fact.** The report prompt hands the AI the facts, the actions and the diff, and asks for words. What comes back is validated (JSON shape, owner language, known part names) and merged under the facts. A card can therefore never say "Payments untouched" unless the file list says so, whatever the model writes.
- **"Since you last checked" is anchored to the digest page**, not the Room tab. Leaving the Room open on the second monitor all day must not make the digest empty; opening the digest and reading it for a moment is what counts as checking.
- **The Ask box cites its sources.** Every answer returns the ids of the actions it rests on, shown as plain lines with the raw action behind the toggle. An answer the record cannot support is marked "unsure" and says "I can't tell from what was recorded".

## Honest gaps

- **No AI report, digest or Ask has been run against a real key.** The prompts, parsing, validation and merging are tested; the first real card should be read critically and the prompt tuned. Without a key everything on this page works from templates (verified end to end).
- **Before/after is AI-only.** The template leaves it blank rather than guess. Without a key, cards have no before/after line.
- **The diff is only available for Claude Code.** Codex `apply_patch` bodies are reduced to a file list at the connector for privacy, and Cursor strips contents. A Phase 4 option is to have `glasshouse watch` attach `git diff` for the changed files at task end, still under the "diff of changed files only" rule.
- **"New parts of your app" needs a previous digest** to compare against; the first digest of a window kind lists none.
- **The Supabase store is still unverified live**, now with three more tables' worth of untested SQL. Apply all three migrations when the hosted project exists.
- **Email delivery is Phase 5.** The digest is in-app only.
- **"Decision needed" from the closing message is a heuristic** (a sentence with a question mark and owner-facing words). It can miss a question phrased without one, and the AI is expected to catch those when a key is present.

## Exit test

"The first report card shows Christopher something he would have missed." Not yet run for real: it needs a real session on
Christopher's machine. In the fixture replay the Codex card that continues the Claude Code task reads "Review
recommended · High risk: changes login" with Login and Dashboard touched and Payments, Storyboard and Uploads verifiably
not, which is exactly the kind of line the brief wants noticed. The live version is his next finished task.
