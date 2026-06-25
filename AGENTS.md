# Agent Guide

This file is the handoff map for future coding agents working on the Japan 2026 Travel Scheduler.

## Project Snapshot

- App type: Vite + React single-page travel planner.
- Package manager: pnpm.
- Main UI file: `src/App.jsx`.
- Styling: `src/styles.css`.
- Seed data and static options: `src/data/tripData.js`.
- Current persistence: `src/lib/storage.js` using `localStorage`.
- Current export path: `src/lib/export.js` downloading `japan-2026-trip.json`.

## Current Backend State

There is no application backend yet. Supabase MCP connectivity has been verified for read and transaction-scoped write checks, and the connected `public` schema currently has no tables.

Do not assume Supabase application tables exist until `mcp__supabase.list_tables` confirms them.

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

Keep compatibility with that shape until the UI has a dedicated Supabase adapter and import/export migration path.

## Collaboration Notes

- The worktree may contain user edits. Check `git status --short` before editing and do not revert unrelated changes.
- Keep docs and code changes scoped. This app is small, so direct, readable modules are preferred over broad abstraction.
- If adding Supabase client code, place it behind a small data module under `src/lib/` before touching UI flows.
