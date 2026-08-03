import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, Bed, CalendarPlus, Check, ChevronDown, Clock3, Coffee, Filter, Landmark, MapPin, Plus, RefreshCcw, Search, ShoppingBag, Sparkles, Train, Utensils, X } from "lucide-react";
import { searchPlaceSuggestionsCached } from "../../lib/mapsRepository.js";
import { CATEGORY_CLASS_NAMES } from "../../lib/categoryPresentation.js";
import { buildIdeaCityGroups, getAvailableIdeaCategoryFilters } from "../../lib/ideasLibrary.js";

const IDEA_SORT_OPTIONS = [
  { value: "planning", label: "Planning order" },
  { value: "title", label: "Name A–Z" },
  { value: "needs-location", label: "Needs location" }
];
const CATEGORY_CONFIG = {
  Food: { icon: Utensils, className: CATEGORY_CLASS_NAMES.Food, label: "Food" },
  "Coffee/Bar": { icon: Coffee, className: CATEGORY_CLASS_NAMES["Coffee/Bar"], label: "Coffee/Bar" },
  Culture: { icon: Landmark, className: CATEGORY_CLASS_NAMES.Culture, label: "Culture" },
  Transit: { icon: Train, className: CATEGORY_CLASS_NAMES.Transit, label: "Transit" },
  Hotel: { icon: Bed, className: CATEGORY_CLASS_NAMES.Hotel, label: "Hotel" },
  Shopping: { icon: ShoppingBag, className: CATEGORY_CLASS_NAMES.Shopping, label: "Shopping" },
  Nature: { icon: Clock3, className: CATEGORY_CLASS_NAMES.Nature, label: "Nature" },
  Nightlife: { icon: Coffee, className: CATEGORY_CLASS_NAMES.Nightlife, label: "Nightlife" },
  Wellness: { icon: Clock3, className: CATEGORY_CLASS_NAMES.Wellness, label: "Wellness" },
  Entertainment: { icon: Landmark, className: CATEGORY_CLASS_NAMES.Entertainment, label: "Entertainment" },
  Family: { icon: Clock3, className: CATEGORY_CLASS_NAMES.Family, label: "Family" },
  Adventure: { icon: Clock3, className: CATEGORY_CLASS_NAMES.Adventure, label: "Adventure" },
  Sightseeing: { icon: Landmark, className: CATEGORY_CLASS_NAMES.Sightseeing, label: "Sightseeing" },
  Markets: { icon: ShoppingBag, className: CATEGORY_CLASS_NAMES.Markets, label: "Markets" },
  Beauty: { icon: Sparkles, className: CATEGORY_CLASS_NAMES.Beauty, label: "Beauty" },
  "Work-friendly": { icon: Coffee, className: CATEGORY_CLASS_NAMES["Work-friendly"], label: "Work-friendly" },
  "Open Time": { icon: Clock3, className: CATEGORY_CLASS_NAMES["Open Time"], label: "Open Time" }
};
const STATUS_CLASS = { Proposed: "proposed", Maybe: "maybe", Booked: "booked", Skipped: "skipped" };
const REACTION_ORDER = ["", "like", "ok", "interesting", "pass"];
const REACTION_LABELS = { "": "React", like: "Like", ok: "Ok", interesting: "Interesting", pass: "Pass" };
const REACTION_EMOJIS = { "": "♡", like: "👍", ok: "👌", interesting: "👀", pass: "😒" };
const LEGACY_REACTION_VALUES = { maybe: "ok", love: "like" };
const GENERIC_ICON_BASE = `${import.meta.env.BASE_URL}assets/icons/`;
const IDEA_INTERESTS = [
  { id: "food", label: "Food", category: "Food", query: "local restaurants, food markets, and regional dishes", icon: "tag-food-generic.png" },
  { id: "coffee", label: "Coffee & Drinks", category: "Coffee/Bar", query: "specialty coffee shops, cocktail bars, and local drinks", icon: "tag-coffee-bar-generic.png" },
  { id: "culture", label: "Culture", category: "Culture", query: "museums, landmarks, galleries, and cultural attractions", icon: "tag-culture-generic.png" },
  { id: "shopping", label: "Shopping", category: "Shopping", query: "local shops, markets, and independent boutiques", icon: "tag-shopping-generic.png" },
  { id: "relax", label: "Relax & Outdoors", category: "Open Time", query: "parks, gardens, scenic walks, and relaxing outdoor places", icon: "tag-open-time-generic.png" },
  { id: "nature", label: "Nature", category: "Nature", query: "nature parks, gardens, scenic trails, and outdoor escapes", icon: "tag-nature-generic.png" },
  { id: "nightlife", label: "Nightlife", category: "Nightlife", query: "cocktail bars, live music, clubs, and nightlife", icon: "tag-nightlife-generic.png" },
  { id: "wellness", label: "Wellness", category: "Wellness", query: "spas, yoga, massage, pools, and wellness activities", icon: "tag-wellness-generic.png" },
  { id: "entertainment", label: "Entertainment", category: "Entertainment", query: "shows, concerts, theater, cinema, and entertainment", icon: "tag-entertainment-generic.png" },
  { id: "family", label: "Family", category: "Family", query: "family friendly activities, attractions, and kid friendly places", icon: "tag-family-generic.png" },
  { id: "adventure", label: "Adventure", category: "Adventure", query: "active excursions, sports, guided adventures, and outdoor activities", icon: "tag-adventure-generic.png" },
  { id: "sightseeing", label: "Sightseeing", category: "Sightseeing", query: "landmarks, walking tours, photo stops, and must see sights", icon: "tag-sightseeing-generic.png" },
  { id: "markets", label: "Markets", category: "Markets", query: "local markets, flea markets, food stalls, and browsing", icon: "tag-market-generic.png" },
  { id: "beauty", label: "Beauty", category: "Beauty", query: "beauty salons, skincare, makeup, hair styling, and beauty shopping", icon: "tag-beauty-generic.png" },
  { id: "work", label: "Work-friendly", category: "Work-friendly", query: "coworking spaces, work friendly cafes, reliable wifi, and remote work spots", icon: "tag-work-generic.png" }
];
const MAX_DISCOVERY_INTERESTS = 3;
const PRIMARY_IDEA_INTEREST_COUNT = 5;
const REACTION_OPTIONS = REACTION_ORDER.filter(Boolean).map((value) => ({
  value,
  label: REACTION_LABELS[value],
  emoji: REACTION_EMOJIS[value]
}));

function TagIcon({ src, size = "chip" }) {
  if (!src) return null;
  return <img className={`tag-icon tag-icon-${size}`} src={src} alt="" aria-hidden="true" draggable={false} />;
}

function getCategoryConfig(category, tagAssets) {
  const base = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG["Open Time"];
  return { ...base, asset: tagAssets?.category?.[category] ?? tagAssets?.category?.["Open Time"] ?? "" };
}

function getStatusAsset(status, tagAssets) {
  return status === "Proposed"
    ? tagAssets?.meta?.notes ?? ""
    : tagAssets?.status?.[status] ?? tagAssets?.meta?.notes ?? "";
}

function IdeasSortMenu({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const controlRef = useRef(null);
  const selectedOption = IDEA_SORT_OPTIONS.find((option) => option.value === value) ?? IDEA_SORT_OPTIONS[0];

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!controlRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="ideas-sort-control" ref={controlRef}>
      <button
        className={`icon-button ideas-sort-trigger${value !== "planning" ? " is-active" : ""}`}
        type="button"
        aria-label={`Sort ideas: ${selectedOption.label}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={`Sort ideas: ${selectedOption.label}`}
        onClick={() => setIsOpen((current) => !current)}
      >
        <ArrowDownUp size={17} aria-hidden="true" />
      </button>
      {isOpen ? (
        <div className="ideas-sort-menu" role="menu" aria-label="Sort ideas">
          <span>Sort ideas</span>
          {IDEA_SORT_OPTIONS.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                className={isSelected ? "is-selected" : ""}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                <span>{option.label}</span>
                {isSelected ? <Check size={15} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function IdeasCategoryFilters({ activeCategory, categories, onChange, tagAssets }) {
  return (
    <div className="category-filters ideas-library-filters" aria-label="Filter ideas by category">
      <span className="category-filter-label">
        <Filter size={15} aria-hidden="true" />
        Category
      </span>
      <div className="category-filter-options">
        {categories.map((category) => {
          const config = category === "All" ? null : getCategoryConfig(category, tagAssets);
          const Icon = config?.icon ?? Filter;
          const isActive = activeCategory === category;
          return (
            <button className={isActive ? "is-active" : ""} type="button" key={category} aria-pressed={isActive} onClick={() => onChange(category)}>
              {config?.asset ? <TagIcon src={config.asset} size="chip" /> : <Icon size={15} aria-hidden="true" />}
              {config?.label ?? category}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function IdeasSection({
  ideas,
  allIdeas,
  hidden = false,
  currentTravelerName,
  onAddIdea,
  onEditIdea,
  onDeleteIdea,
  openReactionPickerId,
  onToggleReactionPicker,
  onReact,
  onPromote,
  missingLocationIdeaIds,
  tagAssets,
  showWelcome = false,
  canFindInspiration = false,
  destination = "",
  mapsProfile,
  onDismissWelcome,
  onFindInspiration,
  onSaveSuggestedIdeas
}) {
  const [ideaSearchQuery, setIdeaSearchQuery] = useState("");
  const [ideaSort, setIdeaSort] = useState("planning");
  const [ideaCategory, setIdeaCategory] = useState("All");
  const [collapsedCities, setCollapsedCities] = useState(() => new Set());
  const availableIdeaCategories = useMemo(() => getAvailableIdeaCategoryFilters(allIdeas), [allIdeas]);
  const ideaGroups = useMemo(
    () => buildIdeaCityGroups({
      ideas,
      query: ideaSearchQuery,
      category: ideaCategory,
      sort: ideaSort,
      missingLocationIdeaIds
    }),
    [ideas, ideaSearchQuery, ideaCategory, ideaSort, missingLocationIdeaIds]
  );
  const hasIdeaSearchQuery = Boolean(ideaSearchQuery.trim());
  const hasActiveIdeaFilters = hasIdeaSearchQuery || ideaCategory !== "All" || ideaSort !== "planning";

  useEffect(() => {
    if (!availableIdeaCategories.includes(ideaCategory)) {
      setIdeaCategory("All");
    }
  }, [availableIdeaCategories, ideaCategory]);

  function clearIdeaSearch(event) {
    setIdeaSearchQuery("");
    event.currentTarget.closest("label")?.querySelector("input")?.blur();
  }

  function clearIdeaFilters() {
    setIdeaSearchQuery("");
    setIdeaCategory("All");
    setIdeaSort("planning");
  }

  function toggleCitySection(city) {
    setCollapsedCities((current) => {
      const next = new Set(current);
      if (next.has(city)) {
        next.delete(city);
      } else {
        next.add(city);
      }
      return next;
    });
  }

  return (
    <section className={`ideas-section${showWelcome ? " is-onboarding" : ""}`} aria-label="Ideas and proposals" hidden={hidden}>
      <div className="ideas-section-header">
        <div>
          <h1>Ideas</h1>
          <p>{allIdeas.length} saved</p>
        </div>
        {!showWelcome ? (
          <div className="ideas-header-actions">
            <label className="ideas-search-field ideas-header-search-field">
              <span>
                <Search size={15} />
                <span className="sr-only">Search ideas</span>
              </span>
              <input
                type="search"
                value={ideaSearchQuery}
                onChange={(event) => setIdeaSearchQuery(event.target.value)}
                placeholder="Search ideas by title or city"
              />
              {hasIdeaSearchQuery ? (
                <button className="ideas-search-clear" type="button" aria-label="Clear ideas search" onMouseDown={(event) => event.preventDefault()} onClick={clearIdeaSearch}>
                  <X size={16} />
                </button>
              ) : null}
            </label>
            <IdeasSortMenu value={ideaSort} onChange={setIdeaSort} />
            <button className="primary-button ideas-add-button" type="button" onClick={onAddIdea}>
              <Plus size={17} />
              Add idea
            </button>
          </div>
        ) : null}
      </div>

      {showWelcome ? (
        <div className="ideas-onboarding-stage">
          <IdeasWelcomePanel
            destination={destination}
            mapsProfile={mapsProfile}
            onAddIdea={onAddIdea}
            onDismiss={onDismissWelcome}
            onSaveSuggestedIdeas={onSaveSuggestedIdeas}
          />
        </div>
      ) : (
        <>
          <IdeasCategoryFilters
            activeCategory={ideaCategory}
            categories={availableIdeaCategories}
            onChange={setIdeaCategory}
            tagAssets={tagAssets}
          />
          <div className="ideas-workspace">
            <div className="ideas-browser">
              <div className="idea-list ideas-city-list">
                {ideaGroups.map((group, groupIndex) => {
                  const isCollapsed = collapsedCities.has(group.city);
                  const headingId = `ideas-city-heading-${groupIndex}`;
                  const contentId = `ideas-city-content-${groupIndex}`;
                  return (
                    <section className="ideas-city-section" aria-labelledby={headingId} key={group.city}>
                      <h2 id={headingId}>
                        <button type="button" aria-expanded={!isCollapsed} aria-controls={contentId} onClick={() => toggleCitySection(group.city)}>
                          <span className="ideas-city-heading-copy">
                            <MapPin size={17} aria-hidden="true" />
                            <span>
                              <strong>{group.city}</strong>
                              <small>{group.ideas.length} {group.ideas.length === 1 ? "idea" : "ideas"}</small>
                            </span>
                          </span>
                          <ChevronDown className={isCollapsed ? "" : "is-expanded"} size={18} aria-hidden="true" />
                        </button>
                      </h2>
                      <div className="ideas-city-grid" id={contentId} hidden={isCollapsed}>
                        {group.ideas.map((idea) => (
                          <IdeaRow
                            idea={idea}
                            key={idea.id}
                            tagAssets={tagAssets}
                            currentTravelerName={currentTravelerName}
                            isReactionPickerOpen={openReactionPickerId === idea.id}
                            onEdit={() => onEditIdea(idea)}
                            onDelete={() => onDeleteIdea(idea.id)}
                            onToggleReactionPicker={() => onToggleReactionPicker(idea.id)}
                            onReact={(reaction) => onReact(idea.id, reaction)}
                            onPromote={() => onPromote(idea)}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
                {!ideaGroups.length ? (
                  <div className="ideas-empty-state">
                    <span>{hasActiveIdeaFilters ? "No ideas match the current filters." : "No ideas saved yet."}</span>
                    {hasActiveIdeaFilters ? (
                      <button className="ghost-button" type="button" onClick={clearIdeaFilters}>Clear filters</button>
                    ) : null}
                    {canFindInspiration && !hasActiveIdeaFilters ? (
                      <button className="ghost-button ideas-find-inspiration" type="button" onClick={onFindInspiration}>
                        <img src={`${GENERIC_ICON_BASE}nav-ideas-generic.png`} alt="" aria-hidden="true" />
                        Find inspiration
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <button className="mobile-fab-action ideas-mobile-fab" type="button" aria-label="Add idea" title="Add idea" onClick={onAddIdea}>
            <Plus size={22} />
            <span>Add idea</span>
          </button>
        </>
      )}
    </section>
  );
}

function IdeasWelcomePanel({ destination, mapsProfile, onAddIdea, onDismiss, onSaveSuggestedIdeas }) {
  const [query, setQuery] = useState("");
  const [selectedInterestIds, setSelectedInterestIds] = useState([]);
  const [status, setStatus] = useState("idle");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState(() => new Set());
  const [errorMessage, setErrorMessage] = useState("");
  const selectedInterests = IDEA_INTERESTS.filter((interest) => selectedInterestIds.includes(interest.id));
  const primaryInterests = IDEA_INTERESTS.slice(0, PRIMARY_IDEA_INTEREST_COUNT);
  const moreInterests = IDEA_INTERESTS.slice(PRIMARY_IDEA_INTEREST_COUNT);
  const normalizedQuery = query.trim();
  const canFindIdeas = Boolean(destination.trim() && (selectedInterests.length || normalizedQuery));
  const selectedInterestLabels = selectedInterests.map((interest) => interest.label);
  const discoveryButtonLabel = getDiscoveryButtonLabel(selectedInterests, normalizedQuery);

  function resetDiscovery() {
    setStatus("idle");
    setSuggestions([]);
    setSelectedPlaceIds(new Set());
    setErrorMessage("");
  }

  function toggleInterest(interestId) {
    setSelectedInterestIds((current) => {
      const isSelected = current.includes(interestId);
      if (isSelected) {
        return current.filter((id) => id !== interestId);
      }
      if (current.length >= MAX_DISCOVERY_INTERESTS) {
        return current;
      }
      return [...current, interestId];
    });
    resetDiscovery();
  }

  function clearInterests() {
    setSelectedInterestIds([]);
    resetDiscovery();
  }

  function renderInterest(interest) {
    const isSelected = selectedInterestIds.includes(interest.id);
    const isUnavailable = !isSelected && selectedInterestIds.length >= MAX_DISCOVERY_INTERESTS;
    return (
      <button
        className={isSelected ? "is-selected" : ""}
        type="button"
        aria-pressed={isSelected}
        disabled={isUnavailable}
        key={interest.id}
        onClick={() => toggleInterest(interest.id)}
      >
        <img src={`${GENERIC_ICON_BASE}${interest.icon}`} alt="" aria-hidden="true" />
        {interest.label}
      </button>
    );
  }

  async function findIdeas() {
    if (!canFindIdeas) {
      return;
    }
    setStatus("loading");
    setErrorMessage("");
    setSelectedPlaceIds(new Set());
    try {
      const result = await searchPlaceSuggestionsCached({
        query: selectedInterests.length ? "" : normalizedQuery,
        intents: selectedInterests.map(({ id, query: interestQuery }) => ({ interestId: id, query: interestQuery })),
        refinement: normalizedQuery,
        destination,
        regionCodes: mapsProfile?.regionCodes ?? [],
        languageCode: mapsProfile?.languageCode ?? "en",
        limit: 8
      });
      setSuggestions(result.suggestions ?? []);
      setStatus("ready");
    } catch (error) {
      setSuggestions([]);
      setStatus("error");
      setErrorMessage(error?.message || "Could not find ideas right now.");
    }
  }

  function toggleSuggestion(placeId) {
    setSelectedPlaceIds((current) => {
      const next = new Set(current);
      if (next.has(placeId)) {
        next.delete(placeId);
      } else {
        next.add(placeId);
      }
      return next;
    });
  }

  function saveSelected() {
    const selected = suggestions
      .filter((suggestion) => selectedPlaceIds.has(suggestion.placeId))
      .map((suggestion) => ({
        ...suggestion,
        category: IDEA_INTERESTS.find((interest) => suggestion.interestIds?.includes(interest.id))?.category ?? "Culture"
      }));
    onSaveSuggestedIdeas(selected, "Culture");
  }

  return (
    <section className="ideas-welcome" aria-labelledby="ideas-welcome-title">
      <div className="ideas-welcome-intro">
        <img src={`${GENERIC_ICON_BASE}nav-ideas-generic.png`} alt="" aria-hidden="true" />
        <div>
          <span>Your trip starts with ideas</span>
          <h2 id="ideas-welcome-title">Find your first ideas</h2>
          <p>Choose up to three vibes, then optionally refine them for places around {destination || "your destination"}.</p>
        </div>
      </div>

      <div className="ideas-onboarding-step">
        <div className="ideas-step-heading">
          <span className="ideas-step-label">1 · Choose up to {MAX_DISCOVERY_INTERESTS} vibes</span>
          {selectedInterests.length ? <span className="ideas-selection-count">{selectedInterests.length} of {MAX_DISCOVERY_INTERESTS} selected <button className="text-button ideas-clear-interests" type="button" onClick={clearInterests}>Clear</button></span> : null}
        </div>
        <div className="ideas-interest-chips" aria-label="Idea interests">
          {primaryInterests.map(renderInterest)}
        </div>
        <details className="ideas-more-interests">
          <summary>
            <span className="ideas-more-interests-copy">
              <strong>More interests</strong>
              <small>Nature, nightlife, wellness, and more</small>
            </span>
            <span className="ideas-more-interests-action">
              <span>{moreInterests.length}</span>
              <ChevronDown size={17} aria-hidden="true" />
            </span>
          </summary>
          <div className="ideas-interest-chips ideas-more-interest-grid" aria-label="More idea interests">
            {moreInterests.map(renderInterest)}
          </div>
        </details>
      </div>

      <div className="ideas-onboarding-step">
        <span className="ideas-step-label">2 · Add something specific <em>(optional)</em></span>
        <div className="ideas-discovery-search">
          <label>
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">Refine your selected vibes</span>
            <input value={query} onChange={(event) => {
              setQuery(event.target.value);
              resetDiscovery();
            }} placeholder="Street food, architecture, quiet gardens..." onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                findIdeas();
              }
            }} />
          </label>
          <button className="primary-button" type="button" disabled={!canFindIdeas || status === "loading"} onClick={findIdeas}>
            {status === "loading" ? "Searching..." : discoveryButtonLabel}
          </button>
        </div>
      </div>

      {status === "error" ? (
        <div className="ideas-discovery-message is-error" role="alert">
          <span>{errorMessage}</span>
          <button className="ghost-button" type="button" onClick={findIdeas}><RefreshCcw size={15} />Retry</button>
        </div>
      ) : null}
      {status === "ready" && !suggestions.length ? (
        <div className="ideas-discovery-message"><span>No places matched yet. Try a broader interest or add your own idea.</span></div>
      ) : null}
      {suggestions.length ? (
        <div className="ideas-suggestion-results">
          <div className="ideas-suggestion-heading">
            <div>
              <strong>{selectedInterestLabels.length ? `${selectedInterestLabels.join(" + ")} near ${destination}` : `Places near ${destination}`}</strong>
              <small>Powered by Google</small>
            </div>
            <div className="ideas-suggestion-selection" aria-live="polite">
              <span>{selectedPlaceIds.size} selected</span>
            </div>
          </div>
          <div className="ideas-suggestion-grid">
            {suggestions.map((suggestion) => {
              const isSelected = selectedPlaceIds.has(suggestion.placeId);
              return (
                <button className={isSelected ? "is-selected" : ""} type="button" aria-pressed={isSelected} key={suggestion.placeId} onClick={() => toggleSuggestion(suggestion.placeId)}>
                  <span className="ideas-suggestion-icon"><MapPin size={17} aria-hidden="true" /></span>
                  <span className="ideas-suggestion-copy">
                    <strong>{suggestion.name}</strong>
                    <small>{suggestion.formattedAddress || destination}</small>
                    {suggestion.interestIds?.length ? (
                      <span className="ideas-suggestion-sources">
                        {getInterestSources(suggestion.interestIds).map((interest) => (
                          <span className={`ideas-suggestion-source ${CATEGORY_CONFIG[interest.category]?.className ?? "open"}`} key={interest.id}>
                            {interest.label}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  <span className="ideas-suggestion-check" aria-hidden="true">{isSelected ? <Check size={15} /> : null}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="ideas-welcome-actions">
        <button className="ghost-button" type="button" onClick={onAddIdea}><Plus size={16} />Add my own idea</button>
        <div className="ideas-welcome-actions-end">
          <button className="text-button" type="button" onClick={onDismiss}>Skip for now</button>
          {suggestions.length ? (
            <button className="primary-button ideas-save-suggestions" type="button" disabled={!selectedPlaceIds.size} onClick={saveSelected}>
              {selectedPlaceIds.size
                ? `Save ${selectedPlaceIds.size} ${selectedPlaceIds.size === 1 ? "idea" : "ideas"}`
                : "Save selected"}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function getDiscoveryButtonLabel(interests, refinement) {
  if (!interests.length) {
    return refinement ? "See ideas" : "See ideas";
  }
  const labels = interests.map((interest) => interest.label.toLowerCase());
  return `See ${labels.join(" + ")} ideas`;
}

function getInterestSources(interestIds) {
  return IDEA_INTERESTS
    .filter((interest) => interestIds.includes(interest.id));
}
function IdeaRow({ idea, tagAssets, currentTravelerName, isReactionPickerOpen, onEdit, onDelete, onToggleReactionPicker, onReact, onPromote }) {
  const config = getCategoryConfig(idea.category, tagAssets);
  const currentReaction = currentTravelerName ? getIdeaReaction(idea, currentTravelerName) : "";
  const reactionLabel = getReactionLabel(currentReaction);
  const reactionEmoji = getReactionEmoji(currentReaction);
  const reactionSummary = getIdeaReactionSummary(idea);
  const currentReactionSummary = currentReaction ? reactionSummary.find((reaction) => reaction.value === currentReaction) : null;
  const visibleReactionSummary = currentReaction
    ? reactionSummary.filter((reaction) => reaction.value !== currentReaction)
    : reactionSummary;
  const longPressTimerRef = useRef(null);
  const longPressOpenedRef = useRef(false);

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  function handleReactionPointerDown() {
    if (!currentTravelerName) {
      return;
    }
    longPressOpenedRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressOpenedRef.current = true;
      onToggleReactionPicker();
    }, 450);
  }

  function handleReactionPointerEnd() {
    clearLongPressTimer();
  }

  function handleReactionClick(event) {
    if (!currentTravelerName) {
      return;
    }
    if (longPressOpenedRef.current) {
      event.preventDefault();
      longPressOpenedRef.current = false;
      return;
    }
    onReact(currentReaction || "like");
  }

  function handleReactionContextMenu(event) {
    if (!currentTravelerName) {
      return;
    }
    event.preventDefault();
    clearLongPressTimer();
    onToggleReactionPicker();
  }

  return (
    <article className="idea-row">
      <button className={`idea-thumb category-${config.className}`} type="button" onClick={onEdit} aria-label={`Edit ${idea.title}`}>
        <TagIcon src={config.asset} size="thumb" />
      </button>
      <button className="idea-main" type="button" onClick={onEdit}>
        <strong>{idea.title}</strong>
        <small>{idea.city || "Japan"}</small>
      </button>
      <span className={`status-pill idea-status ${STATUS_CLASS[idea.status]}`}>
        <TagIcon src={getStatusAsset(idea.status, tagAssets)} size="tiny" />
        {idea.status}
      </span>
      <div className="idea-actions">
        <div className="idea-reaction-control">
          <button
            className={`reaction-button reaction-${currentReaction || "none"}${currentReactionSummary ? " has-count" : ""}`}
            type="button"
            disabled={!currentTravelerName}
            onPointerDown={handleReactionPointerDown}
            onPointerUp={handleReactionPointerEnd}
            onPointerCancel={handleReactionPointerEnd}
            onPointerLeave={handleReactionPointerEnd}
            onClick={handleReactionClick}
            onContextMenu={handleReactionContextMenu}
            aria-expanded={isReactionPickerOpen}
            aria-label={currentTravelerName ? `${reactionLabel} reaction` : "Link your traveler to react"}
            title={currentTravelerName ? `${reactionLabel} reaction` : "Link your traveler to react"}
          >
            <span className="reaction-emoji" aria-hidden="true">{reactionEmoji}</span>
            {currentReactionSummary ? <strong>{currentReactionSummary.count}</strong> : null}
          </button>
          {isReactionPickerOpen ? (
            <div className="reaction-menu" role="menu" aria-label={`Choose reaction for ${idea.title}`}>
              {REACTION_OPTIONS.map((reaction) => (
                <button
                  className={currentReaction === reaction.value ? "is-selected" : ""}
                  type="button"
                  role="menuitem"
                  key={reaction.value}
                  onClick={() => onReact(reaction.value)}
                  title={currentReaction === reaction.value ? `Remove ${reaction.label}` : reaction.label}
                >
                  <span aria-hidden="true">{reaction.emoji}</span>
                  <small>{reaction.label}</small>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {visibleReactionSummary.length ? (
          <div className="reaction-summary" aria-label={`Reactions for ${idea.title}`}>
            {visibleReactionSummary.map((reaction) => (
              <span className={`reaction-summary-chip reaction-${reaction.value}`} key={reaction.value} title={`${reaction.count} ${reaction.label}`}>
                <span aria-hidden="true">{reaction.emoji}</span>
                <strong>{reaction.count}</strong>
              </span>
            ))}
          </div>
        ) : null}
        <button className="promote-button" type="button" onClick={onPromote} aria-label={`Schedule ${idea.title}`} title={`Schedule ${idea.title}`}>
          <CalendarPlus size={18} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function normalizeReaction(value) {
  const reaction = String(value ?? "").trim().toLowerCase();
  const normalizedReaction = LEGACY_REACTION_VALUES[reaction] ?? reaction;
  return REACTION_ORDER.includes(normalizedReaction) ? normalizedReaction : "";
}

function normalizeIdeaReactions(idea, travelers = []) {
  const source = idea?.reactions ?? idea?.votes ?? {};
  const normalized = {};

  Object.entries(source).forEach(([traveler, reaction]) => {
    normalized[traveler] = normalizeReaction(reaction);
  });

  travelers.forEach((traveler) => {
    if (!(traveler in normalized)) {
      normalized[traveler] = "";
    }
  });

  return normalized;
}

function getIdeaReaction(idea, traveler) {
  return normalizeReaction((idea?.reactions ?? idea?.votes ?? {})[traveler]);
}

function getIdeaReactionSummary(idea) {
  const source = normalizeIdeaReactions(idea);
  const counts = Object.values(source).reduce((summary, reaction) => {
    const normalizedReaction = normalizeReaction(reaction);
    if (normalizedReaction) {
      summary[normalizedReaction] = (summary[normalizedReaction] ?? 0) + 1;
    }
    return summary;
  }, {});

  return REACTION_OPTIONS
    .map((reaction) => ({
      ...reaction,
      count: counts[reaction.value] ?? 0
    }))
    .filter((reaction) => reaction.count > 0);
}

function getReactionLabel(reaction, { emptyLabel = REACTION_LABELS[""] } = {}) {
  return reaction ? REACTION_LABELS[reaction] : emptyLabel;
}

function getReactionEmoji(reaction) {
  return REACTION_EMOJIS[reaction] ?? REACTION_EMOJIS[""];
}

export default IdeasSection;
