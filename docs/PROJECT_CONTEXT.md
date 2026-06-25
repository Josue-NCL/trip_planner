# Project Context

## Product

Japan 2026 Travel Scheduler is a private trip-planning tool for an itinerary from September 25, 2026 through October 5, 2026. It helps coordinate daily schedule blocks, loose ideas, reservations, transit, food, shopping, and traveler votes.

## Core Workflows

- View the full trip by day.
- Open a single day timeline.
- Add, edit, move, and remove scheduled activities.
- Add and filter ideas by status/category.
- Promote ideas into scheduled activity blocks.
- Track traveler sentiment with votes.
- Invite another signed-in user to the trip and link that account to a named traveler.
- Export and import trip data as JSON.
- Reset local planner data back to seed state.

## Current Data Shape

The app currently keeps the whole planner as one trip object in React state and syncs that object through a Supabase repository layer.

Top-level fields:

- `version`: local schema version from `TRIP_VERSION`.
- `name`: trip name.
- `dateRangeLabel`: human-readable range label.
- `travelers`: list of traveler names.
- `days`: ordered trip days.
- `ideas`: unscheduled or proposed trip ideas.
- `updatedAt`: ISO timestamp updated by `saveTrip`.

Day fields:

- `id`
- `date`
- `dayNumber`
- `city`
- `notes`
- `schedule`

Schedule item fields:

- `id`
- `title`
- `category`
- `city`
- `start`
- `duration`
- `status`
- `notes`
- `cost`
- `link`
- `mapLink`

Idea fields:

- `id`
- `title`
- `category`
- `city`
- `duration`
- `status`
- `notes`
- `cost`
- `link`
- `mapLink`
- `imageKey`
- `votes`

Supabase-only fields:

- Normalized tables use database `bigint` IDs plus stable `client_id` values for travelers, days, schedule items, and ideas so the UI trip-object shape can survive full-trip replacements.
- Planner rows include `sort_order` where ordering matters in normalized storage, including travelers, schedule items, and ideas.
- `profiles` stores both `display_name` and `email`; the app only exposes browser-safe Supabase auth data.
- `trip_travelers.profile_id` optionally links a named traveler, such as `Me` or `Wife`, to a Supabase Auth user.
- `trip_invitations` stores pending invite metadata plus a hashed invite token. The raw invite token only appears in the generated invite URL.
- `idea_votes.profile_id` is filled when the traveler is linked so future user-specific voting can be enforced without changing the UI shape.

## Important Files

- `src/App.jsx`: main application state, event handlers, views, forms, dialogs, drag/move behavior, and rendering.
- `src/data/tripData.js`: seed trip dates, category/status/traveler constants, and initial trip factory.
- `src/lib/storage.js`: local persistence helpers retained for importing existing browser-only planner data.
- `src/lib/tripRepository.js`: Supabase trip listing, loading, replacing, creation, and realtime subscription.
- `src/lib/tripMappers.js`: conversion between normalized Supabase rows and the existing trip object shape.
- `src/lib/collaborationRepository.js`: invite creation, invite acceptance, member/traveler listing, and traveler claiming helpers.
- `src/lib/export.js`: JSON serialization and download.
- `src/styles.css`: all app styling and responsive behavior.
- `public/assets/icons/`: visual tag assets used by categories and metadata.

## Supabase Implementation

Supabase calls are isolated under `src/lib/`. `tripRepository.js` loads, creates, replaces, and subscribes to trips; `tripMappers.js` translates between normalized rows and the existing UI trip shape; `collaborationRepository.js` handles sharing and traveler identity links.
