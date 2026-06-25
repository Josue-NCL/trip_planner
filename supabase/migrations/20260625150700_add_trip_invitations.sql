create extension if not exists pgcrypto with schema extensions;

create table public.trip_invitations (
  id bigint generated always as identity primary key,
  trip_id bigint not null references public.trips(id) on delete cascade,
  email text not null,
  role text not null default 'editor',
  traveler_id bigint not null references public.trip_travelers(id) on delete cascade,
  token_hash text not null,
  status text not null default 'pending',
  invited_by uuid not null references public.profiles(id) on delete cascade,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_invitations_role_check check (role in ('editor')),
  constraint trip_invitations_status_check check (status in ('pending', 'accepted', 'revoked', 'expired')),
  constraint trip_invitations_email_normalized_check check (email = lower(email)),
  constraint trip_invitations_token_hash_key unique (token_hash)
);

create index trip_invitations_trip_id_idx on public.trip_invitations(trip_id);
create index trip_invitations_email_status_idx on public.trip_invitations(email, status);
create index trip_invitations_traveler_id_idx on public.trip_invitations(traveler_id);
create index trip_invitations_invited_by_idx on public.trip_invitations(invited_by);
create index trip_invitations_accepted_by_idx on public.trip_invitations(accepted_by);

create trigger trip_invitations_set_updated_at
  before update on public.trip_invitations
  for each row execute function public.set_updated_at();

alter table public.trip_invitations enable row level security;

create policy trip_invitations_select_owner_or_invitee on public.trip_invitations
  for select to authenticated
  using (
    private.is_trip_owner(trip_id)
    or email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy trip_invitations_insert_owner on public.trip_invitations
  for insert to authenticated
  with check (
    private.is_trip_owner(trip_id)
    and invited_by = (select auth.uid())
    and role = 'editor'
    and status = 'pending'
    and exists (
      select 1
      from public.trip_travelers traveler
      where traveler.id = traveler_id
        and traveler.trip_id = trip_invitations.trip_id
    )
  );

create policy trip_invitations_update_owner on public.trip_invitations
  for update to authenticated
  using (private.is_trip_owner(trip_id))
  with check (
    private.is_trip_owner(trip_id)
    and exists (
      select 1
      from public.trip_travelers traveler
      where traveler.id = traveler_id
        and traveler.trip_id = trip_invitations.trip_id
    )
  );

create policy trip_invitations_delete_owner on public.trip_invitations
  for delete to authenticated
  using (private.is_trip_owner(trip_id));

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
    set role = excluded.role,
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

grant execute on function public.accept_trip_invite(text) to authenticated;

alter publication supabase_realtime add table public.trip_invitations;
