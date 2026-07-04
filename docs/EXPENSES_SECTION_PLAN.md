# Expenses Section Plan

## Design Brief

Create a lightweight expenses section inside the Japan 2026 Travel Scheduler. It should help travelers understand what paid activities already exist, add simple trip expenses, choose who paid, choose who participated, and see a plain "who owes who" summary.

This is not meant to become a full finance app. It should feel like a planning aid attached to the itinerary.

## Product Goals

- Show activities and ideas that already have a `cost` value.
- Let the user turn an activity or idea cost into a tracked expense.
- Let the user add a manual expense that is not tied to an activity.
- Let the user choose who paid.
- Let the user choose who the expense is split between.
- Show simple totals by traveler.
- Show a simple settlement summary, such as "Wife owes Me ¥3,200".

## First Version Scope

Build the first version around a simple equal split.

Included:

- Expenses tab or section in the existing planner UI.
- "Activity costs" list sourced from scheduled activities and ideas that already have `cost`.
- "Tracked expenses" list for expenses the user has chosen to track.
- Add expense form with title, amount, currency, paid by, participants, source, date, and notes.
- Equal split only.
- Trip total.
- Paid total by traveler.
- Owed/receivable summary by traveler.
- One settlement recommendation list.

Not included in the first version:

- Receipt upload.
- Currency conversion.
- Recurring expenses.
- Percentage/share/exact split types.
- Payment status tracking.
- Export to Splitwise.
- Automatic parsing of vague costs like `$$`.

## User Experience

Add an `Expenses` mode near the existing trip/day/ideas views. It should be dense and planner-like, not a separate app.

Recommended layout:

- Top summary row: trip total, paid by me, my balance, untracked activity costs.
- Activity costs panel: scheduled activities and ideas with `cost` text that are not tracked yet.
- Dashboard snapshots: small Recharts visuals for spending by category, paid by traveler, and daily tracked spend.
- Tracked expenses list: title, date/source, amount, paid by, split participants, and balance effect.
- Add expense drawer or modal: fast form for manual or activity-linked expenses.
- Settlement panel: optimized "who pays who" list.

Activity cost behavior:

- If a schedule item has `cost: "¥6,400"` or `"$40"`, show it in the Activity costs panel.
- If a schedule item has `cost: "$$"` or `"TBD"`, show it as an estimate but do not prefill a numeric amount.
- User clicks "Track expense" to create a real expense from that activity.
- The original activity `cost` stays unchanged. The tracked expense stores the real numeric amount.

Manual expense behavior:

- User clicks "Add expense".
- Defaults: currency `JPY`, date from selected day if available, participants set to all travelers.
- Paid by defaults to the current linked traveler when available.

## Data Shape

Keep expenses separate from the current trip object fields until the feature is approved and wired.

Proposed UI shape:

```js
{
  id,
  tripId,
  sourceType: "schedule_item", // "idea" or "manual"
  sourceClientId: "schedule-item-client-id",
  title: "TeamLab tickets",
  amountMinor: 6400,
  currency: "JPY",
  paidByTravelerClientId: "traveler-me",
  participantTravelerClientIds: ["traveler-me", "traveler-wife"],
  splitType: "equal",
  expenseDate: "2026-09-28",
  notes: "",
  createdAt,
  updatedAt
}
```

Use `amountMinor` as an integer. For JPY, `amountMinor` is yen. For USD, it is cents.

## Supabase Tables

Add tables only after this plan is approved.

Proposed tables:

- `trip_expenses`
- `trip_expense_participants`

`trip_expenses`:

- `id`
- `trip_id`
- `client_id`
- `source_type`
- `source_client_id`
- `title`
- `amount_minor`
- `currency`
- `paid_by_traveler_id`
- `split_type`
- `expense_date`
- `notes`
- `created_at`
- `updated_at`

`trip_expense_participants`:

- `expense_id`
- `traveler_id`
- `share_amount_minor`

First version can calculate equal `share_amount_minor` in app code and store it so the display is stable.

Follow the existing Supabase rules before schema work:

- Confirm current schema with `mcp__supabase.list_tables`.
- Use `apply_migration` for DDL.
- Enable RLS.
- Index foreign keys and RLS policy columns.
- Run Supabase security and performance advisors after migration.

## JS Modules

Add small modules instead of pushing more logic into `src/App.jsx`.

Recommended modules:

- `src/lib/money.js`: Dinero wrappers for parsing, formatting, adding, and splitting integer money values.
- `src/lib/expenses.js`: derive activity costs, calculate balances, calculate settlement recommendations.
- `src/lib/expenseRepository.js`: Supabase read/write helpers for expenses.
- `src/lib/expenseMappers.js`: map Supabase rows to the UI expense shape.

Use `recharts` only in UI components for dashboard snapshots. The chart inputs should come from `src/lib/expenses.js`, and chart labels/tooltips should format money through `src/lib/money.js`.

## Balance Logic

For each expense:

1. Add the full amount to the payer's paid total.
2. Divide the amount across participants.
3. Each participant owes their share.
4. Payer's net balance is `paid - owed`.

Settlement recommendation:

1. Build a list of travelers with positive balances.
2. Build a list of travelers with negative balances.
3. Match the largest debtor to the largest creditor until balances reach zero.

Example:

```text
Me paid ¥10,000, Wife paid ¥2,000.
Each traveler owes ¥6,000.
Me is owed ¥4,000.
Wife owes ¥4,000.
```

## Implementation Phases

### Phase 1: Planning Preview

- Add mock-only expense data in a local helper.
- Build the Expenses UI section behind local state.
- No Supabase writes.
- No schema changes.
- Verify the workflow feels right.

### Phase 2: Local Feature

- Add `src/lib/money.js`.
- Add `src/lib/expenses.js`.
- Derive untracked activity costs from existing `trip.days[].schedule[]` and `trip.ideas[]`.
- Add real local state for tracked expenses.
- Confirm the balance math with simple examples.

### Phase 3: Supabase Persistence

- Add tables and RLS.
- Add repository and mapper modules.
- Load expenses with the selected trip.
- Subscribe to expense table realtime changes.
- Preserve current trip object compatibility.

### Phase 4: Polish

- Add edit/delete expense.
- Add "mark as settled" only if needed.
- Add exact split only if equal split is not enough.
- Add receipt/photo support only if it becomes useful.

## Review Questions

- Should the Expenses section live as a top-level view next to Trip/Day/Ideas, or as a panel inside the Trip view?
- Should activity costs auto-create draft expenses, or only appear as "Track expense" suggestions?
- Should first version support only `JPY`, or allow `USD` too for prepaid items?
- Should the payer default to the current linked traveler, or always ask?
