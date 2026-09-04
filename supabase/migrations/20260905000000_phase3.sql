-- Glasshouse Phase 3: memory.
-- Report cards, "since you last checked", the needs-you inbox, digest caching and translation
-- feedback. Mirrors what the local store keeps, exactly.

-- When the owner last opened the digest: the start of the "since you last checked" window.
alter table projects add column if not exists last_checked_at timestamptz;

-- The words of a report card are stored; the facts (touched, not_touched, evidence, risk) are
-- recomputed against the current area map whenever the card is read. The fact columns below are
-- readable snapshots taken when the words were written, for SQL and Realtime only.
alter table reports
  add column if not exists touched_reasons jsonb not null default '{}',   -- area key -> reason
  add column if not exists source text not null default 'template' check (source in ('template','ai')),
  add column if not exists event_count int not null default 0,            -- events on the task when the words were written
  add column if not exists updated_at timestamptz;
comment on column reports.not_touched is 'Snapshot. Computed from the changed-files list, never from the AI. Recomputed on read.';

-- Digest per window kind, cached with a fingerprint of the facts so the AI summary is reused
-- while nothing changed.
alter table digests
  add column if not exists kind text not null default 'today' check (kind in ('since-checked','today','week')),
  add column if not exists fingerprint text;
create index if not exists digests_project_kind on digests (project_id, kind, created_at desc);

-- Thumbs-down on a plain-English line: keep the line exactly as shown and the raw one-liner it
-- came from, so the weekly review can see what went wrong even after the map changed.
alter table translation_feedback
  add column if not exists task_id uuid references tasks(id) on delete set null,
  add column if not exists plain text,
  add column if not exists summary text,
  add column if not exists kind text;

-- Reports and feedback are written by the server (service role); owners read and clear their own.
alter publication supabase_realtime add table reports;
