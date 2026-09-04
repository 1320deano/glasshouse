-- Glasshouse Phase 4: other people.
-- Sign-in (Supabase Auth), one profile per person with their plan, one-time link codes for
-- `glasshouse connect`, the tester invite list, "something's wrong" notes, and landing-page metrics.

-- One row per signed-in person. The plan is written only by billing code (Stripe webhook).
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  plan text not null default 'free' check (plan in ('free','pro')),
  stripe_customer_id text unique,
  stripe_subscription_id text,
  subscription_status text,
  plan_updated_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "own profile" on profiles for select using (user_id = auth.uid());

-- Create the profile the moment a person signs up, so the plan and email are always there.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (user_id, email) values (new.id, new.email) on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- A one-time code the owner pastes into `glasshouse connect`, so the project lands in their account.
create table if not exists link_codes (
  code text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  project_id uuid references projects(id) on delete set null
);
alter table link_codes enable row level security;
create policy "own link codes" on link_codes for select using (owner_id = auth.uid());
create index if not exists link_codes_owner on link_codes (owner_id, created_at desc);

-- Projects now belong to a person. Older rows keep owner_id null and are only reachable with the setup secret.
create index if not exists projects_owner on projects (owner_id);

-- The tester cohort: who may sign in while GLASSHOUSE_INVITE_ONLY is on.
create table if not exists invites (
  email text primary key,
  note text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
alter table invites enable row level security;

-- "Something's wrong" from a tester, with where they were.
create table if not exists tester_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  project_id uuid references projects(id) on delete set null,
  page text not null,
  note text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table tester_notes enable row level security;
create policy "own notes" on tester_notes for select using (user_id = auth.uid());

-- Landing-page metrics: one row per event per visitor; counts are distinct visitors.
create table if not exists metrics (
  id bigint generated always as identity primary key,
  event text not null,
  visitor_id text not null,
  at timestamptz not null default now()
);
alter table metrics enable row level security;
create index if not exists metrics_event_at on metrics (event, at desc);

-- Writes to profiles (plan), link_codes, invites, tester_notes and metrics go through the server
-- with the service role. Owners read their own rows; admins read everything through the server.
