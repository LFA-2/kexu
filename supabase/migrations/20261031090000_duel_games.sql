-- Two-player attack/defense games between linked users:
--   battleship (turn-based, fleets hidden until the game ends)
--   blotto     (one sealed allocation per day, Asia/Taipei)
--   penalty    (one sealed set of shots and dives per round)

-- ---------------------------------------------------------------------------
-- Battleship: 7x7 board (cells 0..48), ships of length 4, 3, 2, 2
-- ---------------------------------------------------------------------------

create table public.bs_games (
  id bigint generated always as identity primary key,
  player_a uuid not null references auth.users (id) on delete cascade,
  player_b uuid not null references auth.users (id) on delete cascade,
  status text not null default 'placing' check (status in ('placing', 'playing', 'finished')),
  turn uuid,
  winner uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (player_a <> player_b)
);

create unique index bs_games_active_pair
  on public.bs_games (least(player_a, player_b), greatest(player_a, player_b))
  where status <> 'finished';
create index bs_games_player_b_idx on public.bs_games (player_b);

create table public.bs_fleets (
  game_id bigint not null references public.bs_games (id) on delete cascade,
  player uuid not null references auth.users (id) on delete cascade,
  ships jsonb not null,
  primary key (game_id, player)
);

create table public.bs_shots (
  id bigint generated always as identity primary key,
  game_id bigint not null references public.bs_games (id) on delete cascade,
  shooter uuid not null references auth.users (id) on delete cascade,
  cell smallint not null check (cell between 0 and 48),
  result text not null check (result in ('miss', 'hit', 'sunk')),
  sunk_cells smallint[],
  created_at timestamptz not null default now(),
  unique (game_id, shooter, cell)
);

create function private.bs_valid_fleet(ships jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  ship jsonb;
  cells int[];
  all_cells int[] := '{}';
  lens int[] := '{}';
  n int;
  step int;
begin
  if coalesce(jsonb_typeof(ships), '') <> 'array' or jsonb_array_length(ships) <> 4 then
    return false;
  end if;

  for ship in select * from jsonb_array_elements(ships) loop
    if coalesce(jsonb_typeof(ship), '') <> 'array' then
      return false;
    end if;
    begin
      select array_agg(x order by x) into cells
        from (select (e #>> '{}')::int as x from jsonb_array_elements(ship) e) s;
    exception when others then
      return false;
    end;

    n := coalesce(array_length(cells, 1), 0);
    if n < 2 or cells[1] < 0 or cells[n] > 48 then
      return false;
    end if;
    step := cells[2] - cells[1];
    if step not in (1, 7) then
      return false;
    end if;
    for i in 2..n loop
      if cells[i] - cells[i - 1] <> step then
        return false;
      end if;
    end loop;
    if step = 1 and cells[1] / 7 <> cells[n] / 7 then
      return false;
    end if;

    lens := lens || n;
    all_cells := all_cells || cells;
  end loop;

  if (select array_agg(x order by x) from unnest(lens) x) <> array[2, 2, 3, 4] then
    return false;
  end if;
  return (select count(distinct x) from unnest(all_cells) x) = array_length(all_cells, 1);
end;
$$;

create function public.bs_new_game(opponent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  new_id bigint;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if opponent_id = me or not private.is_linked_with(opponent_id) then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;
  begin
    insert into public.bs_games (player_a, player_b) values (me, opponent_id)
    returning id into new_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'active_exists');
  end;
  return jsonb_build_object('ok', true, 'id', new_id);
end;
$$;

create function public.bs_place(target_game bigint, fleet jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  g public.bs_games;
begin
  select * into g from public.bs_games where id = target_game for update;
  if not found or me is null or me not in (g.player_a, g.player_b) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if g.status <> 'placing' then
    return jsonb_build_object('ok', false, 'error', 'not_placing');
  end if;
  if not private.bs_valid_fleet(fleet) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  insert into public.bs_fleets (game_id, player, ships) values (g.id, me, fleet)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'already_placed');
  end if;

  if (select count(*) from public.bs_fleets f where f.game_id = g.id) = 2 then
    update public.bs_games
       set status = 'playing',
           turn = case when random() < 0.5 then g.player_a else g.player_b end,
           updated_at = now()
     where id = g.id;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.bs_fire(target_game bigint, target_cell int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  g public.bs_games;
  other uuid;
  fleet jsonb;
  ship jsonb;
  hit_ship int[];
  outcome text := 'miss';
  sunk int[];
  hits int;
begin
  select * into g from public.bs_games where id = target_game for update;
  if not found or me is null or me not in (g.player_a, g.player_b) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if g.status <> 'playing' then
    return jsonb_build_object('ok', false, 'error', 'not_playing');
  end if;
  if g.turn is distinct from me then
    return jsonb_build_object('ok', false, 'error', 'not_your_turn');
  end if;
  if target_cell is null or target_cell < 0 or target_cell > 48 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if exists (
    select 1 from public.bs_shots s
     where s.game_id = g.id and s.shooter = me and s.cell = target_cell
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_shot');
  end if;

  other := case when me = g.player_a then g.player_b else g.player_a end;
  select f.ships into fleet from public.bs_fleets f where f.game_id = g.id and f.player = other;

  for ship in select * from jsonb_array_elements(fleet) loop
    if ship @> to_jsonb(target_cell) then
      select array_agg((e #>> '{}')::int) into hit_ship from jsonb_array_elements(ship) e;
      exit;
    end if;
  end loop;

  if hit_ship is not null then
    outcome := 'hit';
    if (
      select count(*) from public.bs_shots s
       where s.game_id = g.id and s.shooter = me and s.cell = any (hit_ship)
    ) + 1 = array_length(hit_ship, 1) then
      outcome := 'sunk';
      sunk := hit_ship;
    end if;
  end if;

  insert into public.bs_shots (game_id, shooter, cell, result, sunk_cells)
  values (g.id, me, target_cell, outcome, sunk);

  select count(*) into hits
    from public.bs_shots s
   where s.game_id = g.id and s.shooter = me and s.result <> 'miss';

  if hits = 11 then
    update public.bs_games
       set status = 'finished', winner = me, turn = null, updated_at = now()
     where id = g.id;
    return jsonb_build_object('ok', true, 'result', outcome, 'finished', true);
  end if;

  update public.bs_games set turn = other, updated_at = now() where id = g.id;
  return jsonb_build_object('ok', true, 'result', outcome, 'finished', false);
end;
$$;

create function public.bs_resign(target_game bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  g public.bs_games;
begin
  select * into g from public.bs_games where id = target_game for update;
  if not found or me is null or me not in (g.player_a, g.player_b) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if g.status = 'finished' then
    return jsonb_build_object('ok', false, 'error', 'finished');
  end if;
  update public.bs_games
     set status = 'finished',
         winner = case when me = g.player_a then g.player_b else g.player_a end,
         turn = null,
         updated_at = now()
   where id = g.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Sealed-move duels (blotto, penalty)
-- ---------------------------------------------------------------------------

create table public.duel_moves (
  id bigint generated always as identity primary key,
  game text not null check (game in ('blotto', 'penalty')),
  round text not null,
  player uuid not null references auth.users (id) on delete cascade,
  opponent uuid not null references auth.users (id) on delete cascade,
  move jsonb not null,
  created_at timestamptz not null default now(),
  unique (game, round, player, opponent),
  check (player <> opponent)
);

create index duel_moves_opponent_idx on public.duel_moves (opponent, game, round);

create function private.has_duel_move(g text, r text, who uuid, against uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.duel_moves m
     where m.game = g and m.round = r and m.player = who and m.opponent = against
  );
$$;

-- blotto: today's date; penalty: the first round number not yet completed by both.
create function private.duel_current_round(g text, me uuid, other uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n int;
begin
  if g = 'blotto' then
    return private.taipei_today()::text;
  end if;

  select max(m.round::int) into n
    from public.duel_moves m
   where m.game = g
     and ((m.player = me and m.opponent = other) or (m.player = other and m.opponent = me));
  if n is null then
    return '1';
  end if;
  if private.has_duel_move(g, n::text, me, other) and private.has_duel_move(g, n::text, other, me) then
    return (n + 1)::text;
  end if;
  return n::text;
end;
$$;

create function private.valid_int_array(v jsonb, len int)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  e jsonb;
begin
  if coalesce(jsonb_typeof(v), '') <> 'array' or jsonb_array_length(v) <> len then
    return false;
  end if;
  for e in select * from jsonb_array_elements(v) loop
    if jsonb_typeof(e) <> 'number' or (e #>> '{}') !~ '^[0-9]+$' then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create function private.valid_duel_move(g text, move jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  e jsonb;
  total int := 0;
begin
  if coalesce(jsonb_typeof(move), '') <> 'object'
     or (select count(*) from jsonb_object_keys(move)) <> 2 then
    return false;
  end if;

  if g = 'blotto' then
    if not private.valid_int_array(move -> 'attack', 3)
       or not private.valid_int_array(move -> 'defense', 3) then
      return false;
    end if;
    select sum((x #>> '{}')::int) into total
      from (
        select x from jsonb_array_elements(move -> 'attack') x
        union all
        select x from jsonb_array_elements(move -> 'defense') x
      ) s;
    return total = 10;
  end if;

  if g = 'penalty' then
    foreach e in array array[move -> 'shots', move -> 'dives'] loop
      if coalesce(jsonb_typeof(e), '') <> 'array' or jsonb_array_length(e) <> 5 then
        return false;
      end if;
      if exists (
        select 1 from jsonb_array_elements(e) x
         where jsonb_typeof(x) <> 'string' or (x #>> '{}') not in ('L', 'C', 'R')
      ) then
        return false;
      end if;
    end loop;
    return true;
  end if;

  return false;
end;
$$;

create function public.submit_duel(game_name text, opponent_id uuid, move jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  r text;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if opponent_id = me or not private.is_linked_with(opponent_id) then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;
  if game_name not in ('blotto', 'penalty') or not private.valid_duel_move(game_name, move) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  perform pg_advisory_xact_lock(
    hashtext(game_name || least(me::text, opponent_id::text) || greatest(me::text, opponent_id::text))
  );
  r := private.duel_current_round(game_name, me, opponent_id);

  insert into public.duel_moves (game, round, player, opponent, move)
  values (game_name, r, me, opponent_id, move)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'already_submitted');
  end if;
  return jsonb_build_object('ok', true, 'round', r);
end;
$$;

create function public.duel_status(game_name text, opponent_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  r text;
begin
  if me is null or opponent_id = me or not private.is_linked_with(opponent_id) then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;
  r := private.duel_current_round(game_name, me, opponent_id);
  return jsonb_build_object(
    'ok', true,
    'round', r,
    'mine', private.has_duel_move(game_name, r, me, opponent_id),
    'theirs', private.has_duel_move(game_name, r, opponent_id, me)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------

revoke all on public.bs_games, public.bs_fleets, public.bs_shots, public.duel_moves
  from anon, authenticated;
grant select on public.bs_games, public.bs_fleets, public.bs_shots, public.duel_moves
  to authenticated;

revoke execute on function private.bs_valid_fleet(jsonb) from public, anon, authenticated;
revoke execute on function private.duel_current_round(text, uuid, uuid) from public, anon, authenticated;
revoke execute on function private.valid_int_array(jsonb, int) from public, anon, authenticated;
revoke execute on function private.valid_duel_move(text, jsonb) from public, anon, authenticated;
revoke execute on function private.has_duel_move(text, text, uuid, uuid) from public, anon;
grant execute on function private.has_duel_move(text, text, uuid, uuid) to authenticated;

revoke execute on function public.bs_new_game(uuid) from public, anon;
revoke execute on function public.bs_place(bigint, jsonb) from public, anon;
revoke execute on function public.bs_fire(bigint, int) from public, anon;
revoke execute on function public.bs_resign(bigint) from public, anon;
revoke execute on function public.submit_duel(text, uuid, jsonb) from public, anon;
revoke execute on function public.duel_status(text, uuid) from public, anon;
grant execute on function public.bs_new_game(uuid) to authenticated;
grant execute on function public.bs_place(bigint, jsonb) to authenticated;
grant execute on function public.bs_fire(bigint, int) to authenticated;
grant execute on function public.bs_resign(bigint) to authenticated;
grant execute on function public.submit_duel(text, uuid, jsonb) to authenticated;
grant execute on function public.duel_status(text, uuid) to authenticated;

alter table public.bs_games enable row level security;
alter table public.bs_fleets enable row level security;
alter table public.bs_shots enable row level security;
alter table public.duel_moves enable row level security;

create policy "bs_games_select_players" on public.bs_games
  for select to authenticated
  using ((select auth.uid()) in (player_a, player_b));

-- Your own fleet always; the opponent's only once the game is over.
create policy "bs_fleets_select_own_or_finished" on public.bs_fleets
  for select to authenticated
  using (
    player = (select auth.uid())
    or exists (
      select 1 from public.bs_games g
       where g.id = bs_fleets.game_id
         and g.status = 'finished'
         and (select auth.uid()) in (g.player_a, g.player_b)
    )
  );

create policy "bs_shots_select_players" on public.bs_shots
  for select to authenticated
  using (
    exists (
      select 1 from public.bs_games g
       where g.id = bs_shots.game_id
         and (select auth.uid()) in (g.player_a, g.player_b)
    )
  );

-- Your own moves always; the opponent's move only after you've made yours for that round.
create policy "duel_moves_select_own_or_revealed" on public.duel_moves
  for select to authenticated
  using (
    player = (select auth.uid())
    or (
      opponent = (select auth.uid())
      and private.has_duel_move(game, round, (select auth.uid()), player)
    )
  );
