# The design system

One system, four layers, in this order. Every screen composes them; nothing below the first layer
invents a value.

| Layer | File | What lives there |
| --- | --- | --- |
| tokens | `apps/web/src/styles/tokens.css` | colour, type scale, spacing, radii, shadow, motion, layout |
| base | `apps/web/src/styles/base.css` | reset, typographic defaults, links, the focus ring, the motion contract |
| components | `apps/web/src/styles/components.css` | buttons, fields, badges, cards, notices, empty states, the loading wheel, tables, page shell |
| screens | `apps/web/src/styles/screens.css` | the report card, the task panel, digest, inbox, areas, landing, admin |
| room | `apps/web/src/styles/room.css` | the Room: header, three columns, agent cards, the story, progress |
| deano | `apps/web/src/styles/deano.css` | the front door (the product picker) and the Potting Shed, composed from the Room's own parts: the way-out button, product cards, helper and suggestion cards, the sheet, chips |

`apps/web/src/app/globals.css` is six `@import` lines and nothing else.

**Light only, and warm.** The palette is the Claude app's: an ivory page (`#f5f4ee`), white surfaces,
warm greys for lines and quiet text, one terracotta accent. There is no dark mode. The grey ramp's
numbers name a role, not a lightness (`--grey-1000` is the page, `--grey-50` is the primary text), so
every rule reads the same whichever way the palette leans. White is spent on things: cards, and the
reply box, which is the one surface that floats.

## The rules

**One accent.** `--accent` (terracotta, #b04f2c) is for a primary action, a focused control, the
"working" dot, or the single most important link on a page. Never a whole navigation, never
decoration. Text that sits on the accent's tint uses `--accent-ink`, a shade deeper, so it still
passes AA. Links are neutral by default; `.link-accent` opts one in.

**Status colour carries a fact.** In the Shed, the green "In your project" pill and the green "kept to its patch" line
are computed (from the connector's report and from the files a run changed); a red "went outside its patch" is the same
computation the other way; amber "unclear" means the tool did not say which agent made an edit. The chips on the sheet
use the same three: green may work here, red must never change, neutral no rule.

 Amber (`--warn`) means the owner is the blocker: waiting for you,
a decision needed, a part that counts as high risk. Green (`--positive`) means verified: "not
touched", checks passed. Red (`--danger`) means an error, stuck, or high risk. Nothing is coloured
because it looks nice. Per the Room's design rules, "waiting for you" is the one badge allowed to
light up, and the card it belongs to is the one card allowed an amber border. Amber and red are spent
on the *agent card* and in the report; the progress column states the same facts in words and in its
own blue, so the owner's eye is pulled to one place and not to two. The activity heatmap
climbs `--blue-1` to `--blue-4`: it is a count, so it may use the progress blue's ramp and nothing else.

**The progress column is blue, and only blue.** `--blue` is Claude's blue (#6a9bcc, the secondary
accent of the Claude and Claude Code apps). The right-hand column of the Room is the week in counts
and stages, so it is drawn in that one cool family from top to bottom and nothing warm appears in
it: the heatmap's four steps (`--blue-1` to `--blue-4`); the filled segments of a part's stage bar
(`--blue`, with the "finished" segment at `--blue-deep`); every part's stage word, including
"waiting for you" and "looks stuck", in `--blue-ink` (#356490, the one step dark enough for text at
6.2:1 on a white card); and all four hues of `TOOL_COLOURS`, which are three depths of the same
blue plus the watcher's slate, for the tool mix bar and its key.

The signals the owner is meant to catch from across the room are on the agent card, not here: its
amber status word, its amber edge, its red "looks stuck" block. So the stage bar is never tinted
amber or red, and a failing check is stated in words in `--blue-ink` rather than in red — `--positive`
green for "checks passed" is the one status colour this column still spends, because it is a verified
fact. `TOOL_COLOURS` is deliberately not the makers' brand colours; the real logos carry those
(see **the tool marks** below).

**Contrast passes AA everywhere.** Every text token is at or above 4.5:1 on the surface it is used
on (`--text-tertiary` is the floor at 5.0:1 on the subtle fill). Earlier sessions are made quieter with size and
colour, never with `opacity` — a dimmed tile is an unreadable tile.
`node scripts/design-screenshots.mjs out/` audits every rendered screen and fails loudly.

**Type is Geist, one scale, 11px to 48px.** Geist is the open face closest to Anthropic Sans (which
credits Geist's designers); Next bundles it at build time (`app/layout.tsx`), so the Room renders it
offline and falls back to the system stack only if that bundle is missing. Source Serif 4 is the one
serif, and it is used for one kind of thing: the greeting-style title at the top of a column, set the way
Claude sets its greeting. That is the project's name at the top of the Room's story and the Shed's builder, the
greeting on Deano's front door, and the name of the helper being written on the Shed's sheet. Sizes are absolute. The only two clamps are `--text-headline` (the Room's
tile headline) and `--text-display` (the landing hero), because those two are read from across a desk.
Labels are sentence case. Nothing in the Room is uppercase, tracked or set in the mono face except
paths behind the technical toggle.

**Space is an 8pt grid.** `--space-1` is 8px; 4px and 12px are the half-steps. Nothing is spaced by
a number typed in by hand.

**Lines, not shadows.** Surfaces are separated by one hairline at one of three tones. Pills and
badges are borderless tints. Shadows exist in the tokens but are reserved for things that genuinely
float, which in the Room is the reply box and an opened card.

**The owner decides how much is on screen.** Either side column folds away to nothing, leaving only its
own toggle sitting on the exact pixel it occupied while the column was open; either can be widened or
narrowed by dragging its inner edge (240-560px, and never squeezing the story below 380px); cards have a
compact density; and each progress section folds on its own. Every fold and width is remembered in that
browser (`glasshouse.room.*` in localStorage) and none of it is stored on the server or changes what the
record says.

**Motion says "this arrived" or "this opened", and nothing else.** Tiles rise in, panels expand, the
working dot pulses, the chevron turns. All of it is switched off under `prefers-reduced-motion`.

**One wheel while anything is on its way, never a skeleton.** A skeleton guesses the shape of what is
coming, and the shape is not knowable up front: the Room's folds live in the browser, and the Shed, the
front door and the plain pages are all different shapes. `components/Loading.tsx` is the one loading
state, inline or as a whole page (`app/loading.tsx`); it waits a beat before showing so a fast answer never
flashes it. When the real page replaces it, its parts rise in through `.enter` (base.css): the header
first, then the columns left to right, then the first cards in each column one after another, the whole
entrance over inside half a second. Delays are zeroed under `prefers-reduced-motion` too.

**Icons, never emoji.** `apps/web/src/components/icons.tsx` is the whole set: line icons on a 16px
grid, inheriting `currentColor`. An icon appears only where a word would otherwise be repeated.

**One exception: the tool marks.** `apps/web/src/components/ToolLogo.tsx` holds the mark of each tool
an agent can run in — Claude's burst for Claude Code, Codex's own mark, Cursor's cube, a folder for
the watcher. These are the makers' real logos, never a drawing of one: each is the official
single-path mark, taken from what the maker publishes and kept at a viewBox that frames that path.
A logo is either the right one or it is wrong, so redrawing one by hand is not allowed; to refresh
one, replace its `d`, its `fill-rule` and its `fill` with the maker's current published values.
Only the watcher's folder is drawn here, because a folder watcher is not a product and has no mark
to be right about.

**A re-tinted logo is the wrong logo**, so each mark keeps its maker's own colour and none of them is
pulled into the palette: Claude Code is Anthropic's coral (`#D97757`, the fill in `claude.ai/favicon.svg`),
Cursor is the black cube from the logo in cursor.com's own header, and Codex is the black scalloped
disc around a `>_` prompt — its `fill-rule` is `evenodd` because the prompt is a hole cut out of the
disc, and it is deliberately not the OpenAI blossom, which is the company's mark and not this
product's. The watcher's folder is the Room's slate, having no brand colour to be right about.
Cursor's cube is taller than it is wide, so `preserveAspectRatio` is left at its default and the
mark is fitted and centred in its box rather than stretched.

The marks stand beside the tool's name on an agent card, where a plain coloured dot used to, so the
tool is recognised from two metres. The name is always written beside the mark, so the mark is
`aria-hidden` and never carries a fact on its own. The tool mix bar and its key on the right keep
the dot in `TOOL_COLOURS`, because there the colour is a key to a bar and not a logo.

**Keyboard first.** One focus ring (`:focus-visible`), always visible on both the page and a filled
button. Every page starts with a skip link. Icon-only controls carry an `aria-label`; every input
has a label, visible or `.visually-hidden`.

## Looking at your own work

```
pnpm dev                                   # with GLASSHOUSE_LOCAL_STORE pointing somewhere scratch
pnpm tsx scripts/seed-demo.ts              # a project with every state: waiting, stuck, blocked, a decision
node scripts/design-screenshots.mjs out/   # every screen at 390px and 1440px, plus a contrast audit
```

The shoot covers the empty, loading and error states as well as the full ones, and reports console
errors and contrast failures per screen in `out/report.json`. `GLASSHOUSE_PLAN=free` on a second
port covers the gated screens.
