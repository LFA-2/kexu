-- 1A2B: each user sets one 4-digit number per day (Asia/Taipei); linked users guess it.
-- Secrets are readable only by their owner; guesses are scored server-side.

create table public.daily_secrets (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  secret text not null check (secret ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table public.ab_guesses (
  id bigint generated always as identity primary key,
  day date not null,
  guesser uuid not null references auth.users (id) on delete cascade,
  owner uuid not null references auth.users (id) on delete cascade,
  guess text not null check (guess ~ '^[0-9]{4}$'),
  a smallint not null,
  b smallint not null,
  created_at timestamptz not null default now(),
  check (guesser <> owner)
);

create index ab_guesses_day_idx on public.ab_guesses (day, owner, guesser);
create index ab_guesses_guesser_idx on public.ab_guesses (guesser);

create function private.taipei_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Taipei')::date;
$$;

-- A: right digit, right place. B: right digit, wrong place, ignoring digits already counted in A.
create function private.score_ab(secret text, attempt text, out a int, out b int)
language plpgsql
immutable
set search_path = ''
as $$
declare
  rest_secret text := '';
  rest_attempt text := '';
  d text;
begin
  a := 0;
  b := 0;
  for i in 1..4 loop
    if substr(secret, i, 1) = substr(attempt, i, 1) then
      a := a + 1;
    else
      rest_secret := rest_secret || substr(secret, i, 1);
      rest_attempt := rest_attempt || substr(attempt, i, 1);
    end if;
  end loop;
  for n in 0..9 loop
    d := n::text;
    b := b + least(
      length(rest_secret) - length(replace(rest_secret, d, '')),
      length(rest_attempt) - length(replace(rest_attempt, d, ''))
    );
  end loop;
end;
$$;

create function public.set_daily_secret(new_secret text)
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
  if new_secret is null or new_secret !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  insert into public.daily_secrets (user_id, day, secret)
  values (me, today, new_secret)
  on conflict do nothing;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'already_set');
  end if;
  return jsonb_build_object('ok', true, 'day', today);
end;
$$;

create function public.make_guess(target uuid, attempt text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  today date := private.taipei_today();
  target_secret text;
  score record;
  tries int;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if attempt is null or attempt !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if target = me or not private.is_linked_with(target) then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  perform pg_advisory_xact_lock(hashtext(me::text || target::text || today::text));

  select ds.secret into target_secret
    from public.daily_secrets ds
   where ds.user_id = target and ds.day = today;
  if target_secret is null then
    return jsonb_build_object('ok', false, 'error', 'no_secret');
  end if;

  if exists (
    select 1 from public.ab_guesses g
     where g.day = today and g.guesser = me and g.owner = target and g.a = 4
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_solved');
  end if;

  select * into score from private.score_ab(target_secret, attempt);

  insert into public.ab_guesses (day, guesser, owner, guess, a, b)
  values (today, me, target, attempt, score.a, score.b);

  select count(*) into tries
    from public.ab_guesses g
   where g.day = today and g.guesser = me and g.owner = target;

  return jsonb_build_object(
    'ok', true, 'a', score.a, 'b', score.b, 'attempts', tries, 'solved', score.a = 4
  );
end;
$$;

-- Who (yourself or linked people) has set a number today, without revealing it.
create function public.daily_secret_status()
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select ds.user_id
    from public.daily_secrets ds
   where ds.day = private.taipei_today()
     and (ds.user_id = auth.uid() or private.is_linked_with(ds.user_id));
$$;

revoke all on public.daily_secrets, public.ab_guesses from anon, authenticated;
grant select on public.daily_secrets, public.ab_guesses to authenticated;

revoke execute on function private.taipei_today() from public, anon, authenticated;
revoke execute on function private.score_ab(text, text) from public, anon, authenticated;
revoke execute on function public.set_daily_secret(text) from public, anon;
revoke execute on function public.make_guess(uuid, text) from public, anon;
revoke execute on function public.daily_secret_status() from public, anon;
grant execute on function public.set_daily_secret(text) to authenticated;
grant execute on function public.make_guess(uuid, text) to authenticated;
grant execute on function public.daily_secret_status() to authenticated;

alter table public.daily_secrets enable row level security;
alter table public.ab_guesses enable row level security;

create policy "daily_secrets_select_own" on public.daily_secrets
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "ab_guesses_select_parties" on public.ab_guesses
  for select to authenticated
  using (guesser = (select auth.uid()) or owner = (select auth.uid()));
