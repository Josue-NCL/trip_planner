create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create or replace function private.handle_new_user()
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
  for each row execute function private.handle_new_user();

create or replace function private.is_trip_member(target_trip_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = target_trip_id
      and tm.profile_id = (select auth.uid())
  );
$$;

create or replace function private.can_edit_trip(target_trip_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = target_trip_id
      and tm.profile_id = (select auth.uid())
      and tm.role in ('owner', 'editor')
  );
$$;

create or replace function private.is_trip_owner(target_trip_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = target_trip_id
      and tm.profile_id = (select auth.uid())
      and tm.role = 'owner'
  ) or exists (
    select 1
    from public.trips t
    where t.id = target_trip_id
      and t.owner_id = (select auth.uid())
  );
$$;

create or replace function private.trip_id_for_day(target_trip_day_id bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select td.trip_id from public.trip_days td where td.id = target_trip_day_id;
$$;

create or replace function private.trip_id_for_idea(target_idea_id bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select i.trip_id from public.ideas i where i.id = target_idea_id;
$$;

create or replace function private.trip_id_for_traveler(target_traveler_id bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select tt.trip_id from public.trip_travelers tt where tt.id = target_traveler_id;
$$;

drop policy profiles_select_trip_members on public.profiles;
drop policy trips_select_member on public.trips;
drop policy trips_update_editor on public.trips;
drop policy trips_delete_owner on public.trips;
drop policy trip_members_select_member on public.trip_members;
drop policy trip_members_insert_owner on public.trip_members;
drop policy trip_members_update_owner on public.trip_members;
drop policy trip_members_delete_owner on public.trip_members;
drop policy trip_travelers_select_member on public.trip_travelers;
drop policy trip_travelers_insert_editor on public.trip_travelers;
drop policy trip_travelers_update_editor on public.trip_travelers;
drop policy trip_travelers_delete_editor on public.trip_travelers;
drop policy trip_days_select_member on public.trip_days;
drop policy trip_days_insert_editor on public.trip_days;
drop policy trip_days_update_editor on public.trip_days;
drop policy trip_days_delete_editor on public.trip_days;
drop policy schedule_items_select_member on public.schedule_items;
drop policy schedule_items_insert_editor on public.schedule_items;
drop policy schedule_items_update_editor on public.schedule_items;
drop policy schedule_items_delete_editor on public.schedule_items;
drop policy ideas_select_member on public.ideas;
drop policy ideas_insert_editor on public.ideas;
drop policy ideas_update_editor on public.ideas;
drop policy ideas_delete_editor on public.ideas;
drop policy idea_votes_select_member on public.idea_votes;
drop policy idea_votes_insert_editor on public.idea_votes;
drop policy idea_votes_update_editor on public.idea_votes;
drop policy idea_votes_delete_editor on public.idea_votes;

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

create policy trips_select_member on public.trips
  for select to authenticated
  using (private.is_trip_member(id) or owner_id = (select auth.uid()));

create policy trips_update_editor on public.trips
  for update to authenticated
  using (private.can_edit_trip(id) or owner_id = (select auth.uid()))
  with check (private.can_edit_trip(id) or owner_id = (select auth.uid()));

create policy trips_delete_owner on public.trips
  for delete to authenticated
  using (private.is_trip_owner(id) or owner_id = (select auth.uid()));

create policy trip_members_select_member on public.trip_members
  for select to authenticated
  using (private.is_trip_member(trip_id) or profile_id = (select auth.uid()));

create policy trip_members_insert_owner on public.trip_members
  for insert to authenticated
  with check (private.is_trip_owner(trip_id));

create policy trip_members_update_owner on public.trip_members
  for update to authenticated
  using (private.is_trip_owner(trip_id))
  with check (private.is_trip_owner(trip_id));

create policy trip_members_delete_owner on public.trip_members
  for delete to authenticated
  using (private.is_trip_owner(trip_id));

create policy trip_travelers_select_member on public.trip_travelers
  for select to authenticated
  using (private.is_trip_member(trip_id));

create policy trip_travelers_insert_editor on public.trip_travelers
  for insert to authenticated
  with check (private.can_edit_trip(trip_id));

create policy trip_travelers_update_editor on public.trip_travelers
  for update to authenticated
  using (private.can_edit_trip(trip_id))
  with check (private.can_edit_trip(trip_id));

create policy trip_travelers_delete_editor on public.trip_travelers
  for delete to authenticated
  using (private.can_edit_trip(trip_id));

create policy trip_days_select_member on public.trip_days
  for select to authenticated
  using (private.is_trip_member(trip_id));

create policy trip_days_insert_editor on public.trip_days
  for insert to authenticated
  with check (private.can_edit_trip(trip_id));

create policy trip_days_update_editor on public.trip_days
  for update to authenticated
  using (private.can_edit_trip(trip_id))
  with check (private.can_edit_trip(trip_id));

create policy trip_days_delete_editor on public.trip_days
  for delete to authenticated
  using (private.can_edit_trip(trip_id));

create policy schedule_items_select_member on public.schedule_items
  for select to authenticated
  using (private.is_trip_member(private.trip_id_for_day(trip_day_id)));

create policy schedule_items_insert_editor on public.schedule_items
  for insert to authenticated
  with check (private.can_edit_trip(private.trip_id_for_day(trip_day_id)));

create policy schedule_items_update_editor on public.schedule_items
  for update to authenticated
  using (private.can_edit_trip(private.trip_id_for_day(trip_day_id)))
  with check (private.can_edit_trip(private.trip_id_for_day(trip_day_id)));

create policy schedule_items_delete_editor on public.schedule_items
  for delete to authenticated
  using (private.can_edit_trip(private.trip_id_for_day(trip_day_id)));

create policy ideas_select_member on public.ideas
  for select to authenticated
  using (private.is_trip_member(trip_id));

create policy ideas_insert_editor on public.ideas
  for insert to authenticated
  with check (private.can_edit_trip(trip_id));

create policy ideas_update_editor on public.ideas
  for update to authenticated
  using (private.can_edit_trip(trip_id))
  with check (private.can_edit_trip(trip_id));

create policy ideas_delete_editor on public.ideas
  for delete to authenticated
  using (private.can_edit_trip(trip_id));

create policy idea_votes_select_member on public.idea_votes
  for select to authenticated
  using (private.is_trip_member(private.trip_id_for_idea(idea_id)));

create policy idea_votes_insert_editor on public.idea_votes
  for insert to authenticated
  with check (
    private.can_edit_trip(private.trip_id_for_idea(idea_id))
    and private.trip_id_for_idea(idea_id) = private.trip_id_for_traveler(traveler_id)
  );

create policy idea_votes_update_editor on public.idea_votes
  for update to authenticated
  using (private.can_edit_trip(private.trip_id_for_idea(idea_id)))
  with check (
    private.can_edit_trip(private.trip_id_for_idea(idea_id))
    and private.trip_id_for_idea(idea_id) = private.trip_id_for_traveler(traveler_id)
  );

create policy idea_votes_delete_editor on public.idea_votes
  for delete to authenticated
  using (private.can_edit_trip(private.trip_id_for_idea(idea_id)));

drop function public.handle_new_user();
drop function public.is_trip_member(bigint);
drop function public.can_edit_trip(bigint);
drop function public.is_trip_owner(bigint);
drop function public.trip_id_for_day(bigint);
drop function public.trip_id_for_idea(bigint);
drop function public.trip_id_for_traveler(bigint);
