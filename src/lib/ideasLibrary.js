import { CATEGORIES } from "../data/tripData.js";

const IDEA_SORTER = new Intl.Collator(undefined, { sensitivity: "base" });

export const IDEA_CATEGORY_FILTERS = ["All", ...CATEGORIES];
export const UNASSIGNED_IDEA_CITY = "Unassigned";

export function getAvailableIdeaCategoryFilters(ideas = []) {
  const availableCategories = new Set(
    ideas.map((idea) => String(idea.category ?? "").trim()).filter(Boolean)
  );
  const knownCategories = CATEGORIES.filter((category) => availableCategories.has(category));
  const unknownCategories = [...availableCategories]
    .filter((category) => !CATEGORIES.includes(category))
    .sort((first, second) => IDEA_SORTER.compare(first, second));

  return ["All", ...knownCategories, ...unknownCategories];
}

export function buildIdeaCityGroups({
  ideas = [],
  query = "",
  category = "All",
  sort = "planning",
  missingLocationIdeaIds = new Set()
} = {}) {
  const normalizedQuery = query.trim().toLowerCase();
  const filteredIdeas = ideas.filter((idea) => {
    if (category !== "All" && idea.category !== category) {
      return false;
    }
    if (sort === "needs-location" && !missingLocationIdeaIds.has(idea.id)) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    const searchableText = `${idea.title ?? ""} ${idea.city ?? ""}`.toLowerCase();
    return searchableText.includes(normalizedQuery);
  });

  const cityGroups = new Map();
  filteredIdeas.forEach((idea) => {
    const city = String(idea.city ?? "").trim() || UNASSIGNED_IDEA_CITY;
    const currentIdeas = cityGroups.get(city) ?? [];
    currentIdeas.push(idea);
    cityGroups.set(city, currentIdeas);
  });

  return [...cityGroups.entries()]
    .sort(([firstCity], [secondCity]) => {
      if (firstCity === UNASSIGNED_IDEA_CITY) return 1;
      if (secondCity === UNASSIGNED_IDEA_CITY) return -1;
      return IDEA_SORTER.compare(firstCity, secondCity);
    })
    .map(([city, groupedIdeas]) => ({
      city,
      ideas: sort === "title"
        ? [...groupedIdeas].sort((first, second) => IDEA_SORTER.compare(first.title || "", second.title || ""))
        : groupedIdeas
    }));
}
