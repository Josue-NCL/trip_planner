import { makeInitialTrip, TRIP_VERSION } from "../data/tripData.js";

const STORAGE_KEY = "japan-2026-trip:v1";

export function loadTrip() {
  if (typeof window === "undefined") {
    return makeInitialTrip();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return makeInitialTrip();
    }

    const parsed = JSON.parse(raw);
    if (!isValidTrip(parsed)) {
      return makeInitialTrip();
    }

    return parsed;
  } catch {
    return makeInitialTrip();
  }
}

export function saveTrip(trip) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...trip, version: TRIP_VERSION, updatedAt: new Date().toISOString() })
  );
}

export function resetTripStorage() {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function isValidTrip(value) {
  return (
    value &&
    value.version === TRIP_VERSION &&
    Array.isArray(value.days) &&
    Array.isArray(value.ideas) &&
    typeof value.name === "string"
  );
}

export function mergeIdeas(currentTrip, incomingTrip) {
  const existingIds = new Set(currentTrip.ideas.map((idea) => idea.id));
  const importedIdeas = incomingTrip.ideas
    .filter((idea) => !existingIds.has(idea.id))
    .map((idea) => ({ ...idea, id: `${idea.id}-imported-${Date.now()}` }));

  return {
    ...currentTrip,
    ideas: [...currentTrip.ideas, ...importedIdeas],
    updatedAt: new Date().toISOString()
  };
}

export function getStorageKey() {
  return STORAGE_KEY;
}
