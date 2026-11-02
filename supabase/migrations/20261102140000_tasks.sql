-- Tasks: one linked person assigns a task to another, with a deadline and an optional reward.
-- The assigner owns the content; the assignee can only mark it done. Times are set by the server.

create table public.tasks (
  id bigint generated always as identity primary key,
  created_by uuid not null references auth.users (id) on delete cascade,
  assignee uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  note text not null default '' check (char_length(note) <= 2000),
  reward text not null default '' check (char_length(reward) <= 200),
  due_at timestamptz not null,
  done_at timestamptz,
  rewarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (created_by <> assignee)
);

create index tasks_created_by_idx on public.tasks (created_by, due_at);
create index tasks_assignee_idx on public.tasks (assignee, due_at);

create function private.tasks_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() = old.assignee then
    if new.title is distinct from old.title
       or new.note is distinct from old.note
       or new.reward is distinct from old.reward
       or new.due_at is distinct from old.due_at
       or new.rewarded_at is distinct from old.rewarded_at then
      raise exception 'only the assigner can change this task' using errcode = '42501';
    end if;
    if old.rewarded_at is not null and new.done_at is distinct from old.done_at then
      raise exception 'task already rewarded' using errcode = '42501';
    end if;
  elsif new.done_at is distinct from old.done_at then
    raise exception 'only the assignee can mark this task done' using errcode = '42501';
  end if;

  if new.done_at is not null and old.done_at is null then
    new.done_at := now();
  end if;
  if new.rewarded_at is not null and old.rewarded_at is null then
    new.rewarded_at := now();
  end if;
  if new.rewarded_at is not null and new.done_at is null then
    raise exception 'task is not done yet' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_guard
  before update on public.tasks
  for each row execute function private.tasks_guard();

revoke all on public.tasks from anon, authenticated;
grant select, delete on public.tasks to authenticated;
grant insert (created_by, assignee, title, note, reward, due_at) on public.tasks to authenticated;
grant update (title, note, reward, due_at, done_at, rewarded_at) on public.tasks to authenticated;

alter table public.tasks enable row level security;

create policy "tasks_select_parties" on public.tasks
  for select to authenticated
  using (created_by = (select auth.uid()) or assignee = (select auth.uid()));

create policy "tasks_insert_linked" on public.tasks
  for insert to authenticated
  with check (created_by = (select auth.uid()) and private.is_linked_with(assignee));

create policy "tasks_update_linked_parties" on public.tasks
  for update to authenticated
  using (
    (created_by = (select auth.uid()) and private.is_linked_with(assignee))
    or (assignee = (select auth.uid()) and private.is_linked_with(created_by))
  )
  with check (
    (created_by = (select auth.uid()) and private.is_linked_with(assignee))
    or (assignee = (select auth.uid()) and private.is_linked_with(created_by))
  );

create policy "tasks_delete_assigner" on public.tasks
  for delete to authenticated
  using (created_by = (select auth.uid()));
