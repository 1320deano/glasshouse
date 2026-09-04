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

## Rules

- All writes to `agent_sessions`, `tasks` and `events` go through the ingest API route using the service-role key.
  The browser only reads, governed by row-level security (owners see their own projects).
- Realtime is enabled on `events`, `tasks` and `agent_sessions`; the Room subscribes to those.
