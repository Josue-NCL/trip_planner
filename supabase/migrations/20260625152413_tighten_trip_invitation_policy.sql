revoke execute on function public.accept_trip_invite(text) from public;
revoke execute on function public.claim_trip_traveler(bigint) from public;

grant execute on function public.accept_trip_invite(text) to authenticated;
grant execute on function public.claim_trip_traveler(bigint) to authenticated;

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
    or email = (select lower(coalesce(auth.jwt() ->> 'email', '')))
  );
