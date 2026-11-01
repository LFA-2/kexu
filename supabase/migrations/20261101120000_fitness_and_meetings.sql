-- Fitness data (one JSON document per user, same model as life_data) and
-- meetings (one row per meeting, editable by both participants).

-- ---------------------------------------------------------------------------
-- Fitness
-- ---------------------------------------------------------------------------

create table public.fitness_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null default '{"exercises":[],"routines":[],"weekPlan":{},"sessions":[],"body":{}}'::jsonb,
  version integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint fitness_data_state_shape check (
    jsonb_typeof(state -> 'exercises') = 'array'
    and jsonb_typeof(state -> 'routines') = 'array'
    and jsonb_typeof(state -> 'weekPlan') = 'object'
    and jsonb_typeof(state -> 'sessions') = 'array'
    and jsonb_typeof(state -> 'body') = 'object'
  ),
  constraint fitness_data_state_size check (octet_length(state::text) < 4000000)
);

insert into public.fitness_data (user_id) select id from auth.users on conflict do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text;
begin
  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.profiles where link_code = code);
  end loop;

  insert into public.profiles (id, display_name, link_code)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 40), code);

  insert into public.school_data (user_id) values (new.id);
  insert into public.life_data (user_id) values (new.id);
  insert into public.fitness_data (user_id) values (new.id);
  return new;
end;
$$;

create function public.save_fitness_data(base_version integer, new_state jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.fitness_data;
begin
  update public.fitness_data
     set state = new_state, version = version + 1, updated_at = now()
   where user_id = auth.uid() and version = base_version
  returning * into r;

  if found then
    return jsonb_build_object('ok', true, 'version', r.version, 'state', r.state);
  end if;

  select * into r from public.fitness_data where user_id = auth.uid();
  return jsonb_build_object('ok', false, 'version', r.version, 'state', r.state);
end;
$$;

revoke all on public.fitness_data from anon, authenticated;
grant select on public.fitness_data to authenticated;
grant update (state, version, updated_at) on public.fitness_data to authenticated;

revoke execute on function public.save_fitness_data(integer, jsonb) from public, anon;
grant execute on function public.save_fitness_data(integer, jsonb) to authenticated;

alter table public.fitness_data enable row level security;

create policy "fitness_data_select_self_or_linked" on public.fitness_data
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_linked_with(user_id));

create policy "fitness_data_update_self" on public.fitness_data
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Meetings: both participants read and write. Writes require the link to
-- still exist; reading past meetings does not.
-- ---------------------------------------------------------------------------

create table public.meetings (
  id bigint generated always as identity primary key,
  created_by uuid not null references auth.users (id) on delete cascade,
  partner uuid not null references auth.users (id) on delete cascade,
  date date not null,
  title text not null default '' check (char_length(title) <= 100),
  agenda text not null default '' check (char_length(agenda) <= 20000),
  notes text not null default '' check (char_length(notes) <= 50000),
  decisions text not null default '' check (char_length(decisions) <= 20000),
  -- [{ id, text, assignee (uuid or null), done }]
  actions jsonb not null default '[]'::jsonb check (
    jsonb_typeof(actions) = 'array' and octet_length(actions::text) < 100000
  ),
  version integer not null default 0,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (created_by <> partner)
);

create index meetings_created_by_idx on public.meetings (created_by, date desc);
create index meetings_partner_idx on public.meetings (partner, date desc);

create function private.meetings_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger meetings_touch
  before update on public.meetings
  for each row execute function private.meetings_touch();

revoke all on public.meetings from anon, authenticated;
grant select, delete on public.meetings to authenticated;
grant insert (created_by, partner, date, title, agenda, notes, decisions, actions)
  on public.meetings to authenticated;
grant update (date, title, agenda, notes, decisions, actions, version)
  on public.meetings to authenticated;

alter table public.meetings enable row level security;

create policy "meetings_select_participants" on public.meetings
  for select to authenticated
  using (created_by = (select auth.uid()) or partner = (select auth.uid()));

create policy "meetings_insert_linked" on public.meetings
  for insert to authenticated
  with check (created_by = (select auth.uid()) and private.is_linked_with(partner));

create policy "meetings_update_linked_participants" on public.meetings
  for update to authenticated
  using (
    (created_by = (select auth.uid()) and private.is_linked_with(partner))
    or (partner = (select auth.uid()) and private.is_linked_with(created_by))
  )
  with check (
    (created_by = (select auth.uid()) and private.is_linked_with(partner))
    or (partner = (select auth.uid()) and private.is_linked_with(created_by))
  );

create policy "meetings_delete_participants" on public.meetings
  for delete to authenticated
  using (created_by = (select auth.uid()) or partner = (select auth.uid()));
