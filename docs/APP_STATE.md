# Japan Travel Planner — Current App State

Last reviewed: July 11, 2026
Source checkout: `Josue-NCL/trip_planner`, branch `main`

This is the canonical handoff for the latest state of the web app. It describes the current local checkout, including work that has not yet been committed or confirmed deployed. For feature brainstorming, also see `CHATGPT_FEATURE_PLANNING_BRIEF.md`.

## Executive Summary

The project is a responsive Vite + React 19 single-page travel planner backed by Supabase. It began as the Japan 2026 scheduler, but trip creation, navigation assets, map profiles, and traveler setup now support trips outside Japan as well.

The current website has four primary sections:

- **Trip:** whole-trip calendar/list views plus a focused day timeline.
- **Ideas:** searchable and sortable activity ideas with categories, statuses, reactions, and promotion into the schedule.
- **Map:** an interactive Google map of scheduled places and ideas, missing-location cleanup, filters, place previews, and multi-stop route previews.
- **Expenses:** trip-budget estimates, tracked split expenses, balances, and settlement suggestions.

Supabase remains the source of truth for authentication, normalized planner data, collaboration, expenses, RLS, realtime updates, and Edge Functions. JSON import/export remains a backup and migration path.

## Current User Flows

### Authentication and trip selection

- Sign in with a Supabase magic link or password.
- Choose among trips the user can access.
- Create a custom trip with a name, date range, and traveler name.
- Create the Japan 2026 starter template.
- Import a legacy local planner or JSON file as a Supabase trip.
- Return to the trip picker without signing out.

### Planning the itinerary

- Rename a trip and edit its date range through day management.
- View the trip as a calendar/timeline or list, with responsive layouts for desktop, tablet, and phone.
- Open a focused day timeline, add/edit/delete activities, drag activities between times or days, resize durations, and auto-arrange a day.
- Add and edit multi-day hotel stays with check-in and check-out details.
- Add day notes and a day base location.
- Run a day route check and review suggested timing adjustments.

### Ideas

- Add, edit, delete, search, sort, and category-filter ideas.
- Store statuses, notes, costs, links, map links, and resolved Google place data.
- React as the linked traveler with `Like`, `Ok`, `Interesting`, or `Pass`.
- Promote an idea into a scheduled activity.
- Move a scheduled activity back into Ideas.

### Maps and routes

- Resolve pasted Google Maps links or search Google Places while editing ideas, activities, and day bases.
- Show mapped ideas and scheduled activities on an interactive Google map.
- Filter by source, mapped state, day, city, category, status, and text search.
- Identify planner items that still need a location.
- Open a place detail card with photo/address data when available.
- Select multiple markers and preview walking, driving, or transit routes.
- Cache map configuration, place previews, autocomplete results, and route previews to reduce repeated requests.
- Apply Japan, Mexico City, or global map/search profiles based on the trip data.

### Expenses

- Build a trip budget from activity, idea, stay, and manually tracked costs.
- Filter budget items by category/type.
- Display estimates in original currencies, JPY, or USD using a user-editable JPY/USD rate.
- Track actual expenses, choose the payer and participants, and split evenly.
- See per-currency balances and suggested settlements.
- Receive realtime expense refreshes alongside planner collaboration.

### People and collaboration

- Invite people as editors or viewers through tokenized invite links.
- Accept pending email invitations after sign-in.
- Link an authenticated account to a named traveler.
- Create or rename the user's traveler identity.
- Revoke pending invitations and review who has access.
- Use the linked traveler for reactions and split expenses.

### Backup and sync

- Autosave the active trip to Supabase through an atomic payload-replacement RPC.
- Refetch planner and expense data after relevant realtime changes.
- Export the active trip as `japan-2026-trip.json`.
- Import JSON by replacing the active planner or merging ideas only.

## Architecture

- `src/App.jsx`: app shell, authentication/trip selection, Trip/Day/Map orchestration, dialogs, planner state, and save flows.
- `src/features/ideas/`: lazy-loaded Ideas UI and promotion flow.
- `src/features/expenses/`: lazy-loaded budget, split-expense UI, and expense dialog.
- `src/features/forms/`: shared React Hook Form and Zod validation helpers.
- `src/data/tripData.js`: starter data and static planner options.
- `src/lib/tripRepository.js`: trip listing/loading/creation, atomic replacement, and realtime subscriptions.
- `src/lib/tripMappers.js`: normalized Supabase rows to/from the React trip object.
- `src/lib/collaborationRepository.js`: members, invitations, traveler claiming, and traveler names.
- `src/lib/expenseRepository.js`, `expenseMappers.js`, and `expenses.js`: expense persistence and calculations.
- `src/lib/mapsRepository.js`: Supabase Edge Function calls plus client-side request caching.
- `src/styles.css`: the full responsive visual system.
- `supabase/migrations/`: schema, RLS, RPCs, indexes, and backend contracts.
- `supabase/functions/`: Google Maps, routing, invitation-session, admin-user, and companion-route Edge Functions.

The UI still works with one nested trip object in React state. Supabase stores normalized rows with stable `client_id` values and `sort_order` fields, then `tripMappers.js` reconstructs that object.

## Current Supabase Model

Core planner and collaboration tables:

- `profiles`
- `trips`
- `trip_members`
- `trip_travelers`
- `trip_days`
- `schedule_items`
- `ideas`
- `idea_votes` (the table name remains for compatibility; current UI values are reactions)
- `trip_invitations`
- `trip_expenses`
- `trip_expense_participants`

The latest local migrations also define a shared Travel Companion contract:

- Trip timezone and default leave-buffer settings.
- Activity travel mode, leave buffer/override, and reminder settings.
- `schedule_item_resources` for bookings, tickets, and links.
- `trip_notes` for trip/day/activity notes.
- Conflict-aware delete and idea-promotion RPCs.

These Travel Companion additions are present in the local migration files, but the website does not yet expose their new resource, note, reminder, or leave-time fields in its UI/repository layer.

## Security and Data Rules

- Browser code uses only public `VITE_*` configuration and the Supabase anon key.
- Planner, collaboration, expense, resource, and note tables use RLS.
- Membership and role checks determine read/edit access.
- Invite tokens are stored as hashes; raw tokens only appear in generated invite URLs.
- Full planner saves use a permission-checked atomic RPC instead of direct client-side bulk deletes.
- Service-role keys, database passwords, and private tokens must never be committed.

## Local Configuration

Expected browser variables are documented in `.env.example`:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_GOOGLE_MAPS_EMBED_KEY
VITE_GOOGLE_MAPS_BROWSER_KEY
VITE_GOOGLE_MAPS_MAP_ID
VITE_PUBLIC_TRIP_URL
```

Google Maps server credentials are kept in Supabase Edge Function secrets rather than Vite browser variables. The app can load browser map configuration through the `maps-config` Edge Function.

## Local Commands

```sh
pnpm install
pnpm dev
pnpm build
pnpm preview
```

The established preview URL for this repo is `http://127.0.0.1:4173/trip/`.

## Verification

- `pnpm build` passed on July 11, 2026 from this working tree.
- `git diff --check` passed for the documentation update.
- Backend migration/function deployment and live-site parity were not re-verified during this documentation pass.

## Deployment Shape

- Source repository: `Josue-NCL/trip_planner`, branch `main`.
- Vite base path: `/trip/`.
- Canonical public URL: `https://neoncartridgelabs.com/trip/`.
- The public bundle is deployed separately under `garabatods/NCL/public/trip`.
- The source repository's automatic GitHub Pages push trigger is disabled; deployment is not implied by a source-only change.

## Important Current-Checkout Warning

As of this review, the working tree contains substantial uncommitted work. It includes the interactive Map section, refreshed routing/place Edge Functions, reaction migration, Travel Companion schema/functions, branding assets, modular Ideas/Expenses/forms, and large `App.jsx`/CSS changes.

Therefore:

- Treat this document as the state of the **current local checkout**, not proof of what is live in production.
- Before shipping, review `git status --short`, run `pnpm build`, confirm required migrations and Edge Functions are applied, and verify the separate deploy bundle.
- Do not discard or overwrite the working tree; it may contain user work that is not yet committed.

## Known Open Work and Risks

- Confirm and apply the untracked July migrations in the intended Supabase project before relying on the Travel Companion contract or reaction constraints.
- Deploy/verify the new or changed Edge Functions used by maps, route previews, and the companion route contract.
- Wire Travel Companion resources, notes, reminder, and leave-time fields into the website only if cross-surface editing is desired.
- Add rollback guidance for failed JSON imports.
- Decide whether schedule conflict checks should also be enforced in Postgres.
- Continue splitting `src/App.jsx`; it remains very large even after Ideas, Expenses, and form modules were extracted.
- Run final responsive and authenticated-flow QA before publishing the current redesign.

## Quick Handoff Prompt

```text
Read docs/APP_STATE.md first. Treat it as the latest local-checkout handoff for the Japan Travel Planner. Inspect git status before editing because substantial work may be uncommitted. Keep the Vite + React + Supabase architecture, repository boundaries, RLS rules, nested trip-object compatibility, /trip/ base path, and separate garabatods/NCL deploy bundle in mind. Verify current code and backend state before assuming local migrations or functions are deployed.
```
