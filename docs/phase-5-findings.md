# Phase 5 findings: the three-column Room

Built from Christopher's mockup (6 September 2026) and the answers he gave to the questions about it.

## What was decided, and why

| Mockup showed | Decision | Reason |
| --- | --- | --- |
| "85% complete" bars per area | Five-segment **stage** bars (looking, planning, building, testing, finished) plus counts | Rule 1: stages, never percentages. An agent cannot honestly know how far along it is. |
| "Fix with Codex agent", "Deploy anyway" buttons | **Watch-only.** "Open the report" and "Copy a message for the agent" (copies words to the clipboard, sends nothing) | Rule 4. The connector is one-way and stays that way. |
| File paths, task IDs and +142/-38 in the default view | Plain-English **parts touched** by default; paths, task ID and line counts behind "Details → Show technical detail" | Rule 5. |
| "Sprint velocity 4.8x normal" | Dropped | Cannot be backed by a checkable fact. |
| A "Supervisor" that writes messages | **Template messages** from the record (`lib/story.ts`); AI narration is a later phase | Christopher: "template messages for now, focus on UI". |
| Dark UI | **Light only**, everywhere | Christopher's choice. No dark mode. |
| Desktop only | Three **tabs on a phone** (Agents, Story, Progress) | The Room still has to work on a phone. |

## What is where

- `apps/web/src/components/Room.tsx` — the shell: header (project switcher, working/waiting/stuck counts, last action, nav), the phone tabs, the three columns.
- `AgentCard.tsx` — one card per agent. Live cards in full; finished ones as one line; days before today behind "Show earlier".
- `Conversation.tsx` — the story (from `state.story`) plus the Ask reply box (existing `/api/ask`, one task at a time, chosen in the "About" dropdown).
- `Progress.tsx` — activity heatmap (actions per two-hour slot, last seven days, local time), tool mix, per-part stage bars.
- `lib/story.ts`, `lib/progress.ts` — pure, tested in `lib/room-facts.test.ts`. Both stores call them in `getRoom`; `lib/plan.ts` cuts the results to the plan's history window.
- `styles/room.css` — the Room's own layer; `tokens.css` is now a light palette. Every text colour was checked at or above 4.5:1 on every surface it sits on.

## What was found

- **The template headline for a waiting task is the bare "Waiting for you".** The card and the story now fall back to the last action's plain line ("Waiting for you to approve a command") and say where. The template itself could carry the reason.
- **Line counts (+/-) exist only for Claude Code.** They are counted off the patches its edit hooks carry. Codex and Cursor send none, so the technical strip says so instead of showing zeros.
- **The branch is not recorded.** The mockup's "origin/main" needs the connector to send the branch with commit or session-start events. Left out of the header rather than guessed.
- **Ask is still per task.** The reply box picks the task from a dropdown (live tasks first). A project-wide Ask that reads the whole story is the next step of "the conversational aspect".
- **The dev server wedged once during the design shoot** (100% CPU, 2.3 GB) while files were being edited under it. Not reproducible afterwards: the same pages shot cleanly with the server idle at 600 MB, and `getRoom` for the seeded project takes 11 ms. Noted in case it recurs; the production Room process on this machine also showed high CPU at the time and is worth a look.
- **`apps/web/.env.local` carries the hosted Supabase keys**, so a plain `pnpm dev` talks to the real database. For design work, blank `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` on the command line and point `GLASSHOUSE_LOCAL_STORE` somewhere scratch. The seed script refuses to run against the hosted store without a link code, which is what saved the real database here.

## Not done (needs a decision or a later phase)

- AI-written story messages and a daily opening summary (Christopher: later).
- Saving the conversation (questions and answers) across reloads: the story itself is recomputed from the record so it survives; the Ask history does not.
- Real recordings for Codex and Cursor (still `-synthetic` fixtures; see Phase 2).
