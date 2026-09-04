-- Glasshouse Phase 2: understanding.
-- The area map as data, task facts for the stage machine and risk badge, continuity, file
-- descriptions, and the tool on every event. Mirrors what the local store keeps, exactly.

-- The project's file tree (paths only, plus manifest heads) and the map's bookkeeping.
alter table projects
  add column if not exists tree jsonb,
  add column if not exists tree_updated_at timestamptz,
  add column if not exists area_map_source text check (area_map_source in ('ai','heuristic')),
  add column if not exists area_map_tree_hash text,
  add column if not exists area_map_generated_at timestamptz;

-- Areas keep a stable text key (derived from the first path prefix) so events, tasks and
-- corrections survive refreshes. `sensitive` drives the risk badge.
alter table areas
  add column if not exists key text,
  add column if not exists source text not null default 'heuristic' check (source in ('ai','heuristic','user')),
  add column if not exists sensitive boolean not null default false;
create unique index if not exists areas_project_key on areas (project_id, key);

-- Per-file plain-English nouns ("how logged-in users are identified"), written lazily by the AI
-- or by the user, so templates have a specific noun. Never file contents.
create table if not exists file_descriptions (
  project_id uuid not null references projects(id) on delete cascade,
  path text not null,
  description text not null,
  source text not null default 'ai' check (source in ('ai','user')),
  created_at timestamptz not null default now(),
  primary key (project_id, path)
);
alter table file_descriptions enable row level security;
create policy "owner file_descriptions" on file_descriptions for all using (is_project_owner(project_id)) with check (is_project_owner(project_id));

-- Task facts. `state` is the source of truth and matches the local store's TaskState one to one;
-- the older columns are kept as readable copies for SQL and Realtime.
alter table tasks
  add column if not exists tool text check (tool in ('claude-code','codex','cursor','watcher')),
  add column if not exists state jsonb not null default '{}',
  add column if not exists headline_source text not null default 'template' check (headline_source in ('template','ai')),
  add column if not exists risk_reasons jsonb not null default '[]',
  add column if not exists continued_reason text;

-- Events: which tool, the short attached text (commit message, plan, reasoning, error), and
-- parsed test counts. `plain` is computed at read time from the current area map so a renamed
-- area is right everywhere at once; the column from Phase 0 is not used.
alter table events
  add column if not exists tool text check (tool in ('claude-code','codex','cursor','watcher')),
  add column if not exists text text,
  add column if not exists tests jsonb;
alter table events drop column if exists plain;

-- ai_calls gains the purposes Phase 2 introduces (no constraint existed; documented here).
comment on column ai_calls.purpose is 'headline | why | report | digest | area_map | ask | file_descriptions';
