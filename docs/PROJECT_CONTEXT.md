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
- Export and import trip data as JSON.
- Reset local planner data back to seed state.

## Current Data Shape

The app currently keeps the whole planner as one trip object in React state and mirrors that object to `localStorage`.

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

## Important Files

- `src/App.jsx`: main application state, event handlers, views, forms, dialogs, drag/move behavior, and rendering.
- `src/data/tripData.js`: seed trip dates, category/status/traveler constants, and initial trip factory.
- `src/lib/storage.js`: local persistence, validation, reset, and idea merge helpers.
- `src/lib/export.js`: JSON serialization and download.
- `src/styles.css`: all app styling and responsive behavior.
- `public/assets/icons/`: visual tag assets used by categories and metadata.

## Supabase Implication

The first Supabase implementation should not scatter network calls through `src/App.jsx`. Add a small data-access layer that can load/save a normalized Supabase model while still returning the existing trip shape to the UI.
