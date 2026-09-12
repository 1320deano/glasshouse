# What Christopher needs to do

Everything built in Phases 0 to 6 that is waiting on a decision, an account, a key or a real session from you.
In order of how much they unblock. Each item says what it is for, in plain words, and where the instructions are.

## The three things that unblock the most

1. **Create the hosted Supabase project and apply the five migrations.** Supabase is the database, sign-in and
   live-update service the hosted product runs on. Nothing hosted (sign-in, testers, plans, the landing page for real
   visitors) works without it, and the Supabase side of the code has never been run against a real database.
   Instructions: `docs/supabase-setup.md`. Then, before anything else, run the recorded sessions into it and open the
   Room; whatever breaks in that first hour is the most important bug in the project.
2. **Add an Anthropic API key** (`ANTHROPIC_API_KEY` in `apps/web/.env.local` locally, and in the hosting service's
   settings when deployed). Without it everything works from templates. With it, tiles get better headlines, the parts
   of your app get proper names, report cards get their words and a "Previously … Now …" line, the digest gets its
   opening, and the Ask box answers. The first AI-written card should be read critically.
3. **Run one real task with the Room open and read the card.** This is the Phase 3 exit test ("the first report card
   shows me something I would have missed") and the first honest look at the walkthrough callout from Phase 4.
   Instructions: `docs/running-the-room.md`.

## Phase 0

- Nothing outstanding except the Supabase project above.

## Phase 1

- **The week-long tab test.** Leave the Room open on the second monitor for a week and count the days it stayed open.
  The plan asks for the real number, not a feeling.

## Phase 2

- **Record one real Codex session and one real Cursor session.** Their listeners were written from documentation and
  their recordings are marked synthetic. Run `node packages/connector/dist/cli.js record codex <event>` (and the Cursor
  equivalent) as described in `docs/phase-2-findings.md`, then replace the `-synthetic` files in `fixtures/sessions`.
  Until then a Codex or Cursor tile may be thinner than expected.
- **Do the real credit switch once**: let Claude Code hit its limit mid-task, open Codex to continue, and check the Room
  shows "Continuing from Claude Code".
- **Codex users must type `/hooks` in Codex and trust the listeners.** This is a Codex rule, not ours; until they do,
  Codex is followed through its logs by `glasshouse watch`.

## Phase 3

- Item 3 above (the real report card).
- Once the AI key is in, **read three AI-written cards and three digest openings** and note any line that says more than
  the facts. The prompts are in `apps/web/src/lib/ai/report.ts` and `digest.ts`; tuning them is a ten-minute job.

## Phase 4

- **Decide the name** (`docs/name-decision.md`). Recommendation: keep Glasshouse for the private test, decide before
  launch. If you keep it: backorder `useglasshouse.com`, take the `getglasshouse` handles, recheck the trademark after
  2 December 2026.
- **Deploy the web app somewhere with a public address** (Vercel is the simplest for a Next.js app). Set these in its
  settings: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`,
  `NEXT_PUBLIC_SITE_URL` (the public address), `GLASSHOUSE_ADMIN_EMAILS` (your email), `GLASSHOUSE_INVITE_ONLY=1`,
  and, when the name is decided, `NEXT_PUBLIC_PRODUCT_NAME` and `NEXT_PUBLIC_CONNECT_COMMAND`. `apps/web/.env.example`
  lists them all with a line each. One caveat: background AI work runs inside the web server; on a serverless host it
  can be cut off, so a small always-on server (Railway, Fly, a VPS) is safer than Vercel for now (`docs/phase-2-findings.md`).
  **Leave the three `GLASSHOUSE_DEV_*` settings blank there.** They are the test account's one-click sign-in, meant for
  your computer only (`docs/running-the-room.md`); set on a public address, anyone could use them to get in.
- **In the Supabase dashboard, set the site URL** (Authentication -> URL configuration) to your public address. Email
  sign-in is already on and sign-up needs nothing else: an account is made with an email and a password and works
  immediately, so no email is ever sent and there is no link to come back from. Tidy-up, optional: Authentication ->
  Providers -> Email -> turn "Confirm email" off, and in Authentication -> Users delete the leftover test accounts.
- **Publish the connector to npm** so `npx … connect` works for testers. The package name depends on the name decision
  (`glasshouse` is taken; `glasshouse-connect` is free). Until then testers can run it from a copy of the repository,
  and `NEXT_PUBLIC_CONNECT_COMMAND` sets what the pages show.
- **Create a Stripe account, a product "Pro" with a £15/month price, and a webhook** pointing at
  `https://<your address>/api/billing/webhook` for the events `checkout.session.completed`,
  `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Set
  `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_PRO` and `STRIPE_WEBHOOK_SECRET`. Not needed for the tester period: Pro is
  switched on by hand from `/admin` until then.
- **Recruit ten testers and run the five days** (`docs/tester-cohort.md`). Write the answers into
  `docs/tester-results.md`.
- **Decide the launch date and record the 30-second demo** (`docs/demo-script.md`).

## Things that are yours to check, not to build

- The connector's hook commands on a Windows machine without Git Bash (Phase 0 open question; matters for testers).
- Whether a Cursor session shows up twice when Cursor reads Claude Code's settings (Phase 2 note). If it does, connect
  with `--tools claude-code` only.

## Phase 6 (Deano and the Potting Shed)

- **Say yes or no to the names.** The website is Deano, as you asked. The agent builder is called the **Potting Shed**
  (the place beside a glasshouse where you raise young plants before planting them out). Agents and sub-agents are
  called **helpers** everywhere the owner looks. All three are one setting each (`NEXT_PUBLIC_SITE_NAME`,
  `NEXT_PUBLIC_SHED_NAME`, and "helper" in the UI copy). `docs/phase-6-findings.md` says why.
- **Apply the fifth migration** (`supabase/migrations/20260909000000_phase6.sql`) when you set up Supabase. It adds the
  table that stores helpers and an index the "checked afterwards" line needs.
- **Grow one real helper and run it.** Open the Shed for a real project, take the first suggestion (or type one
  sentence), press Grow it, run `npx glasshouse helpers` in the project folder, then start Claude Code and ask it to use
  the helper by name. The helper's card should say "Ran once; kept to its patch" within a minute of it finishing. That is
  the Phase 6 exit test: the first time the check says something you did not already know.
- **Decide whether placing should ever be automatic.** Today the owner runs one command. The `watch` process could pull
  helpers itself, but that means an agent's instructions can change without your hand on it; the findings say why it was
  left out. Your call.
- **Decide the AI key question for the Shed.** Without a key, your typed sentence is used as-is. With a key, one call
  tidies it into a name, a clearer job and first-guess boundaries. It costs one short call per helper started, logged
  like every other call.

## Phase 7 (the Shed rebuilt, helpers in Glasshouse)

- **Read the six kinds and the boxes as a customer would.** The words on the tiles, the boxes under "What it does" and
  "How it talks", and the lines in "Tried on your recent tasks" are the product now. Each is one string in
  `apps/web/src/lib/shed/build.ts` and `rehearse.ts`; say which read wrongly and they change in a minute.
- **Grow a helper from a real stuck moment.** In Glasshouse, on a stuck or failing task, press "Grow a helper from
  this", read what it would have done on that very task, grow it, run the one command, and watch the story say it
  started and whether it kept to its patch. That is the whole loop; it needs one real project to prove it.

