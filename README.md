# Japan 2026 Travel Scheduler

A Vite + React travel-planning app for the Japan 2026 trip. The app is currently frontend-only and persists the full trip document in browser `localStorage`; the next major backend step is moving shared trip data into Supabase.

## Current App

- React 19 single-page app built with Vite.
- Trip schedule, daily timeline, ideas board, traveler votes, JSON export, and JSON import flows live in `src/App.jsx`.
- Seed data and static trip constants live in `src/data/tripData.js`.
- Browser persistence helpers live in `src/lib/storage.js`.
- JSON export helpers live in `src/lib/export.js`.
- Visual styling is centralized in `src/styles.css`.

## Commands

```sh
pnpm install
pnpm dev
pnpm build
pnpm preview
```

## Persistence Status

Current storage is local-only:

- Storage key: `japan-2026-trip:v1`
- Trip schema version: `TRIP_VERSION = 1`
- Source of truth at runtime: one trip object in React state
- Durable storage: `window.localStorage`

Planned storage is Supabase-backed:

- Keep the existing local trip shape stable until a migration adapter exists.
- Add Supabase behind a data-access layer instead of wiring it directly through UI components.
- Preserve JSON export/import as a backup and migration path.
- Enable Row Level Security before real trip data is written to persistent Supabase tables.

## Docs

- `AGENTS.md`: working notes and guardrails for coding agents.
- `docs/PROJECT_CONTEXT.md`: product shape, data model, and important files.
- `docs/SUPABASE_TRANSITION.md`: proposed backend plan and schema direction.
- `docs/DECISIONS.md`: project decisions worth preserving.
- `docs/TASKS.md`: next implementation checklist.
