# The design system

One system, four layers, in this order. Every screen composes them; nothing below the first layer
invents a value.

| Layer | File | What lives there |
| --- | --- | --- |
| tokens | `apps/web/src/styles/tokens.css` | colour, type scale, spacing, radii, shadow, motion, layout |
| base | `apps/web/src/styles/base.css` | reset, typographic defaults, links, the focus ring, the motion contract |
| components | `apps/web/src/styles/components.css` | buttons, fields, badges, cards, notices, empty states, skeletons, tables, page shell |
| screens | `apps/web/src/styles/screens.css` | the report card, the task panel, digest, inbox, areas, landing, admin |
| room | `apps/web/src/styles/room.css` | the Room: header, three columns, agent cards, the story, progress |

`apps/web/src/app/globals.css` is five `@import` lines and nothing else.

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

**Status colour carries a fact.** Amber (`--warn`) means the owner is the blocker: waiting for you,
a decision needed, a part that counts as high risk. Green (`--positive`) means verified: "not
touched", checks passed. Red (`--danger`) means an error, stuck, or high risk. Nothing is coloured
because it looks nice. Per the Room's design rules, "waiting for you" is the one badge allowed to
light up, and the card it belongs to is the one card allowed an amber border. The activity heatmap
climbs `--accent-1` to `--accent-4`: it is a count, so it may use the accent's ramp and nothing else.

**Contrast passes AA everywhere.** Every text token is at or above 4.5:1 on the surface it is used
on (`--text-tertiary` is the floor at 5.0:1 on the subtle fill). Earlier sessions are made quieter with size and
colour, never with `opacity` — a dimmed tile is an unreadable tile.
`node scripts/design-screenshots.mjs out/` audits every rendered screen and fails loudly.

**Type is Geist, one scale, 11px to 48px.** Geist is the open face closest to Anthropic Sans (which
credits Geist's designers); Next bundles it at build time (`app/layout.tsx`), so the Room renders it
offline and falls back to the system stack only if that bundle is missing. Source Serif 4 is the one
serif, and it is used for exactly one thing: the project's name at the top of the story, set the way
Claude sets its greeting. Sizes are absolute. The only two clamps are `--text-headline` (the Room's
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

**Icons, never emoji.** `apps/web/src/components/icons.tsx` is the whole set: line icons on a 16px
grid, inheriting `currentColor`. An icon appears only where a word would otherwise be repeated.

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
