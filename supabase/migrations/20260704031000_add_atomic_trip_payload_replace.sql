create or replace function public.replace_trip_payload(target_trip_id bigint, payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in to save a trip.' using errcode = '28000';
  end if;

  if not (
    private.can_edit_trip(target_trip_id)
    or exists (
      select 1
      from public.trips trip
      where trip.id = target_trip_id
        and trip.owner_id = (select auth.uid())
    )
  ) then
    raise exception 'You do not have permission to save this trip.' using errcode = '42501';
  end if;

  perform set_config('app.allow_trip_replace', 'true', true);

  update public.trips
  set
    name = coalesce(nullif(payload #>> '{trip,name}', ''), 'Untitled trip'),
    date_range_label = coalesce(payload #>> '{trip,date_range_label}', ''),
    schema_version = coalesce(nullif(payload #>> '{trip,schema_version}', '')::integer, 1)
  where id = target_trip_id;

  if not found then
    raise exception 'Trip not found.' using errcode = 'P0002';
  end if;

  drop table if exists pg_temp.payload_travelers;
  create temporary table payload_travelers (
    client_id text not null,
    name text not null,
    sort_order integer not null
  ) on commit drop;

  insert into payload_travelers (client_id, name, sort_order)
  select client_id, name, sort_order
  from jsonb_to_recordset(coalesce(payload -> 'travelers', '[]'::jsonb))
    as row(client_id text, name text, sort_order integer);

  drop table if exists pg_temp.payload_days;
  create temporary table payload_days (
    client_id text not null,
    trip_date date not null,
    day_number integer not null,
    city text not null,
    notes text not null,
    base_map_link text not null,
    base_place_id text,
    base_place_name text,
    base_formatted_address text,
    base_latitude double precision,
    base_longitude double precision,
    base_google_maps_uri text,
    base_place_resolved_at timestamptz
  ) on commit drop;

  insert into payload_days (
    client_id,
    trip_date,
    day_number,
    city,
    notes,
    base_map_link,
    base_place_id,
    base_place_name,
    base_formatted_address,
    base_latitude,
    base_longitude,
    base_google_maps_uri,
    base_place_resolved_at
  )
  select
    client_id,
    trip_date,
    day_number,
    coalesce(city, ''),
    coalesce(notes, ''),
    coalesce(base_map_link, ''),
    base_place_id,
    base_place_name,
    base_formatted_address,
    base_latitude,
    base_longitude,
    base_google_maps_uri,
    nullif(base_place_resolved_at, '')::timestamptz
  from jsonb_to_recordset(coalesce(payload -> 'days', '[]'::jsonb))
    as row(
      client_id text,
      trip_date date,
      day_number integer,
      city text,
      notes text,
      base_map_link text,
      base_place_id text,
      base_place_name text,
      base_formatted_address text,
      base_latitude double precision,
      base_longitude double precision,
      base_google_maps_uri text,
      base_place_resolved_at text
    );

  drop table if exists pg_temp.payload_schedule_items;
  create temporary table payload_schedule_items (
    day_client_id text not null,
    client_id text not null,
    item_kind text not null,
    title text not null,
    category text not null,
    city text not null,
    start_time time not null,
    duration_minutes integer not null,
    status text not null,
    notes text not null,
    cost text not null,
    link text not null,
    map_link text not null,
    sort_order integer not null,
    place_id text,
    place_name text,
    formatted_address text,
    latitude double precision,
    longitude double precision,
    google_maps_uri text,
    place_resolved_at timestamptz,
    stay_start_day_client_id text not null,
    stay_end_day_client_id text not null,
    check_in_time time,
    check_out_time time
  ) on commit drop;

  insert into payload_schedule_items (
    day_client_id,
    client_id,
    item_kind,
    title,
    category,
    city,
    start_time,
    duration_minutes,
    status,
    notes,
    cost,
    link,
    map_link,
    sort_order,
    place_id,
    place_name,
    formatted_address,
    latitude,
    longitude,
    google_maps_uri,
    place_resolved_at,
    stay_start_day_client_id,
    stay_end_day_client_id,
    check_in_time,
    check_out_time
  )
  select
    day_client_id,
    client_id,
    coalesce(item_kind, 'activity'),
    coalesce(nullif(title, ''), 'Untitled plan'),
    coalesce(nullif(category, ''), 'Open Time'),
    coalesce(city, ''),
    coalesce(nullif(start_time, '')::time, '10:00'::time),
    coalesce(duration_minutes, 60),
    coalesce(nullif(status, ''), 'Proposed'),
    coalesce(notes, ''),
    coalesce(cost, ''),
    coalesce(link, ''),
    coalesce(map_link, ''),
    coalesce(sort_order, 0),
    place_id,
    place_name,
    formatted_address,
    latitude,
    longitude,
    google_maps_uri,
    nullif(place_resolved_at, '')::timestamptz,
    coalesce(stay_start_day_client_id, ''),
    coalesce(stay_end_day_client_id, ''),
    nullif(check_in_time, '')::time,
    nullif(check_out_time, '')::time
  from jsonb_to_recordset(coalesce(payload -> 'scheduleItems', '[]'::jsonb))
    as row(
      day_client_id text,
      client_id text,
      item_kind text,
      title text,
      category text,
      city text,
      start_time text,
      duration_minutes integer,
      status text,
      notes text,
      cost text,
      link text,
      map_link text,
      sort_order integer,
      place_id text,
      place_name text,
      formatted_address text,
      latitude double precision,
      longitude double precision,
      google_maps_uri text,
      place_resolved_at text,
      stay_start_day_client_id text,
      stay_end_day_client_id text,
      check_in_time text,
      check_out_time text
    );

  drop table if exists pg_temp.payload_ideas;
  create temporary table payload_ideas (
    client_id text not null,
    title text not null,
    category text not null,
    city text not null,
    duration_minutes integer not null,
    status text not null,
    notes text not null,
    cost text not null,
    link text not null,
    map_link text not null,
    image_key text not null,
    sort_order integer not null,
    place_id text,
    place_name text,
    formatted_address text,
    latitude double precision,
    longitude double precision,
    google_maps_uri text,
    place_resolved_at timestamptz,
    votes jsonb not null
  ) on commit drop;

  insert into payload_ideas (
    client_id,
    title,
    category,
    city,
    duration_minutes,
    status,
    notes,
    cost,
    link,
    map_link,
    image_key,
    sort_order,
    place_id,
    place_name,
    formatted_address,
    latitude,
    longitude,
    google_maps_uri,
    place_resolved_at,
    votes
  )
  select
    client_id,
    coalesce(nullif(title, ''), 'Untitled idea'),
    coalesce(nullif(category, ''), 'Culture'),
    coalesce(city, ''),
    coalesce(duration_minutes, 60),
    coalesce(nullif(status, ''), 'Proposed'),
    coalesce(notes, ''),
    coalesce(cost, ''),
    coalesce(link, ''),
    coalesce(map_link, ''),
    coalesce(image_key, ''),
    coalesce(sort_order, 0),
    place_id,
    place_name,
    formatted_address,
    latitude,
    longitude,
    google_maps_uri,
    nullif(place_resolved_at, '')::timestamptz,
    coalesce(votes, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(payload -> 'ideas', '[]'::jsonb))
    as row(
      client_id text,
      title text,
      category text,
      city text,
      duration_minutes integer,
      status text,
      notes text,
      cost text,
      link text,
      map_link text,
      image_key text,
      sort_order integer,
      place_id text,
      place_name text,
      formatted_address text,
      latitude double precision,
      longitude double precision,
      google_maps_uri text,
      place_resolved_at text,
      votes jsonb
    );

  if exists (
    select 1
    from payload_schedule_items
    where category not in ('Food', 'Coffee/Bar', 'Culture', 'Transit', 'Hotel', 'Shopping', 'Open Time')
  ) or exists (
    select 1
    from payload_ideas
    where category not in ('Food', 'Coffee/Bar', 'Culture', 'Transit', 'Hotel', 'Shopping', 'Open Time')
  ) then
    raise exception 'Trip contains an invalid category. Nothing was saved.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from payload_schedule_items
    where status not in ('Proposed', 'Maybe', 'Booked', 'Skipped') or duration_minutes <= 0
  ) or exists (
    select 1
    from payload_ideas
    where status not in ('Proposed', 'Maybe', 'Booked', 'Skipped') or duration_minutes <= 0
  ) then
    raise exception 'Trip contains an invalid status or duration. Nothing was saved.' using errcode = '23514';
  end if;

  if (
    (select count(*) from payload_days) + 1
    < (select count(*) from public.trip_days where trip_id = target_trip_id)
  ) then
    raise exception 'Trip save looked stale and would remove too many days. Reload and try again.' using errcode = '40001';
  end if;

  if (
    (select count(*) from payload_ideas) + 1
    < (select count(*) from public.ideas where trip_id = target_trip_id)
  ) then
    raise exception 'Trip save looked stale and would remove too many ideas. Reload and try again.' using errcode = '40001';
  end if;

  drop table if exists pg_temp.saved_travelers;
  create temporary table saved_travelers (
    id bigint not null,
    client_id text not null,
    name text not null,
    profile_id uuid
  ) on commit drop;

  drop table if exists pg_temp.saved_days;
  create temporary table saved_days (
    id bigint not null,
    client_id text not null
  ) on commit drop;

  drop table if exists pg_temp.saved_ideas;
  create temporary table saved_ideas (
    id bigint not null,
    client_id text not null,
    votes jsonb not null
  ) on commit drop;

  delete from public.idea_votes
  where idea_id in (
    select id
    from public.ideas
    where trip_id = target_trip_id
  );

  delete from public.schedule_items
  where trip_day_id in (
    select id
    from public.trip_days
    where trip_id = target_trip_id
  );

  delete from public.ideas
  where trip_id = target_trip_id;

  delete from public.trip_days
  where trip_id = target_trip_id;

  delete from public.trip_travelers traveler
  where traveler.trip_id = target_trip_id
    and traveler.profile_id is null
    and not exists (
      select 1
      from payload_travelers incoming
      where incoming.client_id = traveler.client_id
    );

  with upserted_travelers as (
    insert into public.trip_travelers (
      trip_id,
      client_id,
      name,
      profile_id,
      sort_order
    )
    select
      target_trip_id,
      incoming.client_id,
      incoming.name,
      existing.profile_id,
      incoming.sort_order
    from payload_travelers incoming
    left join public.trip_travelers existing
      on existing.trip_id = target_trip_id
     and existing.client_id = incoming.client_id
    on conflict (trip_id, client_id) do update
      set
        name = excluded.name,
        profile_id = coalesce(public.trip_travelers.profile_id, excluded.profile_id),
        sort_order = excluded.sort_order
    returning id, client_id, name, profile_id
  )
  insert into saved_travelers (id, client_id, name, profile_id)
  select id, client_id, name, profile_id
  from upserted_travelers;

  with inserted_days as (
    insert into public.trip_days (
      trip_id,
      client_id,
      trip_date,
      day_number,
      city,
      notes,
      base_map_link,
      base_place_id,
      base_place_name,
      base_formatted_address,
      base_latitude,
      base_longitude,
      base_google_maps_uri,
      base_place_resolved_at
    )
    select
      target_trip_id,
      client_id,
      trip_date,
      day_number,
      city,
      notes,
      base_map_link,
      base_place_id,
      base_place_name,
      base_formatted_address,
      base_latitude,
      base_longitude,
      base_google_maps_uri,
      base_place_resolved_at
    from payload_days
    returning id, client_id
  )
  insert into saved_days (id, client_id)
  select id, client_id
  from inserted_days;

  insert into public.schedule_items (
    trip_day_id,
    client_id,
    item_kind,
    title,
    category,
    city,
    start_time,
    duration_minutes,
    status,
    notes,
    cost,
    link,
    map_link,
    sort_order,
    place_id,
    place_name,
    formatted_address,
    latitude,
    longitude,
    google_maps_uri,
    place_resolved_at,
    stay_start_day_client_id,
    stay_end_day_client_id,
    check_in_time,
    check_out_time
  )
  select
    saved_days.id,
    item.client_id,
    item.item_kind,
    item.title,
    item.category,
    item.city,
    item.start_time,
    item.duration_minutes,
    item.status,
    item.notes,
    item.cost,
    item.link,
    item.map_link,
    item.sort_order,
    item.place_id,
    item.place_name,
    item.formatted_address,
    item.latitude,
    item.longitude,
    item.google_maps_uri,
    item.place_resolved_at,
    item.stay_start_day_client_id,
    item.stay_end_day_client_id,
    item.check_in_time,
    item.check_out_time
  from payload_schedule_items item
  join saved_days on saved_days.client_id = item.day_client_id;

  with inserted_ideas as (
    insert into public.ideas (
      trip_id,
      client_id,
      title,
      category,
      city,
      duration_minutes,
      status,
      notes,
      cost,
      link,
      map_link,
      image_key,
      sort_order,
      place_id,
      place_name,
      formatted_address,
      latitude,
      longitude,
      google_maps_uri,
      place_resolved_at
    )
    select
      target_trip_id,
      client_id,
      title,
      category,
      city,
      duration_minutes,
      status,
      notes,
      cost,
      link,
      map_link,
      image_key,
      sort_order,
      place_id,
      place_name,
      formatted_address,
      latitude,
      longitude,
      google_maps_uri,
      place_resolved_at
    from payload_ideas
    returning id, client_id, '{}'::jsonb as votes
  )
  insert into saved_ideas (id, client_id, votes)
  select id, client_id, votes
  from inserted_ideas;

  update saved_ideas
  set votes = payload_ideas.votes
  from payload_ideas
  where payload_ideas.client_id = saved_ideas.client_id;

  insert into public.idea_votes (
    idea_id,
    traveler_id,
    profile_id,
    vote
  )
  select
    saved_ideas.id,
    saved_travelers.id,
    saved_travelers.profile_id,
    vote.value
  from saved_ideas
  cross join lateral jsonb_each_text(saved_ideas.votes) as vote(key, value)
  join saved_travelers on saved_travelers.name = vote.key
  where vote.value <> '';
end;
$$;

revoke all on function public.replace_trip_payload(bigint, jsonb) from public;
revoke all on function public.replace_trip_payload(bigint, jsonb) from anon;
grant execute on function public.replace_trip_payload(bigint, jsonb) to authenticated;
