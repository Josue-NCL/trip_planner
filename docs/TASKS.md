# Tasks

## Supabase Setup

- [ ] Confirm target Supabase project and environment.
- [ ] Add `@supabase/supabase-js`.
- [ ] Add `.env.example` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- [ ] Create `src/lib/supabaseClient.js`.
- [ ] Create initial SQL migration for app tables.
- [ ] Enable RLS on app tables.
- [ ] Add RLS policies for owner/member access.
- [ ] Run Supabase security and performance advisors after migrations.

## Data Layer

- [ ] Create `src/lib/tripRepository.js`.
- [ ] Add a mapper from Supabase rows to the existing trip object shape.
- [ ] Add a mapper from the existing trip object shape to Supabase inserts/updates.
- [ ] Decide whether local guest mode remains supported.
- [ ] Add loading, saving, error, and sync states to the app.

## Migration

- [ ] Add an import path from current `localStorage` data to Supabase.
- [ ] Preserve JSON export as a manual backup.
- [ ] Add a visible confirmation before replacing remote trip data.
- [ ] Add rollback guidance for failed imports.

## Product Follow-Ups

- [ ] Decide whether traveler votes map to authenticated users or named travelers.
- [ ] Decide whether multiple trips are in scope.
- [ ] Decide whether realtime collaboration is needed.
- [ ] Decide whether schedule conflict checks should be enforced in Postgres.
