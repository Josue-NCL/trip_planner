-- replace_trip_payload deletes/reinserts planner rows. Keep mobile booking
-- references attached to their stable schedule-item client IDs during that swap.

begin;

alter table public.schedule_item_resources
  add column if not exists trip_id bigint references public.trips(id) on delete cascade,
  add column if not exists schedule_item_client_id text;

update public.schedule_item_resources resource
set
  trip_id = day.trip_id,
  schedule_item_client_id = item.client_id
from public.schedule_items item
join public.trip_days day on day.id = item.trip_day_id
where item.id = resource.schedule_item_id
  and (resource.trip_id is null or resource.schedule_item_client_id is null);

alter table public.schedule_item_resources
  alter column trip_id set not null,
  alter column schedule_item_client_id set not null,
  alter column schedule_item_id drop not null;

alter table public.schedule_item_resources
  drop constraint if exists schedule_item_resources_schedule_item_id_fkey,
  add constraint schedule_item_resources_schedule_item_id_fkey
  foreign key (schedule_item_id) references public.schedule_items(id) on delete set null,
  drop constraint if exists schedule_item_resources_client_id_key,
  add constraint schedule_item_resources_trip_item_client_id_key
  unique (trip_id, schedule_item_client_id, client_id);

create index if not exists schedule_item_resources_trip_item_client_id_idx
  on public.schedule_item_resources(trip_id, schedule_item_client_id);

create or replace function private.sync_schedule_item_resource_identity()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  target_trip_id bigint;
  target_client_id text;
begin
  if new.schedule_item_id is null then
    raise exception 'A schedule item resource must be attached to an activity.' using errcode = '23514';
  end if;

  select day.trip_id, item.client_id
  into target_trip_id, target_client_id
  from public.schedule_items item
  join public.trip_days day on day.id = item.trip_day_id
  where item.id = new.schedule_item_id;

  if target_trip_id is null then
    raise exception 'Schedule item resource activity was not found.' using errcode = '23503';
  end if;

  new.trip_id = target_trip_id;
  new.schedule_item_client_id = target_client_id;
  return new;
end;
$$;

create or replace function private.rebind_schedule_item_resources()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  target_trip_id bigint;
begin
  select trip_id into target_trip_id from public.trip_days where id = new.trip_day_id;
  update public.schedule_item_resources
  set schedule_item_id = new.id
  where trip_id = target_trip_id
    and schedule_item_client_id = new.client_id
    and schedule_item_id is null;
  return new;
end;
$$;

create or replace function private.cleanup_deleted_schedule_item_resources()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  target_trip_id bigint;
begin
  if coalesce(current_setting('app.allow_trip_replace', true), '') = 'true' then
    return old;
  end if;

  select trip_id into target_trip_id from public.trip_days where id = old.trip_day_id;
  delete from public.schedule_item_resources
  where trip_id = target_trip_id
    and schedule_item_client_id = old.client_id
    and schedule_item_id is null;
  return old;
end;
$$;

drop trigger if exists schedule_item_resources_sync_identity on public.schedule_item_resources;
create trigger schedule_item_resources_sync_identity
  before insert or update of schedule_item_id on public.schedule_item_resources
  for each row execute function private.sync_schedule_item_resource_identity();

drop trigger if exists schedule_items_rebind_resources on public.schedule_items;
create trigger schedule_items_rebind_resources
  after insert on public.schedule_items
  for each row execute function private.rebind_schedule_item_resources();

drop trigger if exists schedule_items_cleanup_resources on public.schedule_items;
create trigger schedule_items_cleanup_resources
  after delete on public.schedule_items
  for each row execute function private.cleanup_deleted_schedule_item_resources();

drop policy if exists schedule_item_resources_select_member on public.schedule_item_resources;
drop policy if exists schedule_item_resources_insert_editor on public.schedule_item_resources;
drop policy if exists schedule_item_resources_update_editor on public.schedule_item_resources;
drop policy if exists schedule_item_resources_delete_editor on public.schedule_item_resources;

create policy schedule_item_resources_select_member on public.schedule_item_resources
  for select to authenticated
  using (private.is_trip_member(trip_id));

create policy schedule_item_resources_insert_editor on public.schedule_item_resources
  for insert to authenticated
  with check (private.can_edit_trip(trip_id));

create policy schedule_item_resources_update_editor on public.schedule_item_resources
  for update to authenticated
  using (private.can_edit_trip(trip_id))
  with check (private.can_edit_trip(trip_id));

create policy schedule_item_resources_delete_editor on public.schedule_item_resources
  for delete to authenticated
  using (private.can_edit_trip(trip_id));

commit;
