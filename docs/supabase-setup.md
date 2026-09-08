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

## Sign-up and sign-in (Phase 4)

An email address and a password. Nothing is emailed, and there is nothing for a new person to confirm.

1. Authentication -> Providers: turn **Email** on. Passwords are used; magic links are not.
2. `/api/auth/signup` creates the account server-side with the service role and `email_confirm: true`, then signs that
   browser in with the same password. That is why no confirmation email is ever sent, whatever
   Authentication -> Providers -> Email -> "Confirm email" is set to. Turning that setting **off** as well is tidy but
   not required by anything in the product.
3. Authentication -> URL configuration: set the site URL to the public address. No callback URL is needed: there is no
   link to redirect back from.
4. No email templates or SMTP sender are needed for sign-in. They become necessary only if a "forgot my password" flow
   is added later (not built).
5. The web app needs `NEXT_PUBLIC_SUPABASE_ANON_KEY` as well as the service-role key: the anon key is what the browser
   session uses for identity; the service-role key is what the server uses for data and for creating the account.
6. Accounts made before this change that never confirmed their email cannot sign in. Confirm them once in
   Authentication -> Users, or delete them.
7. Recommended now that passwords are used: Authentication -> Passwords -> turn on **leaked password protection**
   (it checks a chosen password against HaveIBeenPwned). Supabase's own advisor flags this while it is off.
8. Rate limiting: sign-in goes through Supabase's `/token` endpoint and is rate limited by it. Sign-up creates the
   account with the service role, so Supabase's sign-up limit does not cover it. `GLASSHOUSE_INVITE_ONLY=1` is the
   control during the tester period; before a public launch add a rate limit or a captcha to `/api/auth/signup`.

## Stripe (Phase 4, optional until launch)

Create a product "Pro" with a recurring £15/month price and a webhook to `https://<your address>/api/billing/webhook`
for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` and
`customer.subscription.deleted`. Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_PRO` and `STRIPE_WEBHOOK_SECRET`. Until then,
`/admin` switches a person to Pro by hand.

## Rules

- All writes to `agent_sessions`, `tasks` and `events` go through the ingest API route using the service-role key.
  The browser only reads, governed by row-level security (owners see their own projects).
- Realtime is enabled on `events`, `tasks` and `agent_sessions`; the Room subscribes to those.
