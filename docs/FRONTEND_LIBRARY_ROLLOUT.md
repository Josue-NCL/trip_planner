# Frontend Library Rollout

This guide covers the first safe set of JavaScript libraries added to the planner:

- `sonner` for toast notifications.
- `driver.js` for guided onboarding tours.
- `fuse.js` for fuzzy search.
- `zod` for trip data validation.
- `date-fns` for date and time helpers.

These packages are installed, but they should be adopted gradually. Do not refactor the whole planner at once. The app currently works by keeping one trip object in React state, saving it through `src/lib/tripRepository.js`, and preserving JSON import/export compatibility. Each rollout below keeps that shape intact.

## Rollout Order

1. Add `sonner` first because it can replace the current custom toast timer code with minimal product risk.
2. Add `zod` validation around import and mapper boundaries before changing data flows.
3. Add `date-fns` helpers for schedule math without changing stored date or time formats.
4. Add `fuse.js` search as a read-only derived view over `trip.ideas` and schedule items.
5. Add `driver.js` after stable `data-tour` attributes exist in the UI.

Run `pnpm build` after each step.

## Sonner

Use `sonner` to replace the custom `toasts`, `toastTimersRef`, and `addToast` machinery in `src/App.jsx`.

Safe implementation:

- Add `<Toaster richColors position="top-right" />` once near the root of `App`.
- Keep the existing `addToast(message, type)` function name at first, but change its body to call `toast.success`, `toast.error`, or `toast.message`.
- Replace call sites gradually only after the wrapper works.
- Remove the old toast state, timers, and JSX only after every existing notification still appears.

Recommended mapping:

- `success`: trip saved, invite copied, magic link sent, import complete.
- `error`: Supabase errors, import validation failures, sign-in failures.
- `message`: realtime refreshes, neutral status updates.

Do not put Supabase logic inside toast helpers. Toasts should stay a UI notification layer only.

## Zod

Use `zod` to validate data at boundaries, not inside every render path.

Safe implementation:

- Create `src/lib/tripSchema.js`.
- Model the broad current trip shape from `docs/PROJECT_CONTEXT.md`.
- Keep schemas tolerant with optional fields and unknown-field passthrough where needed so older exports do not fail unnecessarily.
- Validate JSON imports before calling the current import/replace flow.
- Validate mapper output in development or at repository boundaries, but do not change the normalized Supabase table shape.

Good first target:

- `src/lib/storage.js`: validate imported local planner payloads.
- `src/lib/export.js`: optionally export only after the current state parses.
- `src/lib/tripMappers.js`: add a development-only check that mapped rows still produce a valid trip object.

Do not make validation stricter than the current UI. The goal is to catch broken files and mapper regressions, not block valid existing trip data.

## Date FNS

Use `date-fns` for calculations, but keep stored values compatible.

Safe implementation:

- Create `src/lib/tripDates.js`.
- Keep day dates stored as the existing date strings.
- Keep schedule start times stored as the existing `HH:mm` strings.
- Convert to `Date` objects only inside helper functions.
- Return plain strings or minute counts back to the UI.

Good helpers:

- `formatTripDayLabel(dateString)`
- `timeToMinutes(timeString)`
- `minutesToTime(minutes)`
- `getScheduleEnd(start, duration)`
- `findScheduleConflicts(schedule)`
- `getOpenWindows(schedule, dayStart, dayEnd)`

Do not rewrite all date rendering in one pass. Start with conflict/open-window helpers, then move labels later.

## Fuse JS

Use `fuse.js` for read-only search across ideas and schedule items.

Safe implementation:

- Create `src/lib/tripSearch.js`.
- Build a normalized search list from the current trip object.
- Include enough metadata to navigate back to an idea, day, or schedule item.
- Use `useMemo` in `src/App.jsx` so the Fuse index rebuilds only when `trip` changes.
- Keep existing category/status filters working; fuzzy search should narrow results, not replace the current filters.

Suggested keys:

- `title`
- `city`
- `category`
- `status`
- `notes`
- `cost`
- `link`
- `mapLink`
- `dayLabel`

Do not mutate `trip.ideas` or `day.schedule` when sorting search results. Search should return derived results only.

## Driver JS

Use `driver.js` for a guided tour once key UI regions have stable selectors.

Safe implementation:

- Create `src/lib/onboardingTour.js`.
- Add stable `data-tour` attributes to existing buttons and panels.
- Trigger tours from an explicit help button or menu item first.
- Only consider auto-starting later, and guard it with `localStorage`.
- Wait until auth loading and trip loading are complete before starting.
- Import Driver's CSS once, likely from `src/main.jsx` or the tour module.

Suggested tour steps:

- Trip/day switcher.
- Date rail.
- Day timeline.
- Add schedule block.
- Ideas board.
- Traveler voting.
- Share/invite dialog.
- Export/import controls.

Do not depend on brittle CSS class selectors. Use `data-tour` attributes so style refactors do not break the tour.

## Later Libraries Not Installed Yet

These are still good candidates, but they should wait until the app needs deeper UI or data-flow work:

- `@dnd-kit/*`: best for drag-and-drop scheduling and idea reordering.
- `@tanstack/react-query`: best when Supabase loading, mutation, retry, and cache states become harder to manage in `src/App.jsx`.
- `@vis.gl/react-google-maps`: best when map views become a real feature instead of simple links or embeds.

Install these only as part of the feature that uses them.

## Verification Checklist

After each library implementation pass:

- Run `pnpm build`.
- Test signed-out/local preview behavior.
- Test signed-in trip load and save.
- Test invite creation/copy if sharing UI changed.
- Test JSON export/import if validation or date handling changed.
- Confirm existing schedule items, ideas, votes, and travelers keep the same shape.

Rollback for unused first-wave libraries:

```sh
pnpm remove sonner driver.js fuse.js zod date-fns
```
