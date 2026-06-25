create or replace function public.claim_trip_traveler(target_traveler_id bigint)
returns table (traveler_id bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile_id uuid := auth.uid();
  traveler_row public.trip_travelers%rowtype;
begin
  if current_profile_id is null then
    raise exception 'Sign in before claiming a traveler.';
  end if;

  select *
  into traveler_row
  from public.trip_travelers traveler
  where traveler.id = target_traveler_id
  for update;

  if not found then
    raise exception 'Traveler was not found.';
  end if;

  if not private.can_edit_trip(traveler_row.trip_id) then
    raise exception 'You do not have permission to claim this traveler.';
  end if;

  if traveler_row.profile_id is not null and traveler_row.profile_id <> current_profile_id then
    raise exception 'This traveler is already linked to another user.';
  end if;

  update public.trip_travelers
  set profile_id = current_profile_id
  where id = target_traveler_id;

  update public.idea_votes
  set profile_id = current_profile_id
  where traveler_id = target_traveler_id
    and profile_id is null;

  return query select target_traveler_id;
end;
$$;

grant execute on function public.claim_trip_traveler(bigint) to authenticated;
