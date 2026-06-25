revoke execute on function public.accept_trip_invite(text) from anon;
revoke execute on function public.claim_trip_traveler(bigint) from anon;

grant execute on function public.accept_trip_invite(text) to authenticated;
grant execute on function public.claim_trip_traveler(bigint) to authenticated;

drop policy if exists trip_invitations_select_owner_or_invitee on public.trip_invitations;

create policy trip_invitations_select_owner_or_invitee on public.trip_invitations
  for select to authenticated
  using (
    private.is_trip_owner(trip_id)
    or email = (select lower(coalesce(auth.jwt() ->> 'email', '')))
  );
