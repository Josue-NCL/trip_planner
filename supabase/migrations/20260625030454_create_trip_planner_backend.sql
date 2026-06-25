create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trips (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  date_range_label text not null default '',
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trip_members (
  trip_id bigint not null references public.trips(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (trip_id, profile_id),
  constraint trip_members_role_check check (role in ('owner', 'editor'))
);

create table public.trip_travelers (
  id bigint generated always as identity primary key,
  trip_id bigint not null references public.trips(id) on delete cascade,
  name text not null,
  profile_id uuid references public.profiles(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_travelers_trip_id_name_key unique (trip_id, name)
);

create table public.trip_days (
  id bigint generated always as identity primary key,
  trip_id bigint not null references public.trips(id) on delete cascade,
  trip_date date not null,
  day_number integer not null,
  city text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_days_trip_id_trip_date_key unique (trip_id, trip_date),
  constraint trip_days_day_number_check check (day_number > 0)
);

create table public.schedule_items (
  id bigint generated always as identity primary key,
  trip_day_id bigint not null references public.trip_days(id) on delete cascade,
  title text not null,
  category text not null,
  city text not null default '',
  start_time time not null,
  duration_minutes integer not null,
  status text not null,
  notes text not null default '',
  cost text not null default '',
  link text not null default '',
  map_link text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_items_category_check check (category in ('Food', 'Culture', 'Transit', 'Hotel', 'Shopping', 'Open Time')),
  constraint schedule_items_status_check check (status in ('Proposed', 'Maybe', 'Booked', 'Skipped')),
  constraint schedule_items_duration_check check (duration_minutes > 0)
);

create table public.ideas (
  id bigint generated always as identity primary key,
  trip_id bigint not null references public.trips(id) on delete cascade,
  title text not null,
  category text not null,
  city text not null default '',
  duration_minutes integer not null,
  status text not null,
  notes text not null default '',
  cost text not null default '',
  link text not null default '',
  map_link text not null default '',
  image_key text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ideas_category_check check (category in ('Food', 'Culture', 'Transit', 'Hotel', 'Shopping', 'Open Time')),
  constraint ideas_status_check check (status in ('Proposed', 'Maybe', 'Booked', 'Skipped')),
  constraint ideas_duration_check check (duration_minutes > 0)
);

create table public.idea_votes (
  idea_id bigint not null references public.ideas(id) on delete cascade,
  traveler_id bigint not null references public.trip_travelers(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  vote text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (idea_id, traveler_id),
  constraint idea_votes_vote_check check (vote in ('maybe', 'like', 'love'))
);

create index trips_owner_id_idx on public.trips(owner_id);
create index trip_members_profile_id_idx on public.trip_members(profile_id);
create index trip_members_trip_id_idx on public.trip_members(trip_id);
create index trip_travelers_trip_id_idx on public.trip_travelers(trip_id);
create index trip_travelers_profile_id_idx on public.trip_travelers(profile_id);
create index trip_days_trip_id_trip_date_idx on public.trip_days(trip_id, trip_date);
create index schedule_items_trip_day_id_start_time_idx on public.schedule_items(trip_day_id, start_time);
create index ideas_trip_id_status_idx on public.ideas(trip_id, status);
create index idea_votes_traveler_id_idx on public.idea_votes(traveler_id);
create index idea_votes_profile_id_idx on public.idea_votes(profile_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger trips_set_updated_at before update on public.trips for each row execute function public.set_updated_at();
create trigger trip_members_set_updated_at before update on public.trip_members for each row execute function public.set_updated_at();
create trigger trip_travelers_set_updated_at before update on public.trip_travelers for each row execute function public.set_updated_at();
create trigger trip_days_set_updated_at before update on public.trip_days for each row execute function public.set_updated_at();
create trigger schedule_items_set_updated_at before update on public.schedule_items for each row execute function public.set_updated_at();
create trigger ideas_set_updated_at before update on public.ideas for each row execute function public.set_updated_at();
create trigger idea_votes_set_updated_at before update on public.idea_votes for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_trip_member(target_trip_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members tm
    where tm.trip_id = target_trip_id
      and tm.profile_id = (select auth.uid())
  );
$$;

create or replace function public.can_edit_trip(target_trip_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members tm
    where tm.trip_id = target_trip_id
      and tm.profile_id = (select auth.uid())
      and tm.role in ('owner', 'editor')
  );
$$;

create or replace function public.is_trip_owner(target_trip_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members tm
    where tm.trip_id = target_trip_id
      and tm.profile_id = (select auth.uid())
      and tm.role = 'owner'
  ) or exists (
    select 1 from public.trips t
    where t.id = target_trip_id
      and t.owner_id = (select auth.uid())
  );
$$;

create or replace function public.trip_id_for_day(target_trip_day_id bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select td.trip_id from public.trip_days td where td.id = target_trip_day_id;
$$;

create or replace function public.trip_id_for_idea(target_idea_id bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select i.trip_id from public.ideas i where i.id = target_idea_id;
$$;

create or replace function public.trip_id_for_traveler(target_traveler_id bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select tt.trip_id from public.trip_travelers tt where tt.id = target_traveler_id;
$$;

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_travelers enable row level security;
alter table public.trip_days enable row level security;
alter table public.schedule_items enable row level security;
alter table public.ideas enable row level security;
alter table public.idea_votes enable row level security;

create policy profiles_select_trip_members on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.trip_members mine
      join public.trip_members theirs on theirs.trip_id = mine.trip_id
      where mine.profile_id = (select auth.uid())
        and theirs.profile_id = profiles.id
    )
  );

create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy trips_select_member on public.trips
  for select to authenticated
  using (public.is_trip_member(id) or owner_id = (select auth.uid()));

create policy trips_insert_authenticated_owner on public.trips
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy trips_update_editor on public.trips
  for update to authenticated
  using (public.can_edit_trip(id) or owner_id = (select auth.uid()))
  with check (public.can_edit_trip(id) or owner_id = (select auth.uid()));

create policy trips_delete_owner on public.trips
  for delete to authenticated
  using (public.is_trip_owner(id) or owner_id = (select auth.uid()));

create policy trip_members_select_member on public.trip_members
  for select to authenticated
  using (public.is_trip_member(trip_id) or profile_id = (select auth.uid()));

create policy trip_members_insert_owner on public.trip_members
  for insert to authenticated
  with check (public.is_trip_owner(trip_id));

create policy trip_members_update_owner on public.trip_members
  for update to authenticated
  using (public.is_trip_owner(trip_id))
  with check (public.is_trip_owner(trip_id));

create policy trip_members_delete_owner on public.trip_members
  for delete to authenticated
  using (public.is_trip_owner(trip_id));

create policy trip_travelers_select_member on public.trip_travelers
  for select to authenticated
  using (public.is_trip_member(trip_id));

create policy trip_travelers_insert_editor on public.trip_travelers
  for insert to authenticated
  with check (public.can_edit_trip(trip_id));

create policy trip_travelers_update_editor on public.trip_travelers
  for update to authenticated
  using (public.can_edit_trip(trip_id))
  with check (public.can_edit_trip(trip_id));

create policy trip_travelers_delete_editor on public.trip_travelers
  for delete to authenticated
  using (public.can_edit_trip(trip_id));

create policy trip_days_select_member on public.trip_days
  for select to authenticated
  using (public.is_trip_member(trip_id));

create policy trip_days_insert_editor on public.trip_days
  for insert to authenticated
  with check (public.can_edit_trip(trip_id));

create policy trip_days_update_editor on public.trip_days
  for update to authenticated
  using (public.can_edit_trip(trip_id))
  with check (public.can_edit_trip(trip_id));

create policy trip_days_delete_editor on public.trip_days
  for delete to authenticated
  using (public.can_edit_trip(trip_id));

create policy schedule_items_select_member on public.schedule_items
  for select to authenticated
  using (public.is_trip_member(public.trip_id_for_day(trip_day_id)));

create policy schedule_items_insert_editor on public.schedule_items
  for insert to authenticated
  with check (public.can_edit_trip(public.trip_id_for_day(trip_day_id)));

create policy schedule_items_update_editor on public.schedule_items
  for update to authenticated
  using (public.can_edit_trip(public.trip_id_for_day(trip_day_id)))
  with check (public.can_edit_trip(public.trip_id_for_day(trip_day_id)));

create policy schedule_items_delete_editor on public.schedule_items
  for delete to authenticated
  using (public.can_edit_trip(public.trip_id_for_day(trip_day_id)));

create policy ideas_select_member on public.ideas
  for select to authenticated
  using (public.is_trip_member(trip_id));

create policy ideas_insert_editor on public.ideas
  for insert to authenticated
  with check (public.can_edit_trip(trip_id));

create policy ideas_update_editor on public.ideas
  for update to authenticated
  using (public.can_edit_trip(trip_id))
  with check (public.can_edit_trip(trip_id));

create policy ideas_delete_editor on public.ideas
  for delete to authenticated
  using (public.can_edit_trip(trip_id));

create policy idea_votes_select_member on public.idea_votes
  for select to authenticated
  using (public.is_trip_member(public.trip_id_for_idea(idea_id)));

create policy idea_votes_insert_editor on public.idea_votes
  for insert to authenticated
  with check (
    public.can_edit_trip(public.trip_id_for_idea(idea_id))
    and public.trip_id_for_idea(idea_id) = public.trip_id_for_traveler(traveler_id)
  );

create policy idea_votes_update_editor on public.idea_votes
  for update to authenticated
  using (public.can_edit_trip(public.trip_id_for_idea(idea_id)))
  with check (
    public.can_edit_trip(public.trip_id_for_idea(idea_id))
    and public.trip_id_for_idea(idea_id) = public.trip_id_for_traveler(traveler_id)
  );

create policy idea_votes_delete_editor on public.idea_votes
  for delete to authenticated
  using (public.can_edit_trip(public.trip_id_for_idea(idea_id)));

alter publication supabase_realtime add table public.trips;
alter publication supabase_realtime add table public.trip_members;
alter publication supabase_realtime add table public.trip_travelers;
alter publication supabase_realtime add table public.trip_days;
alter publication supabase_realtime add table public.schedule_items;
alter publication supabase_realtime add table public.ideas;
alter publication supabase_realtime add table public.idea_votes;
