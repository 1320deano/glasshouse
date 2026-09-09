-- Deano Phase 6: the Potting Shed.
-- One row per helper an owner has grown for a project. Only the words are stored (the brief); the
-- files for each tool are compiled from them when read, so a renamed part of the app is right in
-- every helper at once. Runs are not stored: they are read from `events` (sub-agent starts).

create table if not exists helpers (
  id uuid primary key,
  project_id uuid not null references projects(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  slug text not null,
  name text not null,
  brief jsonb not null,
  grown_from text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  placed_at timestamptz,
  unique (project_id, slug)
);
alter table helpers enable row level security;
create policy "own helpers" on helpers for select using (
  exists (select 1 from projects p where p.id = helpers.project_id and p.owner_id = auth.uid())
);
create index if not exists helpers_project on helpers (project_id, updated_at desc);

-- The "checked afterwards" facts need sub-agent starts and edits by project and time.
create index if not exists events_project_kind_ts on events (project_id, kind, ts desc);

comment on column ai_calls.purpose is 'headline | why | report | digest | area_map | ask | file_descriptions | helper';
-- Writes go through the server with the service role; owners read their own rows.
