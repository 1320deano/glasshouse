# The design system

One system, four layers, in this order. Every screen composes them; nothing below the first layer
invents a value.

| Layer | File | What lives there |
| --- | --- | --- |
| tokens | `apps/web/src/styles/tokens.css` | colour, type scale, spacing, radii, shadow, motion, layout |
| base | `apps/web/src/styles/base.css` | reset, typographic defaults, links, the focus ring, the motion contract |
| components | `apps/web/src/styles/components.css` | buttons, fields, badges, cards, notices, empty states, skeletons, tables, page shell |
| screens | `apps/web/src/styles/screens.css` | the Room, the report card, the task panel, digest, inbox, areas, landing, admin |

`apps/web/src/app/globals.css` is four `@import` lines and nothing else.

## The rules

**One accent.** `--accent` (#5b8cff) is for a primary action, a focused control, or the single most
important link on a page. Never a whole navigation, never decoration. Links are neutral by default;
`.link-accent` opts one in.

**Status colour carries a fact.** Amber (`--warn`) means the owner is the blocker: waiting for you,
a decision needed, a part that counts as high risk. Green (`--positive`) means verified: "not
touched", checks passed. Red (`--danger`) means an error, stuck, or high risk. Nothing is coloured
because it looks nice. Per the Room's design rules, "waiting for you" is the one badge allowed to
light up, and the tile it belongs to is the one tile allowed an amber border.

**Contrast passes AA everywhere.** Every text token is at or above 4.5:1 on the surface it is used
on (`--text-tertiary` is the floor at 4.9:1). Earlier sessions are made quieter with size and
colour, never with `opacity` — a dimmed tile is an unreadable tile.
`node scripts/design-screenshots.mjs out/` audits every rendered screen and fails loudly.

**Type is one scale, 11px to 48px.** Sizes are absolute. The only two clamps are
`--text-headline` (the Room's tile headline) and `--text-display` (the landing hero), because those
two are read from across a desk.

**Space is an 8pt grid.** `--space-1` is 8px; 4px and 12px are the half-steps. Nothing is spaced by
a number typed in by hand.

**Lines, not shadows.** Surfaces are separated by one hairline at one of three tones. Shadows exist
in the tokens but are reserved for things that genuinely float.

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
