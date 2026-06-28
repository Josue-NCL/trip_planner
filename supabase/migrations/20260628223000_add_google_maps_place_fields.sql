alter table public.ideas
  add column place_id text,
  add column place_name text,
  add column formatted_address text,
  add column latitude double precision,
  add column longitude double precision,
  add column google_maps_uri text,
  add column place_resolved_at timestamptz;

alter table public.schedule_items
  add column place_id text,
  add column place_name text,
  add column formatted_address text,
  add column latitude double precision,
  add column longitude double precision,
  add column google_maps_uri text,
  add column place_resolved_at timestamptz;

alter table public.trip_days
  add column base_map_link text not null default '',
  add column base_place_id text,
  add column base_place_name text,
  add column base_formatted_address text,
  add column base_latitude double precision,
  add column base_longitude double precision,
  add column base_google_maps_uri text,
  add column base_place_resolved_at timestamptz;

create index ideas_trip_id_place_id_idx on public.ideas(trip_id, place_id) where place_id is not null;
create index schedule_items_trip_day_id_place_id_idx on public.schedule_items(trip_day_id, place_id) where place_id is not null;
create index trip_days_trip_id_base_place_id_idx on public.trip_days(trip_id, base_place_id) where base_place_id is not null;
