-- Penalty shootouts are best of three. Drop a half-finished five-kick
-- round so that pair can submit the shorter move; finished rounds stay.
create or replace function private.valid_duel_move(g text, move jsonb)
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
      if coalesce(jsonb_typeof(e), '') <> 'array' or jsonb_array_length(e) <> 3 then
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

delete from public.duel_moves m
 where m.game = 'penalty'
   and (
     coalesce(jsonb_array_length(m.move -> 'shots'), 0) <> 3
     or coalesce(jsonb_array_length(m.move -> 'dives'), 0) <> 3
   )
   and not exists (
     select 1
       from public.duel_moves o
      where o.game = m.game
        and o.round = m.round
        and o.player = m.opponent
        and o.opponent = m.player
   );
