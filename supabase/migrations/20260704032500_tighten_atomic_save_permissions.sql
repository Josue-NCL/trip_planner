revoke all on function public.replace_trip_payload(bigint, jsonb) from anon;
grant execute on function public.replace_trip_payload(bigint, jsonb) to authenticated;

drop policy if exists trip_travelers_delete_atomic_replace on public.trip_travelers;
drop policy if exists trip_days_delete_atomic_replace on public.trip_days;
drop policy if exists schedule_items_delete_atomic_replace on public.schedule_items;
drop policy if exists ideas_delete_atomic_replace on public.ideas;
drop policy if exists idea_votes_delete_atomic_replace on public.idea_votes;

create policy trip_travelers_delete_atomic_replace on public.trip_travelers
  for delete to authenticated
  using (
    (select current_setting('app.allow_trip_replace', true)) = 'true'
    and private.can_edit_trip(trip_id)
  );

create policy trip_days_delete_atomic_replace on public.trip_days
  for delete to authenticated
  using (
    (select current_setting('app.allow_trip_replace', true)) = 'true'
    and private.can_edit_trip(trip_id)
  );

create policy schedule_items_delete_atomic_replace on public.schedule_items
  for delete to authenticated
  using (
    (select current_setting('app.allow_trip_replace', true)) = 'true'
    and private.can_edit_trip(private.trip_id_for_day(trip_day_id))
  );

create policy ideas_delete_atomic_replace on public.ideas
  for delete to authenticated
  using (
    (select current_setting('app.allow_trip_replace', true)) = 'true'
    and private.can_edit_trip(trip_id)
  );

create policy idea_votes_delete_atomic_replace on public.idea_votes
  for delete to authenticated
  using (
    (select current_setting('app.allow_trip_replace', true)) = 'true'
    and private.can_edit_trip(private.trip_id_for_idea(idea_id))
  );
