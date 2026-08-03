export function getMapEmptyState({
  plannerItemCount = 0,
  mappedItemCount = 0,
  needsLocationCount = 0,
  hasActiveQuery = false,
  locationFilter = "Mapped"
} = {}) {
  if (Number(plannerItemCount) === 0) {
    return {
      key: "empty-trip",
      title: "No planner places yet",
      detail: "Add an idea or scheduled activity to start building the map.",
      primaryAction: "add-idea",
      secondaryAction: "add-activity"
    };
  }

  if (hasActiveQuery) {
    return {
      key: "filtered-empty",
      title: "No mapped places match this view",
      detail: "Clear the current search and filters to show all mapped places again.",
      primaryAction: "clear-view"
    };
  }

  if (locationFilter === "Needs location") {
    return {
      key: "needs-location-view",
      title: "Review places that need a location",
      detail: "Choose an item from the list and add a resolved place before it can appear on the map.",
      primaryAction: "show-mapped"
    };
  }

  if (Number(mappedItemCount) === 0 && Number(needsLocationCount) > 0) {
    return {
      key: "all-need-location",
      title: "These places need locations",
      detail: "Review the missing locations so these ideas and activities can appear on the map.",
      primaryAction: "review-missing"
    };
  }

  return {
    key: "empty-view",
    title: "No mapped places in this view",
    detail: "Clear the current view to show all available mapped places.",
    primaryAction: "clear-view"
  };
}
