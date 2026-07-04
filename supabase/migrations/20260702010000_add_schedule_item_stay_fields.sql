alter table public.schedule_items
  add column if not exists item_kind text not null default 'activity',
  add column if not exists stay_start_day_client_id text not null default '',
  add column if not exists stay_end_day_client_id text not null default '',
  add column if not exists check_in_time time,
  add column if not exists check_out_time time;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'schedule_items_item_kind_check'
      and conrelid = 'public.schedule_items'::regclass
  ) then
    alter table public.schedule_items
      add constraint schedule_items_item_kind_check
      check (item_kind in ('activity', 'stay'));
  end if;
end $$;

create index if not exists schedule_items_trip_day_id_item_kind_idx
  on public.schedule_items (trip_day_id, item_kind);
