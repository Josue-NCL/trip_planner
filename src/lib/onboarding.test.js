import test from "node:test";
import assert from "node:assert/strict";
import {
  IDEAS_ONBOARDING_STATES,
  buildSuggestedIdeas,
  ideasOnboardingStorageKey,
  readIdeasOnboardingState,
  shouldShowIdeasWelcome,
  writeIdeasOnboardingState
} from "./onboarding.js";

test("welcome onboarding only replaces an empty ideas library", () => {
  assert.equal(shouldShowIdeasWelcome(IDEAS_ONBOARDING_STATES.PENDING, 0), true);
  assert.equal(shouldShowIdeasWelcome(IDEAS_ONBOARDING_STATES.PENDING, 3), false);
  assert.equal(shouldShowIdeasWelcome(IDEAS_ONBOARDING_STATES.COMPLETED, 0), false);
  assert.equal(shouldShowIdeasWelcome(IDEAS_ONBOARDING_STATES.SKIPPED, 0), false);
});

test("onboarding state is isolated by user and trip", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  assert.equal(ideasOnboardingStorageKey("user-1", 42), "travel-planner-onboarding:v1:user-1:42");
  assert.equal(writeIdeasOnboardingState("user-1", 42, IDEAS_ONBOARDING_STATES.PENDING, storage), true);
  assert.equal(readIdeasOnboardingState("user-1", 42, storage), IDEAS_ONBOARDING_STATES.PENDING);
  assert.equal(readIdeasOnboardingState("user-2", 42, storage), "");
});

test("suggested ideas preserve resolved places and remove duplicates", () => {
  const existingIdeas = [{ id: "existing", place: { id: "place-1" } }];
  const result = buildSuggestedIdeas({
    existingIdeas,
    category: "Food",
    destination: "Kyoto",
    travelers: ["Josue"],
    now: 1_700_000_000_000,
    suggestions: [
      { placeId: "place-1", name: "Already saved" },
      { placeId: "place-2", name: "Ramen House", formattedAddress: "Kyoto, Japan", latitude: 35.01, longitude: 135.76, googleMapsUri: "https://maps.google.com/place-2" },
      { placeId: "place-2", name: "Duplicate result" }
    ]
  });

  assert.equal(result.addedIdeas.length, 1);
  assert.equal(result.ideas.length, 2);
  assert.deepEqual(result.addedIdeas[0], {
    id: "idea-discovery-1700000000000-2",
    title: "Ramen House",
    category: "Food",
    city: "Kyoto",
    duration: 60,
    status: "Proposed",
    notes: "",
    cost: "",
    link: "",
    mapLink: "https://maps.google.com/place-2",
    place: {
      id: "place-2",
      name: "Ramen House",
      formattedAddress: "Kyoto, Japan",
      latitude: 35.01,
      longitude: 135.76,
      googleMapsUri: "https://maps.google.com/place-2",
      resolvedAt: "2023-11-14T22:13:20.000Z"
    },
    reactions: { Josue: "" }
  });
});

test("suggested ideas keep the category supplied by discovery results", () => {
  const result = buildSuggestedIdeas({
    category: "Culture",
    destination: "Mexico City",
    suggestions: [{ placeId: "place-food", name: "Market", category: "Food" }],
    now: 1_700_000_000_000
  });

  assert.equal(result.addedIdeas[0].category, "Food");
});
