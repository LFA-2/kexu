-- Leaving a battleship game before it starts cancels it (no winner);
-- leaving during play is a resignation.
create or replace function public.bs_resign(target_game bigint)
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
         winner = case
           when g.status = 'placing' then null
           when me = g.player_a then g.player_b
           else g.player_a
         end,
         turn = null,
         updated_at = now()
   where id = g.id;
  return jsonb_build_object('ok', true);
end;
$$;
