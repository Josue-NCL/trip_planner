import test from "node:test";
import assert from "node:assert/strict";
import { getMapEmptyState } from "./mapEmptyState.js";

test("offers creation actions when the trip has no planner places", () => {
  const state = getMapEmptyState();
  assert.equal(state.key, "empty-trip");
  assert.equal(state.primaryAction, "add-idea");
  assert.equal(state.secondaryAction, "add-activity");
});

test("offers to clear an empty filtered map view", () => {
  const state = getMapEmptyState({
    plannerItemCount: 5,
    mappedItemCount: 4,
    needsLocationCount: 1,
    hasActiveQuery: true
  });
  assert.equal(state.key, "filtered-empty");
  assert.equal(state.primaryAction, "clear-view");
});

test("offers missing-location review when no planner item is mapped", () => {
  const state = getMapEmptyState({
    plannerItemCount: 3,
    mappedItemCount: 0,
    needsLocationCount: 3
  });
  assert.equal(state.key, "all-need-location");
  assert.equal(state.primaryAction, "review-missing");
});

test("explains the intentional needs-location view", () => {
  const state = getMapEmptyState({
    plannerItemCount: 3,
    mappedItemCount: 1,
    needsLocationCount: 2,
    locationFilter: "Needs location"
  });
  assert.equal(state.key, "needs-location-view");
  assert.equal(state.primaryAction, "show-mapped");
});

test("lets a filtered needs-location view recover when no item matches", () => {
  const state = getMapEmptyState({
    plannerItemCount: 3,
    mappedItemCount: 1,
    needsLocationCount: 2,
    hasActiveQuery: true,
    locationFilter: "Needs location"
  });
  assert.equal(state.key, "filtered-empty");
  assert.equal(state.primaryAction, "clear-view");
});
