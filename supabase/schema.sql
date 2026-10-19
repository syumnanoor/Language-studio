-- Run once in the new project's SQL editor. No learner data is included.
create table if not exists public.learning_records (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null,
 kind text not null check(kind in ('attempt','session','card','draft','exam','speaking')),
 created timestamptz not null default now(),
 value jsonb not null,
 primary key(user_id,id)
);
create index if not exists learning_records_user_created on public.learning_records(user_id,created);
alter table public.learning_records enable row level security;
revoke all on public.learning_records from anon, authenticated;
grant select on public.learning_records to authenticated;
drop policy if exists "Read own learning" on public.learning_records;
create policy "Read own learning" on public.learning_records for select to authenticated using ((select auth.uid())=user_id);
-- All grading and writes pass through the server, whose service key is never sent to a browser.
grant all on public.learning_records to service_role;
create table if not exists public.family_links (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 learner_id uuid references auth.users(id) on delete cascade,
 code_hash text unique not null,
 expires timestamptz not null,
 created timestamptz not null default now(),
 check(owner_id is distinct from learner_id)
);
alter table public.family_links enable row level security;
revoke all on public.family_links from anon, authenticated;
grant all on public.family_links to service_role;
