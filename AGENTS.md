# Agent Guide

This file is the handoff map for future coding agents working on the Japan 2026 Travel Scheduler.

## Project Snapshot

- App type: Vite + React single-page travel planner.
- Package manager: pnpm.
- Main UI file: `src/App.jsx`.
- Styling: `src/styles.css`.
- Seed data and static options: `src/data/tripData.js`.
- Current persistence: Supabase via `src/lib/tripRepository.js`.
- Legacy local planner import: `src/lib/storage.js` using `localStorage`.
- Current export path: `src/lib/export.js` downloading `japan-2026-trip.json`.

## Current Backend State

Supabase is the application backend. The connected project has normalized planner tables, RLS enabled, private RLS helper functions, and realtime publication entries for planner tables.

Always confirm schema state with `mcp__supabase.list_tables` before making further schema changes.

## Local Commands

```sh
pnpm dev
pnpm build
pnpm preview
```

Run `pnpm build` after meaningful code changes unless the user asks for docs-only work.

## Supabase Working Rules

- Before schema work, call `mcp__supabase.list_tables` for the relevant schemas.
- Use `mcp__supabase.apply_migration` for DDL. Use `execute_sql` for reads and small non-DDL verification only.
- After schema changes, run Supabase advisors for security and performance.
- Never commit service-role keys, database passwords, or personal tokens.
- Browser code should only use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Enable RLS before storing real user/trip data in persistent tables.
- Prefer lowercase `snake_case` identifiers in SQL.
- Use `timestamptz` for timestamps.
- Index foreign keys and columns used in RLS policies.
- Wrap `auth.uid()` in RLS policies as `(select auth.uid())`.

## Data-Model Guardrails

The current UI expects a single trip object with this broad shape:

```js
{
  version,
  name,
  dateRangeLabel,
  travelers,
  days: [{ id, date, dayNumber, city, notes, schedule }],
  ideas: [{ id, title, category, city, duration, status, notes, cost, link, votes }],
  updatedAt
}
```

Keep compatibility with that shape. `src/lib/tripMappers.js` translates between React state and normalized rows.

## Collaboration Notes

- The worktree may contain user edits. Check `git status --short` before editing and do not revert unrelated changes.
- Keep docs and code changes scoped. This app is small, so direct, readable modules are preferred over broad abstraction.
- Keep Supabase client code behind modules under `src/lib/` before touching UI flows.
