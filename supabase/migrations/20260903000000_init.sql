-- Glasshouse core schema. Phase 0.
-- Everything the Room, the Report and the Digest need is one stream of events,
-- viewed at three distances. Tables follow that stream.

create extension if not exists "pgcrypto";

-- A project = one repository the user has connected.
create table projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,  -- nullable until Phase 4 adds sign-in
  name text not null,
  repo_root_hint text,                      -- last known local path, informational only
  created_at timestamptz not null default now()
);

-- Connector credentials. One per machine per project. Hashed; the plain token is shown once.
create table project_tokens (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  token_hash text not null unique,
  label text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- The area map: the app described in the owner's own words. Phase 2 fills it; the table exists
-- now because events reference areas from day one.
create table areas (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,                        -- "Login", "Image generation"
  description text,                          -- one plain-English line
  path_prefixes text[] not null default '{}',
  user_corrected boolean not null default false,  -- corrections win over refreshes
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One agent session (a Claude Code session, a Codex session, a Cursor chat).
create table agent_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  tool text not null check (tool in ('claude-code','codex','cursor','watcher')),
  external_id text not null,                 -- the agent's own session id
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (project_id, tool, external_id)
);

-- A task = one prompt through to the agent stopping. The unit the Report is written for.
create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  session_id uuid not null references agent_sessions(id) on delete cascade,
  external_key text,                         -- the source tool's own task id (Claude Code prompt_id)
  prompt text,
  headline text,                             -- current plain-English headline
  current_location text,                     -- last path touched (Phase 2 maps it to an area)
  stage text not null default 'investigating'
    check (stage in ('investigating','planning','building','testing','done','stuck','waiting')),
  risk text check (risk in ('low','medium','high')),
  current_area_id uuid references areas(id) on delete set null,
  continued_from uuid references tasks(id) on delete set null,  -- continuity across tools
  end_reason text,                           -- 'stop' | 'usage_limit' | 'session_end' | null while running
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_event_at timestamptz,
  unique (session_id, external_key)
);

-- Every action, normalised. raw is kept so the plain-English line always links to the truth.
create table events (
  id uuid primary key,                       -- connector-generated; de-duplicates retries
  project_id uuid not null references projects(id) on delete cascade,
  session_id uuid not null references agent_sessions(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  agent_id text,
  kind text not null,
  ts timestamptz not null,
  paths text[] not null default '{}',
  command text,
  summary text not null,                     -- raw one-liner
  plain text,                                -- translated line (Phase 2)
  area_id uuid references areas(id) on delete set null,
  success boolean,
  source_event text not null,
  source_tool text,
  raw jsonb,
  received_at timestamptz not null default now()
);
create index events_task_ts on events (task_id, ts desc);
create index events_session_ts on events (session_id, ts desc);
create index events_project_ts on events (project_id, ts desc);

-- One report card per finished task. Phase 3.
create table reports (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references tasks(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  headline text not null,
  before_after text,
  touched jsonb not null default '[]',        -- [{area, reason}]
  not_touched jsonb not null default '[]',    -- computed from changed files, never guessed
  evidence jsonb not null default '{}',       -- tests, dependencies, config/secrets touched
  risk text not null check (risk in ('low','medium','high')),
  risk_reason text,
  needs_you text not null default 'nothing'
    check (needs_you in ('nothing','review','decision','blocked')),
  needs_you_detail text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- Digests per interval. Phase 3.
create table digests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  window_start timestamptz not null,
  window_end timestamptz not null,
  body jsonb not null,
  created_at timestamptz not null default now()
);

-- Every AI call, so we always know the real cost per task and per user.
create table ai_calls (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  purpose text not null,                     -- 'headline' | 'why' | 'report' | 'digest' | 'area_map' | 'ask'
  model text not null,
  input_tokens int not null,
  output_tokens int not null,
  cost_gbp numeric(10,6),
  created_at timestamptz not null default now()
);

-- Thumbs-down on a translated line. Phase 3.
create table translation_feedback (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

-- Row-level security: owners see their own projects and everything under them.
alter table projects enable row level security;
alter table project_tokens enable row level security;
alter table areas enable row level security;
alter table agent_sessions enable row level security;
alter table tasks enable row level security;
alter table events enable row level security;
alter table reports enable row level security;
alter table digests enable row level security;
alter table ai_calls enable row level security;
alter table translation_feedback enable row level security;

create policy "owner reads projects" on projects for select using (owner_id = auth.uid());
create policy "owner writes projects" on projects for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create or replace function is_project_owner(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from projects where id = p and owner_id = auth.uid());
$$;

create policy "owner project_tokens" on project_tokens for all using (is_project_owner(project_id)) with check (is_project_owner(project_id));
create policy "owner areas" on areas for all using (is_project_owner(project_id)) with check (is_project_owner(project_id));
create policy "owner agent_sessions" on agent_sessions for select using (is_project_owner(project_id));
create policy "owner tasks" on tasks for select using (is_project_owner(project_id));
create policy "owner events" on events for select using (is_project_owner(project_id));
create policy "owner reports" on reports for all using (is_project_owner(project_id)) with check (is_project_owner(project_id));
create policy "owner digests" on digests for select using (is_project_owner(project_id));
create policy "owner ai_calls" on ai_calls for select using (is_project_owner(project_id));
create policy "owner translation_feedback" on translation_feedback for all using (is_project_owner(project_id)) with check (is_project_owner(project_id));

-- Writes to sessions/tasks/events come only from the ingest route using the service role.

-- Realtime: the Room subscribes to these.
alter publication supabase_realtime add table events, tasks, agent_sessions;
