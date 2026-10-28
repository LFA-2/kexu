-- Per-user life data: daily metrics, todos, daily notes for linked people, available dates.

create table public.life_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null default '{"metrics":{},"todos":[],"notes":{},"available":[]}'::jsonb,
  version integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint life_data_state_shape check (
    jsonb_typeof(state -> 'metrics') = 'object'
    and jsonb_typeof(state -> 'todos') = 'array'
    and jsonb_typeof(state -> 'notes') = 'object'
    and jsonb_typeof(state -> 'available') = 'array'
  ),
  constraint life_data_state_size check (octet_length(state::text) < 1000000)
);

insert into public.life_data (user_id) select id from auth.users on conflict do nothing;

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
  return new;
end;
$$;

create function public.save_life_data(base_version integer, new_state jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.life_data;
begin
  update public.life_data
     set state = new_state, version = version + 1, updated_at = now()
   where user_id = auth.uid() and version = base_version
  returning * into r;

  if found then
    return jsonb_build_object('ok', true, 'version', r.version, 'state', r.state);
  end if;

  select * into r from public.life_data where user_id = auth.uid();
  return jsonb_build_object('ok', false, 'version', r.version, 'state', r.state);
end;
$$;

revoke all on public.life_data from anon, authenticated;
grant select on public.life_data to authenticated;
grant update (state, version, updated_at) on public.life_data to authenticated;

revoke execute on function public.save_life_data(integer, jsonb) from public, anon;
grant execute on function public.save_life_data(integer, jsonb) to authenticated;

alter table public.life_data enable row level security;

create policy "life_data_select_self_or_linked" on public.life_data
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_linked_with(user_id));

create policy "life_data_update_self" on public.life_data
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
