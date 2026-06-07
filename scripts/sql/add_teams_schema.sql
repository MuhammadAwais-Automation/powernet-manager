-- Up Migration
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  unique (team_id, staff_id)
);

alter table public.complaints
  add column if not exists team_id uuid references public.teams(id) on delete set null;

-- Enable RLS
alter table public.teams enable row level security;
alter table public.team_members enable row level security;

-- Policies
drop policy if exists teams_auth_all on public.teams;
create policy teams_auth_all
  on public.teams
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists team_members_auth_all on public.team_members;
create policy team_members_auth_all
  on public.team_members
  for all
  to authenticated
  using (true)
  with check (true);

-- Indices
create index if not exists team_members_team_id_idx on public.team_members (team_id);
create index if not exists team_members_staff_id_idx on public.team_members (staff_id);
create index if not exists complaints_team_id_idx on public.complaints (team_id);

-- Enable realtime for teams and team_members
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'teams'
  ) then
    alter publication supabase_realtime add table public.teams;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'team_members'
  ) then
    alter publication supabase_realtime add table public.team_members;
  end if;
end $$;
