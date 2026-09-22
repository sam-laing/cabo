-- Run this once in Supabase's SQL editor.
create table if not exists public.games (
  code text primary key check (char_length(code) = 6),
  state jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.games enable row level security;

grant usage on schema public to anon;
grant select, insert on public.games to anon;

drop policy if exists "Anyone with a code can read a room" on public.games;
drop policy if exists "Anyone can create a private room" on public.games;

create policy "Anyone with a code can read a room"
on public.games for select to anon using (true);

create policy "Anyone can create a private room"
on public.games for insert to anon with check (true);

-- Version-checked writes prevent two devices from silently overwriting each other.
create or replace function public.update_game(
  p_code text,
  p_expected_version integer,
  p_state jsonb
)
returns setof public.games
language sql
security definer
set search_path = public
as $$
  update public.games
  set state = p_state,
      version = version + 1,
      updated_at = now()
  where code = p_code and version = p_expected_version
  returning *;
$$;

revoke execute on function public.update_game(text, integer, jsonb) from public;
grant execute on function public.update_game(text, integer, jsonb) to anon;

-- Realtime is idempotent only when wrapped in this check.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
  end if;
end $$;

-- Optional housekeeping: call this from a daily Supabase cron if desired.
create or replace function public.delete_old_games()
returns void language sql security definer set search_path = public as $$
  delete from public.games where updated_at < now() - interval '7 days';
$$;
