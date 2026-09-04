# The 30-second demo (brief section 15)

Split screen, no voiceover. Left: the prompting monitor. Right: the Room. The credit-switch moment lands at second 18.
The landing page's mock tile plays this same story from the recordings; the video should be the real thing.

## Before recording

- Two monitors, one screen recording of both, 1920 wide each or a single 2560 capture split in the middle.
- A sample project with a `src/auth`, `src/dashboard`, `src/storyboard`, `src/payments` and `src/upload` folder, connected
  with `glasshouse connect`, area map named (rename to "Login", "Dashboard", "Storyboard", "Payments", "Uploads" on
  the Parts of your app page so the tiles read cleanly).
- Claude Code with a low enough remaining allowance that the task below hits the limit, or a session recorded earlier
  and replayed with the fixture recorder. Codex signed in and ready in the same folder.
- The Room open on the right at 125% zoom so the headline is readable in the video.

## The shots

| Second | Left (terminal) | Right (the Room) | How to make it happen |
|---|---|---|---|
| 0–5 | Claude Code churning: tool calls scrolling | One tile. Headline "Looking into how Dashboard works" → "Changing the scene builder part of Storyboard" · Working in **Storyboard** · **Building** · ticker calm | Prompt: "The dashboard needs to know which organisation a user is in. Change the login session so it carries the organisation id." Let it read for a few seconds first. |
| 5–12 | "Update(src/auth/session.ts)" | Headline flips: "Changing how logged-in users are identified" · Location **Login** · badge flips to **High risk** · the amber "This is the moment" callout appears: "Claude Code changed Login. You asked: …" | The first edit in `src/auth`. The callout is automatic on a fresh browser (clear the dismissal: `localStorage.removeItem("glasshouse.walkthrough.<project id>")`). |
| 12–18 | — | Click Expand. Why: the prompt. Where: Login (changed), Dashboard (looked at). **Not changed: Payments · Storyboard · Uploads** | The expanded tile. Leave the technical toggle off. |
| 18–24 | "You've hit your usage limit" | Tile: **Stopped: usage limit**. Start Codex with "Continue the login session change…". A second tile appears: **Codex** · "Continuing from Claude Code: Stopped: usage limit reached" · Working in **Login** | The StopFailure hook fires; the Codex prompt overlaps the first prompt's words and touches the same part, so the continuity link is made. |
| 24–28 | Codex finishes: "All 6 tests pass." | The Codex tile turns into its report card. Touched: Login, Dashboard. **Not touched: Payments ✓ Storyboard ✓ Uploads ✓**. Needs you: **Review recommended · High risk: changes login.** | The Stop hook. The card is written the moment it lands; the AI-worded version replaces it a few seconds later if a key is set. |
| 28–30 | — | Cut to black. Text: "Two tools. One story. You never opened the code." | Title card in the editor. |

## If the usage limit will not cooperate

Record the Claude Code half on a day the limit is close, or replay `fixtures/sessions/claude-code-usage-limit-synthetic.jsonl`
through `fixtures/record-hook.mjs` into a connected project. The Room cannot tell the difference, and the fixture is
labelled synthetic in the repository, not in the video; replace it with a real recording as soon as one exists.
