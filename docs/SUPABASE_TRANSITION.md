# Supabase Transition Plan

## Current State

- Supabase MCP is reachable.
- The connected project has planner tables in `public`.
- The app uses Supabase Auth, normalized tables, invite-based sharing, and realtime refetching.
- `localStorage` is now only used as an import source for existing browser-only planner data.
- JSON export/import remains available as a backup and migration path.

## Implemented Outcome

The app has moved from private, browser-only planning to shared, authenticated trip data in Supabase while preserving the current UI behavior.

## Environment Variables

Browser-safe values:

```sh
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_PUBLIC_TRIP_URL=https://neoncartridgelabs.com/trip/
```

`VITE_PUBLIC_TRIP_URL` should match the production custom-domain path so Supabase magic links and generated invite links return to the `.com` deployment instead of a Netlify preview URL.

Never expose service-role keys or database passwords in Vite client code.

## Implemented Tables

Use lowercase `snake_case`, `bigint generated always as identity` primary keys, `timestamptz` audit fields, and indexed foreign keys.

```sql
profiles
- id uuid primary key references auth.users(id)
- display_name text
- email text
- created_at timestamptz
- updated_at timestamptz

trips
- id bigint primary key
- owner_id uuid references profiles(id)
- name text
- date_range_label text
- schema_version integer
- created_at timestamptz
- updated_at timestamptz

trip_members
- trip_id bigint references trips(id)
- profile_id uuid references profiles(id)
- role text check in ('owner', 'editor')
- created_at timestamptz
- updated_at timestamptz

trip_travelers
- id bigint primary key
- trip_id bigint references trips(id)
- client_id text
- name text
- profile_id uuid references profiles(id)
- sort_order integer
- created_at timestamptz
- updated_at timestamptz

trip_days
- id bigint primary key
- trip_id bigint references trips(id)
- client_id text
- trip_date date
- day_number integer
- city text
- notes text
- created_at timestamptz
- updated_at timestamptz

schedule_items
- id bigint primary key
- trip_day_id bigint references trip_days(id)
- client_id text
- title text
- category text
- city text
- start_time time
- duration_minutes integer
- status text
- notes text
- cost text
- link text
- map_link text
- sort_order integer
- created_at timestamptz
- updated_at timestamptz

ideas
- id bigint primary key
- trip_id bigint references trips(id)
- client_id text
- title text
- category text
- city text
- duration_minutes integer
- status text
- notes text
- cost text
- link text
- map_link text
- image_key text
- sort_order integer
- created_at timestamptz
- updated_at timestamptz

idea_votes
- idea_id bigint references ideas(id)
- traveler_id bigint references trip_travelers(id)
- profile_id uuid references profiles(id)
- vote text check in ('maybe', 'like', 'love')
- created_at timestamptz
- updated_at timestamptz

trip_invitations
- id bigint primary key
- trip_id bigint references trips(id)
- email text
- role text check in ('editor')
- traveler_id bigint references trip_travelers(id)
- token_hash text unique
- status text check in ('pending', 'accepted', 'revoked', 'expired')
- invited_by uuid references profiles(id)
- accepted_by uuid references profiles(id)
- accepted_at timestamptz
- expires_at timestamptz
- created_at timestamptz
- updated_at timestamptz
```

Composite uniqueness candidates:

- `trip_members(trip_id, profile_id)`
- `trip_days(trip_id, trip_date)`
- `trip_travelers(trip_id, client_id)`
- `trip_days(trip_id, client_id)`
- `ideas(trip_id, client_id)`
- `idea_votes(idea_id, traveler_id)`
- `trip_invitations(token_hash)`

Indexes to include early:

- `trips(owner_id)`
- `trip_members(profile_id)`
- `trip_members(trip_id)`
- `trip_travelers(trip_id)`
- `trip_travelers(profile_id)`
- `trip_days(trip_id, trip_date)`
- `schedule_items(trip_day_id, start_time)`
- `schedule_items(trip_day_id, client_id)`
- `ideas(trip_id, status)`
- `idea_votes(traveler_id)`
- `idea_votes(profile_id)`
- `trip_invitations(trip_id)`
- `trip_invitations(email, status)`
- `trip_invitations(traveler_id)`

## RLS Direction

Enable RLS on every app table before storing real data.

Policy shape:

- Trip owners can manage their trips.
- Trip members can read trips they belong to.
- Editors can insert/update trip days, schedule items, ideas, and votes.
- Trip owners can create and revoke pending trip invitations.
- Invite links are accepted through authenticated RPCs; anonymous execution is revoked.
- Named travelers can be linked to Supabase profiles, and linked votes carry `profile_id`.
- Profiles can read member profiles for trips they belong to.
- RLS helper functions live in a private schema so they are not exposed as public RPC endpoints.

Performance notes:

- Index every FK and every column used in membership policies.
- Use `(select auth.uid())` inside policies instead of calling `auth.uid()` bare.
- Prefer helper functions only when policies become too complex to read.

## Migration Phases

1. Supabase client dependency and env documentation are added.
2. `src/lib/supabaseClient.js` handles browser-safe client setup.
3. `src/lib/tripRepository.js` returns the existing trip object shape.
4. Migrations exist for profiles, trips, members, travelers, days, schedule items, ideas, and votes.
5. RLS and membership policies are enabled.
6. Existing `localStorage` data can be imported into Supabase manually.
7. Authenticated app load/save behavior uses Supabase.
8. Realtime events trigger debounced active-trip refetches.
9. Trip invitations let the owner invite another editor and link that user to a traveler.
10. Traveler claiming lets an existing trip member bind their profile to an unlinked named traveler.

## Open Questions

- Do schedule items need conflict prevention in the database, or is UI validation enough for now?
- Should rollback guidance be added for failed imports?
