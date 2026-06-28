# ChatGPT Feature Planning Brief

Use this file as context when planning new features for the Japan 2026 Travel Scheduler. It is written for ChatGPT or another planning assistant, not as implementation instructions for production code.

## Quick Copy/Paste Prompt

```text
I am planning features for a private React travel-planning app called Japan 2026 Travel Scheduler. Use the project context below to suggest practical, scoped features, UX improvements, data-model changes, and implementation steps. Keep recommendations compatible with the current Vite + React + Supabase architecture, and do not assume a mobile native app unless I ask for one.
```

## Product Summary

Japan 2026 Travel Scheduler is a private single-page travel planner for a Japan trip from September 25, 2026 through October 5, 2026. It helps coordinate a shared itinerary, daily schedule blocks, loose ideas, reservations, transit, food, shopping, notes, links, maps, costs, and traveler votes.

The app is meant for a small group, currently modeled around named travelers such as `Me` and `Wife`, with authenticated Supabase users optionally linked to those named travelers.

## Tech Stack

- App: Vite + React 19 single-page app.
- Package manager: pnpm.
- Styling: plain CSS in `src/styles.css`.
- Icons: `lucide-react` plus custom image assets in `public/assets/icons/`.
- Backend: Supabase Auth, Postgres tables, RLS policies, RPC helper functions, and realtime database events.
- Current persistence: Supabase via repository modules in `src/lib/`.
- Legacy persistence: local planner import from `localStorage` via `src/lib/storage.js`.
- Export format: JSON download named `japan-2026-trip.json`.

## Important Files

- `src/App.jsx`: main UI, app state, forms, dialogs, views, schedule editing, drag/move behavior, invite flow, import/export, and save triggers.
- `src/data/tripData.js`: seed trip dates, category/status/traveler constants, starter trip data.
- `src/lib/tripRepository.js`: list/load/create/replace trips in Supabase and subscribe to realtime changes.
- `src/lib/tripMappers.js`: maps normalized Supabase rows to the existing React trip object and back.
- `src/lib/collaborationRepository.js`: invite creation, invite acceptance, invite revocation, member/traveler listing, and traveler claiming.
- `src/lib/auth.js`: Supabase magic-link auth and profile setup.
- `src/lib/storage.js`: localStorage helpers retained for importing legacy local planner data.
- `src/lib/export.js`: JSON export helper.
- `supabase/migrations/`: database schema, RLS, invitation RPCs, helper functions, indexes, and policy hardening.
- `docs/PROJECT_CONTEXT.md`: product and data-model context.
- `docs/SUPABASE_TRANSITION.md`: backend transition summary and schema notes.
- `docs/TASKS.md`: completed and open implementation checklist.
- `docs/DECISIONS.md`: preserved architectural decisions.

## What Is Done So Far

The app currently supports:

- Supabase magic-link sign-in.
- Development testing should use the authenticated Supabase flow.
- Trip picker after sign-in.
- Creating a starter Japan 2026 trip.
- Importing an existing local planner into Supabase.
- Importing a JSON trip file as a new trip from the picker.
- Selecting an active trip.
- Viewing the whole trip by day.
- Viewing a single day timeline.
- Viewing ideas/proposals separately.
- Switching all-trip board modes between grid, list, and calendar-style views.
- Switching day view between timeline and compact modes.
- Adding, editing, and deleting trip days.
- Adding, editing, deleting, and moving scheduled activities.
- Dragging scheduled activities between days/time slots with UI-level conflict checks.
- Auto-arranging a selected day's schedule by start time.
- Adding and editing ideas.
- Filtering ideas by status tab and category.
- Promoting an idea into a scheduled activity.
- Voting on ideas with named traveler votes.
- Restricting votes in authenticated mode so a linked traveler can only vote as themselves.
- Sharing a trip through owner-created invite links.
- Accepting invite links after sign-in.
- Linking a signed-in user to a named traveler.
- Revoking pending invitations.
- Exporting the active trip as JSON.
- Importing JSON into an active trip by replacing the planner or merging ideas only.
- Resetting an active Supabase trip back to the starter trip.
- Autosaving active trip changes to Supabase with a short debounce.
- Realtime refetching when planner tables change.
- Toast messages for save, import, invite, and error states.

## Current UI Views

The main app has three primary views:

- `Trip`: whole-trip board with day summaries and schedule blocks.
- `Day`: focused daily timeline with date rail, notes, and schedule activity controls.
- `Ideas`: ideas board with add form, tabs, category filters, traveler votes, and promote actions.

There are also modal/dialog flows for:

- Sharing and invites.
- Promoting an idea to an activity.
- Editing a schedule item.
- Editing an idea.
- Editing day settings.
- Import confirmation.

## Current Trip Object Shape

The React UI expects one trip object:

```js
{
  version,
  name,
  dateRangeLabel,
  travelers,
  days: [
    {
      id,
      date,
      dayNumber,
      city,
      notes,
      schedule: [
        {
          id,
          title,
          category,
          city,
          start,
          duration,
          status,
          notes,
          cost,
          link,
          mapLink
        }
      ]
    }
  ],
  ideas: [
    {
      id,
      title,
      category,
      city,
      duration,
      status,
      notes,
      cost,
      link,
      mapLink,
      imageKey,
      votes
    }
  ],
  updatedAt
}
```

Feature plans should keep this shape compatible unless they explicitly include a migration plan.

## Seed Data and Options

Current trip dates:

- September 25, 2026 through October 5, 2026.

Current categories:

- `Food`
- `Culture`
- `Transit`
- `Hotel`
- `Shopping`
- `Open Time`

Current statuses:

- `Proposed`
- `Maybe`
- `Booked`
- `Skipped`

Current named travelers:

- `Me`
- `Wife`

Starter trip data includes an arrival buffer, first dinner, a sample Kyoto day, departure buffer, and starter ideas such as ramen, Fushimi Inari, Tokyo to Kyoto train, and a ryokan option.

## Backend State

Supabase is the active backend. The schema is normalized and includes:

- `profiles`
- `trips`
- `trip_members`
- `trip_travelers`
- `trip_days`
- `schedule_items`
- `ideas`
- `idea_votes`
- `trip_invitations`

Important backend behavior:

- RLS is enabled for app data.
- Membership policies control read/write access.
- Private RLS helper functions exist outside the public RPC surface.
- Invite tokens are hashed before storage.
- Raw invite tokens only exist in the browser-generated invite URL.
- Invitations are accepted through authenticated RPCs.
- Realtime publication entries exist for planner tables.
- The frontend refetches the active trip after realtime events.
- Normalized rows use stable `client_id` values so the UI can keep its existing trip-object shape.
- `sort_order` is used where ordering matters.
- `idea_votes.profile_id` is populated when a named traveler is linked to an authenticated user.

## Constraints and Guardrails

When planning features:

- Preserve the existing React trip object shape where practical.
- Keep Supabase access behind modules in `src/lib/`.
- Do not put direct Supabase table logic throughout `src/App.jsx`.
- Keep the app small and readable; avoid broad abstraction unless a feature genuinely needs it.
- Treat JSON export/import as a backup and migration path, not as the primary backend.
- Keep browser code limited to `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Do not suggest service-role keys in frontend code.
- For database work, plan for RLS, indexes, lowercase `snake_case` identifiers, and `timestamptz` timestamps.
- Use `(select auth.uid())` in RLS policies rather than bare `auth.uid()`.
- Prefer UI-level changes before database changes unless persistence, security, or collaboration requires schema support.
- Consider that the planner may contain private travel details, reservations, links, and notes.

## Known Open Items

From the current project docs:

- Add rollback guidance for failed imports.
- Decide whether schedule conflict checks should be enforced in Postgres or only in the UI.

Additional planning areas that may be worth exploring:

- Better reservation tracking and confirmation details.
- Lodging and transit-specific fields.
- Budget summaries by day/category.
- Packing or prep checklist.
- Map-oriented views.
- Calendar export.
- Better mobile ergonomics.
- Offline or poor-network behavior.
- More explicit conflict warnings.
- Activity templates or duplicate activity flows.
- Richer collaboration presence or change history.
- Better traveler management beyond the initial `Me` and `Wife` defaults.

## Feature Planning Questions To Ask

When proposing new features, ask:

- Is this mainly a UI-only improvement, a data-model change, or both?
- Does it need to persist in Supabase?
- Does it affect collaboration, permissions, invites, or RLS?
- Does it need to appear in JSON export/import?
- Does it preserve compatibility with existing trip objects?
- Does it affect mobile layouts?
- Does it create privacy or security concerns?
- Is it useful before, during, or after the trip?
- Is it small enough to implement safely in this app, or should it be split into phases?

## Suggested Response Format For ChatGPT

When using this context with ChatGPT, ask it to respond with:

1. A short feature summary.
2. User value and primary workflow.
3. Scope for version 1.
4. UI changes.
5. Data changes, if any.
6. Supabase/RLS impact, if any.
7. Import/export impact.
8. Risks and edge cases.
9. Implementation steps.
10. Testing checklist.

## Local Development Commands

```sh
pnpm install
pnpm dev
pnpm build
pnpm preview
```

Run `pnpm build` after meaningful code changes. Docs-only edits do not need a build.
