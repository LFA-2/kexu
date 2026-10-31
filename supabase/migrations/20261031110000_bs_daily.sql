-- Battleship becomes a daily puzzle like 1A2B: each user places one fleet per day
-- (Asia/Taipei); linked users fire at it at their own pace. Fewer shots to sink
-- every ship wins. Replaces the turn-based tables.

drop function public.bs_new_game(uuid);
drop function public.bs_place(bigint, jsonb);
drop function public.bs_fire(bigint, int);
drop function public.bs_resign(bigint);
drop table public.bs_shots, public.bs_fleets, public.bs_games;

create table public.bs_daily_fleets (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  ships jsonb not null check (private.bs_valid_fleet(ships)),
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table public.bs_daily_shots (
  id bigint generated always as identity primary key,
  day date not null,
  shooter uuid not null references auth.users (id) on delete cascade,
  owner uuid not null references auth.users (id) on delete cascade,
  cell smallint not null check (cell between 0 and 48),
  result text not null check (result in ('miss', 'hit', 'sunk')),
  sunk_cells smallint[],
  created_at timestamptz not null default now(),
  unique (day, shooter, owner, cell),
  check (shooter <> owner)
);

create index bs_daily_shots_owner_idx on public.bs_daily_shots (owner, day);

create function public.bs_set_fleet(fleet jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  today date := private.taipei_today();
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if not private.bs_valid_fleet(fleet) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  insert into public.bs_daily_fleets (user_id, day, ships)
  values (me, today, fleet)
  on conflict do nothing;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'already_set');
  end if;
  return jsonb_build_object('ok', true, 'day', today);
end;
$$;

create function public.bs_daily_fire(target uuid, target_cell int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  today date := private.taipei_today();
  fleet jsonb;
  ship jsonb;
  hit_ship int[];
  outcome text := 'miss';
  sunk int[];
  hits int;
  total int;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if target_cell is null or target_cell < 0 or target_cell > 48 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if target = me or not private.is_linked_with(target) then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;
  if not exists (
    select 1 from public.bs_daily_fleets f where f.user_id = me and f.day = today
  ) then
    return jsonb_build_object('ok', false, 'error', 'no_own_fleet');
  end if;

  select f.ships into fleet
    from public.bs_daily_fleets f
   where f.user_id = target and f.day = today;
  if fleet is null then
    return jsonb_build_object('ok', false, 'error', 'no_fleet');
  end if;

  perform pg_advisory_xact_lock(hashtext('bs' || me::text || target::text || today::text));

  select count(*) filter (where s.result <> 'miss') into hits
    from public.bs_daily_shots s
   where s.day = today and s.shooter = me and s.owner = target;
  if hits = 11 then
    return jsonb_build_object('ok', false, 'error', 'already_finished');
  end if;
  if exists (
    select 1 from public.bs_daily_shots s
     where s.day = today and s.shooter = me and s.owner = target and s.cell = target_cell
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_shot');
  end if;

  for ship in select * from jsonb_array_elements(fleet) loop
    if ship @> to_jsonb(target_cell) then
      select array_agg((e #>> '{}')::int) into hit_ship from jsonb_array_elements(ship) e;
      exit;
    end if;
  end loop;

  if hit_ship is not null then
    outcome := 'hit';
    hits := hits + 1;
    if (
      select count(*) from public.bs_daily_shots s
       where s.day = today and s.shooter = me and s.owner = target
         and s.cell = any (hit_ship)
    ) + 1 = array_length(hit_ship, 1) then
      outcome := 'sunk';
      sunk := hit_ship;
    end if;
  end if;

  insert into public.bs_daily_shots (day, shooter, owner, cell, result, sunk_cells)
  values (today, me, target, target_cell, outcome, sunk);

  select count(*) into total
    from public.bs_daily_shots s
   where s.day = today and s.shooter = me and s.owner = target;

  return jsonb_build_object(
    'ok', true, 'result', outcome, 'shots', total, 'finished', hits = 11
  );
end;
$$;

-- Who (yourself or linked people) has placed a fleet today, without revealing it.
create function public.bs_fleet_status()
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select f.user_id
    from public.bs_daily_fleets f
   where f.day = private.taipei_today()
     and (f.user_id = auth.uid() or private.is_linked_with(f.user_id));
$$;

revoke all on public.bs_daily_fleets, public.bs_daily_shots from anon, authenticated;
grant select on public.bs_daily_fleets, public.bs_daily_shots to authenticated;

revoke execute on function public.bs_set_fleet(jsonb) from public, anon;
revoke execute on function public.bs_daily_fire(uuid, int) from public, anon;
revoke execute on function public.bs_fleet_status() from public, anon;
grant execute on function public.bs_set_fleet(jsonb) to authenticated;
grant execute on function public.bs_daily_fire(uuid, int) to authenticated;
grant execute on function public.bs_fleet_status() to authenticated;

alter table public.bs_daily_fleets enable row level security;
alter table public.bs_daily_shots enable row level security;

create policy "bs_daily_fleets_select_own" on public.bs_daily_fleets
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "bs_daily_shots_select_parties" on public.bs_daily_shots
  for select to authenticated
  using (shooter = (select auth.uid()) or owner = (select auth.uid()));
