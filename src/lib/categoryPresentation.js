export const CATEGORY_CLASS_NAMES = Object.freeze({
  Food: "food",
  "Coffee/Bar": "coffee",
  Culture: "culture",
  Transit: "transit",
  Hotel: "hotel",
  Shopping: "shopping",
  Nature: "nature",
  Nightlife: "nightlife",
  Wellness: "wellness",
  Beauty: "beauty",
  Entertainment: "entertainment",
  Family: "family",
  Adventure: "adventure",
  Sightseeing: "sightseeing",
  Markets: "markets",
  "Work-friendly": "work",
  "Open Time": "open"
});

export const EXPANDED_CATEGORY_NAMES = Object.freeze([
  "Nature",
  "Nightlife",
  "Wellness",
  "Beauty",
  "Entertainment",
  "Family",
  "Adventure",
  "Sightseeing",
  "Markets",
  "Work-friendly"
]);

export function getCategoryClassName(category, fallback = "open") {
  return CATEGORY_CLASS_NAMES[category] ?? fallback;
}
