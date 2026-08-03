export const IDEAS_ONBOARDING_STATES = {
  PENDING: "pending",
  COMPLETED: "completed",
  SKIPPED: "skipped"
};

export function shouldShowIdeasWelcome(state, ideaCount) {
  return state === IDEAS_ONBOARDING_STATES.PENDING && Number(ideaCount) === 0;
}

const IDEAS_ONBOARDING_KEY_PREFIX = "travel-planner-onboarding:v1";

export function ideasOnboardingStorageKey(userId, tripId) {
  const normalizedUserId = String(userId ?? "").trim();
  const normalizedTripId = Number(tripId);
  if (!normalizedUserId || !normalizedTripId) {
    return "";
  }
  return `${IDEAS_ONBOARDING_KEY_PREFIX}:${normalizedUserId}:${normalizedTripId}`;
}

export function readIdeasOnboardingState(userId, tripId, storage = globalThis.localStorage) {
  const key = ideasOnboardingStorageKey(userId, tripId);
  if (!key || !storage) {
    return "";
  }
  try {
    const state = storage.getItem(key) ?? "";
    return Object.values(IDEAS_ONBOARDING_STATES).includes(state) ? state : "";
  } catch {
    return "";
  }
}

export function writeIdeasOnboardingState(userId, tripId, state, storage = globalThis.localStorage) {
  const key = ideasOnboardingStorageKey(userId, tripId);
  if (!key || !storage || !Object.values(IDEAS_ONBOARDING_STATES).includes(state)) {
    return false;
  }
  try {
    storage.setItem(key, state);
    return true;
  } catch {
    return false;
  }
}

export function buildSuggestedIdeas({ suggestions = [], existingIdeas = [], category = "Culture", destination = "", travelers = [], now = Date.now() } = {}) {
  const existingPlaceIds = new Set(
    existingIdeas.map((idea) => String(idea.place?.id ?? "").trim()).filter(Boolean)
  );
  const seenPlaceIds = new Set(existingPlaceIds);
  const addedIdeas = [];

  suggestions.forEach((suggestion, index) => {
    const placeId = String(suggestion?.placeId ?? "").trim();
    const name = String(suggestion?.name ?? "").trim();
    if (!placeId || !name || seenPlaceIds.has(placeId)) {
      return;
    }
    seenPlaceIds.add(placeId);
    addedIdeas.push({
      id: `idea-discovery-${now}-${index + 1}`,
      title: name,
      category: String(suggestion?.category ?? "").trim() || category,
      city: String(destination ?? "").trim(),
      duration: 60,
      status: "Proposed",
      notes: "",
      cost: "",
      link: "",
      mapLink: suggestion.googleMapsUri ?? "",
      place: {
        id: placeId,
        name,
        formattedAddress: suggestion.formattedAddress ?? "",
        latitude: finiteNumberOrNull(suggestion.latitude),
        longitude: finiteNumberOrNull(suggestion.longitude),
        googleMapsUri: suggestion.googleMapsUri ?? "",
        resolvedAt: new Date(now).toISOString()
      },
      reactions: Object.fromEntries(travelers.map((traveler) => [traveler, ""]))
    });
  });

  return {
    addedIdeas,
    ideas: [...addedIdeas, ...existingIdeas]
  };
}

function finiteNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
