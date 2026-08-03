import test from "node:test";
import assert from "node:assert/strict";
import { buildIdeaCityGroups, getAvailableIdeaCategoryFilters, IDEA_CATEGORY_FILTERS, UNASSIGNED_IDEA_CITY } from "./ideasLibrary.js";

const IDEAS = [
  { id: "1", title: "Kyoto Coffee", city: "Kyoto", category: "Coffee/Bar" },
  { id: "2", title: "Tokyo Museum", city: "Tokyo", category: "Culture" },
  { id: "3", title: "Kyoto Temple", city: "Kyoto", category: "Culture" },
  { id: "4", title: "No Location", city: "", category: "Shopping" },
  { id: "5", title: "A Tokyo Garden", city: "Tokyo", category: "Open Time" }
];

test("includes onboarding categories in the Ideas filter", () => {
  ["Nature", "Nightlife", "Wellness", "Entertainment", "Family", "Adventure", "Sightseeing", "Markets", "Beauty", "Work-friendly"]
    .forEach((category) => assert.ok(IDEA_CATEGORY_FILTERS.includes(category), `${category} should be filterable`));
});

test("only exposes categories represented by saved ideas", () => {
  assert.deepEqual(getAvailableIdeaCategoryFilters(IDEAS), ["All", "Coffee/Bar", "Culture", "Shopping", "Open Time"]);
});

test("groups ideas alphabetically by city and leaves unassigned last", () => {
  const groups = buildIdeaCityGroups({ ideas: IDEAS });
  assert.deepEqual(groups.map((group) => group.city), ["Kyoto", "Tokyo", UNASSIGNED_IDEA_CITY]);
  assert.deepEqual(groups[0].ideas.map((idea) => idea.id), ["1", "3"]);
});

test("combines category and search filters before grouping", () => {
  const groups = buildIdeaCityGroups({ ideas: IDEAS, category: "Culture", query: "temple" });
  assert.deepEqual(groups, [{ city: "Kyoto", ideas: [IDEAS[2]] }]);
});

test("sorts titles inside each city without changing city order", () => {
  const groups = buildIdeaCityGroups({ ideas: IDEAS, sort: "title" });
  assert.deepEqual(groups[1].ideas.map((idea) => idea.title), ["A Tokyo Garden", "Tokyo Museum"]);
});

test("needs-location filters before creating city groups", () => {
  const groups = buildIdeaCityGroups({
    ideas: IDEAS,
    sort: "needs-location",
    missingLocationIdeaIds: new Set(["2", "4"])
  });
  assert.deepEqual(groups.map((group) => [group.city, group.ideas.map((idea) => idea.id)]), [
    ["Tokyo", ["2"]],
    [UNASSIGNED_IDEA_CITY, ["4"]]
  ]);
});
