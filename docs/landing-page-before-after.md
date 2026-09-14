# The landing page, before and after

Written for Christopher on 14 September 2026. Every picture is a real screenshot of the website running on this
computer with demo data, taken by the design-QA script at a desktop width (1440px) and a phone width (390px), before
and after the rebuild. Nothing is a mockup. The change is on the branch `claude/funny-pascal-euz2ei`; the working
notes are in `landing-page-findings.md`.

## In one paragraph

The landing page is the public page a visitor sees before signing up, so it is where a hit is made or lost. Before,
it described the product in three short paragraphs and showed one small, out-of-date card floating in a big empty
grey box; the "credits run out, switch tools, the story carries on" moment played somewhere in a loop that nothing
pointed at. After, the page shows the product: the same two real recorded sessions replayed through the real control
room, cut into five chapters you can click through, with the real cards, the real story, the real "this is the
moment" callout and the real report card. Every reassuring line on the page is computed from that recording, the same
way it would be in the product.

## The whole page

Desktop, before and after.

| Before | After |
| --- | --- |
| ![The old landing page at desktop width](report/landing/before-1440.png) | ![The new landing page at desktop width](report/landing/after-1440.png) |

Phone, before and after.

| Before | After |
| --- | --- |
| ![The old landing page on a phone](report/landing/before-390.png) | ![The new landing page on a phone](report/landing/after-390.png) |

## The demo, chapter by chapter

The five chapters are the brief's own thirty-second demo. Which moment belongs to which chapter is decided by the
recording (the first change, the usage limit, Codex appearing, the finish), never placed by hand. The left pane is the
terminal on the prompting monitor, written from what the recording actually contains. The right pane is the control
room in miniature, drawn with the control room's own parts.

**1. It reads first.** Every action becomes one plain line. The headline only changes when the meaning does.

![Chapter 1](report/landing/demo-chapter-1.png)

**2. It changes Login.** You asked about the dashboard; it changed how people log in. The card flips to "High risk",
and the "This is the moment" callout appears in the story with your own instruction beside it.

![Chapter 2](report/landing/demo-chapter-2.png)

**3. Credits run out.** Claude Code stops mid-task. The card says "Blocked", where it got to, and what it verifiably
did not touch.

![Chapter 3](report/landing/demo-chapter-3.png)

**4. Codex carries on.** A new tool, but the story does not start again: the Codex card says "Continuing from Claude
Code". The finished Claude Code card folds to one line, as it does in the control room.

![Chapter 4](report/landing/demo-chapter-4.png)

**5. The report card.** Touched, not touched, checks, risk, and "Review recommended". All computed from the files that
changed.

![Chapter 5](report/landing/demo-chapter-5.png)

On a phone the two monitors stack and the chapter strip keeps its numbers.

![Chapter 5 on a phone](report/landing/demo-phone-chapter-5.png)

## The rest of the page

The opening, with the three tools' real marks in the "works with" line and three checkable facts under the button.

![The opening](report/landing/after-hero.png)

Three proofs, each shown rather than claimed: the moment you would have missed, the report card you can check, and
the handoff between tools. Each exhibit is read off the same recording the demo plays.

![The three proofs](report/landing/after-proofs.png)

The control room in six lines.

![Six lines](report/landing/after-six-lines.png)

The Potting Shed, with the two helpers its own suggestion engine proposes from those two sessions.

![The Potting Shed section](report/landing/after-shed.png)

Setup beside what leaves your computer.

![Setup and privacy](report/landing/after-setup.png)

Price, with a button on each plan.

![Price](report/landing/after-price.png)

## What changed, in short

- The demo is now the control room itself, framed in five clickable chapters with a caption each, and it pauses.
- The terminal shows the recording's own lines, and says "codex" when Codex starts (it used to say "claude").
- Three proofs with the product's real output beside the words; the Shed section shows real proposed helpers.
- New sections: the control room in six lines, what leaves your computer, six questions, a sticky header.
- Found and fixed along the way: the Potting Shed was reading "Claude Code ran out of credits" as a question you had
  been asked, and proposing a "House rules" helper on the strength of it. It no longer does.
- All 210 automatic checks pass; the readability (contrast) audit is clean at both widths.

## What needs you

- Read the page as a customer: the chapter titles and captions, the three proofs and the six questions are the pitch.
- The "What does it run on?" answer says Windows needs Git Bash; soften it if you know otherwise.
- Merge the branch when you are happy.
