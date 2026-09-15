-- Deano Phase 8: asking from the Room.
-- One row per thing the owner asked for from Glasshouse's chat: an instruction for one of the
-- tools (started on the owner's own computer by their connector), or a question Glasshouse
-- answered itself from the record. Only the owner's words, the tool's own session id and the
-- process facts are stored; what the run became (the session, the task, the plain-English lines)
-- is looked up from `agent_sessions`, `tasks` and `events` when read.
create table if not exists requests (
  id uuid primary key,
  project_id uuid not null references projects(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  tool text not null check (tool in ('claude-code','codex','cursor','glasshouse')),
  text text not null,
  -- {sessionId, externalId}: a follow-up to an agent already in the Room.
  continues jsonb,
  -- {kind: typed | suggested, suggestionId?, taskId?}: where the words came from.
  origin jsonb not null default '{"kind":"typed"}'::jsonb,
  care text not null default 'ask' check (care in ('ask','free')),
  status text not null default 'queued' check (status in ('queued','taken','running','finished','failed','expired','withdrawn','answered')),
  status_at timestamptz not null default now(),
  external_session_id text,
  result jsonb,
  answer jsonb,
  created_at timestamptz not null default now()
);
alter table requests enable row level security;
create policy "own requests" on requests for select using (
  exists (select 1 from projects p where p.id = requests.project_id and p.owner_id = auth.uid())
);
create index if not exists requests_project_created on requests (project_id, created_at desc);
create index if not exists requests_project_status on requests (project_id, status, created_at);

-- The questions a running tool put to the owner through the Room: may it run this, or which way.
-- Their own table so a connector adding one and the owner answering another never overwrite each other.
create table if not exists request_questions (
  id uuid primary key,
  request_id uuid not null references requests(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  asked_at timestamptz not null default now(),
  kind text not null check (kind in ('permission','choice')),
  tool_name text not null,
  event_kind text,
  description text,
  summary text not null,
  paths text[] not null default '{}',
  command text,
  choices jsonb,
  raw jsonb,
  -- {allow, answers?, at, by?}; null until the owner answers.
  answer jsonb
);
alter table request_questions enable row level security;
create policy "own request questions" on request_questions for select using (
  exists (select 1 from projects p where p.id = request_questions.project_id and p.owner_id = auth.uid())
);
create index if not exists request_questions_request on request_questions (request_id, asked_at);

-- When the owner's connector last asked the Room for requests: the Room says whether their computer is listening.
alter table projects add column if not exists listening_at timestamptz;

-- Writes go through the server with the service role; owners read their own rows.
