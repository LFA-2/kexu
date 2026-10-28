-- Keep the RLS helper out of the exposed API schema.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create function private.is_linked_with(other uuid)
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

revoke execute on function private.is_linked_with(uuid) from public, anon;
grant execute on function private.is_linked_with(uuid) to authenticated;

alter policy "school_data_select_self_or_linked" on public.school_data
  using (user_id = (select auth.uid()) or private.is_linked_with(user_id));

drop function public.is_linked_with(uuid);
