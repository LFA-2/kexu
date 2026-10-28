-- Accounts, per-user school data, and read-only sharing between linked users.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  link_code text not null unique,
  created_at timestamptz not null default now()
);

create table public.school_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null default '{"courses":[],"homework":[],"exams":[],"progress":[]}'::jsonb,
  version integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint school_data_state_shape check (
    jsonb_typeof(state -> 'courses') = 'array'
    and jsonb_typeof(state -> 'homework') = 'array'
    and jsonb_typeof(state -> 'exams') = 'array'
    and jsonb_typeof(state -> 'progress') = 'array'
  ),
  constraint school_data_state_size check (octet_length(state::text) < 1000000)
);

create table public.links (
  id bigint generated always as identity primary key,
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);

-- At most one link per pair, regardless of direction.
create unique index links_pair_unique
  on public.links (least(requester, addressee), greatest(requester, addressee));
create index links_addressee_idx on public.links (addressee);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.is_linked_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.links l
    where l.status = 'accepted'
      and ((l.requester = auth.uid() and l.addressee = other)
        or (l.addressee = auth.uid() and l.requester = other))
  );
$$;

create function public.handle_new_user()
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
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Optimistic-concurrency save: only writes when base_version matches.
create function public.save_school_data(base_version integer, new_state jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.school_data;
begin
  update public.school_data
     set state = new_state, version = version + 1, updated_at = now()
   where user_id = auth.uid() and version = base_version
  returning * into r;

  if found then
    return jsonb_build_object('ok', true, 'version', r.version, 'state', r.state);
  end if;

  select * into r from public.school_data where user_id = auth.uid();
  return jsonb_build_object('ok', false, 'version', r.version, 'state', r.state);
end;
$$;

-- Send a link request by link code. If the other person already sent one, accept it.
create function public.request_link(code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  target uuid;
  existing public.links;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  select id into target from public.profiles where link_code = upper(trim(code));
  if target is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if target = me then
    return jsonb_build_object('ok', false, 'error', 'self');
  end if;

  select * into existing from public.links
   where least(requester, addressee) = least(me, target)
     and greatest(requester, addressee) = greatest(me, target);

  if found then
    if existing.status = 'pending' and existing.addressee = me then
      update public.links set status = 'accepted' where id = existing.id;
      return jsonb_build_object('ok', true, 'status', 'accepted');
    end if;
    return jsonb_build_object(
      'ok', false,
      'error', case when existing.status = 'accepted' then 'already_linked' else 'already_requested' end
    );
  end if;

  insert into public.links (requester, addressee) values (me, target);
  return jsonb_build_object('ok', true, 'status', 'pending');
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on public.profiles, public.school_data, public.links from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

grant select on public.school_data to authenticated;
grant update (state, version, updated_at) on public.school_data to authenticated;

grant select, delete on public.links to authenticated;
grant update (status) on public.links to authenticated;

revoke execute on function public.is_linked_with(uuid) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.save_school_data(integer, jsonb) from public, anon;
revoke execute on function public.request_link(text) from public, anon;
grant execute on function public.is_linked_with(uuid) to authenticated;
grant execute on function public.save_school_data(integer, jsonb) to authenticated;
grant execute on function public.request_link(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.school_data enable row level security;
alter table public.links enable row level security;

-- Profiles are visible to yourself and to anyone you share a link or request with.
create policy "profiles_select_self_or_connected" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.links l
      where (l.requester = (select auth.uid()) and l.addressee = profiles.id)
         or (l.addressee = (select auth.uid()) and l.requester = profiles.id)
    )
  );

create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- School data: owner reads and writes; accepted links read only.
create policy "school_data_select_self_or_linked" on public.school_data
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_linked_with(user_id));

create policy "school_data_update_self" on public.school_data
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Links: both parties can see and remove; only the addressee can accept.
create policy "links_select_parties" on public.links
  for select to authenticated
  using (requester = (select auth.uid()) or addressee = (select auth.uid()));

create policy "links_accept_addressee" on public.links
  for update to authenticated
  using (addressee = (select auth.uid()) and status = 'pending')
  with check (addressee = (select auth.uid()) and status = 'accepted');

create policy "links_delete_parties" on public.links
  for delete to authenticated
  using (requester = (select auth.uid()) or addressee = (select auth.uid()));
