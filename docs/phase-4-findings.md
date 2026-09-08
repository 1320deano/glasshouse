# Phase 4 findings

Date: 4 September 2026. Other people: sign-in, several projects per person, onboarding that produces the
"I'd have missed that" moment, Free and Pro, the landing page, and the tools to run a ten-person test.

## What was built

| Piece | Where | What it does |
|---|---|---|
| Sign-up and sign-in | `apps/web/src/lib/auth.ts`, `lib/credentials.ts`, `lib/supabase/{server,admin}.ts`, `middleware.ts`, `/signup`, `/signin`, `/api/auth/*` | Supabase Auth with an email and a password. Nothing is emailed and there is nothing to confirm: `/api/auth/signup` makes the account with the service role and `email_confirm`, then signs that browser in with the same password, so a person is in the Room the second they press the button. Passwords are at least 8 characters and at most 72 (bcrypt's ceiling). `/api/auth/signin` is the same form for coming back. The middleware keeps the session fresh and sends signed-out visitors from `/room`, `/connect`, `/account` and `/admin` to `/signin`. Every read route now checks the project belongs to the person asking. Local mode (no Supabase keys) has no sign-in at all: it is your own machine, one implicit person, everything open, exactly as before. |
| Projects per person | `projects.owner_id`, `Store.listProjects(ownerId)`, `/api/projects/mine` | Each project belongs to whoever connected it. The home page lists yours and goes straight into the Room when there is one. Projects made before sign-in existed have no owner and are reachable only with the setup secret. |
| Onboarding with a link code | `/connect`, `/api/projects/link-code`, `glasshouse connect --code` | "New project" shows one command with a one-time code (works once, 15 minutes). The connector posts the code with the folder's name; the server creates the project in that person's account and hands back the project token. The page polls until the connector has run, then opens the Room. In local mode the command needs no code. |
| The first-session walkthrough | `lib/moment.ts`, `components/Walkthrough.tsx` | While the Room is empty after connecting: what to do next. Then, the first time a task changes a sensitive part (Login, Payments…), a secrets file, several parts at once, or adds a new tool, an amber callout says so in one line ("Claude Code changed Login. You asked: …") and why it matters. Computed from facts, dismissed once per browser. It picks the earliest such task, so the story starts where it started. |
| Free and Pro | `lib/plan.ts`, `lib/room.ts`, every gated route and page | Free: 1 project, 1 agent at a time, the live Room and report cards, the last 24 hours. Pro: everything. The gate is one pure function applied identically on first paint and on every refresh; the free Room says what is hidden and why ("2 more agents are running…", "3 older sessions hidden…") with the fact, never a bare "upgrade". Digest, inbox and Ask answer 402 with the reason. Local mode is Pro; `GLASSHOUSE_PLAN=free` previews the free tier without Stripe. |
| Stripe | `lib/billing.ts`, `/api/billing/{checkout,portal,webhook}`, `/account` | Checkout starts a Pro subscription; the customer portal changes or cancels it; the webhook is the only code that changes a plan, and it verifies Stripe's signature first. Without keys the account page says "Upgrades open soon" and testers get Pro by hand from `/admin`. |
| Landing page | `/landing` (always), `/` when signed out, `components/Landing.tsx`, `MockTile.tsx`, `lib/demo.ts` | First line: "Works with Claude Code, Codex, Cursor and anything that saves to GitHub." The two-monitor story with a live mock tile that is not a mock-up: the recorded sessions are replayed through the real store, frame by frame, including the credit switch and the report card. Price shown. Sign-up is the email-and-password form, in the hero and again at the foot. |
| Sign-up rate | `/api/metrics`, `Store.recordMetric`, `/admin` | One row per event per visitor (a random id kept in the browser, never identifying). Landing views, sign-ups started and completed, projects connected, upgrade clicks. The dashboard shows the rate against the 5% target. |
| Tester cohort tools | `/admin`, `/api/admin`, `/api/notes`, `GLASSHOUSE_INVITE_ONLY`, `components/ReportProblem.tsx` | Invite list (when invite-only is on, only invited emails may make an account), each tester's projects, sessions, tasks, last agent activity, last time they opened the Room, and their AI cost; "active in the last 5 days" against the 7-of-10 target; the "Something's wrong?" notes with the page they were on; a switch to give a tester Pro by hand. |
| Product name in one place | `lib/brand.ts` | `NEXT_PUBLIC_PRODUCT_NAME` renames every page, title and email in one go when the name is decided (`docs/name-decision.md`). |
| Supabase | `supabase/migrations/20260906000000_phase4.sql` | `profiles` (with a trigger that creates one on sign-up), `link_codes`, `invites`, `tester_notes`, `metrics`, an index on `projects.owner_id`, row-level security throughout. |

## Measured

| What | Result |
|---|---|
| Tests | 162 (was 151). Plans, gating, link codes, ownership, profiles, invites, notes, metrics, the moment, the demo frames, the Stripe event mapping, and every new route in local mode. |
| Web build | 38 routes, all server-rendered on demand; the landing page ships 106 KB of script. |
| End to end | The built Room started in free-tier preview, seeded with the three recorded sessions, and screenshotted: landing page with the live tile, connect page, the free Room with the moment callout and Pro-marked links, the gated digest, the account page and the admin dashboard. |
| Cost per person | Now on the admin dashboard: AI spend per Pro person, with the £5 alert line from the brief. |

## Design decisions

- **Local mode is unchanged and open.** Nothing in Phase 4 makes the laptop setup harder. Sign-in, plans and billing only switch on when Supabase keys are present.
- **The webhook owns the plan.** No page or route can set `plan` except the Stripe webhook and the admin's manual switch, so a paid plan can never be granted by a client request.
- **Gating is a pure function.** `gateRoom` runs on the server for the first paint and for every refresh; there is no client-side "hide this", so the free tier cannot see Pro data by reading the response.
- **The moment is computed, not written.** It fires only on facts the risk badge already trusts (sensitive part, secrets, several parts, new tools) and quotes the owner's own instruction, so it can never claim something the record does not hold.
- **The demo is the product.** The landing page's tile is the real `MemoryStore` replaying real recordings, so every improvement to translation shows up on the landing page for free, and the demo can never drift from what the product does.
- **Invites are a switch, not a rewrite.** `GLASSHOUSE_INVITE_ONLY=1` for the private test; turn it off for launch and the same sign-in form becomes public.

## Honest gaps

- **Nothing hosted has been run.** Supabase Auth, the middleware, row-level security on the new tables, Stripe Checkout and the webhook are written to the documented interfaces and tested only in local mode. The first hosted deployment will find something; `docs/what-christopher-needs-to-do.md` is the checklist, and the first hour should be spent replaying the fixtures against the real database.
- **Sign-in emails come from Supabase's default sender** until a custom sender is set up, and they may land in spam. The tester plan says to warn testers.
- **No rate limit on the sign-in route.** Supabase enforces its own per-email limits; a public launch should add a simple per-IP limit at the edge.
- **The connector is still run from this repository** (`node packages/connector/dist/cli.js`). `npx glasshouse connect` on the landing page assumes the package is published; the name `glasshouse` is taken on npm (`docs/name-check.md`), so publishing needs the name decision first. `NEXT_PUBLIC_CONNECT_COMMAND` changes the text shown until then.
- **"1 agent at a time" hides extra active tiles rather than refusing their events.** Events are still stored, so upgrading reveals them. That is deliberate (nothing is lost) but it means the free tier still costs storage.
- **Digest emails, cost alerts and the weekly translation review are Phase 5**, as planned.

## Exit test

"7 of 10 testers still have the tab open on day five; 3 or more say 'I'd pay'." Not yet run: it needs the hosted
deployment, ten people and five days. Everything needed to run it and read the result is built (invites, the
dashboard's day-five count, the notes, the Pro switch); `docs/tester-cohort.md` is the protocol.
