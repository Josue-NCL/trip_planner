# Japan 2026 Travel Scheduler

A Vite + React travel-planning app for the Japan 2026 trip. The app now uses Supabase Auth, normalized Supabase tables, and realtime refetching for shared trip planning.

## Current App

- React 19 single-page app built with Vite.
- Trip schedule, daily timeline, ideas board, traveler votes, JSON export, and JSON import flows live in `src/App.jsx`.
- Seed data and static trip constants live in `src/data/tripData.js`.
- Supabase auth/client/repository helpers live in `src/lib/`.
- Browser persistence helpers remain in `src/lib/storage.js` for importing existing local planner data.
- JSON export helpers live in `src/lib/export.js`.
- Visual styling is centralized in `src/styles.css`.

## Commands

```sh
pnpm install
pnpm dev
pnpm build
pnpm preview
```

## Supabase Setup

Create a local `.env` from `.env.example`:

```sh
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

The Supabase schema is tracked in `supabase/migrations/` and has been applied to the connected project.

## Persistence Status

- Sign-in uses Supabase magic links.
- After sign-in, users choose from multiple trips or create/import one.
- Trip owners can invite another editor and link that account to a named traveler for voting.
- The React UI still uses the existing trip object shape.
- The repository layer maps that shape to normalized Supabase rows.
- Realtime database events trigger a debounced active-trip refetch.
- JSON export/import remains available as a backup and migration path.

## Docs

- `AGENTS.md`: working notes and guardrails for coding agents.
- `docs/PROJECT_CONTEXT.md`: product shape, data model, and important files.
- `docs/SUPABASE_TRANSITION.md`: implemented backend plan and schema direction.
- `docs/DECISIONS.md`: project decisions worth preserving.
- `docs/TASKS.md`: next implementation checklist.
