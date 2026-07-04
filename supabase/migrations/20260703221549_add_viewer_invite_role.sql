alter table public.trip_members
  drop constraint if exists trip_members_role_check;

alter table public.trip_members
  add constraint trip_members_role_check
  check (role in ('owner', 'editor', 'viewer'));

alter table public.trip_invitations
  drop constraint if exists trip_invitations_role_check;

alter table public.trip_invitations
  add constraint trip_invitations_role_check
  check (role in ('editor', 'viewer'));

drop policy if exists trip_invitations_insert_owner on public.trip_invitations;

create policy trip_invitations_insert_owner on public.trip_invitations
  for insert to authenticated
  with check (
    private.is_trip_owner(trip_id)
    and invited_by = (select auth.uid())
    and role in ('editor', 'viewer')
    and status = 'pending'
    and exists (
      select 1
      from public.trip_travelers traveler
      where traveler.id = traveler_id
        and traveler.trip_id = trip_invitations.trip_id
    )
  );

drop policy if exists trip_invitations_update_owner on public.trip_invitations;

create policy trip_invitations_update_owner on public.trip_invitations
  for update to authenticated
  using (private.is_trip_owner(trip_id))
  with check (
    private.is_trip_owner(trip_id)
    and role in ('editor', 'viewer')
    and exists (
      select 1
      from public.trip_travelers traveler
      where traveler.id = traveler_id
        and traveler.trip_id = trip_invitations.trip_id
    )
  );

create or replace function public.accept_trip_invite(invite_token text)
returns table (trip_id bigint)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_profile_id uuid := auth.uid();
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  invite_hash text;
  invite_row public.trip_invitations%rowtype;
begin
  if current_profile_id is null then
    raise exception 'Sign in before accepting this invite.';
  end if;

  if current_email = '' then
    raise exception 'Signed-in user does not have an email address.';
  end if;

  if invite_token is null or length(trim(invite_token)) < 24 then
    raise exception 'Invalid invite link.';
  end if;

  invite_hash := encode(extensions.digest(trim(invite_token), 'sha256'), 'hex');

  select *
  into invite_row
  from public.trip_invitations invitation
  where invitation.token_hash = invite_hash
  for update;

  if not found then
    raise exception 'Invite was not found.';
  end if;

  if invite_row.status <> 'pending' then
    raise exception 'Invite is no longer pending.';
  end if;

  if invite_row.expires_at <= now() then
    update public.trip_invitations
    set status = 'expired'
    where id = invite_row.id;
    raise exception 'Invite has expired.';
  end if;

  if invite_row.email <> current_email then
    raise exception 'This invite is for a different email address.';
  end if;

  if exists (
    select 1
    from public.trip_travelers traveler
    where traveler.id = invite_row.traveler_id
      and traveler.profile_id is not null
      and traveler.profile_id <> current_profile_id
  ) then
    raise exception 'This traveler is already linked to another user.';
  end if;

  insert into public.trip_members (trip_id, profile_id, role)
  values (invite_row.trip_id, current_profile_id, invite_row.role)
  on conflict (trip_id, profile_id) do update
    set role = case
          when trip_members.role = 'owner' then 'owner'
          when trip_members.role = 'editor' then 'editor'
          when excluded.role = 'editor' then 'editor'
          else 'viewer'
        end,
        updated_at = now();

  update public.trip_travelers
  set profile_id = current_profile_id
  where id = invite_row.traveler_id
    and trip_id = invite_row.trip_id
    and (profile_id is null or profile_id = current_profile_id);

  update public.idea_votes
  set profile_id = current_profile_id
  where traveler_id = invite_row.traveler_id
    and profile_id is null;

  update public.trip_invitations
  set status = 'accepted',
      accepted_by = current_profile_id,
      accepted_at = now()
  where id = invite_row.id;

  return query select invite_row.trip_id;
end;
$$;
