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
  linked_traveler_id bigint;
  fallback_name text;
  next_sort_order integer;
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

  if invite_row.email <> current_email then
    raise exception 'This invite is for a different email address.';
  end if;

  if invite_row.status <> 'pending' then
    if exists (
      select 1
      from public.trip_members member
      where member.trip_id = invite_row.trip_id
        and member.profile_id = current_profile_id
    ) then
      return query select invite_row.trip_id;
      return;
    end if;

    raise exception 'Invite is no longer pending.';
  end if;

  if invite_row.expires_at <= now() then
    update public.trip_invitations
    set status = 'expired'
    where id = invite_row.id;
    raise exception 'Invite has expired.';
  end if;

  if invite_row.traveler_id is not null and exists (
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

  if invite_row.traveler_id is null then
    fallback_name := nullif(trim(split_part(invite_row.email, '@', 1)), '');
    if fallback_name is null then
      fallback_name := 'Traveler';
    end if;

    select coalesce(max(sort_order), -1) + 1
    into next_sort_order
    from public.trip_travelers
    where trip_travelers.trip_id = invite_row.trip_id;

    insert into public.trip_travelers (trip_id, client_id, name, profile_id, sort_order)
    values (
      invite_row.trip_id,
      'invite-' || invite_row.id::text,
      fallback_name,
      current_profile_id,
      next_sort_order
    )
    returning id into linked_traveler_id;
  else
    linked_traveler_id := invite_row.traveler_id;

    update public.trip_travelers
    set profile_id = current_profile_id
    where id = linked_traveler_id
      and trip_id = invite_row.trip_id
      and (profile_id is null or profile_id = current_profile_id);
  end if;

  update public.idea_votes
  set profile_id = current_profile_id
  where traveler_id = linked_traveler_id
    and profile_id is null;

  update public.trip_invitations
  set traveler_id = linked_traveler_id,
      status = 'accepted',
      accepted_by = current_profile_id,
      accepted_at = now()
  where id = invite_row.id;

  update public.trip_invitations
  set status = 'revoked'
  where trip_id = invite_row.trip_id
    and email = invite_row.email
    and status = 'pending'
    and id <> invite_row.id;

  return query select invite_row.trip_id;
end;
$$;
