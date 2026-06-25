# Tasks

## Supabase Setup

- [x] Confirm target Supabase project and environment.
- [x] Add `@supabase/supabase-js`.
- [x] Add `.env.example` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- [x] Create `src/lib/supabaseClient.js`.
- [x] Create initial SQL migration for app tables.
- [x] Enable RLS on app tables.
- [x] Add RLS policies for owner/member access.
- [x] Run Supabase security and performance advisors after migrations.

## Data Layer

- [x] Create `src/lib/tripRepository.js`.
- [x] Add a mapper from Supabase rows to the existing trip object shape.
- [x] Add a mapper from the existing trip object shape to Supabase inserts/updates.
- [x] Decide whether local guest mode remains supported.
- [x] Add loading, saving, error, and sync states to the app.

## Migration

- [x] Add an import path from current `localStorage` data to Supabase.
- [x] Preserve JSON export as a manual backup.
- [x] Add a visible confirmation before replacing remote trip data.
- [ ] Add rollback guidance for failed imports.

## Product Follow-Ups

- [x] Decide whether traveler votes map to authenticated users or named travelers.
- [x] Decide whether multiple trips are in scope.
- [x] Decide whether realtime collaboration is needed.
- [ ] Decide whether schedule conflict checks should be enforced in Postgres.
