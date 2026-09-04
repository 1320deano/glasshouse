# Supabase setup

Supabase is the backend for everything: Postgres, Auth, Realtime, Storage.
The schema lives in `supabase/migrations` and is applied with the CLI (installed as a dev dependency, run via `pnpm supabase`).

## One-off: create the hosted project (needs your account)

1. Go to https://supabase.com/dashboard and create a project called `glasshouse` (region: London / eu-west-2).
2. Note the project ref from the URL (`https://supabase.com/dashboard/project/<ref>`).
3. Log the CLI in and link this repo to the project:
   ```
   pnpm supabase login
   pnpm supabase link --project-ref <ref>
   ```
4. Apply the schema:
   ```
   pnpm supabase db push
   ```
5. Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in the URL, anon key and service-role key
   from Project settings -> API. Never commit `.env.local`.

## Local development (optional, needs Docker Desktop)

```
pnpm supabase start      # local Postgres + Auth + Realtime on localhost
pnpm supabase db reset   # apply migrations from scratch
```

## Adding a migration

```
pnpm supabase migration new <name>
```
Edit the generated file in `supabase/migrations`, then `db push` (hosted) or `db reset` (local).

## Migrations so far

| File | Adds |
|---|---|
| `20260903000000_init.sql` | Phase 0: projects, tokens, areas, sessions, tasks, events, reports, digests, ai_calls, feedback, RLS |
| `20260904000000_phase2.sql` | Phase 2: file tree on projects, area keys, `file_descriptions`, task `state`, event `tool`/`text`/`tests` |
| `20260905000000_phase3.sql` | Phase 3: report card words on `reports`, digest cache, feedback as shown, `last_checked_at` |
| `20260906000000_phase4.sql` | Phase 4: `profiles` (plan, Stripe ids, created by trigger on sign-up), `link_codes`, `invites`, `tester_notes`, `metrics`, `projects.owner_id` index |

## Sign-in (Phase 4)

1. Authentication -> Providers: turn **Email** on, with magic links (OTP) allowed. Passwords are not used.
2. Authentication -> URL configuration: set the site URL to the public address and add
   `https://<your address>/auth/callback` (and `http://localhost:3000/auth/callback` for development) to the redirect list.
3. Optional but recommended before testers: Authentication -> Email templates, and a custom SMTP sender, so sign-in emails
   come from your domain and do not land in spam.
4. The web app needs `NEXT_PUBLIC_SUPABASE_ANON_KEY` as well as the service-role key: the anon key is what the browser
   session uses for identity; the service-role key is what the server uses for data.

## Stripe (Phase 4, optional until launch)

Create a product "Pro" with a recurring £15/month price and a webhook to `https://<your address>/api/billing/webhook`
for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` and
`customer.subscription.deleted`. Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_PRO` and `STRIPE_WEBHOOK_SECRET`. Until then,
`/admin` switches a person to Pro by hand.

## Rules

- All writes to `agent_sessions`, `tasks` and `events` go through the ingest API route using the service-role key.
  The browser only reads, governed by row-level security (owners see their own projects).
- Realtime is enabled on `events`, `tasks` and `agent_sessions`; the Room subscribes to those.
