drop policy if exists trip_invitations_select_owner_or_invitee on public.trip_invitations;

create policy trip_invitations_select_owner_or_invitee on public.trip_invitations
  for select to authenticated
  using (
    exists (
      select 1
      from public.trips trip
      where trip.id = trip_invitations.trip_id
        and trip.owner_id = (select auth.uid())
    )
    or email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );
