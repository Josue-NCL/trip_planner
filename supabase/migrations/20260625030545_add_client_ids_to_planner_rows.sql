alter table public.trip_travelers add column client_id text;
alter table public.trip_days add column client_id text;
alter table public.schedule_items add column client_id text;
alter table public.ideas add column client_id text;

update public.trip_travelers set client_id = id::text where client_id is null;
update public.trip_days set client_id = trip_date::text where client_id is null;
update public.schedule_items set client_id = id::text where client_id is null;
update public.ideas set client_id = id::text where client_id is null;

alter table public.trip_travelers alter column client_id set not null;
alter table public.trip_days alter column client_id set not null;
alter table public.schedule_items alter column client_id set not null;
alter table public.ideas alter column client_id set not null;

alter table public.trip_travelers add constraint trip_travelers_trip_id_client_id_key unique (trip_id, client_id);
alter table public.trip_days add constraint trip_days_trip_id_client_id_key unique (trip_id, client_id);
alter table public.ideas add constraint ideas_trip_id_client_id_key unique (trip_id, client_id);

create index schedule_items_trip_day_id_client_id_idx on public.schedule_items(trip_day_id, client_id);
