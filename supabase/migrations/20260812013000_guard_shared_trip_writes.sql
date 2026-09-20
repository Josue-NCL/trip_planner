-- Shared trips need one durable revision signal for every direct child write.
-- Full payload saves opt out while they run, because they already touch the
-- parent trip once inside their transaction.
create or replace function public.touch_parent_trip_from_change()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  target_trip_id bigint;
begin
  if current_setting('app.allow_trip_replace', true) = 'true'
    or current_setting('app.skip_trip_touch', true) = 'true' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  case tg_table_name
    when 'trip_days', 'ideas', 'trip_expenses', 'trip_travelers' then
      target_trip_id := case when tg_op = 'DELETE' then old.trip_id else new.trip_id end;
    when 'schedule_items' then
      select day.trip_id
      into target_trip_id
      from public.trip_days day
      where day.id = case when tg_op = 'DELETE' then old.trip_day_id else new.trip_day_id end;
    when 'idea_votes' then
      select idea.trip_id
      into target_trip_id
      from public.ideas idea
      where idea.id = case when tg_op = 'DELETE' then old.idea_id else new.idea_id end;
    else
      raise exception 'Unsupported parent-trip touch table: %', tg_table_name;
  end case;

  if target_trip_id is not null then
    update public.trips
    set updated_at = now()
    where id = target_trip_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trip_days_touch_parent_trip on public.trip_days;
create trigger trip_days_touch_parent_trip
after insert or update or delete on public.trip_days
for each row execute function public.touch_parent_trip_from_change();

drop trigger if exists schedule_items_touch_parent_trip on public.schedule_items;
create trigger schedule_items_touch_parent_trip
after insert or update or delete on public.schedule_items
for each row execute function public.touch_parent_trip_from_change();

drop trigger if exists ideas_touch_parent_trip on public.ideas;
create trigger ideas_touch_parent_trip
after insert or update or delete on public.ideas
for each row execute function public.touch_parent_trip_from_change();

drop trigger if exists idea_votes_touch_parent_trip on public.idea_votes;
create trigger idea_votes_touch_parent_trip
after insert or update or delete on public.idea_votes
for each row execute function public.touch_parent_trip_from_change();

drop trigger if exists trip_expenses_touch_parent_trip on public.trip_expenses;
create trigger trip_expenses_touch_parent_trip
after insert or update or delete on public.trip_expenses
for each row execute function public.touch_parent_trip_from_change();

drop trigger if exists trip_travelers_touch_parent_trip on public.trip_travelers;
create trigger trip_travelers_touch_parent_trip
after insert or update or delete on public.trip_travelers
for each row execute function public.touch_parent_trip_from_change();

-- The legacy two-argument function remains for backwards compatibility.
-- New clients use this short, row-locked wrapper to reject stale snapshots
-- before the payload function can change any child rows.
create or replace function public.replace_trip_payload_guarded(
  target_trip_id bigint,
  payload jsonb,
  expected_trip_updated_at timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actual_trip_updated_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in to save a trip.' using errcode = '28000';
  end if;

  if not private.can_edit_trip(target_trip_id) then
    raise exception 'You do not have permission to save this trip.' using errcode = '42501';
  end if;

  if expected_trip_updated_at is null then
    raise exception 'A trip version is required. Reload and try again.' using errcode = '40001';
  end if;

  select trip.updated_at
  into actual_trip_updated_at
  from public.trips trip
  where trip.id = target_trip_id
  for update;

  if actual_trip_updated_at is null then
    raise exception 'Trip not found.' using errcode = 'P0002';
  end if;

  if actual_trip_updated_at is distinct from expected_trip_updated_at then
    raise exception 'This trip changed elsewhere. Reload and try again.' using errcode = '40001';
  end if;

  perform public.replace_trip_payload(target_trip_id, payload);

  select updated_at
  into actual_trip_updated_at
  from public.trips
  where id = target_trip_id;

  return actual_trip_updated_at;
end;
$$;

revoke all on function public.replace_trip_payload_guarded(bigint, jsonb, timestamptz) from public, anon;
grant execute on function public.replace_trip_payload_guarded(bigint, jsonb, timestamptz) to authenticated;

-- The targeted calendar RPC already updates the parent after its one-row
-- write, so prevent the generic child trigger from emitting a second signal.
create or replace function public.move_schedule_item(
  target_trip_id bigint,
  source_day_client_id text,
  target_day_client_id text,
  target_item_client_id text,
  next_start_time time,
  next_duration_minutes integer,
  next_city text,
  expected_updated_at timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = public, private
as $$
declare
  source_item_count bigint;
  target_schedule_item_id bigint;
  target_trip_day_id bigint;
  saved_updated_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required to update a schedule item';
  end if;

  if not private.can_edit_trip(target_trip_id) then
    raise exception 'You do not have permission to edit this trip';
  end if;

  if expected_updated_at is null then
    raise exception 'A schedule item version is required';
  end if;

  select day.id
  into target_trip_day_id
  from public.trip_days day
  where day.trip_id = target_trip_id
    and day.client_id = target_day_client_id;

  if target_trip_day_id is null then
    raise exception 'The destination day does not belong to this trip';
  end if;

  select count(*), min(item.id)
  into source_item_count, target_schedule_item_id
  from public.schedule_items item
  join public.trip_days source_day on source_day.id = item.trip_day_id
  where source_day.trip_id = target_trip_id
    and source_day.client_id = source_day_client_id
    and item.client_id = target_item_client_id;

  if source_item_count <> 1 then
    raise exception 'The schedule item could not be safely identified';
  end if;

  perform set_config('app.skip_trip_touch', 'true', true);

  update public.schedule_items item
  set trip_day_id = target_trip_day_id,
      start_time = next_start_time,
      duration_minutes = next_duration_minutes,
      city = coalesce(next_city, item.city)
  where item.id = target_schedule_item_id
    and item.updated_at = expected_updated_at
    and (item.trip_day_id, item.start_time, item.duration_minutes, item.city)
      is distinct from (target_trip_day_id, next_start_time, next_duration_minutes, coalesce(next_city, item.city))
  returning item.updated_at into saved_updated_at;

  if saved_updated_at is null then
    select item.updated_at
    into saved_updated_at
    from public.schedule_items item
    where item.id = target_schedule_item_id;

    if saved_updated_at is distinct from expected_updated_at then
      raise exception 'This activity changed elsewhere. Refresh the trip and try again.';
    end if;

    return saved_updated_at;
  end if;

  update public.trips
  set updated_at = now()
  where id = target_trip_id;

  return saved_updated_at;
end;
$$;
