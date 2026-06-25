# Supabase Transition Plan

## Current State

- Supabase MCP is reachable.
- `public` schema currently reports no tables.
- The app currently persists one complete trip document in `localStorage`.
- JSON export/import should remain available during the transition as a backup and migration path.

## Target Outcome

Move from private, browser-only planning to shared, authenticated trip data in Supabase while preserving the current UI behavior.

## Environment Variables

Browser-safe values:

```sh
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Never expose service-role keys or database passwords in Vite client code.

## Proposed Tables

Use lowercase `snake_case`, `bigint generated always as identity` primary keys, `timestamptz` audit fields, and indexed foreign keys.

```sql
profiles
- id uuid primary key references auth.users(id)
- display_name text
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
- role text check in ('owner', 'editor', 'viewer')
- created_at timestamptz

trip_days
- id bigint primary key
- trip_id bigint references trips(id)
- trip_date date
- day_number integer
- city text
- notes text
- created_at timestamptz
- updated_at timestamptz

schedule_items
- id bigint primary key
- trip_day_id bigint references trip_days(id)
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
- created_at timestamptz
- updated_at timestamptz

idea_votes
- idea_id bigint references ideas(id)
- profile_id uuid references profiles(id)
- vote text check in ('maybe', 'like', 'love')
- created_at timestamptz
- updated_at timestamptz
```

Composite uniqueness candidates:

- `trip_members(trip_id, profile_id)`
- `trip_days(trip_id, trip_date)`
- `idea_votes(idea_id, profile_id)`

Indexes to include early:

- `trips(owner_id)`
- `trip_members(profile_id)`
- `trip_members(trip_id)`
- `trip_days(trip_id, trip_date)`
- `schedule_items(trip_day_id, start_time)`
- `ideas(trip_id, status)`
- `idea_votes(profile_id)`

## RLS Direction

Enable RLS on every app table before storing real data.

Policy shape:

- Trip owners can manage their trips.
- Trip members can read trips they belong to.
- Editors can insert/update trip days, schedule items, ideas, and votes.
- Viewers can read but not mutate trip planning data.
- Profiles can read member profiles for trips they belong to.

Performance notes:

- Index every FK and every column used in membership policies.
- Use `(select auth.uid())` inside policies instead of calling `auth.uid()` bare.
- Prefer helper functions only when policies become too complex to read.

## Migration Phases

1. Add Supabase client dependency and env documentation.
2. Create a `src/lib/supabaseClient.js` module for client setup.
3. Create a `src/lib/tripRepository.js` adapter that can return the existing trip object shape.
4. Add migrations for profiles, trips, members, days, schedule items, ideas, and votes.
5. Enable RLS and add membership policies.
6. Add a one-time importer from the current `localStorage` trip shape into Supabase.
7. Switch app load/save behavior from `localStorage` to Supabase for authenticated users.
8. Keep `localStorage` as an offline or fallback draft only if needed.

## Open Questions

- Should the app require authentication immediately, or support local guest mode first?
- Should traveler names remain free-text labels, or map to authenticated profiles?
- Should one user own exactly one Japan 2026 trip, or should the app support multiple trips?
- Do schedule items need conflict prevention in the database, or is UI validation enough for now?
- Should realtime collaboration be enabled after basic CRUD works?
