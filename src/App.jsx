import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import "sonner/dist/styles.css";
import {
  Bed,
  Bus,
  CalendarDays,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coffee,
  Copy,
  Download,
  ExternalLink,
  FileUp,
  Filter,
  Footprints,
  GripVertical,
  Info,
  Landmark,
  LogIn,
  LogOut,
  Luggage,
  Mail,
  MapPin,
  Minus,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCcw,
  ReceiptText,
  Route,
  ArrowRight,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Sun,
  Train,
  Trash2,
  Utensils,
  UserPlus,
  Users,
  X
} from "lucide-react";
import { CATEGORIES, buildCustomTrip, getTodayDate, makeInitialTrip, STATUSES } from "./data/tripData.js";
import { createPasswordUser } from "./lib/adminUsersRepository.js";
import { ensureUserProfile, getCurrentSession, onAuthSessionChange, sendMagicLink, signInWithPassword, signOut } from "./lib/auth.js";
import { acceptPendingTripInvite, acceptTripInvite, claimTripTraveler, createOwnTripTraveler, createTripInvite, listTripCollaboration, prepareInviteSession, revokeTripInvite, updateTripTravelerName } from "./lib/collaborationRepository.js";
import { clearTripExpenses, deleteTripExpense, listTripExpenses, saveTripExpense, subscribeToExpenseChanges } from "./lib/expenseRepository.js";
import { EXPENSE_SOURCE_TYPES, buildTravelerOptions, createExpenseDraft, prepareExpenseForSave } from "./lib/expenses.js";
import { downloadTripExport } from "./lib/export.js";
import { formatMajorAmount, formatMoney, parseMoneyValue, SUPPORTED_CURRENCIES } from "./lib/money.js";
import { isSupabaseConfigured } from "./lib/supabaseClient.js";
import { autocompletePlaceCached, loadMapsConfigCached, loadPlacePreviewCached, previewRouteCached, resolvePlace } from "./lib/mapsRepository.js";
import { mapCameraStorageKey, mapFitPadding, outsideViewportResultCount, readStoredMapCamera, resolveInitialMapCamera, selectInitialMapCluster, writeStoredMapCamera } from "./lib/mapCamera.js";
import { getMapEmptyState } from "./lib/mapEmptyState.js";
import { IDEAS_ONBOARDING_STATES, buildSuggestedIdeas, readIdeasOnboardingState, shouldShowIdeasWelcome, writeIdeasOnboardingState } from "./lib/onboarding.js";
import { CATEGORY_CLASS_NAMES } from "./lib/categoryPresentation.js";
import { buildDayCheck, isDayCheckItemMovable } from "./lib/dayRouteCheck.js";
import { isValidTrip, loadTrip, mergeIdeas } from "./lib/storage.js";
import {
  MIN_TIMELINE_DURATION_MINUTES as MIN_SCHEDULE_DURATION_MINUTES,
  TIMELINE_DAY_MINUTES as DAY_MINUTES,
  TIMELINE_END_MINUTES as TIME_GRID_END_MINUTES,
  TIMELINE_GRID_STEP_MINUTES as TIME_GRID_STEP_MINUTES,
  TIMELINE_INTERACTION_STEP_MINUTES as RESIZE_STEP_MINUTES,
  TIMELINE_START_MINUTES as TIME_GRID_START_MINUTES,
  buildTimeGridSlots,
  clampMinutes,
  getClampedTimelineDuration,
  getLatestTimelineStart,
  getStartTimeOptions,
  getTimelineSmartStartMinutes,
  isWithinTimelineRange,
  minutesToTimeInput,
  parseTimeToMinutes,
  snapTimelineMinutes,
  suggestNextTimelineStart,
  timeRangesOverlap
} from "./lib/timeline.js";
import { commitNewTripDay, createNewTripDayDraft, removeTripDayToIdeas } from "./lib/tripSettings.js";
import { createTripFromPayload, deleteTrip, listTrips, loadRemoteTrip, replaceTripPayload, subscribeToTripChanges } from "./lib/tripRepository.js";
import IdeasSection from "./features/ideas/IdeasSection.jsx";
import ExpensesSection from "./features/expenses/ExpensesSection.jsx";

const FILTER_TABS = ["All", "Booked", "Maybe"];
const CATEGORY_FILTERS = ["All", ...CATEGORIES];
const DAY_TIME_GRID_ROW_HEIGHT = 48;
const TRIP_TIME_GRID_ROW_HEIGHT = 60;
const TRIP_TIME_GRID_COMPACT_ROW_HEIGHT = 42;
const TRIP_TIME_GRID_TABLET_ROW_HEIGHT = 40;
const TRIP_TIME_GRID_PHONE_ROW_HEIGHT = 38;
const COMPACT_TIMELINE_QUERY = "(max-width: 1600px)";
const TABLET_TIMELINE_QUERY = "(max-width: 980px)";
const PHONE_TIMELINE_QUERY = "(max-width: 560px)";
const MOBILE_NAV_ITEMS = [
  { id: "trip", label: "Trip", iconSrc: "nav-day-generic.png" },
  { id: "ideas", label: "Ideas", iconSrc: "nav-ideas-generic.png" },
  { id: "map", label: "Map", iconSrc: "nav-map-generic.png" },
  { id: "expenses", label: "Expenses", iconSrc: "nav-expenses-generic.png" }
];
const ASSET_BASE = `${import.meta.env.BASE_URL}assets/`;
const ICON_BASE = `${import.meta.env.BASE_URL}assets/icons/`;
const FLAG_ASSET = `${ASSET_BASE}japan-flag-title.avif`;
const KUMI_PLANNER_LOGO_ASSET = `${ASSET_BASE}branding/kumi-planner-logo.png`;
const GENERIC_TRIP_MARK_ASSET = `${ICON_BASE}tag-priority-generic.png`;
const FOOTER_STRIP_ASSET = `${ASSET_BASE}japan-footer-strip.avif`;
const GENERIC_TRIP_COVER_ASSET = `${ASSET_BASE}trip-covers/generic-itinerary-cover.avif`;
const GENERIC_TRIP_NAV_ASSET = `${ICON_BASE}nav-trip-generic.png`;
const GENERIC_CALENDAR_ASSET = `${ICON_BASE}tag-calendar-generic.png`;
const GENERIC_FLEXIBLE_ASSET = `${ICON_BASE}tag-flexible-generic.png`;
const GOOGLE_MAPS_EMBED_KEY = import.meta.env.VITE_GOOGLE_MAPS_EMBED_KEY ?? "";
const GOOGLE_MAPS_BROWSER_KEY = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY ?? "";
const GOOGLE_MAPS_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? "";
const LOCAL_REALTIME_ECHO_SUPPRESSION_MS = 4000;
const PENDING_INVITE_TOKEN_KEY = "japan-2026-pending-invite-token:v1";
const SEEN_EXPENSE_IDS_KEY = "japan-2026-seen-expenses:v1";
const LAST_SELECTED_TRIP_KEY = "japan-2026-last-selected-trip:v1";
const MAP_SOURCE_FILTERS = ["All", "Ideas", "Scheduled"];
const MAP_LOCATION_FILTERS = ["Mapped", "Needs location", "All"];
const MAP_DEFAULT_FILTERS = {
  source: "All",
  dayId: "All",
  city: "All",
  category: "All",
  status: "All",
  location: "Mapped"
};
const EXCLUDED_MAP_CATEGORIES = new Set(["Transit"]);
const MAP_PROFILE_CENTERS = {
  global: { lat: 35.6764, lng: 139.65, zoom: 5 },
  japan: { lat: 35.6764, lng: 139.65, zoom: 6 },
  "mexico-city": { lat: 19.4326, lng: -99.1332, zoom: 11 }
};
const MAPS_PROFILES = {
  global: {
    id: "global",
    label: "Global",
    regionCode: "",
    regionCodes: [],
    countryName: "",
    languageCode: "en",
    timezone: "local",
    timezoneOffset: "",
    autocompleteHint: "Place results for this trip."
  },
  japan: {
    id: "japan",
    label: "Japan",
    regionCode: "JP",
    regionCodes: ["jp"],
    countryName: "Japan",
    languageCode: "en",
    timezone: "Asia/Tokyo",
    timezoneOffset: "+09:00",
    autocompleteHint: "Japan results for this trip."
  },
  mexicoCity: {
    id: "mexico-city",
    label: "Mexico City",
    regionCode: "MX",
    regionCodes: ["mx"],
    countryName: "Mexico",
    languageCode: "en",
    timezone: "America/Mexico_City",
    timezoneOffset: "-06:00",
    autocompleteHint: "Mexico City results for this trip."
  }
};
const COST_CURRENCY_OPTIONS = SUPPORTED_CURRENCIES;

const LazyPromoteIdeaModal = React.lazy(() => import("./features/ideas/PromoteIdeaModal.jsx"));
const LazyExpenseModal = React.lazy(() => import("./features/expenses/ExpenseModal.jsx"));
const LazyValidatedForm = React.lazy(() => import("./features/forms/ValidatedForm.jsx"));

const LazyPlannerGoogleMap = React.lazy(() =>
  import("@vis.gl/react-google-maps").then(({ APIProvider, Map, AdvancedMarker, useMap }) => {
    function PlannerMapCamera({ items, initialItems, fallbackCenter, storageKey, focusRequest = 0, isPhoneView = false, onOutsideResultsChange }) {
      const map = useMap();
      const initializedRef = useRef(false);
      const previousFocusRequestRef = useRef(focusRequest);

      useEffect(() => {
        if (!map || !window.google?.maps || initializedRef.current) {
          return;
        }
        initializedRef.current = true;
        const saved = readStoredMapCamera(storageKey);
        if (saved) {
          map.moveCamera({ center: { lat: saved.latitude, lng: saved.longitude }, zoom: saved.zoom, heading: saved.heading, tilt: saved.tilt });
        } else {
          focusMapItems(map, initialItems, fallbackCenter, mapFitPadding(isPhoneView));
        }
      }, [map, initialItems, fallbackCenter, storageKey, isPhoneView]);

      useEffect(() => {
        if (!map) {
          return;
        }
        let timer = 0;
        const listener = map.addListener("idle", () => {
          window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            const center = map.getCenter();
            if (center) {
              writeStoredMapCamera(storageKey, {
                latitude: center.lat(),
                longitude: center.lng(),
                zoom: map.getZoom() ?? fallbackCenter.zoom ?? 10,
                heading: map.getHeading() ?? 0,
                tilt: map.getTilt() ?? 0
              });
            }
            onOutsideResultsChange(countItemsOutsideViewport(map, items));
          }, 350);
        });
        return () => {
          window.clearTimeout(timer);
          listener.remove();
        };
      }, [map, items, fallbackCenter.zoom, storageKey, onOutsideResultsChange]);

      useEffect(() => {
        if (!map) {
          return;
        }
        onOutsideResultsChange(countItemsOutsideViewport(map, items));
      }, [map, items, onOutsideResultsChange]);

      useEffect(() => {
        if (!map || focusRequest === previousFocusRequestRef.current) {
          return;
        }
        previousFocusRequestRef.current = focusRequest;
        focusMapItems(map, items, fallbackCenter, mapFitPadding(isPhoneView));
        onOutsideResultsChange(0);
      }, [map, items, fallbackCenter, focusRequest, isPhoneView, onOutsideResultsChange]);

      return null;
    }

    function PlannerGoogleMap({ apiKey, mapId, items, initialItems = [], selectedItemId, routeSelectedItemIds = [], fallbackCenter, storageKey, focusRequest = 0, isPhoneView = false, onOutsideResultsChange, onSelectItem, onMapError }) {
      const storedCamera = readStoredMapCamera(storageKey);
      const initialCamera = resolveInitialMapCamera(storedCamera, initialItems, fallbackCenter);

      return (
        <APIProvider apiKey={apiKey} libraries={["marker"]} onError={onMapError}>
          <Map
            className="planner-map-canvas"
            defaultCenter={initialCamera.center}
            defaultZoom={initialCamera.zoom}
            defaultHeading={initialCamera.heading}
            defaultTilt={initialCamera.tilt}
            mapId={mapId}
            gestureHandling="greedy"
            mapTypeControl={!isPhoneView}
            fullscreenControl={!isPhoneView}
            streetViewControl={!isPhoneView}
            reuseMaps
          >
            <PlannerMapCamera
              items={items}
              initialItems={initialItems}
              fallbackCenter={fallbackCenter}
              storageKey={storageKey}
              focusRequest={focusRequest}
              isPhoneView={isPhoneView}
              onOutsideResultsChange={onOutsideResultsChange}
            />
            {items.map((item) => {
              const routeIndex = routeSelectedItemIds.indexOf(item.id);
              const isRouteSelected = routeIndex >= 0;
              return (
              <AdvancedMarker key={item.id} position={item.position} zIndex={selectedItemId === item.id || isRouteSelected ? 20 + routeIndex : 1} onClick={() => onSelectItem(item.id)}>
                <span
                  className={`planner-map-marker source-${item.source} category-${item.categoryClass}${selectedItemId === item.id ? " is-selected" : ""}${isRouteSelected ? " is-route-selected" : ""}`}
                  title={`${item.sourceLabel}: ${item.title}`}
                  aria-label={`${item.sourceLabel}: ${item.title}`}
                >
                  <img src={item.iconSrc} alt="" aria-hidden="true" draggable={false} />
                  {isRouteSelected ? <em aria-hidden="true">{routeIndex + 1}</em> : null}
                </span>
              </AdvancedMarker>
              );
            })}
          </Map>
        </APIProvider>
      );
    }

    return { default: PlannerGoogleMap };
  })
);

function focusMapItems(map, items = [], fallbackCenter, fitPadding = 72) {
  if (!map || !window.google?.maps) {
    return;
  }
  if (!items.length) {
    map.moveCamera({ center: { lat: fallbackCenter.lat, lng: fallbackCenter.lng }, zoom: fallbackCenter.zoom ?? 10 });
    return;
  }
  if (items.length === 1) {
    map.moveCamera({ center: items[0].position, zoom: 14 });
    return;
  }
  const bounds = new window.google.maps.LatLngBounds();
  items.forEach((item) => bounds.extend(item.position));
  map.fitBounds(bounds, fitPadding);
  window.google.maps.event.addListenerOnce(map, "idle", () => {
    if ((map.getZoom() ?? 0) > 13) {
      map.setZoom(13);
    }
  });
}

function countItemsOutsideViewport(map, items = []) {
  if (!items.length) {
    return 0;
  }
  const bounds = map?.getBounds?.();
  if (!bounds) {
    return 0;
  }
  return outsideViewportResultCount(items, (position) => bounds.contains(position));
}

function buildTagAssets(suffix = "") {
  return {
    category: {
      Food: `${ICON_BASE}tag-food${suffix}.png`,
      "Coffee/Bar": `${ICON_BASE}tag-coffee-bar${suffix}.png`,
      Culture: `${ICON_BASE}tag-culture${suffix}.png`,
      Transit: `${ICON_BASE}tag-transit${suffix}.png`,
      Hotel: `${ICON_BASE}tag-hotel${suffix}.png`,
      Shopping: `${ICON_BASE}tag-shopping${suffix}.png`,
      Nature: `${ICON_BASE}tag-nature-generic.png`,
      Nightlife: `${ICON_BASE}tag-nightlife-generic.png`,
      Wellness: `${ICON_BASE}tag-wellness-generic.png`,
      Entertainment: `${ICON_BASE}tag-entertainment-generic.png`,
      Family: `${ICON_BASE}tag-family-generic.png`,
      Adventure: `${ICON_BASE}tag-adventure-generic.png`,
      Sightseeing: `${ICON_BASE}tag-sightseeing-generic.png`,
      Markets: `${ICON_BASE}tag-market-generic.png`,
      Beauty: `${ICON_BASE}tag-beauty-generic.png`,
      "Work-friendly": `${ICON_BASE}tag-work-generic.png`,
      "Open Time": `${ICON_BASE}tag-open-time${suffix}.png`
    },
    status: {
      Booked: `${ICON_BASE}tag-booked${suffix}.png`,
      Maybe: `${ICON_BASE}tag-maybe${suffix}.png`,
      Skipped: `${ICON_BASE}tag-skipped${suffix}.png`
    },
    meta: {
      budget: `${ICON_BASE}tag-budget${suffix}.png`,
      calendar: `${ICON_BASE}tag-calendar${suffix}.png`,
      link: `${ICON_BASE}tag-link${suffix}.png`,
      map: `${ICON_BASE}tag-map-pin${suffix}.png`,
      notes: `${ICON_BASE}tag-notes${suffix}.png`,
      priority: `${ICON_BASE}tag-priority${suffix}.png`,
      reservation: `${ICON_BASE}tag-reservation${suffix}.png`
    }
  };
}

const TAG_ASSET_THEMES = {
  japan: buildTagAssets(""),
  generic: buildTagAssets("-generic")
};
const DEFAULT_TAG_ASSETS = TAG_ASSET_THEMES.japan;
const TagAssetsContext = React.createContext(DEFAULT_TAG_ASSETS);

const CATEGORY_CONFIG_BASE = {
  Food: { icon: Utensils, className: CATEGORY_CLASS_NAMES.Food, label: "Food", short: "Food" },
  "Coffee/Bar": { icon: Coffee, className: CATEGORY_CLASS_NAMES["Coffee/Bar"], label: "Coffee/Bar", short: "Cafe" },
  Culture: { icon: Landmark, className: CATEGORY_CLASS_NAMES.Culture, label: "Culture", short: "See" },
  Transit: { icon: Train, className: CATEGORY_CLASS_NAMES.Transit, label: "Transit", short: "Go" },
  Hotel: { icon: Bed, className: CATEGORY_CLASS_NAMES.Hotel, label: "Hotel", short: "Hotel" },
  Shopping: { icon: ShoppingBag, className: CATEGORY_CLASS_NAMES.Shopping, label: "Shopping", short: "Shop" },
  Nature: { icon: Clock3, className: CATEGORY_CLASS_NAMES.Nature, label: "Nature", short: "Nature" },
  Nightlife: { icon: Coffee, className: CATEGORY_CLASS_NAMES.Nightlife, label: "Nightlife", short: "Night" },
  Wellness: { icon: Clock3, className: CATEGORY_CLASS_NAMES.Wellness, label: "Wellness", short: "Wellness" },
  Entertainment: { icon: Landmark, className: CATEGORY_CLASS_NAMES.Entertainment, label: "Entertainment", short: "Fun" },
  Family: { icon: Clock3, className: CATEGORY_CLASS_NAMES.Family, label: "Family", short: "Family" },
  Adventure: { icon: Clock3, className: CATEGORY_CLASS_NAMES.Adventure, label: "Adventure", short: "Adventure" },
  Sightseeing: { icon: Landmark, className: CATEGORY_CLASS_NAMES.Sightseeing, label: "Sightseeing", short: "Sights" },
  Markets: { icon: ShoppingBag, className: CATEGORY_CLASS_NAMES.Markets, label: "Markets", short: "Markets" },
  Beauty: { icon: Sparkles, className: CATEGORY_CLASS_NAMES.Beauty, label: "Beauty", short: "Beauty" },
  "Work-friendly": { icon: Coffee, className: CATEGORY_CLASS_NAMES["Work-friendly"], label: "Work-friendly", short: "Work" },
  "Open Time": { icon: Clock3, className: CATEGORY_CLASS_NAMES["Open Time"], label: "Open Time", short: "Open" }
};

const STATUS_CLASS = {
  Proposed: "proposed",
  Maybe: "maybe",
  Booked: "booked",
  Skipped: "skipped"
};

const STAY_RAIL_COLORS = [
  { background: "#e8f4ff", backgroundSoft: "#f7fbff", border: "#86b8e8", text: "#175b93" },
  { background: "#f1ecff", backgroundSoft: "#fbf9ff", border: "#aa99ea", text: "#5b3f9b" },
  { background: "#eaf7ef", backgroundSoft: "#f8fdf9", border: "#8acb9f", text: "#2d7044" },
  { background: "#fff1dc", backgroundSoft: "#fffaf2", border: "#e0ad5e", text: "#875719" },
  { background: "#ffeaf0", backgroundSoft: "#fff8fa", border: "#de93a8", text: "#90435d" }
];

const DEFAULT_NEW_IDEA = {
  title: "",
  category: "Culture",
  city: "",
  status: "Proposed",
  notes: "",
  cost: "",
  link: "",
  mapLink: "",
  imageKey: ""
};

const DEFAULT_NEW_BLOCK = {
  itemKind: "activity",
  title: "",
  category: "Open Time",
  city: "",
  start: "10:00",
  duration: 60,
  status: "Proposed",
  notes: "",
  cost: "",
  link: "",
  mapLink: "",
  stayStartDayId: "",
  stayEndDayId: "",
  checkInTime: "",
  checkOutTime: ""
};

const STAY_KIND = "stay";
const ACTIVITY_KIND = "activity";
const HOTEL_CATEGORY = "Hotel";
const DEFAULT_CHECK_IN_TIME = "15:00";
const DEFAULT_CHECK_OUT_TIME = "11:00";

const REACTION_ORDER = ["", "like", "ok", "interesting", "pass"];
const REACTION_LABELS = {
  "": "React",
  like: "Like",
  ok: "Ok",
  interesting: "Interesting",
  pass: "Pass"
};
const REACTION_EMOJIS = {
  "": "♡",
  like: "👍",
  ok: "👌",
  interesting: "👀",
  pass: "😒"
};
const REACTION_OPTIONS = REACTION_ORDER.filter(Boolean).map((value) => ({
  value,
  label: REACTION_LABELS[value],
  emoji: REACTION_EMOJIS[value]
}));
const LEGACY_REACTION_VALUES = {
  maybe: "ok",
  love: "like"
};

const MODAL_DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"]';
const DIALOG_FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

const EMPTY_COLLABORATION = {
  members: [],
  travelers: [],
  invitations: []
};

function findPreferredOwnerTraveler(travelers, profileId) {
  const availableTravelers = (travelers ?? []).filter((traveler) => !traveler.profileId || traveler.profileId === profileId);
  return (
    availableTravelers.find((traveler) => String(traveler.name ?? "").trim().toLowerCase() === "me") ??
    availableTravelers[0] ??
    null
  );
}

function getAccountDisplayName(user, fallback = "") {
  const metadataName = user?.user_metadata?.display_name ?? user?.user_metadata?.name ?? "";
  const emailName = String(user?.email ?? "").split("@")[0];
  return String(fallback || metadataName || emailName || "Traveler").trim();
}

function isGenericTravelerName(name) {
  return ["me", "traveler"].includes(String(name ?? "").trim().toLowerCase());
}

function getInitialTripBoardMode() {
  if (typeof window !== "undefined" && window.matchMedia(PHONE_TIMELINE_QUERY).matches) {
    return "list";
  }

  return "calendar";
}

function getVisibleDialogFocusTargets(dialog) {
  return Array.from(dialog.querySelectorAll(DIALOG_FOCUSABLE_SELECTOR)).filter(
    (element) => element.getAttribute("aria-hidden") !== "true" && element.getClientRects().length > 0
  );
}

function useDialogAccessibility() {
  const activeDialogRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(() => {
    let focusFrame = 0;
    let scrollLock = null;

    function lockDocumentScroll() {
      if (scrollLock) {
        return;
      }

      const body = document.body;
      const root = document.documentElement;
      const { scrollX, scrollY } = window;
      const scrollbarWidth = Math.max(0, window.innerWidth - root.clientWidth);
      const computedBodyStyle = window.getComputedStyle(body);

      scrollLock = {
        scrollX,
        scrollY,
        bodyStyle: {
          left: body.style.left,
          overflow: body.style.overflow,
          paddingRight: body.style.paddingRight,
          position: body.style.position,
          right: body.style.right,
          top: body.style.top,
          width: body.style.width
        },
        rootOverflow: root.style.overflow
      };

      root.style.overflow = "hidden";
      body.style.overflow = "hidden";
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.left = `-${scrollX}px`;
      body.style.right = "0";
      body.style.width = "100%";
      if (scrollbarWidth) {
        body.style.paddingRight = `${parseFloat(computedBodyStyle.paddingRight) + scrollbarWidth}px`;
      }
    }

    function unlockDocumentScroll() {
      if (!scrollLock) {
        return;
      }

      const { bodyStyle, rootOverflow, scrollX, scrollY } = scrollLock;
      const body = document.body;
      const root = document.documentElement;

      root.style.overflow = rootOverflow;
      body.style.left = bodyStyle.left;
      body.style.overflow = bodyStyle.overflow;
      body.style.paddingRight = bodyStyle.paddingRight;
      body.style.position = bodyStyle.position;
      body.style.right = bodyStyle.right;
      body.style.top = bodyStyle.top;
      body.style.width = bodyStyle.width;
      scrollLock = null;
      window.scrollTo(scrollX, scrollY);
    }

    function getActiveDialog() {
      const dialogs = Array.from(document.querySelectorAll(MODAL_DIALOG_SELECTOR)).filter(
        (dialog) => dialog.getClientRects().length > 0
      );
      return dialogs.at(-1) ?? null;
    }

    function restoreTriggerFocus() {
      const trigger = returnFocusRef.current;
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus();
      }
      returnFocusRef.current = null;
    }

    function syncActiveDialog() {
      const nextDialog = getActiveDialog();
      if (nextDialog === activeDialogRef.current) {
        return;
      }

      cancelAnimationFrame(focusFrame);
      if (!nextDialog) {
        activeDialogRef.current = null;
        unlockDocumentScroll();
        restoreTriggerFocus();
        return;
      }

      if (!activeDialogRef.current) {
        returnFocusRef.current = document.activeElement;
      }
      lockDocumentScroll();
      activeDialogRef.current = nextDialog;
      if (!nextDialog.hasAttribute("tabindex")) {
        nextDialog.setAttribute("tabindex", "-1");
      }

      focusFrame = requestAnimationFrame(() => {
        if (!nextDialog.isConnected || nextDialog.contains(document.activeElement)) {
          return;
        }
        const focusTargets = getVisibleDialogFocusTargets(nextDialog);
        const initialTarget = nextDialog.querySelector("[autofocus], [data-dialog-initial-focus]") ?? focusTargets[0] ?? nextDialog;
        initialTarget.focus();
      });
    }

    function handleDialogKeyDown(event) {
      const dialog = activeDialogRef.current;
      if (!dialog || !dialog.isConnected) {
        return;
      }

      if (event.key === "Escape") {
        const closeButton = dialog.querySelector("[data-dialog-close]");
        if (closeButton instanceof HTMLElement) {
          event.preventDefault();
          closeButton.click();
        }
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusTargets = getVisibleDialogFocusTargets(dialog);
      if (!focusTargets.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstTarget = focusTargets[0];
      const lastTarget = focusTargets.at(-1);
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === firstTarget || !dialog.contains(activeElement))) {
        event.preventDefault();
        lastTarget.focus();
      } else if (!event.shiftKey && (activeElement === lastTarget || !dialog.contains(activeElement))) {
        event.preventDefault();
        firstTarget.focus();
      }
    }

    const observer = new MutationObserver(syncActiveDialog);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("keydown", handleDialogKeyDown, true);
    syncActiveDialog();

    return () => {
      cancelAnimationFrame(focusFrame);
      observer.disconnect();
      document.removeEventListener("keydown", handleDialogKeyDown, true);
      unlockDocumentScroll();
      restoreTriggerFocus();
    };
  }, []);
}

function App() {
  useDialogAccessibility();
  const [trip, setTrip] = useState(loadTrip);
  const [selectedDayId, setSelectedDayId] = useState(() => trip.days[0]?.id);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [tripSummaries, setTripSummaries] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [tripListStatus, setTripListStatus] = useState("idle");
  const [tripLoading, setTripLoading] = useState(false);
  const [tripLoaded, setTripLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [inviteToken, setInviteToken] = useState(() => getSearchParam("invite") || readPendingInviteToken());
  const [inviteOpenStatus, setInviteOpenStatus] = useState("idle");
  const [inviteAcceptStatus, setInviteAcceptStatus] = useState("idle");
  const [acceptedInviteTripId, setAcceptedInviteTripId] = useState(null);
  const [inviteWelcomeDismissedTripId, setInviteWelcomeDismissedTripId] = useState(null);
  const [collaboration, setCollaboration] = useState(EMPTY_COLLABORATION);
  const [collaborationStatus, setCollaborationStatus] = useState("idle");
  const [ownerTravelerLink, setOwnerTravelerLink] = useState({ tripId: null, status: "idle", message: "" });
  const [expenses, setExpenses] = useState([]);
  const [expensesStatus, setExpensesStatus] = useState("idle");
  const [seenExpenseIds, setSeenExpenseIds] = useState([]);
  const [isSharingOpen, setIsSharingOpen] = useState(false);
  const [latestInviteUrl, setLatestInviteUrl] = useState("");
  const [activeView, setActiveView] = useState("trip");
  const [hasVisitedIdeas, setHasVisitedIdeas] = useState(false);
  const [hasVisitedExpenses, setHasVisitedExpenses] = useState(false);
  const [tripBoardMode, setTripBoardMode] = useState(getInitialTripBoardMode);
  const [hasTripBoardModeChoice, setHasTripBoardModeChoice] = useState(false);
  const [dayViewMode, setDayViewMode] = useState("timeline");
  const [isDateRailCollapsed, setIsDateRailCollapsed] = useState(false);
  const [ideaTab, setIdeaTab] = useState("All");
  const [ideaPromotion, setIdeaPromotion] = useState(null);
  const [openReactionPickerId, setOpenReactionPickerId] = useState("");
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [editingIdea, setEditingIdea] = useState(null);
  const [editingExpense, setEditingExpense] = useState(null);
  const [editingDay, setEditingDay] = useState(null);
  const [editingDayMode, setEditingDayMode] = useState("edit");
  const [dayRemovalCandidate, setDayRemovalCandidate] = useState(null);
  const [isTripSettingsOpen, setIsTripSettingsOpen] = useState(false);
  const [isTripDeleteConfirmationOpen, setIsTripDeleteConfirmationOpen] = useState(false);
  const [isDeletingTrip, setIsDeletingTrip] = useState(false);
  const [tripSettingsSection, setTripSettingsSection] = useState("general");
  const [tripSettingsNameDraft, setTripSettingsNameDraft] = useState("");
  const [settingsReturnSection, setSettingsReturnSection] = useState("");
  const [ideasOnboardingState, setIdeasOnboardingState] = useState("");
  const [resolvingTarget, setResolvingTarget] = useState("");
  const [routePlanner, setRoutePlanner] = useState({
    isOpen: false,
    reviewSuggestion: false
  });
  const [pendingImport, setPendingImport] = useState(null);
  const fileInputRef = useRef(null);
  const pickerFileInputRef = useRef(null);
  const saveTimerRef = useRef(null);
  const saveInFlightRef = useRef(false);
  const pendingSaveSnapshotRef = useRef(null);
  const pendingAutoSaveSnapshotRef = useRef(null);
  const tripUpdatedAtRef = useRef(trip.updatedAt ?? "");
  const saveGenerationRef = useRef(0);
  const conflictReloadInFlightRef = useRef(false);
  const latestTripRef = useRef(trip);
  latestTripRef.current = trip;
  const realtimeTimerRef = useRef(null);
  const skipNextSaveRef = useRef(false);
  const pendingTripInitialViewRef = useRef(null);
  const localRealtimeSuppressionUntilRef = useRef(0);
  const acceptingInviteRef = useRef("");
  const openingInviteRef = useRef("");
  const sessionUserId = session?.user?.id ?? "";
  const isPhoneView = useMediaQueryMatch(PHONE_TIMELINE_QUERY);

  useEffect(() => {
    tripUpdatedAtRef.current = trip.updatedAt ?? "";
  }, [trip.updatedAt]);

  useEffect(() => {
    if (isPhoneView && !hasTripBoardModeChoice) {
      setTripBoardMode("list");
    }
  }, [hasTripBoardModeChoice, isPhoneView]);

  useEffect(() => {
    if (activeView === "day") {
      setActiveView("trip");
    }
  }, [activeView]);

  useEffect(() => {
    if (activeView === "ideas") {
      setHasVisitedIdeas(true);
    }
    if (activeView === "expenses") {
      setHasVisitedExpenses(true);
    }
  }, [activeView]);

  function handleTripBoardModeChange(mode) {
    setHasTripBoardModeChoice(true);
    setTripBoardMode(mode);
  }

  useEffect(() => {
    const urlInviteToken = getSearchParam("invite");
    const nextInviteToken = urlInviteToken || inviteToken;
    if (!nextInviteToken) {
      return;
    }

    writePendingInviteToken(nextInviteToken);
    if (urlInviteToken && urlInviteToken !== inviteToken) {
      setInviteToken(urlInviteToken);
    }
  }, [inviteToken]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthLoading(false);
      return undefined;
    }

    let isMounted = true;
    getCurrentSession()
      .then((currentSession) => {
        if (isMounted) {
          setSession(currentSession);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setAuthMessage(error.message);
        }
      })
      .finally(() => {
        if (isMounted) {
          setAuthLoading(false);
        }
      });

    const unsubscribe = onAuthSessionChange((event, nextSession) => {
      if (event === "SIGNED_OUT" || !nextSession) {
        clearLastSelectedTripId(getLastSelectedTripStorageKey(session?.user?.id));
        setSession(null);
        setSelectedTripId(null);
        setTripLoaded(false);
        setTripSummaries([]);
        setSyncStatus("idle");
        saveInFlightRef.current = false;
        pendingSaveSnapshotRef.current = null;
        setAcceptedInviteTripId(null);
        setInviteWelcomeDismissedTripId(null);
        setInviteOpenStatus("idle");
        setOwnerTravelerLink({ tripId: null, status: "idle", message: "" });
        return;
      }

      setSession((currentSession) => {
        const currentUserId = currentSession?.user?.id ?? "";
        const nextUserId = nextSession.user?.id ?? "";
        if (!currentSession || currentUserId !== nextUserId) {
          return nextSession;
        }
        return currentSession;
      });
    });

    return () => {
      isMounted = false;
      unsubscribe();
      window.clearTimeout(saveTimerRef.current);
      window.clearTimeout(realtimeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!sessionUserId) {
      return;
    }

    ensureUserProfile(session)
      .then(() => acceptPendingInviteAfterSignIn())
      .catch((error) => {
        if (isDeletedAuthSessionError(error)) {
          resetDeletedAuthSession();
          return;
        }
        setTripListStatus("error");
        showToast({ type: "error", message: error.message });
      });
  }, [sessionUserId, inviteToken]);

  useEffect(() => {
    if (authLoading || !inviteToken || openingInviteRef.current === inviteToken) {
      return;
    }

    let isCurrent = true;
    openingInviteRef.current = inviteToken;
    setInviteOpenStatus("loading");
    setInviteAcceptStatus("loading");
    setAuthMessage("Opening invite...");

    prepareInviteSession(inviteToken)
      .then(({ email }) => signInWithPassword(email, inviteToken))
      .then((nextSession) => {
        if (!isCurrent) {
          return;
        }
        setSession(nextSession);
        setInviteOpenStatus("signed-in");
        setAuthMessage("");
      })
      .catch((error) => {
        if (!isCurrent) {
          return;
        }
        openingInviteRef.current = "";
        setInviteOpenStatus("error");
        setInviteAcceptStatus("error");
        setAuthMessage(error.message);
      });

    return () => {
      isCurrent = false;
    };
  }, [authLoading, inviteToken]);

  useEffect(() => {
    if (!sessionUserId || !inviteToken || inviteOpenStatus !== "signed-in" || acceptingInviteRef.current === inviteToken) {
      return;
    }

    let isCurrent = true;
    acceptingInviteRef.current = inviteToken;
    setInviteAcceptStatus("loading");
    ensureUserProfile(session)
      .then(() => acceptTripInvite(inviteToken))
      .then(async (tripId) => {
        if (!isCurrent) {
          return;
        }
        clearSearchParam("invite");
        clearPendingInviteToken();
        acceptingInviteRef.current = "";
        openingInviteRef.current = "";
        setInviteToken("");
        setInviteOpenStatus("idle");
        setInviteAcceptStatus("accepted");
        setAcceptedInviteTripId(tripId ?? null);
        setInviteWelcomeDismissedTripId(null);
        if (tripId) {
          await refreshTripSummaries({ silent: true });
          selectTrip(tripId);
          setActiveView("trip");
          showToast({ type: "success", message: "Invite accepted" });
        }
      })
      .catch((error) => {
        if (isCurrent) {
          if (isDeletedAuthSessionError(error)) {
            acceptingInviteRef.current = "";
            resetDeletedAuthSession();
            return;
          }
          acceptingInviteRef.current = "";
          setInviteAcceptStatus("error");
          showToast({ type: "error", message: error.message });
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [inviteToken, sessionUserId]);

  const sortedDays = useMemo(() => deriveTripDays(trip.days), [trip.days]);
  const mapsProfile = useMemo(() => getTripMapsProfile(trip, sortedDays), [trip, sortedDays]);
  const tagAssets = useMemo(() => getTagAssetsForMapsProfile(mapsProfile), [mapsProfile.id]);
  const tripMarkAsset = useMemo(() => getTripMarkAssetForMapsProfile(mapsProfile), [mapsProfile.id]);
  const mapOverview = useMemo(() => buildPlannerMapItems(trip, sortedDays, tagAssets), [trip, sortedDays, tagAssets]);
  const missingLocationIdeaIds = useMemo(
    () => new Set(mapOverview.needsLocationItems.filter((item) => item.source === "idea").map((item) => item.sourceItem.id)),
    [mapOverview]
  );

  const selectedDay = useMemo(
    () => sortedDays.find((day) => day.id === selectedDayId) ?? sortedDays[0],
    [selectedDayId, sortedDays]
  );

  useEffect(() => {
    if (!selectedDay?.id) {
      return;
    }

    setRoutePlanner((current) => {
      if (current.dayId === selectedDay.id) {
        return current;
      }

      return {
        ...current,
        dayId: selectedDay.id,
        reviewSuggestion: false
      };
    });
  }, [selectedDay?.id]);

  useEffect(() => {
    if (!selectedDay && sortedDays[0]) {
      setSelectedDayId(sortedDays[0].id);
    }
  }, [selectedDay, sortedDays]);

  const sortedSchedule = useMemo(() => sortActivitySchedule(selectedDay?.schedule ?? []), [selectedDay]);
  const selectedDayStays = useMemo(() => getStaysForDay(selectedDay, sortedDays), [selectedDay, sortedDays]);
  const dayStats = useMemo(() => getDayStats(selectedDay), [selectedDay]);
  const dateRangeLabel = useMemo(() => formatTripRange(sortedDays), [sortedDays]);
  const currentMember = useMemo(
    () => collaboration.members.find((member) => member.profileId === sessionUserId),
    [collaboration.members, sessionUserId]
  );
  const accountDisplayName = useMemo(
    () => getAccountDisplayName(session?.user, currentMember?.displayName),
    [currentMember?.displayName, session?.user]
  );
  const currentTraveler = useMemo(
    () => collaboration.travelers.find((traveler) => traveler.profileId === sessionUserId),
    [collaboration.travelers, sessionUserId]
  );
  const currentTravelerName = currentTraveler?.name ?? "";
  const currentTravelerClientId = currentTraveler?.clientId ?? "";
  const canManageSharing = currentMember?.role === "owner";
  const canEditTrip = currentMember?.role !== "viewer";
  const canDeleteTrip = currentMember?.role === "owner";
  const needsTravelerIdentity = Boolean(
    sessionUserId &&
    selectedTripId &&
    tripLoaded &&
    collaboration.travelers.length &&
    collaborationStatus !== "loading" &&
    !currentTraveler
  );
  const ownerNeedsTravelerIdentity = needsTravelerIdentity && currentMember?.role === "owner";
  const ownerAutoLinkCanRecover = ownerTravelerLink.tripId === selectedTripId && ["error", "no-candidate"].includes(ownerTravelerLink.status);
  const showInviteWelcome = Boolean(
    acceptedInviteTripId &&
    acceptedInviteTripId === selectedTripId &&
    currentTraveler &&
    inviteWelcomeDismissedTripId !== selectedTripId
  );
  const showTravelerIdentityPrompt = Boolean(
    needsTravelerIdentity &&
    !isSharingOpen &&
    !showInviteWelcome &&
    (!ownerNeedsTravelerIdentity || ownerAutoLinkCanRecover)
  );
  const hasDialogOpen = Boolean(
    routePlanner.isOpen ||
    editingSchedule ||
    ideaPromotion ||
    editingIdea ||
    editingExpense ||
    editingDay ||
    dayRemovalCandidate ||
    isTripSettingsOpen ||
    isTripDeleteConfirmationOpen ||
    pendingImport ||
    isSharingOpen ||
    showInviteWelcome ||
    showTravelerIdentityPrompt
  );
  const peopleCount = collaboration.travelers.length || trip.travelers.length;
  const travelerOptions = useMemo(
    () => buildTravelerOptions(trip.travelers, collaboration.travelers),
    [trip.travelers, collaboration.travelers]
  );
  const expenseSeenStorageKey = useMemo(
    () => getSeenExpensesStorageKey(sessionUserId, selectedTripId),
    [sessionUserId, selectedTripId]
  );
  const lastSelectedTripStorageKey = useMemo(
    () => getLastSelectedTripStorageKey(sessionUserId),
    [sessionUserId]
  );

  useEffect(() => {
    setIdeasOnboardingState(readIdeasOnboardingState(sessionUserId, selectedTripId));
  }, [selectedTripId, sessionUserId]);
  const seenExpenseIdSet = useMemo(() => new Set(seenExpenseIds), [seenExpenseIds]);
  const expenseAttentionCount = useMemo(
    () => expenses.filter((expense) => !seenExpenseIdSet.has(getExpenseAttentionId(expense))).length,
    [expenses, seenExpenseIdSet]
  );
  const ideasAttentionCount = useMemo(
    () => trip.ideas.length,
    [trip.ideas]
  );
  const pendingInvitations = useMemo(
    () => collaboration.invitations.filter((invite) => invite.status === "pending"),
    [collaboration.invitations]
  );

  useEffect(() => {
    if (!sessionUserId || !selectedTripId) {
      setCollaboration(EMPTY_COLLABORATION);
      return;
    }

    let isCurrent = true;
    saveGenerationRef.current += 1;
    conflictReloadInFlightRef.current = false;
    pendingAutoSaveSnapshotRef.current = null;
    window.clearTimeout(saveTimerRef.current);
    setTripLoading(true);
    setTripLoaded(false);
    saveInFlightRef.current = false;
    pendingSaveSnapshotRef.current = null;
    setExpensesStatus("loading");
    setSyncStatus("loading");
    Promise.all([loadRemoteTrip(selectedTripId), listTripExpenses(selectedTripId)])
      .then(([remoteTrip, remoteExpenses]) => {
        if (!isCurrent) {
          return;
        }
        skipNextSaveRef.current = true;
        setTrip(remoteTrip);
        const remoteDays = deriveTripDays(remoteTrip.days);
        setSelectedDayId(remoteDays[0]?.id);
        const pendingInitialView = pendingTripInitialViewRef.current;
        const nextActiveView = pendingInitialView?.tripId === Number(selectedTripId)
          ? pendingInitialView.view
          : "trip";
        if (pendingInitialView?.tripId === Number(selectedTripId)) {
          pendingTripInitialViewRef.current = null;
        }
        setActiveView(nextActiveView);
        setTripBoardMode("calendar");
        setExpenses(remoteExpenses);
        setExpensesStatus("ready");
        setTripLoaded(true);
        setSyncStatus("synced");
      })
      .catch((error) => {
        if (isCurrent) {
          setSyncStatus("error");
          setExpensesStatus("error");
          showToast({ type: "error", message: error.message });
        }
      })
      .finally(() => {
        if (isCurrent) {
          setTripLoading(false);
        }
      });

    return () => {
      isCurrent = false;
      saveGenerationRef.current += 1;
      window.clearTimeout(saveTimerRef.current);
    };
  }, [selectedTripId, sessionUserId]);

  useEffect(() => {
    if (!sessionUserId || !selectedTripId || !tripLoaded) {
      setCollaboration(EMPTY_COLLABORATION);
      return;
    }

    refreshCollaboration({ silent: true });
  }, [selectedTripId, sessionUserId, tripLoaded]);

  useEffect(() => {
    setSeenExpenseIds([]);
  }, [expenseSeenStorageKey]);

  useEffect(() => {
    if (!expenseSeenStorageKey || expensesStatus !== "ready") {
      return;
    }

    const storedIds = readSeenExpenseIds(expenseSeenStorageKey);
    if (storedIds) {
      setSeenExpenseIds(storedIds);
      return;
    }

    const currentExpenseIds = expenses.map(getExpenseAttentionId).filter(Boolean);
    setSeenExpenseIds(currentExpenseIds);
    writeSeenExpenseIds(expenseSeenStorageKey, currentExpenseIds);
  }, [expenseSeenStorageKey, expensesStatus, expenses]);

  useEffect(() => {
    if (activeView !== "expenses" || !expenseSeenStorageKey || expensesStatus === "loading") {
      return;
    }

    const currentExpenseIds = expenses.map(getExpenseAttentionId).filter(Boolean);
    setSeenExpenseIds(currentExpenseIds);
    writeSeenExpenseIds(expenseSeenStorageKey, currentExpenseIds);
  }, [activeView, expenseSeenStorageKey, expensesStatus, expenses]);

  useEffect(() => {
    setOwnerTravelerLink({ tripId: selectedTripId, status: "idle", message: "" });
  }, [selectedTripId, sessionUserId]);

  useEffect(() => {
    if (!ownerNeedsTravelerIdentity || !selectedTripId || !sessionUserId) {
      return;
    }

    if (ownerTravelerLink.tripId === selectedTripId && ownerTravelerLink.status !== "idle") {
      return;
    }

    const targetTraveler = findPreferredOwnerTraveler(collaboration.travelers, sessionUserId);
    if (!targetTraveler) {
      setOwnerTravelerLink({
        tripId: selectedTripId,
        status: "no-candidate",
        message: "No available organizer traveler was found."
      });
      return;
    }

    let isCurrent = true;
    setOwnerTravelerLink({ tripId: selectedTripId, status: "linking", message: "" });
    claimTripTraveler(targetTraveler.id)
      .then(() => {
        if (isGenericTravelerName(targetTraveler.name) && accountDisplayName) {
          return updateTripTravelerName(targetTraveler.id, accountDisplayName);
        }
        return undefined;
      })
      .then(() => refreshCollaboration({ silent: true }))
      .then(() => {
        if (isCurrent) {
          setOwnerTravelerLink({ tripId: selectedTripId, status: "linked", message: "" });
        }
      })
      .catch((error) => {
        if (isCurrent) {
          setOwnerTravelerLink({ tripId: selectedTripId, status: "error", message: error.message });
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [accountDisplayName, ownerNeedsTravelerIdentity, selectedTripId, sessionUserId, ownerTravelerLink.tripId, ownerTravelerLink.status, collaboration.travelers]);

  useEffect(() => {
    if (!sessionUserId || !selectedTripId || !tripLoaded) {
      return undefined;
    }

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return undefined;
    }

    if (conflictReloadInFlightRef.current) {
      return undefined;
    }

    window.clearTimeout(saveTimerRef.current);
    setSyncStatus("saving");
    const snapshot = { ...trip, dateRangeLabel };
    pendingAutoSaveSnapshotRef.current = snapshot;
    saveTimerRef.current = window.setTimeout(() => {
      if (pendingAutoSaveSnapshotRef.current === snapshot) {
        pendingAutoSaveSnapshotRef.current = null;
      }
      queueTripSave(snapshot);
    }, 800);

    return () => {
      window.clearTimeout(saveTimerRef.current);
      if (pendingAutoSaveSnapshotRef.current === snapshot) {
        pendingAutoSaveSnapshotRef.current = null;
      }
    };
  }, [trip, dateRangeLabel, selectedTripId, sessionUserId, tripLoaded]);

  useEffect(() => {
    if (!sessionUserId || !selectedTripId || !tripLoaded) {
      return undefined;
    }

    let isCurrent = true;
    const handleRemoteChange = () => {
      if (isLocalRealtimeEcho() || hasUnsavedTripChanges()) {
        window.clearTimeout(realtimeTimerRef.current);
        return;
      }

      window.clearTimeout(realtimeTimerRef.current);
      realtimeTimerRef.current = window.setTimeout(() => {
        const generation = saveGenerationRef.current;
        const snapshot = latestTripRef.current;
        if (!isCurrent || hasUnsavedTripChanges()) return;
        Promise.all([loadRemoteTrip(selectedTripId), listTripExpenses(selectedTripId)])
          .then(([remoteTrip, remoteExpenses]) => {
            if (!isCurrent || generation !== saveGenerationRef.current || hasUnsavedTripChanges() || latestTripRef.current !== snapshot) return;
            skipNextSaveRef.current = true;
            setTrip(remoteTrip);
            setExpenses(remoteExpenses);
            setExpensesStatus("ready");
            setSyncStatus("synced");
            refreshCollaboration({ silent: true });
          })
          .catch((error) => {
            if (!isCurrent || generation !== saveGenerationRef.current) return;
            setSyncStatus("error");
            setExpensesStatus("error");
            showToast({ type: "error", message: error.message });
          });
      }, 1000);
    };

    const unsubscribeTrip = subscribeToTripChanges(selectedTripId, handleRemoteChange);
    const unsubscribeExpenses = subscribeToExpenseChanges(selectedTripId, handleRemoteChange);

    return () => {
      isCurrent = false;
      window.clearTimeout(realtimeTimerRef.current);
      unsubscribeTrip();
      unsubscribeExpenses();
    };
  }, [selectedTripId, sessionUserId, tripLoaded]);

  async function refreshTripSummaries({ silent = false } = {}) {
    if (!silent) {
      setTripListStatus("loading");
    }
    const summaries = await listTrips(session?.user?.id);
    setTripSummaries(summaries);
    setTripListStatus("ready");
    if (!selectedTripId && !inviteToken && lastSelectedTripStorageKey) {
      const lastTripId = readLastSelectedTripId(lastSelectedTripStorageKey);
      if (lastTripId && summaries.some((summary) => Number(summary.id) === lastTripId)) {
        setSelectedTripId(lastTripId);
      } else if (!lastTripId && summaries.length === 1) {
        selectTrip(summaries[0].id);
      } else if (lastTripId) {
        clearLastSelectedTripId(lastSelectedTripStorageKey);
      }
    }
    return summaries;
  }

  async function acceptPendingInviteAfterSignIn() {
    if (inviteToken) {
      await refreshTripSummaries();
      return;
    }

    setInviteAcceptStatus("loading");
    const tripId = await acceptPendingTripInvite();
    if (!tripId) {
      setInviteAcceptStatus("idle");
      await refreshTripSummaries();
      return;
    }

    clearPendingInviteToken();
    setInviteAcceptStatus("accepted");
    setAcceptedInviteTripId(tripId);
    setInviteWelcomeDismissedTripId(null);
    await refreshTripSummaries({ silent: true });
    selectTrip(tripId);
    setActiveView("trip");
    showToast({ type: "success", message: "Invite accepted" });
  }

  function selectTrip(tripId) {
    const nextTripId = Number(tripId);
    if (!nextTripId) {
      return;
    }

    setSelectedTripId(nextTripId);
    writeLastSelectedTripId(lastSelectedTripStorageKey, nextTripId);
  }

  function openTripPicker() {
    pendingTripInitialViewRef.current = null;
    setSelectedTripId(null);
    setTripLoaded(false);
    setTripLoading(false);
    setSyncStatus("idle");
    setCollaboration(EMPTY_COLLABORATION);
    clearLastSelectedTripId(lastSelectedTripStorageKey);
  }

  async function refreshCollaboration({ silent = false } = {}) {
    if (!selectedTripId) {
      setCollaboration(EMPTY_COLLABORATION);
      return;
    }

    if (!silent) {
      setCollaborationStatus("loading");
    }

    try {
      const nextCollaboration = await listTripCollaboration(selectedTripId);
      setCollaboration(nextCollaboration);
      setCollaborationStatus("ready");
    } catch (error) {
      setCollaborationStatus("error");
      showToast({ type: "error", message: error.message });
    }
  }

  async function refreshExpenses({ silent = false } = {}) {
    if (!selectedTripId) {
      setExpenses([]);
      return [];
    }

    if (!silent) {
      setExpensesStatus("loading");
    }

    try {
      const nextExpenses = await listTripExpenses(selectedTripId);
      setExpenses(nextExpenses);
      setExpensesStatus("ready");
      return nextExpenses;
    } catch (error) {
      setExpensesStatus("error");
      showToast({ type: "error", message: error.message });
      return expenses;
    }
  }

  async function handleCreateInvite(inviteDraft) {
    if (!selectedTripId || !session?.user) {
      return false;
    }

    try {
      const invite = await createTripInvite({
        tripId: selectedTripId,
        email: inviteDraft.email,
        role: inviteDraft.role,
        invitedBy: session.user.id
      });
      setLatestInviteUrl(invite.inviteUrl);
      await refreshCollaboration({ silent: true });
      showToast({ type: "success", message: "Invite created" });
      return true;
    } catch (error) {
      showToast({ type: "error", message: error.message });
      return false;
    }
  }

  async function handleRevokeInvite(inviteId) {
    try {
      await revokeTripInvite(inviteId);
      await refreshCollaboration({ silent: true });
      showToast({ type: "success", message: "Invite revoked" });
    } catch (error) {
      showToast({ type: "error", message: error.message });
    }
  }

  async function handleCreatePasswordUser(userDraft) {
    if (!selectedTripId) {
      return false;
    }

    try {
      const result = await createPasswordUser({
        tripId: selectedTripId,
        email: userDraft.email,
        password: userDraft.password,
        displayName: userDraft.displayName,
        role: userDraft.role
      });
      await refreshCollaboration({ silent: true });
      showToast({ type: "success", message: `${result.email} can sign in with password` });
      return true;
    } catch (error) {
      showToast({ type: "error", message: error.message });
      return false;
    }
  }

  async function handleClaimTraveler(travelerId) {
    try {
      await claimTripTraveler(travelerId);
      await refreshCollaboration({ silent: true });
      showToast({ type: "success", message: "Traveler linked" });
    } catch (error) {
      showToast({ type: "error", message: error.message });
    }
  }

  async function handleRenameTraveler(travelerId, name) {
    if (!selectedTripId) {
      return false;
    }

    const nextName = String(name ?? "").trim();
    if (!nextName) {
      showToast({ type: "error", message: "Enter a traveler name." });
      return false;
    }

    try {
      await updateTripTravelerName(travelerId, nextName);
      const [remoteTrip, nextCollaboration] = await Promise.all([
        loadRemoteTrip(selectedTripId),
        listTripCollaboration(selectedTripId)
      ]);
      skipNextSaveRef.current = true;
      setTrip(remoteTrip);
      setCollaboration(nextCollaboration);
      showToast({ type: "success", message: "Traveler name updated" });
      return true;
    } catch (error) {
      showToast({ type: "error", message: error.message });
      return false;
    }
  }

  async function handleCreateOwnTraveler() {
    if (!selectedTripId) {
      return;
    }

    try {
      await createOwnTripTraveler({ tripId: selectedTripId, name: accountDisplayName });
      const [remoteTrip, nextCollaboration] = await Promise.all([
        loadRemoteTrip(selectedTripId),
        listTripCollaboration(selectedTripId)
      ]);
      skipNextSaveRef.current = true;
      setTrip(remoteTrip);
      setCollaboration(nextCollaboration);
      showToast({ type: "success", message: "Traveler created" });
    } catch (error) {
      showToast({ type: "error", message: error.message });
    }
  }

  async function handleInviteWelcomeContinue(name) {
    if (!currentTraveler || !selectedTripId) {
      setInviteWelcomeDismissedTripId(selectedTripId);
      return;
    }

    const nextName = String(name ?? "").trim();
    if (!nextName) {
      showToast({ type: "error", message: "Enter your name to continue." });
      return;
    }

    try {
      if (nextName !== currentTraveler.name) {
        await updateTripTravelerName(currentTraveler.id, nextName);
        const [remoteTrip, nextCollaboration] = await Promise.all([
          loadRemoteTrip(selectedTripId),
          listTripCollaboration(selectedTripId)
        ]);
        skipNextSaveRef.current = true;
        setTrip(remoteTrip);
        setCollaboration(nextCollaboration);
        setCollaborationStatus("ready");
      }
      setInviteWelcomeDismissedTripId(selectedTripId);
    } catch (error) {
      showToast({ type: "error", message: error.message });
    }
  }

  async function copyLatestInvite() {
    if (!latestInviteUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(latestInviteUrl);
      showToast({ type: "success", message: "Invite link copied" });
    } catch {
      showToast({ type: "info", message: "Copy the invite link manually" });
    }
  }

  async function handleMagicLinkSubmit(event) {
    event.preventDefault();
    if (!authEmail.trim()) {
      return;
    }

    setAuthMessage("Sending magic link...");
    try {
      await sendMagicLink(authEmail.trim());
      setAuthMessage("Check your email for the sign-in link.");
    } catch (error) {
      setAuthMessage(error.message);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    if (!authEmail.trim() || !authPassword) {
      return;
    }

    setAuthMessage("Signing in...");
    try {
      if (inviteToken) {
        writePendingInviteToken(inviteToken);
      }
      const nextSession = await signInWithPassword(authEmail.trim(), authPassword);
      setSession(nextSession);
      setAuthPassword("");
      setAuthMessage("");
    } catch (error) {
      setAuthMessage(error.message);
    }
  }

  async function recoverFromInviteError() {
    clearSearchParam("invite");
    clearPendingInviteToken();
    openingInviteRef.current = "";
    acceptingInviteRef.current = "";
    setInviteToken("");
    setInviteOpenStatus("idle");
    setInviteAcceptStatus("idle");
    setAuthMessage("");

    if (!session?.user) {
      return;
    }

    try {
      await refreshTripSummaries();
    } catch (error) {
      setAuthMessage(error.message);
    }
  }

  async function handleSignOut() {
    try {
      clearLastSelectedTripId(lastSelectedTripStorageKey);
      await signOut();
      setSession(null);
      setSelectedTripId(null);
      setTripLoaded(false);
      setSyncStatus("idle");
      saveInFlightRef.current = false;
      pendingSaveSnapshotRef.current = null;
    } catch (error) {
      showToast({ type: "error", message: error.message });
    }
  }

  async function resetDeletedAuthSession() {
    try {
      clearLastSelectedTripId(lastSelectedTripStorageKey);
      await signOut();
    } catch {
      // If the remote auth user was deleted, local session cleanup is the important part.
    }

    setSession(null);
    setSelectedTripId(null);
    setTripLoaded(false);
    setTripSummaries([]);
    setTripListStatus("idle");
    setSyncStatus("idle");
    saveInFlightRef.current = false;
    pendingSaveSnapshotRef.current = null;
    setInviteAcceptStatus("idle");
    setInviteOpenStatus("idle");
    setAuthMessage("That previous sign-in was cleared. Open the invite link again.");
  }

  async function createTrip(payload, { initialView = "trip", startIdeasOnboarding = false } = {}) {
    if (!session?.user) {
      return;
    }

    setTripListStatus("loading");
    try {
      const nextTripId = await createTripFromPayload({ ...payload, dateRangeLabel: formatTripRange(deriveTripDays(payload.days)) }, session.user.id, getAccountDisplayName(session.user));
      await refreshTripSummaries({ silent: true });
      if (startIdeasOnboarding) {
        writeIdeasOnboardingState(session.user.id, nextTripId, IDEAS_ONBOARDING_STATES.PENDING);
        setIdeasOnboardingState(IDEAS_ONBOARDING_STATES.PENDING);
      }
      if (initialView !== "trip") {
        pendingTripInitialViewRef.current = { tripId: Number(nextTripId), view: initialView };
      }
      selectTrip(nextTripId);
      setActiveView(initialView);
      showToast({ type: "success", message: "Trip created" });
    } catch (error) {
      setTripListStatus("error");
      showToast({ type: "error", message: error.message });
    }
  }

  function createGuidedTrip(formValues) {
    const payload = buildCustomTrip({
      name: formValues.name,
      startDate: formValues.startDate,
      endDate: formValues.endDate,
      city: formValues.city,
      travelers: [getAccountDisplayName(session?.user)]
    });
    return createTrip(payload, { initialView: "ideas", startIdeasOnboarding: true });
  }

  function createJapanTemplateTrip() {
    createTrip(makeInitialTrip());
  }

  function handlePickerImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!isValidTrip(parsed)) {
          showToast({ type: "error", message: "Import file is not valid" });
          return;
        }
        createTrip(parsed);
      } catch {
        showToast({ type: "error", message: "Import file could not be read" });
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function updateTripDetails(changes) {
    setTrip((current) => ({ ...current, ...changes }));
  }

  function openTripSettings(section = "general") {
    setTripSettingsNameDraft(trip.name ?? "");
    setTripSettingsSection(section);
    setIsTripSettingsOpen(true);
  }

  function closeTripSettings() {
    setTripSettingsNameDraft(trip.name ?? "");
    setIsTripSettingsOpen(false);
  }

  function saveTripSettingsGeneral() {
    const nextName = tripSettingsNameDraft.trim();
    if (!nextName) return;
    updateTripDetails({ name: nextName });
    setTripSettingsNameDraft(nextName);
    showToast({ type: "success", message: "Trip settings saved" });
  }

  function returnToTripSettings() {
    if (!settingsReturnSection) return;
    const nextSection = settingsReturnSection;
    setSettingsReturnSection("");
    openTripSettings(nextSection);
  }

  function cancelDayEditing() {
    setEditingDay(null);
    setEditingDayMode("edit");
    returnToTripSettings();
  }

  function openPeopleFromSettings() {
    setSettingsReturnSection("people");
    setIsTripSettingsOpen(false);
    setIsSharingOpen(true);
  }

  function closePeopleDialog() {
    setIsSharingOpen(false);
    returnToTripSettings();
  }

  function importFromSettings() {
    setIsTripSettingsOpen(false);
    fileInputRef.current?.click();
  }

  function resetFromSettings() {
    setIsTripSettingsOpen(false);
    void resetPlanner();
  }

  function requestTripDeletion() {
    if (!canDeleteTrip) {
      showToast({ type: "error", message: "Only the trip owner can delete this trip." });
      return;
    }
    setIsTripSettingsOpen(false);
    setIsTripDeleteConfirmationOpen(true);
  }

  function cancelTripDeletion() {
    setIsTripDeleteConfirmationOpen(false);
    openTripSettings("data");
  }

  async function confirmTripDeletion() {
    if (!selectedTripId || !canDeleteTrip || isDeletingTrip) {
      return;
    }

    setIsDeletingTrip(true);
    window.clearTimeout(saveTimerRef.current);
    pendingSaveSnapshotRef.current = null;
    try {
      const deletedTripName = trip.name;
      await deleteTrip({
        tripId: selectedTripId,
        ownerId: sessionUserId,
        expectedName: deletedTripName
      });
      setIsTripDeleteConfirmationOpen(false);
      openTripPicker();
      await refreshTripSummaries({ silent: true });
      showToast({ type: "success", message: `${deletedTripName} deleted` });
    } catch (error) {
      showToast({ type: "error", message: error.message });
    } finally {
      setIsDeletingTrip(false);
    }
  }

  function updateDay(dayId, updater) {
    setTrip((current) => ({
      ...current,
      days: current.days.map((day) => (day.id === dayId ? updater(day) : day))
    }));
  }

  function suppressLocalRealtimeEcho() {
    localRealtimeSuppressionUntilRef.current = Date.now() + LOCAL_REALTIME_ECHO_SUPPRESSION_MS;
  }

  function isLocalRealtimeEcho() {
    return Date.now() < localRealtimeSuppressionUntilRef.current;
  }

  function hasUnsavedTripChanges() {
    return saveInFlightRef.current || pendingSaveSnapshotRef.current || pendingAutoSaveSnapshotRef.current || conflictReloadInFlightRef.current;
  }

  function queueTripSave(snapshot) {
    if (!selectedTripId || conflictReloadInFlightRef.current) {
      return;
    }

    pendingSaveSnapshotRef.current = snapshot;
    if (saveInFlightRef.current) {
      return;
    }

    flushQueuedTripSave();
  }

  function flushQueuedTripSave() {
    if (!selectedTripId || !pendingSaveSnapshotRef.current) {
      saveInFlightRef.current = false;
      return;
    }

    const generation = saveGenerationRef.current;
    const snapshot = pendingSaveSnapshotRef.current;
    const expectedUpdatedAt = tripUpdatedAtRef.current || snapshot.updatedAt;
    pendingSaveSnapshotRef.current = null;
    saveInFlightRef.current = true;
    suppressLocalRealtimeEcho();
    replaceTripPayload(selectedTripId, snapshot, expectedUpdatedAt)
      .then((updatedAt) => {
        if (generation !== saveGenerationRef.current) return;
        if (updatedAt) {
          tripUpdatedAtRef.current = updatedAt;
        }
        suppressLocalRealtimeEcho();
        if (pendingSaveSnapshotRef.current) {
          flushQueuedTripSave();
          return;
        }
        saveInFlightRef.current = false;
        setSyncStatus(pendingAutoSaveSnapshotRef.current ? "saving" : "saved");
        refreshTripSummaries({ silent: true });
      })
      .catch((error) => {
        if (generation !== saveGenerationRef.current) return;
        saveInFlightRef.current = false;
        localRealtimeSuppressionUntilRef.current = 0;
        if (isTripVersionConflict(error)) {
          void reloadTripAfterConflict();
          return;
        }
        setSyncStatus("error");
        showToast({ type: "error", message: error.message });
      });
  }

  function isTripVersionConflict(error) {
    return error?.code === "40001" || /changed elsewhere|version is required/i.test(error?.message ?? "");
  }

  async function reloadTripAfterConflict() {
    if (!selectedTripId || conflictReloadInFlightRef.current) {
      return;
    }

    const generation = saveGenerationRef.current;
    conflictReloadInFlightRef.current = true;
    window.clearTimeout(saveTimerRef.current);
    pendingSaveSnapshotRef.current = null;
    pendingAutoSaveSnapshotRef.current = null;
    try {
      const [remoteTrip, remoteExpenses] = await Promise.all([
        loadRemoteTrip(selectedTripId),
        listTripExpenses(selectedTripId)
      ]);
      if (generation !== saveGenerationRef.current) return;
      const unsavedDraft = { ...latestTripRef.current, dateRangeLabel };
      tripUpdatedAtRef.current = remoteTrip.updatedAt ?? "";
      skipNextSaveRef.current = true;
      setTrip(remoteTrip);
      setExpenses(remoteExpenses);
      setExpensesStatus("ready");
      setSyncStatus("synced");
      toast.message("The saved trip has changed. Kumi loaded the latest version; your unsaved draft is available to download before reapplying your edits.", {
        duration: Infinity,
        action: { label: "Download draft", onClick: () => downloadTripExport(unsavedDraft) }
      });
    } catch (error) {
      if (generation !== saveGenerationRef.current) return;
      const unsavedDraft = { ...latestTripRef.current, dateRangeLabel };
      setSyncStatus("error");
      toast.error(error.message, {
        duration: Infinity,
        action: { label: "Download draft", onClick: () => downloadTripExport(unsavedDraft) }
      });
    } finally {
      if (generation === saveGenerationRef.current) conflictReloadInFlightRef.current = false;
    }
  }

  function showToast({ type = "info", message }) {
    if (!message) {
      return;
    }
    if (type === "success") {
      toast.success(message);
      return;
    }
    if (type === "error") {
      toast.error(message);
      return;
    }
    toast.message(message);
  }

  function addTripDay({ returnToSettings = false } = {}) {
    const newDay = createNewTripDayDraft(sortedDays);
    setEditingDayMode("new");
    setSettingsReturnSection(returnToSettings ? "days" : "");
    setIsTripSettingsOpen(false);
    setEditingDay(newDay);
  }

  function saveTripDay(dayDraft) {
    const normalizedDay = {
      ...dayDraft,
      label: dayDraft.label?.trim() ?? "",
      city: (dayDraft.city ?? "").trim(),
      notes: dayDraft.notes ?? "",
      baseMapLink: normalizeGoogleMapsUrlInput(dayDraft.baseMapLink),
      basePlace: dayDraft.basePlace ?? null
    };
    setTrip((current) => editingDayMode === "new"
      ? commitNewTripDay(current, normalizedDay)
      : {
          ...current,
          days: current.days.map((day) => day.id === normalizedDay.id ? { ...day, ...normalizedDay } : day)
        });
    setSelectedDayId(normalizedDay.id);
    setEditingDay(null);
    setEditingDayMode("edit");
    showToast({ type: "success", message: editingDayMode === "new" ? "Day added" : "Day updated" });
    returnToTripSettings();
  }

  function openTripDayDetails(dayId) {
    const day = sortedDays.find((candidate) => candidate.id === dayId);
    if (!day) {
      return;
    }

    setSelectedDayId(day.id);
    setEditingDayMode("edit");
    setSettingsReturnSection("");
    setEditingDay(day);
  }

  function editTripDayFromSettings(day) {
    setEditingDayMode("edit");
    setSettingsReturnSection("days");
    setIsTripSettingsOpen(false);
    setEditingDay(day);
  }

  function openRoutePlannerForDay(dayId) {
    const day = sortedDays.find((candidate) => candidate.id === dayId);
    if (!day) {
      return;
    }

    setSelectedDayId(day.id);
    setRoutePlanner({
      isOpen: true,
      reviewSuggestion: false,
      dayId: day.id
    });
  }

  function requestTripDayRemoval(day, { returnToSettings = false } = {}) {
    if (!day || sortedDays.length <= 1) return;
    setEditingDay(null);
    setIsTripSettingsOpen(false);
    setSettingsReturnSection(returnToSettings ? "days" : settingsReturnSection);
    setDayRemovalCandidate(day);
  }

  function confirmTripDayRemoval() {
    if (!dayRemovalCandidate) return;
    const result = removeTripDayToIdeas(trip, dayRemovalCandidate.id);
    if (!result.removed) {
      setDayRemovalCandidate(null);
      return;
    }
    setTrip(result.trip);
    setSelectedDayId(result.nextDayId);
    setIdeaPromotion((currentPromotion) => currentPromotion?.dayId === dayRemovalCandidate.id
      ? { ...currentPromotion, dayId: result.nextDayId }
      : currentPromotion);
    setDayRemovalCandidate(null);
    showToast({
      type: "success",
      message: result.movedCount ? `Day removed · ${result.movedCount} ${result.movedCount === 1 ? "activity" : "activities"} moved to Ideas` : "Day removed"
    });
    void repointScheduleExpensesToIdeas(result.expenseSourceMappings);
    returnToTripSettings();
  }

  function saveScheduleItem(dayId, item, consumedIdeaId) {
    const targetDay = sortedDays.find((day) => day.id === dayId);
    if (!targetDay) {
      return false;
    }

    const isStay = isStayItem(item);
    const isExistingActivity = Boolean(targetDay?.schedule.some((scheduleItem) => scheduleItem.id === item.id));
    const nextDuration = Math.max(MIN_SCHEDULE_DURATION_MINUTES, Number(item.duration) || DEFAULT_NEW_BLOCK.duration);
    if (!isStay && !isScheduleSlotAvailable(targetDay.schedule, item.id, item.start, nextDuration)) {
      showToast({ type: "error", message: "That time overlaps another activity or sits outside the timeline." });
      return false;
    }

    setTrip((current) => {
      const targetDay = current.days.find((day) => day.id === dayId);
      if (!targetDay) {
        return current;
      }

      const exists = targetDay.schedule.some((scheduleItem) => scheduleItem.id === item.id);
      const nextItem = {
        ...item,
        title: item.title.trim() || "Untitled plan",
        city: item.city.trim() || targetDay.city,
        duration: isStay ? Math.max(MIN_SCHEDULE_DURATION_MINUTES, Number(item.duration) || DEFAULT_NEW_BLOCK.duration) : nextDuration
      };

      return {
        ...current,
        days: current.days.map((day) => {
          if (day.id !== dayId) {
            return day;
          }

          return {
            ...day,
            schedule: exists
              ? day.schedule.map((scheduleItem) => (scheduleItem.id === item.id ? nextItem : scheduleItem))
              : [...day.schedule, nextItem]
          };
        }),
        ideas: consumedIdeaId ? current.ideas.filter((idea) => idea.id !== consumedIdeaId) : current.ideas
      };
    });
    setEditingSchedule(null);
    showToast({
      type: "success",
      message: consumedIdeaId ? "Added to itinerary" : isExistingActivity ? "Activity updated" : isStay ? "Hotel stay added" : "Activity added"
    });
    return true;
  }

  function deleteScheduleItem(dayId, itemId) {
    updateDay(dayId, (day) => ({
      ...day,
      schedule: day.schedule.filter((item) => item.id !== itemId)
    }));
    setEditingSchedule(null);
    showToast({ type: "success", message: "Activity deleted" });
  }

  async function repointScheduleExpensesToIdeas(sourceMappings = []) {
    const ideaIdByScheduleItemId = new Map(sourceMappings.map(({ scheduleItemId, ideaId }) => [scheduleItemId, ideaId]));
    const linkedExpenses = expenses.filter((expense) => (
      expense.sourceType === EXPENSE_SOURCE_TYPES.SCHEDULE_ITEM && ideaIdByScheduleItemId.has(expense.sourceClientId)
    ));
    if (!linkedExpenses.length) {
      return;
    }

    const nextLocalExpenses = expenses.map((expense) => {
      const ideaId = ideaIdByScheduleItemId.get(expense.sourceClientId);
      return expense.sourceType === EXPENSE_SOURCE_TYPES.SCHEDULE_ITEM && ideaId
        ? { ...expense, sourceType: EXPENSE_SOURCE_TYPES.IDEA, sourceClientId: ideaId }
        : expense;
    });
    setExpenses(nextLocalExpenses);

    if (!selectedTripId) {
      return;
    }

    try {
      setExpensesStatus("saving");
      suppressLocalRealtimeEcho();
      let nextExpenses = nextLocalExpenses;
      for (const expense of linkedExpenses) {
        const ideaId = ideaIdByScheduleItemId.get(expense.sourceClientId);
        nextExpenses = await saveTripExpense(
          selectedTripId,
          prepareExpenseForSave({ ...expense, sourceType: EXPENSE_SOURCE_TYPES.IDEA, sourceClientId: ideaId }, travelerOptions)
        );
      }
      suppressLocalRealtimeEcho();
      setExpenses(nextExpenses);
      setExpensesStatus("ready");
    } catch (error) {
      localRealtimeSuppressionUntilRef.current = 0;
      setExpensesStatus("error");
      showToast({ type: "error", message: "Moved to Ideas, but the linked expense could not be updated." });
    }
  }

  function repointScheduleExpensesToIdea(scheduleItemId, ideaId) {
    return repointScheduleExpensesToIdeas([{ scheduleItemId, ideaId }]);
  }

  function moveScheduleItemToIdeas(dayId, itemId) {
    const sourceDay = sortedDays.find((day) => day.id === dayId);
    const sourceItem = sourceDay?.schedule?.find((item) => item.id === itemId);
    if (!sourceDay || !sourceItem) {
      return;
    }

    const movedIdea = createIdeaFromScheduleItem(sourceItem, sourceDay, sortedDays, trip.travelers);
    setTrip((current) => ({
      ...current,
      days: current.days.map((day) =>
        day.id === dayId
          ? { ...day, schedule: day.schedule.filter((item) => item.id !== itemId) }
          : day
      ),
      ideas: [movedIdea, ...current.ideas]
    }));
    setEditingSchedule(null);
    setActiveView("ideas");
    setIdeaTab("All");
    showToast({ type: "success", message: "Moved back to Ideas" });
    void repointScheduleExpensesToIdea(itemId, movedIdea.id);
  }

  async function resolveTripPlace({ targetType, targetClientId, dayId, placeId, sessionToken, displayNameHint, mapLink, query, title, city, silent = false, throwOnError = false }) {
    if (!selectedTripId) {
      const message = "Open a Supabase trip before resolving places.";
      if (!silent) {
        showToast({ type: "error", message });
      }
      if (throwOnError) {
        throw new Error(message);
      }
      return null;
    }

    const targetKey = getResolveTargetKey(targetType, targetClientId);
    setResolvingTarget(targetKey);
    try {
      suppressLocalRealtimeEcho();
      const normalizedMapLink = normalizeGoogleMapsUrlInput(mapLink);
      const result = await resolvePlace({
        tripId: selectedTripId,
        targetType,
        targetClientId,
        placeId,
        sessionToken,
        displayNameHint,
        mapLink: normalizedMapLink,
        query,
        title,
        city,
        regionCode: mapsProfile.regionCode,
        countryName: mapsProfile.countryName,
        languageCode: mapsProfile.languageCode
      });
      const place = result.place;
      setTrip((current) => applyResolvedPlace(current, { targetType, targetClientId, dayId, mapLink: normalizedMapLink }, place));
      if (!silent) {
        showToast({ type: "success", message: "Google Maps place resolved" });
      }
      return place;
    } catch (error) {
      if (!silent) {
        showToast({ type: "error", message: error.message });
      }
      if (throwOnError) {
        throw error;
      }
      return null;
    } finally {
      setResolvingTarget("");
    }
  }

  function applyDayCheckSuggestion(suggestion) {
    if (!suggestion?.canApply || !suggestion.sourceDayId || !suggestion.targetDayId || !suggestion.itemId) {
      showToast({ type: "info", message: "This suggestion is advice only for now." });
      return;
    }

    const sourceDay = sortedDays.find((day) => day.id === suggestion.sourceDayId);
    const targetDay = sortedDays.find((day) => day.id === suggestion.targetDayId);
    const sourceItem = sourceDay?.schedule?.find((item) => item.id === suggestion.itemId);
    if (!sourceDay || !targetDay || !sourceItem) {
      showToast({ type: "error", message: "That suggested move is no longer available." });
      return;
    }

    if (!isDayCheckItemMovable(sourceItem)) {
      showToast({ type: "info", message: "Transfers, stays, and booked activities stay fixed on their current day." });
      return;
    }

    const duration = Math.max(MIN_SCHEDULE_DURATION_MINUTES, Number(sourceItem.duration) || MIN_SCHEDULE_DURATION_MINUTES);
    const targetStart = findAvailableScheduleStart(targetDay.schedule ?? [], duration);
    if (!targetStart) {
      showToast({ type: "error", message: "Could not find a clear open slot for that change." });
      return;
    }

    const movedItem = {
      ...sourceItem,
      start: targetStart,
      city: sourceItem.city || targetDay.city
    };

    setTrip((current) => {
      const currentSourceDay = current.days.find((day) => day.id === sourceDay.id);
      const currentTargetDay = current.days.find((day) => day.id === targetDay.id);
      if (!currentSourceDay || !currentTargetDay || !currentSourceDay.schedule?.some((item) => item.id === sourceItem.id)) {
        return current;
      }

      if (!isScheduleSlotAvailable(currentTargetDay.schedule ?? [], sourceItem.id, targetStart, duration)) {
        return current;
      }

      return {
        ...current,
        days: current.days.map((day) => {
          if (day.id === sourceDay.id) {
            return { ...day, schedule: (day.schedule ?? []).filter((item) => item.id !== sourceItem.id) };
          }
          if (day.id === targetDay.id) {
            return { ...day, schedule: sortSchedule([...(day.schedule ?? []), movedItem]) };
          }
          return day;
        })
      };
    });

    setRoutePlanner((current) => ({ ...current, isOpen: false, reviewSuggestion: false }));
    showToast({ type: "success", message: "Suggested change applied" });
  }

  function moveScheduleItem(sourceDayId, itemId, targetDayId, targetStart) {
    const sourceDay = trip.days.find((day) => day.id === sourceDayId);
    const targetDay = trip.days.find((day) => day.id === targetDayId);
    const sourceItem = sourceDay?.schedule.find((item) => item.id === itemId);
    if (!sourceDay || !targetDay || !sourceItem || !targetStart) {
      return;
    }

    const duration = Number(sourceItem.duration) || TIME_GRID_STEP_MINUTES;
    if (!isScheduleSlotAvailable(targetDay.schedule, itemId, targetStart, duration)) {
      return;
    }

    if (sourceDayId === targetDayId && sourceItem.start === targetStart) {
      return;
    }

    const movedItem = {
      ...sourceItem,
      start: targetStart,
      city: sourceItem.city || targetDay.city
    };
    const nextTrip = {
      ...trip,
      days: trip.days.map((day) => {
        if (sourceDayId === targetDayId && day.id === sourceDayId) {
          return {
            ...day,
            schedule: day.schedule.map((item) => (item.id === itemId ? movedItem : item))
          };
        }

        if (day.id === sourceDayId) {
          return { ...day, schedule: day.schedule.filter((item) => item.id !== itemId) };
        }

        if (day.id === targetDayId) {
          return { ...day, schedule: [...day.schedule, movedItem] };
        }

        return day;
      })
    };

    setTrip(nextTrip);
  }

  function resizeScheduleItem(dayId, itemId, nextStart, nextDuration) {
    const targetDay = trip.days.find((day) => day.id === dayId);
    const targetItem = targetDay?.schedule.find((item) => item.id === itemId);
    if (!targetDay || !targetItem || !nextStart) {
      return;
    }

    const duration = Math.max(MIN_SCHEDULE_DURATION_MINUTES, Number(nextDuration) || MIN_SCHEDULE_DURATION_MINUTES);
    if (!isScheduleSlotAvailable(targetDay.schedule, itemId, nextStart, duration)) {
      return;
    }

    if (targetItem.start === nextStart && Number(targetItem.duration) === duration) {
      return;
    }

    const resizedItem = {
      ...targetItem,
      start: nextStart,
      duration
    };
    const nextTrip = {
      ...trip,
      days: trip.days.map((day) => {
        if (day.id !== dayId) {
          return day;
        }

        return {
          ...day,
          schedule: day.schedule.map((item) => (item.id === itemId ? resizedItem : item))
        };
      })
    };

    setTrip(nextTrip);
  }

  function openNewScheduleModal() {
    const fallbackDay = selectedDay ?? sortedDays[0];
    if (!fallbackDay) {
      return;
    }
    openNewScheduleModalForDay(fallbackDay.id);
  }

  function openNewScheduleModalForDay(dayId, startTime) {
    const targetDay = sortedDays.find((day) => day.id === dayId) ?? selectedDay ?? sortedDays[0];
    if (!targetDay) {
      return;
    }

    setEditingSchedule({
      mode: "new",
      dayId: targetDay.id,
      item: {
        ...DEFAULT_NEW_BLOCK,
        id: `sched-${Date.now()}`,
        city: targetDay.city,
        start: startTime ?? (findAvailableScheduleStart(targetDay.schedule, DEFAULT_NEW_BLOCK.duration) || suggestNextTimelineStart(targetDay.schedule, DEFAULT_NEW_BLOCK.duration))
      }
    });
  }

  function openNewIdeaModal() {
    setEditingIdea({
      ...DEFAULT_NEW_IDEA,
      id: `idea-${Date.now()}`,
      reactions: Object.fromEntries(trip.travelers.map((name) => [name, ""])),
      _mode: "new"
    });
  }

  function setIdeasOnboarding(nextState) {
    writeIdeasOnboardingState(sessionUserId, selectedTripId, nextState);
    setIdeasOnboardingState(nextState);
  }

  function completeIdeasOnboarding() {
    if (ideasOnboardingState === IDEAS_ONBOARDING_STATES.PENDING) {
      setIdeasOnboarding(IDEAS_ONBOARDING_STATES.COMPLETED);
    }
  }

  function saveSuggestedIdeas(suggestions, category) {
    const result = buildSuggestedIdeas({
      suggestions,
      existingIdeas: trip.ideas,
      category,
      destination: trip.days[0]?.city ?? "",
      travelers: trip.travelers
    });
    if (!result.addedIdeas.length) {
      showToast({ type: "info", message: "Those places are already in Ideas" });
      return 0;
    }

    setTrip((current) => {
      const next = buildSuggestedIdeas({
        suggestions,
        existingIdeas: current.ideas,
        category,
        destination: current.days[0]?.city ?? "",
        travelers: current.travelers
      });
      return next.addedIdeas.length ? { ...current, ideas: next.ideas } : current;
    });
    setIdeasOnboarding(IDEAS_ONBOARDING_STATES.COMPLETED);
    showToast({ type: "success", message: `${result.addedIdeas.length} ${result.addedIdeas.length === 1 ? "idea" : "ideas"} added — syncing` });
    return result.addedIdeas.length;
  }

  function saveIdea(idea) {
    const normalizedIdea = {
      ...idea,
      title: idea.title.trim() || "Untitled idea",
      city: idea.city?.trim() ?? "",
      notes: idea.notes?.trim() ?? "",
      cost: idea.cost?.trim() ?? "",
      link: idea.link?.trim() ?? "",
      mapLink: normalizeGoogleMapsUrlInput(idea.mapLink)
    };
    delete normalizedIdea._mode;
    delete normalizedIdea.votes;
    normalizedIdea.reactions = normalizeIdeaReactions(normalizedIdea, trip.travelers);

    setTrip((current) => ({
      ...current,
      ideas: current.ideas.some((currentIdea) => currentIdea.id === idea.id)
        ? current.ideas.map((currentIdea) => (currentIdea.id === idea.id ? normalizedIdea : currentIdea))
        : [normalizedIdea, ...current.ideas]
    }));
    if (idea._mode === "new") {
      completeIdeasOnboarding();
    }
    setEditingIdea(null);
    showToast({ type: "success", message: idea._mode === "new" ? "Idea added — syncing" : "Idea updated — syncing" });
  }

  function deleteIdea(ideaId) {
    setTrip((current) => ({
      ...current,
      ideas: current.ideas.filter((idea) => idea.id !== ideaId)
    }));
    setEditingIdea(null);
  }

  function setIdeaReaction(ideaId, reaction) {
    if (!currentTravelerName) {
      return;
    }

    setTrip((current) => ({
      ...current,
      ideas: current.ideas.map((idea) => {
        if (idea.id !== ideaId) {
          return idea;
        }
        const reactions = normalizeIdeaReactions(idea, current.travelers);
        const currentReaction = reactions[currentTravelerName] ?? "";
        const nextReaction = currentReaction === reaction ? "" : normalizeReaction(reaction);
        return { ...idea, reactions: { ...reactions, [currentTravelerName]: nextReaction } };
      })
    }));
    setOpenReactionPickerId("");
  }

  function openIdeaPromotion(idea) {
    setIdeaPromotion({ idea, dayId: sortedDays[0]?.id ?? "" });
  }

  function addIdeaToSchedule(dayId, idea, preferredStart) {
    const targetDay = sortedDays.find((day) => day.id === dayId) ?? selectedDay;
    if (!targetDay) {
      return false;
    }

    const scheduleItem = createScheduleItemFromIdea(idea, targetDay, sortedDays, preferredStart);
    setSelectedDayId(targetDay.id);
    return saveScheduleItem(targetDay.id, scheduleItem, idea.id);
  }

  function promoteIdeaToDay(idea, dayId) {
    const targetDay = sortedDays.find((day) => day.id === dayId) ?? selectedDay;
    if (!targetDay) {
      return;
    }

    setSelectedDayId(targetDay.id);
    setIdeaPromotion(null);
    setEditingSchedule({
      mode: "new",
      dayId: targetDay.id,
      consumedIdeaId: idea.id,
      item: createScheduleItemFromIdea(idea, targetDay, sortedDays)
    });
  }

  function exportTrip() {
    downloadTripExport({ ...trip, dateRangeLabel });
    showToast({ type: "info", message: "Trip export downloaded" });
  }

  function openManualExpense() {
    setEditingExpense({
      mode: "new",
      expense: createExpenseDraft({
        travelers: travelerOptions,
        currentTravelerClientId
      })
    });
  }

  function openTrackedExpense(source) {
    setEditingExpense({
      mode: "new",
      expense: createExpenseDraft({
        source,
        travelers: travelerOptions,
        currentTravelerClientId
      })
    });
  }

  function openEditExpense(expense) {
    setEditingExpense({ mode: "edit", expense });
  }

  async function saveExpense(expense) {
    if (!selectedTripId) {
      return;
    }

    const preparedExpense = prepareExpenseForSave(expense, travelerOptions);
    try {
      setExpensesStatus("saving");
      suppressLocalRealtimeEcho();
      const nextExpenses = await saveTripExpense(selectedTripId, preparedExpense);
      suppressLocalRealtimeEcho();
      setExpenses(nextExpenses);
      setExpensesStatus("ready");
      setEditingExpense(null);
      showToast({ type: "success", message: editingExpense?.mode === "edit" ? "Expense updated" : "Expense tracked" });
    } catch (error) {
      localRealtimeSuppressionUntilRef.current = 0;
      setExpensesStatus("error");
      showToast({ type: "error", message: error.message });
    }
  }

  async function removeExpense(expenseClientId) {
    if (!selectedTripId || !expenseClientId) {
      return;
    }

    try {
      setExpensesStatus("saving");
      suppressLocalRealtimeEcho();
      const nextExpenses = await deleteTripExpense(selectedTripId, expenseClientId);
      suppressLocalRealtimeEcho();
      setExpenses(nextExpenses);
      setExpensesStatus("ready");
      setEditingExpense(null);
      showToast({ type: "success", message: "Expense deleted" });
    } catch (error) {
      localRealtimeSuppressionUntilRef.current = 0;
      setExpensesStatus("error");
      showToast({ type: "error", message: error.message });
    }
  }

  async function clearCurrentTripExpenses() {
    if (!selectedTripId || !expenses.length) {
      setExpenses([]);
      return true;
    }

    try {
      setExpensesStatus("saving");
      suppressLocalRealtimeEcho();
      await clearTripExpenses(selectedTripId);
      suppressLocalRealtimeEcho();
      setExpenses([]);
      setExpensesStatus("ready");
      return true;
    } catch (error) {
      localRealtimeSuppressionUntilRef.current = 0;
      setExpensesStatus("error");
      showToast({ type: "error", message: error.message });
      return false;
    }
  }

  function handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!isValidTrip(parsed)) {
          showToast({ type: "error", message: "Import file is not valid" });
          return;
        }
        setPendingImport(parsed);
      } catch {
        showToast({ type: "error", message: "Import file could not be read" });
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  async function replaceWithImport() {
    const didClearExpenses = await clearCurrentTripExpenses();
    if (!didClearExpenses) {
      return;
    }

    setTrip(pendingImport);
    const importedDays = deriveTripDays(pendingImport.days);
    setSelectedDayId(importedDays[0]?.id);
    setActiveView("trip");
    setTripBoardMode("calendar");
    setPendingImport(null);
    showToast({ type: "success", message: "Planner imported" });
  }

  function mergeImportIdeas() {
    setTrip((current) => mergeIdeas(current, pendingImport));
    setPendingImport(null);
    showToast({ type: "success", message: "Ideas imported" });
  }

  async function resetPlanner() {
    if (!window.confirm("Reset this trip by clearing its ideas, schedule, and expenses? The trip name and days will stay editable.")) {
      return;
    }
    const didClearExpenses = await clearCurrentTripExpenses();
    if (!didClearExpenses) {
      return;
    }

    const resetTrip = {
      ...trip,
      days: sortedDays.map((day) => ({
        ...day,
        schedule: []
      })),
      ideas: [],
      updatedAt: new Date().toISOString()
    };
    setTrip(resetTrip);
    setSelectedDayId(sortedDays[0]?.id);
    setActiveView("trip");
    setTripBoardMode("calendar");
    showToast({ type: "success", message: "Planner reset" });
  }

  if (!isSupabaseConfigured) {
    return <ConfigState title="Supabase needs environment variables" message="Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the Vite dev server." />;
  }

  if (authLoading) {
    return <ConfigState title="Checking session" message="Restoring your Supabase session..." />;
  }

  if (inviteToken && inviteOpenStatus === "error") {
    return (
      <ConfigState
        title="Invite could not be opened"
        message={authMessage || "This invite link could not be opened. You can still sign in with your email."}
        actionLabel="Continue to sign in"
        onAction={recoverFromInviteError}
      />
    );
  }

  if (inviteToken && (!session || inviteOpenStatus === "loading")) {
    return <ConfigState title="Opening invite" message="Using the invite link to open the shared trip..." />;
  }

  if (!session) {
    return (
      <AuthScreen
        email={authEmail}
        password={authPassword}
        message={authMessage}
        onEmailChange={setAuthEmail}
        onPasswordChange={setAuthPassword}
        onSubmit={handleMagicLinkSubmit}
        onPasswordSubmit={handlePasswordSubmit}
      />
    );
  }

  if (session && inviteAcceptStatus === "loading") {
    return <ConfigState title="Accepting invite" message="Linking this trip to your account..." />;
  }

  if (session && inviteToken && inviteAcceptStatus === "error") {
    return (
      <ConfigState
        title="Invite could not be accepted"
        message={authMessage || "This invite link could not be accepted. You can continue to the trips already linked to this account."}
        actionLabel="Continue to my trips"
        onAction={recoverFromInviteError}
      />
    );
  }

  if (!selectedTripId) {
    return (
      <TripPicker
        email={session.user.email}
        trips={tripSummaries}
        status={tripListStatus}
        pickerFileInputRef={pickerFileInputRef}
        onRefresh={() => refreshTripSummaries()}
        onSelect={selectTrip}
        onCreateTrip={createGuidedTrip}
        onCreateJapanTemplate={createJapanTemplateTrip}
        onImportFile={handlePickerImportFile}
        onSignOut={handleSignOut}
      />
    );
  }

  if (tripLoading && !tripLoaded) {
    return <ConfigState title="Loading trip" message="Pulling the latest planner from Supabase..." />;
  }

  return (
    <TagAssetsContext.Provider value={tagAssets}>
    <div className={`app-shell is-${activeView}-view${hasDialogOpen ? " has-dialog-open" : ""}`}>
      <header className="topbar">
        <div className="brand-block">
          <img className="title-flag" src={tripMarkAsset} alt="" aria-hidden="true" />
          <div className="trip-name-wrap">
            <strong className="trip-title-display">{trip.name}</strong>
            <p>{dateRangeLabel}</p>
          </div>
        </div>

        <ViewSwitcher activeView={activeView} ideasCount={ideasAttentionCount} mapCount={mapOverview.needsLocationItems.length} expensesCount={expenseAttentionCount} onChange={setActiveView} />

        <div className="topbar-actions">
          <span className={`sync-badge is-${syncStatus}`} role="status" aria-live="polite" aria-atomic="true">
            {formatSyncStatus(syncStatus)}
          </span>
          <button className="ghost-button topbar-trips-button" type="button" aria-label="All trips" title="All trips" onClick={openTripPicker}>
            <Luggage size={17} />
            <span>Trips</span>
          </button>
          <button className="icon-button" type="button" aria-label={`People, ${peopleCount}`} title="People" onClick={() => setIsSharingOpen(true)}>
            <Users size={17} />
            <span className="people-count-badge" aria-hidden="true">{peopleCount}</span>
          </button>
          <button className="icon-button" type="button" aria-label="Trip settings" title="Trip settings" onClick={() => openTripSettings()}>
            <Settings size={17} />
          </button>
          <input ref={fileInputRef} className="file-input" type="file" accept="application/json" onChange={handleImportFile} />
        </div>
      </header>

      <Toaster richColors position="top-right" closeButton />

      <main className={`planner-grid is-${activeView}-view ${activeView === "day" && isDateRailCollapsed ? "is-rail-collapsed" : ""}`}>
        <DateRail
          days={sortedDays}
          hidden={activeView !== "day"}
          selectedDayId={selectedDay?.id}
          isCollapsed={isDateRailCollapsed}
          onToggleCollapsed={() => setIsDateRailCollapsed((isCollapsed) => !isCollapsed)}
          onSelect={(dayId) => {
            setSelectedDayId(dayId);
            setActiveView("day");
          }}
          onAddDay={() => addTripDay()}
        />

        <DayTimeline
          day={selectedDay}
          hidden={activeView !== "day"}
          sortedSchedule={sortedSchedule}
          stays={selectedDayStays}
          stats={dayStats}
          mode={dayViewMode}
          allIdeas={trip.ideas}
          ideasCount={trip.ideas.length}
          onAdd={openNewScheduleModal}
          onEdit={(item, dayId = selectedDay.id) => setEditingSchedule({ mode: "edit", dayId, item })}
          onScheduleMove={moveScheduleItem}
          onScheduleResize={resizeScheduleItem}
          onDayChange={(updater) => updateDay(selectedDay.id, updater)}
          onEditDay={() => setEditingDay(selectedDay)}
          onOpenIdeas={() => setActiveView("ideas")}
          onRoutePlannerChange={setRoutePlanner}
          onModeChange={setDayViewMode}
        />

        <AllTripBoard
          days={sortedDays}
          hidden={activeView !== "trip"}
          mode={tripBoardMode}
          dateRangeLabel={dateRangeLabel}
          onModeChange={handleTripBoardModeChange}
          onOpenDay={(dayId) => {
            setSelectedDayId(dayId);
            setActiveView("day");
          }}
          onCheckDay={openRoutePlannerForDay}
          onScheduleMove={moveScheduleItem}
          onScheduleResize={resizeScheduleItem}
          onAddScheduleAt={openNewScheduleModalForDay}
          onEditSchedule={(dayId, item) => setEditingSchedule({ mode: "edit", dayId, item })}
          onEditDay={(day) => setEditingDay(day)}
        />

        {hasVisitedIdeas ? (
          <IdeasSection
            ideas={trip.ideas}
            allIdeas={trip.ideas}
            hidden={activeView !== "ideas"}
            currentTravelerName={currentTravelerName}
            missingLocationIdeaIds={missingLocationIdeaIds}
            tagAssets={tagAssets}
            showWelcome={shouldShowIdeasWelcome(ideasOnboardingState, trip.ideas.length)}
            canFindInspiration={trip.ideas.length === 0 && ideasOnboardingState !== IDEAS_ONBOARDING_STATES.PENDING}
            destination={trip.days[0]?.city ?? ""}
            mapsProfile={mapsProfile}
            onAddIdea={openNewIdeaModal}
            onDismissWelcome={() => setIdeasOnboarding(IDEAS_ONBOARDING_STATES.SKIPPED)}
            onFindInspiration={() => setIdeasOnboarding(IDEAS_ONBOARDING_STATES.PENDING)}
            onSaveSuggestedIdeas={saveSuggestedIdeas}
            onEditIdea={setEditingIdea}
            onDeleteIdea={deleteIdea}
            openReactionPickerId={openReactionPickerId}
            onToggleReactionPicker={(ideaId) => setOpenReactionPickerId((current) => (current === ideaId ? "" : ideaId))}
            onReact={setIdeaReaction}
            onPromote={openIdeaPromotion}
          />
        ) : null}

        {activeView === "map" ? (
          <MapSection
            trip={trip}
            tripId={selectedTripId}
            days={sortedDays}
            selectedDay={selectedDay}
            mapsProfile={mapsProfile}
            tagAssets={tagAssets}
            mapOverview={mapOverview}
            onAddIdea={openNewIdeaModal}
            onAddActivity={openNewScheduleModal}
            onOpenDay={openTripDayDetails}
            onPromoteIdea={openIdeaPromotion}
            onEditItem={(item) => {
              if (item.source === "idea") {
                setEditingIdea(item.sourceItem);
                return;
              }
              setEditingSchedule({ mode: "edit", dayId: item.dayId, item: item.sourceItem });
            }}
          />
        ) : null}

        {hasVisitedExpenses ? (
          <ExpensesSection
            hidden={activeView !== "expenses"}
            trip={trip}
            status={expensesStatus}
            expenses={expenses}
            travelers={travelerOptions}
            tagAssets={tagAssets}
            currentTravelerClientId={currentTravelerClientId}
            onAddExpense={openManualExpense}
            onTrackSuggestion={openTrackedExpense}
            onEditExpense={openEditExpense}
          />
        ) : null}
      </main>

      <MobileBottomNav
        activeView={activeView}
        ideasCount={ideasAttentionCount}
        mapCount={mapOverview.needsLocationItems.length}
        expensesCount={expenseAttentionCount}
        onChange={setActiveView}
      />

      <TravelStrip />

      {routePlanner.isOpen && selectedDay ? (
        <RoutePlannerModal
          day={selectedDay}
          days={sortedDays}
          planner={routePlanner}
          onPlannerChange={setRoutePlanner}
          onApplySuggestion={applyDayCheckSuggestion}
          onClose={() => setRoutePlanner((current) => ({ ...current, isOpen: false, reviewSuggestion: false }))}
        />
      ) : null}

      {editingSchedule ? (
        <EditScheduleModal
          payload={editingSchedule}
          days={sortedDays}
          ideas={trip.ideas}
          travelers={trip.travelers}
          mapsProfile={mapsProfile}
          resolvingTarget={resolvingTarget}
          onResolvePlace={(draft, options = {}) =>
            resolveTripPlace({
              targetType: "schedule_item",
              targetClientId: draft.id,
              dayId: editingSchedule.dayId,
              mapLink: draft.mapLink,
              title: draft.title,
              city: draft.city,
              ...options
            })
          }
          onCancel={() => setEditingSchedule(null)}
          onSave={(item) => saveScheduleItem(editingSchedule.dayId, item, editingSchedule.consumedIdeaId)}
          onAddIdea={(idea) => addIdeaToSchedule(editingSchedule.dayId, idea, editingSchedule.item.start)}
          onMoveToIdeas={() => moveScheduleItemToIdeas(editingSchedule.dayId, editingSchedule.item.id)}
          onDelete={() => deleteScheduleItem(editingSchedule.dayId, editingSchedule.item.id)}
        />
      ) : null}

      {ideaPromotion ? (
        <React.Suspense fallback={<FeatureLoading label="idea editor" />}>
          <LazyPromoteIdeaModal
            promotion={ideaPromotion}
            days={sortedDays}
            tagAssets={tagAssets}
            onDayChange={(dayId) => setIdeaPromotion((current) => (current ? { ...current, dayId } : current))}
            onCancel={() => setIdeaPromotion(null)}
            onContinue={() => promoteIdeaToDay(ideaPromotion.idea, ideaPromotion.dayId)}
          />
        </React.Suspense>
      ) : null}

      {editingIdea ? (
        <EditIdeaModal
          idea={editingIdea}
          mapsProfile={mapsProfile}
          resolvingTarget={resolvingTarget}
          onResolvePlace={(draft, options = {}) =>
            resolveTripPlace({
              targetType: "idea",
              targetClientId: draft.id,
              mapLink: draft.mapLink,
              title: draft.title,
              city: draft.city,
              ...options
            })
          }
          onCancel={() => setEditingIdea(null)}
          onSave={saveIdea}
          onDelete={editingIdea._mode === "new" ? null : () => deleteIdea(editingIdea.id)}
        />
      ) : null}

      {editingExpense ? (
        <React.Suspense fallback={<FeatureLoading label="expense editor" />}>
          <LazyExpenseModal
            mode={editingExpense.mode}
            expense={editingExpense.expense}
            travelers={travelerOptions}
            onCancel={() => setEditingExpense(null)}
            onSave={saveExpense}
            onDelete={editingExpense.mode === "edit" ? () => removeExpense(editingExpense.expense.clientId) : null}
          />
        </React.Suspense>
      ) : null}

      {editingDay ? (
        <EditDayModal
          day={editingDay}
          canDelete={sortedDays.length > 1}
          mapsProfile={mapsProfile}
          resolvingTarget={resolvingTarget}
          onResolveBase={(draft, options = {}) =>
            resolveTripPlace({
              targetType: "trip_day_base",
              targetClientId: draft.id,
              mapLink: draft.baseMapLink,
              title: draft.basePlace?.name || draft.city,
              city: draft.city,
              ...options
            })
          }
          onCancel={cancelDayEditing}
          onSave={saveTripDay}
          onDelete={() => requestTripDayRemoval(editingDay, { returnToSettings: Boolean(settingsReturnSection) })}
        />
      ) : null}

      {isTripSettingsOpen ? (
        <TripSettingsModal
          activeSection={tripSettingsSection}
          canEditTrip={canEditTrip}
          canDeleteTrip={canDeleteTrip}
          canRemoveDay={sortedDays.length > 1}
          currentRole={formatRoleLabel(currentMember?.role ?? "editor")}
          dateRangeLabel={dateRangeLabel}
          days={sortedDays}
          memberCount={collaboration.members.length}
          nameDraft={tripSettingsNameDraft}
          peopleCount={peopleCount}
          tripName={trip.name}
          tripMarkAsset={tripMarkAsset}
          travelerCount={collaboration.travelers.length || trip.travelers.length}
          onAddDay={() => addTripDay({ returnToSettings: true })}
          onCancelGeneral={() => setTripSettingsNameDraft(trip.name ?? "")}
          onChangeName={setTripSettingsNameDraft}
          onChangeSection={setTripSettingsSection}
          onClose={closeTripSettings}
          onDeleteTrip={requestTripDeletion}
          onEditDay={editTripDayFromSettings}
          onExport={exportTrip}
          onImport={importFromSettings}
          onManagePeople={openPeopleFromSettings}
          onRemoveDay={(day) => requestTripDayRemoval(day, { returnToSettings: true })}
          onReset={resetFromSettings}
          onSaveGeneral={saveTripSettingsGeneral}
        />
      ) : null}

      {dayRemovalCandidate ? (
        <RemoveDayConfirmation
          day={dayRemovalCandidate}
          canRemove={sortedDays.length > 1}
          onCancel={() => {
            setDayRemovalCandidate(null);
            returnToTripSettings();
          }}
          onConfirm={confirmTripDayRemoval}
        />
      ) : null}

      {isTripDeleteConfirmationOpen ? (
        <DeleteTripConfirmation
          tripName={trip.name}
          isDeleting={isDeletingTrip}
          onCancel={cancelTripDeletion}
          onConfirm={confirmTripDeletion}
        />
      ) : null}

      {pendingImport ? (
        <div className="dialog-backdrop" role="presentation">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
            <h2 id="import-title">Import trip data?</h2>
            <p>
              This file contains {pendingImport.days.length} days and {pendingImport.ideas.length} ideas. Choose how to bring it into this Supabase trip.
            </p>
            <div className="dialog-actions">
              <button className="ghost-button" type="button" data-dialog-close onClick={() => setPendingImport(null)}>
                Cancel
              </button>
              <button className="ghost-button" type="button" onClick={mergeImportIdeas}>
                Merge ideas only
              </button>
              <button className="primary-button" type="button" onClick={replaceWithImport}>
                <Check size={17} />
                Replace planner
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isSharingOpen ? (
        <SharingModal
          collaboration={collaboration}
          currentUserId={session?.user?.id}
          currentMember={currentMember}
          currentTraveler={currentTraveler}
          canManage={canManageSharing}
          syncStatus={syncStatus}
          status={collaborationStatus}
          latestInviteUrl={latestInviteUrl}
          pendingInvitations={pendingInvitations}
          onSubmitInvite={handleCreateInvite}
          onCreatePasswordUser={handleCreatePasswordUser}
          onCopyInvite={copyLatestInvite}
          onRevokeInvite={handleRevokeInvite}
          onClaimTraveler={handleClaimTraveler}
          onRenameTraveler={handleRenameTraveler}
          onClose={closePeopleDialog}
        />
      ) : null}

      {showInviteWelcome ? (
        <InviteWelcomeModal
          tripName={trip.name}
          travelerName={currentTraveler.name}
          onContinue={handleInviteWelcomeContinue}
        />
      ) : null}

      {showTravelerIdentityPrompt ? (
        <TravelerIdentityPrompt
          tripName={trip.name}
          travelers={collaboration.travelers}
          currentUserId={sessionUserId}
          defaultTravelerName={accountDisplayName}
          isOwnerRecovery={ownerNeedsTravelerIdentity}
          recoveryMessage={ownerTravelerLink.message}
          onClaimTraveler={handleClaimTraveler}
          onCreateOwnTraveler={handleCreateOwnTraveler}
        />
      ) : null}
    </div>
    </TagAssetsContext.Provider>
  );
}

function AuthScreen({ email, password, message, onEmailChange, onPasswordChange, onSubmit, onPasswordSubmit }) {
  return (
    <main className="auth-shell auth-landing-shell">
      <section className="auth-landing" aria-labelledby="auth-title">
        <div className="auth-hero">
          <div className="auth-hero-copy">
            <h1 id="auth-title">
              <img className="auth-hero-logo" src={KUMI_PLANNER_LOGO_ASSET} alt="Kumi Planner" />
            </h1>
            <p>Bring your itinerary, ideas, bookings, and day-by-day plans into one shared space.</p>
          </div>

          <div className="auth-benefits" aria-label="Planner benefits">
            <span>
              <img src={`${ICON_BASE}tag-favorite.png`} alt="" aria-hidden="true" />
              <strong>Plan together</strong>
              <small>Share ideas and reactions.</small>
            </span>
            <span>
              <img src={`${ICON_BASE}tag-flexible.png`} alt="" aria-hidden="true" />
              <strong>Always in sync</strong>
              <small>Changes follow the trip.</small>
            </span>
            <span>
              <img src={`${ICON_BASE}tag-booked.png`} alt="" aria-hidden="true" />
              <strong>Private & secure</strong>
              <small>Your planner stays yours.</small>
            </span>
          </div>
        </div>

        <aside className="auth-card" aria-label="Sign in">
          <div className="auth-card-header">
            <h2>Sign in</h2>
            <p>Use a password, or send a magic link if you do not have one.</p>
          </div>
          <form className="auth-form" onSubmit={onPasswordSubmit}>
            <label>
              Email
              <input type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="you@example.com" required />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} placeholder="Password" autoComplete="current-password" />
            </label>
            <button className="primary-button" type="submit" disabled={!email.trim() || !password}>
              <LogIn size={17} />
              Sign in
            </button>
          </form>
          <div className="auth-divider">
            <small>or</small>
          </div>
          <form className="auth-form" onSubmit={onSubmit}>
            <button className="ghost-button" type="submit" disabled={!email.trim()}>
              <Mail size={17} />
              Send magic link
            </button>
          </form>
          {message ? <p className="auth-message">{message}</p> : null}
        </aside>
      </section>
      <img className="auth-footer-strip" src={FOOTER_STRIP_ASSET} alt="" aria-hidden="true" />
    </main>
  );
}

function TripPicker({
  email,
  trips,
  status,
  pickerFileInputRef,
  onRefresh,
  onSelect,
  onCreateTrip,
  onCreateJapanTemplate,
  onImportFile,
  onSignOut
}) {
  const isLoading = status === "idle" || status === "loading";
  const hasLoadError = status === "error";
  const isFirstTrip = status === "ready" && trips.length === 0;
  const [setupMode, setSetupMode] = useState("");
  const showTripSetup = isFirstTrip || Boolean(setupMode);
  const isFirstTripSetup = isFirstTrip || setupMode === "first";

  useEffect(() => {
    if (isFirstTrip && !setupMode) {
      setSetupMode("first");
    }
  }, [isFirstTrip, setupMode]);

  function startTemplateTrip() {
    onCreateJapanTemplate();
  }

  return (
    <main className="trip-picker-shell">
      <section className="trip-picker" aria-labelledby={showTripSetup ? "first-trip-setup-title" : "trip-picker-title"}>
        <header className="trip-picker-topbar">
          <div className="trip-picker-brand">
            <img className="title-flag" src={GENERIC_TRIP_NAV_ASSET} alt="" aria-hidden="true" />
            <div>
              <strong>Travel planner</strong>
              <p>{email}</p>
            </div>
          </div>
          <button className="trip-picker-logout" type="button" onClick={onSignOut}>
            <LogOut size={18} />
            <span>Log out</span>
          </button>
        </header>

        {!showTripSetup ? (
          <div className="trip-picker-hero">
            <div className="trip-picker-copy">
              <h1 id="trip-picker-title">Your trips</h1>
              <p>Pick up an existing itinerary or start a new one from a clean planning workspace.</p>
            </div>
          </div>
        ) : null}

        <input ref={pickerFileInputRef} className="file-input" type="file" accept="application/json" onChange={onImportFile} />

        <div className={`trip-list${showTripSetup ? " is-trip-setup" : ""}`}>
          {showTripSetup && !isFirstTripSetup ? (
            <div className="trip-setup-navigation">
              <button className="trip-setup-back" type="button" onClick={() => setSetupMode("")}>
                <ChevronLeft size={17} aria-hidden="true" />
                Back to your trips
              </button>
            </div>
          ) : null}
          {showTripSetup ? (
            <TripSetup
              isFirstTrip={isFirstTripSetup}
              onCreate={onCreateTrip}
              onImport={() => pickerFileInputRef.current?.click()}
              onUseTemplate={startTemplateTrip}
            />
          ) : null}
          {!showTripSetup && isLoading ? (
            Array.from({ length: 3 }, (_, index) => (
              <article className="trip-list-item is-loading" key={`trip-loading-${index}`} aria-hidden="true">
                <span className="trip-card-cover" />
                <span className="trip-card-body">
                  <span className="trip-card-line is-title" />
                  <span className="trip-card-line" />
                  <span className="trip-card-line is-short" />
                </span>
              </article>
            ))
          ) : null}

          {!showTripSetup && hasLoadError ? (
            <div className="empty-trip-list">
              <strong>Trips could not be loaded</strong>
              <span>Check the connection and try again before creating another trip.</span>
              <button className="ghost-button" type="button" onClick={onRefresh}><RefreshCcw size={16} />Try again</button>
            </div>
          ) : null}

          {!showTripSetup && !isLoading && trips.map((tripSummary) => (
            <button className="trip-list-item" key={tripSummary.id} type="button" onClick={() => onSelect(tripSummary.id)}>
              <span className="trip-card-cover" aria-hidden="true">
                <img src={GENERIC_TRIP_COVER_ASSET} alt="" />
                <span className="trip-card-cover-badge">
                  <img src={GENERIC_TRIP_NAV_ASSET} alt="" />
                </span>
              </span>
              <span className="trip-card-body">
                <span className="trip-card-heading">
                  <strong>{tripSummary.name}</strong>
                  <small>{tripSummary.role}</small>
                </span>
                <span className="trip-card-meta">
                  <span>
                    <img src={GENERIC_CALENDAR_ASSET} alt="" aria-hidden="true" />
                    {tripSummary.dateRangeLabel || "No date range yet"}
                  </span>
                </span>
              </span>
            </button>
          ))}

          {!showTripSetup && status === "ready" ? (
            <button
              className="trip-list-item trip-create-card"
              type="button"
              onClick={() => setSetupMode("additional")}
            >
              <span className="trip-create-visual" aria-hidden="true">
                <span>
                  <Plus size={34} />
                </span>
              </span>
              <span className="trip-card-body">
                <span className="trip-card-heading">
                  <strong>New trip</strong>
                  <small>Start here</small>
                </span>
                <span className="trip-card-meta">
                  <span>
                    <img src={GENERIC_FLEXIBLE_ASSET} alt="" aria-hidden="true" />
                    Blank workspace
                  </span>
                </span>
              </span>
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function TripSetup({ isFirstTrip, onCreate, onImport, onUseTemplate }) {
  const today = getTodayDate();
  return (
    <React.Suspense fallback={<FeatureLoading label="trip setup" />}>
      <LazyValidatedForm schema="firstTrip" defaultValues={{ name: "", city: "", startDate: today, endDate: today }}>
        {(form) => <TripSetupContent form={form} today={today} isFirstTrip={isFirstTrip} onCreate={onCreate} onImport={onImport} onUseTemplate={onUseTemplate} />}
      </LazyValidatedForm>
    </React.Suspense>
  );
}

function TripSetupContent({ form, today, isFirstTrip, onCreate, onImport, onUseTemplate }) {
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setValue,
    watch
  } = form;
  const startDate = watch("startDate");
  const endDate = watch("endDate");
  const [isDateRangePickerOpen, setIsDateRangePickerOpen] = useState(false);
  const [dateRangeDraft, setDateRangeDraft] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(() => getCalendarMonth(today));

  function openDateRangePicker() {
    setDateRangeDraft({ startDate, endDate });
    setCalendarMonth(getCalendarMonth(startDate || today));
    setIsDateRangePickerOpen(true);
  }

  function selectDateRangeDay(nextDate) {
    setDateRangeDraft((current) => {
      if (!current?.startDate || current.endDate) {
        return { startDate: nextDate, endDate: "" };
      }

      return nextDate < current.startDate
        ? { startDate: nextDate, endDate: current.startDate }
        : { startDate: current.startDate, endDate: nextDate };
    });
  }

  function applyDateRange() {
    if (!dateRangeDraft?.startDate || !dateRangeDraft.endDate) {
      return;
    }
    setValue("startDate", dateRangeDraft.startDate, { shouldDirty: true, shouldValidate: true });
    setValue("endDate", dateRangeDraft.endDate, { shouldDirty: true, shouldValidate: true });
    setIsDateRangePickerOpen(false);
  }

  return (
    <>
      <section className="first-trip-setup" aria-labelledby="first-trip-setup-title">
        <div className="first-trip-form-wrap">
          <div className="first-trip-heading">
            <img className="first-trip-cover-tile" src={GENERIC_TRIP_COVER_ASSET} alt="" aria-hidden="true" />
            <div>
              <h1 id="first-trip-setup-title">{isFirstTrip ? "Create your first trip" : "Plan a new trip"}</h1>
              <p>Just enough to open the planning workspace.</p>
            </div>
          </div>
          <form className="first-trip-form" onSubmit={handleSubmit(onCreate)}>
            <label>
              Trip name
              <input {...register("name")} autoFocus placeholder="Summer in Japan, Birthday weekend..." />
              {errors.name ? <small className="form-error">{errors.name.message}</small> : null}
            </label>
            <label>
              First destination
              <span className="first-trip-input-with-icon">
                <img src={`${ICON_BASE}tag-map-pin-generic.png`} alt="" aria-hidden="true" />
                <input {...register("city")} autoComplete="off" placeholder="City or region" />
              </span>
              {errors.city ? <small className="form-error">{errors.city.message}</small> : null}
            </label>
            <div className="first-trip-date-field">
              <span>Trip dates</span>
              <input type="hidden" {...register("startDate")} />
              <input type="hidden" {...register("endDate")} />
              <button className="first-trip-date-trigger" type="button" onClick={openDateRangePicker} aria-haspopup="dialog">
                <CalendarDays size={19} aria-hidden="true" />
                <span>{formatTripSetupDateRange(startDate, endDate)}</span>
                <ChevronDown size={18} aria-hidden="true" />
              </button>
              {errors.startDate || errors.endDate ? <small className="form-error">{errors.startDate?.message ?? errors.endDate?.message}</small> : null}
            </div>
            <button className="primary-button first-trip-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating trip..." : "Create trip and add ideas"}
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </form>
          <details className="first-trip-alternatives">
            <summary>
              <span>Other ways to start</span>
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <div className="first-trip-alternative-options">
              <button type="button" onClick={onImport}>
                <FileUp size={18} aria-hidden="true" />
                <span>
                  <strong>Import an existing trip</strong>
                  <small>Bring in a saved planner file</small>
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
              <button type="button" onClick={onUseTemplate}>
                <CalendarDays size={18} aria-hidden="true" />
                <span>
                  <strong>Use the Japan starter plan</strong>
                  <small>Start from the pre-filled itinerary</small>
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          </details>
        </div>
      </section>
      {isDateRangePickerOpen ? (
        <TripDateRangePicker
          month={calendarMonth}
          range={dateRangeDraft}
          onClose={() => setIsDateRangePickerOpen(false)}
          onMonthChange={setCalendarMonth}
          onSelectDate={selectDateRangeDay}
          onApply={applyDateRange}
        />
      ) : null}
    </>
  );
}

function TripDateRangePicker({ month, range, onClose, onMonthChange, onSelectDate, onApply }) {
  const calendarDays = getCalendarMonthDays(month);
  const rangeIsComplete = Boolean(range?.startDate && range?.endDate);

  return (
    <div className="dialog-backdrop trip-date-range-backdrop" role="presentation">
      <section className="dialog trip-date-range-dialog" role="dialog" aria-modal="true" aria-labelledby="trip-date-range-title">
        <div className="trip-date-range-header">
          <div>
            <h2 id="trip-date-range-title">Choose trip dates</h2>
            <p>Select a start date, then an end date.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close date picker" data-dialog-close onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="trip-date-range-month-nav">
          <button className="icon-button" type="button" aria-label="Previous month" onClick={() => onMonthChange(addCalendarMonths(month, -1))}>
            <ChevronLeft size={18} />
          </button>
          <strong aria-live="polite">{formatCalendarMonth(month)}</strong>
          <button className="icon-button" type="button" aria-label="Next month" onClick={() => onMonthChange(addCalendarMonths(month, 1))}>
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="trip-date-range-weekdays" aria-hidden="true">
          {CALENDAR_WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="trip-date-range-grid">
          {calendarDays.map((dateValue, index) => {
            if (!dateValue) {
              return <span className="trip-date-range-empty" key={`empty-${index}`} aria-hidden="true" />;
            }
            const isStart = dateValue === range?.startDate;
            const isEnd = dateValue === range?.endDate;
            const isInRange = Boolean(range?.startDate && range?.endDate && dateValue > range.startDate && dateValue < range.endDate);
            return (
              <button
                className={`trip-date-range-day${isStart ? " is-start" : ""}${isEnd ? " is-end" : ""}${isInRange ? " is-in-range" : ""}`}
                type="button"
                key={dateValue}
                aria-label={formatCalendarDayLabel(dateValue)}
                aria-pressed={isStart || isEnd}
                onClick={() => onSelectDate(dateValue)}
              >
                {Number(dateValue.slice(-2))}
              </button>
            );
          })}
        </div>
        <div className="trip-date-range-actions">
          <button className="primary-button" type="button" disabled={!rangeIsComplete} onClick={onApply}>Apply dates</button>
        </div>
      </section>
    </div>
  );
}

const CALENDAR_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getCalendarMonth(dateValue) {
  const date = new Date(`${dateValue}T12:00:00`);
  return Number.isNaN(date.getTime()) ? new Date() : new Date(date.getFullYear(), date.getMonth(), 1);
}

function addCalendarMonths(month, offset) {
  return new Date(month.getFullYear(), month.getMonth() + offset, 1);
}

function getCalendarMonthDays(month) {
  const leadingEmptyDays = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return [
    ...Array.from({ length: leadingEmptyDays }, () => ""),
    ...Array.from({ length: daysInMonth }, (_, index) => formatDateInputValue(new Date(month.getFullYear(), month.getMonth(), index + 1)))
  ];
}

function formatDateInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatCalendarMonth(month) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(month);
}

function formatCalendarDayLabel(dateValue) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${dateValue}T12:00:00`));
}

function formatTripSetupDateRange(startDate, endDate) {
  if (!startDate || !endDate) {
    return "Choose your trip dates";
  }
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${formatter.format(new Date(`${startDate}T12:00:00`))} – ${formatter.format(new Date(`${endDate}T12:00:00`))}`;
}

function ConfigState({ title, message, actionLabel, onAction }) {
  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="config-title">
        <div className="auth-brand">
          <img className="title-flag" src={GENERIC_TRIP_MARK_ASSET} alt="" aria-hidden="true" />
          <div>
            <p>Japan 2026</p>
            <h1 id="config-title">{title}</h1>
          </div>
        </div>
        <p className="auth-message">{message}</p>
        {actionLabel && onAction ? (
          <button className="primary-button" type="button" onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
      </section>
    </main>
  );
}

function FeatureLoading({ label }) {
  return (
    <section className="feature-loading" role="status" aria-live="polite">
      <strong>Loading {label}</strong>
      <span>Preparing this planner section.</span>
    </section>
  );
}

function TagIcon({ src, size = "chip" }) {
  if (!src) {
    return null;
  }

  return <img className={`tag-icon tag-icon-${size}`} src={src} alt="" aria-hidden="true" draggable={false} />;
}

function ViewSwitcher({ activeView, ideasCount, mapCount, expensesCount, onChange }) {
  return (
    <nav className="view-switcher" aria-label="Planner view">
      <button className={activeView === "trip" ? "is-active" : ""} type="button" aria-current={activeView === "trip" ? "page" : undefined} onClick={() => onChange("trip")}>
        All Trip
      </button>
      <button className={activeView === "ideas" ? "is-active" : ""} type="button" aria-current={activeView === "ideas" ? "page" : undefined} onClick={() => onChange("ideas")}>
        Ideas
        {ideasCount > 0 ? <span>{ideasCount}</span> : null}
      </button>
      <button className={activeView === "map" ? "is-active" : ""} type="button" aria-current={activeView === "map" ? "page" : undefined} onClick={() => onChange("map")}>
        Map
        {mapCount > 0 ? <span>{mapCount}</span> : null}
      </button>
      <button className={activeView === "expenses" ? "is-active" : ""} type="button" aria-current={activeView === "expenses" ? "page" : undefined} onClick={() => onChange("expenses")}>
        Expenses
        {expensesCount > 0 ? <span>{expensesCount}</span> : null}
      </button>
    </nav>
  );
}

function MobileBottomNav({ activeView, ideasCount, mapCount, expensesCount, onChange }) {
  const counts = {
    ideas: ideasCount,
    map: mapCount,
    expenses: expensesCount
  };

  return (
    <nav className="mobile-bottom-nav" aria-label="Planner sections">
      {MOBILE_NAV_ITEMS.map(({ id, label, iconSrc }) => (
        <button className={activeView === id ? "is-active" : ""} key={id} type="button" onClick={() => onChange(id)} aria-current={activeView === id ? "page" : undefined}>
          <span className="mobile-bottom-nav-icon">
            <img src={`${ICON_BASE}${iconSrc}`} alt="" aria-hidden="true" draggable={false} />
            {counts[id] > 0 ? <span className="mobile-bottom-nav-badge">{counts[id]}</span> : null}
          </span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

const TRIP_SETTINGS_SECTIONS = [
  { id: "general", label: "General", icon: Settings },
  { id: "days", label: "Days", icon: CalendarDays },
  { id: "people", label: "People", icon: Users },
  { id: "data", label: "Data & safety", icon: Download }
];

function TripSettingsModal({
  activeSection,
  canEditTrip,
  canDeleteTrip,
  canRemoveDay,
  currentRole,
  dateRangeLabel,
  days,
  memberCount,
  nameDraft,
  peopleCount,
  tripName,
  tripMarkAsset,
  travelerCount,
  onAddDay,
  onCancelGeneral,
  onChangeName,
  onChangeSection,
  onClose,
  onDeleteTrip,
  onEditDay,
  onExport,
  onImport,
  onManagePeople,
  onRemoveDay,
  onReset,
  onSaveGeneral
}) {
  return (
    <div className="dialog-backdrop trip-settings-backdrop" role="presentation">
      <div className="dialog trip-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="trip-settings-title">
        <div className="trip-settings-header">
          <div className="trip-settings-identity">
            <img src={tripMarkAsset} alt="" aria-hidden="true" />
            <div>
              <h2 id="trip-settings-title">Trip settings</h2>
              <p><strong>{tripName}</strong><span>{dateRangeLabel}</span></p>
            </div>
          </div>
          <button className="icon-button" type="button" aria-label="Close trip settings" data-dialog-close onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        <div className="trip-settings-layout">
          <nav className="trip-settings-nav" aria-label="Trip settings sections" role="tablist">
            {TRIP_SETTINGS_SECTIONS.map(({ id, label, icon: Icon }) => (
              <button
                className={activeSection === id ? "is-active" : ""}
                key={id}
                type="button"
                role="tab"
                aria-selected={activeSection === id}
                onClick={() => onChangeSection(id)}
              >
                <Icon size={17} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="trip-settings-content">
            {activeSection === "general" ? (
              <section className="trip-settings-section" role="tabpanel" aria-label="General settings">
                <SettingsSectionHeading title="General" detail="The name identifies this itinerary. Its date range comes from the scheduled days." />
                <form className="settings-general-form" onSubmit={(event) => {
                  event.preventDefault();
                  onSaveGeneral();
                }}>
                  <label>
                    Trip name
                    <input value={nameDraft} onChange={(event) => onChangeName(event.target.value)} maxLength={120} disabled={!canEditTrip} autoFocus />
                  </label>
                  <div className="settings-summary-grid">
                    <span>
                      <small>Date range</small>
                      <strong>{dateRangeLabel || "No dates yet"}</strong>
                    </span>
                    <span>
                      <small>Scheduled days</small>
                      <strong>{days.length}</strong>
                    </span>
                  </div>
                  <div className="settings-form-actions">
                    <button className="ghost-button" type="button" disabled={nameDraft === tripName} onClick={onCancelGeneral}>Cancel changes</button>
                    <button className="primary-button" type="submit" disabled={!canEditTrip || !nameDraft.trim() || nameDraft.trim() === tripName}>Save settings</button>
                  </div>
                </form>
              </section>
            ) : null}

            {activeSection === "days" ? (
              <section className="trip-settings-section" role="tabpanel" aria-label="Day settings">
                <SettingsSectionHeading title="Days" detail="Dates control the itinerary order. Edit a day to change its date, area, base, or notes." />
                <div className="settings-days-toolbar">
                  <span>{days.length} {days.length === 1 ? "day" : "days"}</span>
                  <button className="primary-button" type="button" disabled={!canEditTrip} onClick={onAddDay}>
                    <Plus size={17} />
                    Add day
                  </button>
                </div>
                <div className="settings-day-list">
                  {days.map((day) => {
                    const hotelCount = (day.schedule ?? []).filter(isStayItem).length;
                    const activityCount = (day.schedule ?? []).length - hotelCount;
                    return (
                      <article className="settings-day-row" key={day.id}>
                        <span className="settings-day-number">{day.dayNumber}</span>
                        <div className="settings-day-main">
                          <strong>{day.label || `Day ${day.dayNumber}`}</strong>
                          <span>{formatShortDate(day.date)} · {day.city || "No area"}</span>
                          <small>
                            {activityCount} {activityCount === 1 ? "activity" : "activities"}
                            {hotelCount ? ` · ${hotelCount} ${hotelCount === 1 ? "hotel" : "hotels"}` : ""}
                          </small>
                        </div>
                        <div className="settings-day-actions">
                          <button className="ghost-button compact-action" type="button" disabled={!canEditTrip} onClick={() => onEditDay(day)}>Edit</button>
                          <button className="ghost-button compact-action danger" type="button" disabled={!canEditTrip || !canRemoveDay} onClick={() => onRemoveDay(day)}>
                            Remove
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                {!canRemoveDay ? <p className="settings-inline-note">A trip must keep at least one day.</p> : null}
              </section>
            ) : null}

            {activeSection === "people" ? (
              <section className="trip-settings-section" role="tabpanel" aria-label="People settings">
                <SettingsSectionHeading title="People" detail="Manage who can open the trip and the traveler names used for reactions and expenses." />
                <div className="settings-people-card">
                  <div className="settings-summary-grid">
                    <span><small>People with access</small><strong>{memberCount || peopleCount}</strong></span>
                    <span><small>Travelers</small><strong>{travelerCount}</strong></span>
                    <span><small>Your access</small><strong>{currentRole}</strong></span>
                  </div>
                  <button className="primary-button" type="button" onClick={onManagePeople}>
                    <Users size={17} />
                    Manage people
                  </button>
                </div>
              </section>
            ) : null}

            {activeSection === "data" ? (
              <section className="trip-settings-section" role="tabpanel" aria-label="Data and safety settings">
                <SettingsSectionHeading title="Data & safety" detail="Download a backup, replace this planner from a file, clear its content, or permanently delete it." />
                <div className="settings-data-list">
                  <SettingsActionCard icon={Download} title="Export trip" detail="Download a JSON backup of this itinerary." actionLabel="Export" onAction={onExport} />
                  <SettingsActionCard icon={FileUp} title="Import trip" detail="Review a JSON file before replacing this planner or merging its ideas." actionLabel="Import" disabled={!canEditTrip} onAction={onImport} />
                  <SettingsActionCard icon={Trash2} title="Reset planner" detail="Clear ideas, scheduled activities, and expenses while keeping the trip and its days." actionLabel="Reset" tone="danger" disabled={!canEditTrip} onAction={onReset} />
                  {canDeleteTrip ? <SettingsActionCard icon={Trash2} title="Delete trip" detail="Permanently remove this trip and all of its planning data for everyone." actionLabel="Delete" tone="danger" onAction={onDeleteTrip} /> : null}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsSectionHeading({ title, detail }) {
  return (
    <div className="settings-section-heading">
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}

function SettingsActionCard({ icon: Icon, title, detail, actionLabel, tone = "default", disabled = false, onAction }) {
  return (
    <article className={`settings-action-card${tone === "danger" ? " is-danger" : ""}`}>
      <span className="settings-action-icon"><Icon size={18} /></span>
      <div><strong>{title}</strong><p>{detail}</p></div>
      <button className={`ghost-button compact-action${tone === "danger" ? " danger" : ""}`} type="button" disabled={disabled} onClick={onAction}>{actionLabel}</button>
    </article>
  );
}

function RemoveDayConfirmation({ day, canRemove, onCancel, onConfirm }) {
  const scheduledCount = day.schedule?.length ?? 0;
  return (
    <div className="dialog-backdrop remove-day-backdrop" role="presentation">
      <div className="dialog remove-day-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-day-title">
        <div className="remove-day-icon" aria-hidden="true"><Trash2 size={22} /></div>
        <div>
          <h2 id="remove-day-title">Remove {day.label || `Day ${day.dayNumber}`}?</h2>
          {scheduledCount ? (
            <p>This day has {scheduledCount} scheduled {scheduledCount === 1 ? "activity" : "activities"}. {scheduledCount === 1 ? "It" : "They"} will be moved to Ideas so nothing is lost.</p>
          ) : (
            <p>This day has no scheduled activities. Removing it will update the trip date range.</p>
          )}
        </div>
        <div className="dialog-actions">
          <button className="ghost-button" type="button" data-dialog-close onClick={onCancel}>Keep day</button>
          <button className="primary-button danger-button" type="button" disabled={!canRemove} onClick={onConfirm}>
            <Trash2 size={17} />
            Remove day
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteTripConfirmation({ tripName, isDeleting, onCancel, onConfirm }) {
  const [confirmation, setConfirmation] = useState("");
  const confirmationMatches = confirmation.trim() === String(tripName ?? "").trim();

  return (
    <div className="dialog-backdrop delete-trip-backdrop" role="presentation">
      <div className="dialog delete-trip-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-trip-title">
        <div className="remove-day-icon" aria-hidden="true"><Trash2 size={22} /></div>
        <div>
          <h2 id="delete-trip-title">Delete this trip?</h2>
          <p>This permanently deletes the itinerary, ideas, expenses, invitations, and access for every traveler. This cannot be undone.</p>
        </div>
        <label className="delete-trip-confirmation-field">
          Type <strong>{tripName}</strong> to confirm
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            disabled={isDeleting}
            autoFocus
          />
        </label>
        <div className="dialog-actions">
          <button className="ghost-button" type="button" data-dialog-close disabled={isDeleting} onClick={onCancel}>Keep trip</button>
          <button className="primary-button danger-button" type="button" disabled={!confirmationMatches || isDeleting} onClick={onConfirm}>
            <Trash2 size={17} />
            {isDeleting ? "Deleting..." : "Delete trip"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DateRail({ days, hidden = false, selectedDayId, isCollapsed, onToggleCollapsed, onSelect, onAddDay }) {
  return (
    <aside className={`date-rail ${isCollapsed ? "is-collapsed" : ""}`} aria-label="Itinerary days" hidden={hidden}>
      <div className="rail-heading">
        <CalendarDays size={18} />
        <span>Itinerary</span>
        <button
          className="rail-collapse-button"
          type="button"
          aria-label={isCollapsed ? "Expand itinerary days" : "Collapse itinerary days"}
          aria-expanded={!isCollapsed}
          onClick={onToggleCollapsed}
        >
          {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
      <nav className="day-list">
        {days.map((day) => (
          <button
            className={`day-button ${day.id === selectedDayId ? "is-selected" : ""}`}
            key={day.id}
            type="button"
            aria-label={`Day ${day.dayNumber}, ${formatRailDate(day.date)}, ${day.city}`}
            title={`Day ${day.dayNumber} • ${formatRailDate(day.date)} • ${day.city}`}
            onClick={() => onSelect(day.id)}
          >
            <span className="drag-dots" aria-hidden="true">
              ::
            </span>
            <span className="collapsed-day-number" aria-hidden="true">{day.dayNumber}</span>
            <span className="day-copy">
              <strong>Day {day.dayNumber}</strong>
              <small>{formatRailDate(day.date)}</small>
              <small>{day.city}</small>
            </span>
          </button>
        ))}
      </nav>
      <button className="add-day-button" type="button" onClick={onAddDay}>
        <Plus size={17} />
        Add Day
      </button>
    </aside>
  );
}

function useScheduleDrag({ days, onScheduleMove, onScheduleResize, rowHeight = DAY_TIME_GRID_ROW_HEIGHT }) {
  const [draggedItemId, setDraggedItemId] = useState(null);
  const [resizingItemId, setResizingItemId] = useState(null);
  const [dropPreview, setDropPreview] = useState(null);
  const pointerDragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const daysById = useMemo(() => new Map(days.map((day) => [day.id, day])), [days]);

  function clearDragState() {
    setDraggedItemId(null);
    setResizingItemId(null);
    setDropPreview(null);
  }

  function readInteractionPreview(event, dragState) {
    if (dragState.mode === "resize-start" || dragState.mode === "resize-end") {
      return readResizePreview(event, dragState);
    }

    return readMovePreview(event, dragState);
  }

  function readMovePreview(event, dragState) {
    const column = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-drop-day-id]");
    const targetDayId = column?.dataset.dropDayId;
    const sourceDay = daysById.get(dragState.sourceDayId);
    const targetDay = targetDayId ? daysById.get(targetDayId) : null;
    const item = sourceDay?.schedule.find((candidate) => candidate.id === dragState.itemId);
    if (!column || !targetDay || !item) {
      return null;
    }

    const duration = Number(item.duration) || TIME_GRID_STEP_MINUTES;
    const start = getDropStartFromPointer(event.clientY, column, duration, rowHeight);
    const layout = getTimeGridBlockLayout(start, duration, rowHeight);
    return {
      ...layout,
      dayId: targetDay.id,
      start,
      duration,
      isAvailable: isScheduleSlotAvailable(targetDay.schedule, item.id, start, duration)
    };
  }

  function readResizePreview(event, dragState) {
    const day = daysById.get(dragState.sourceDayId);
    const item = day?.schedule.find((candidate) => candidate.id === dragState.itemId);
    if (!day || !item) {
      return null;
    }

    const deltaMinutes = getResizeDeltaMinutes(event.clientY, dragState.startY, rowHeight);
    const originalStart = dragState.originalStartMinutes;
    const originalEnd = originalStart + dragState.originalDuration;
    let nextStart = originalStart;
    let nextDuration = dragState.originalDuration;

    if (dragState.mode === "resize-start") {
      nextStart = Math.min(originalStart + deltaMinutes, originalEnd - MIN_SCHEDULE_DURATION_MINUTES);
      nextDuration = originalEnd - nextStart;
    } else {
      const nextEnd = Math.max(originalEnd + deltaMinutes, originalStart + MIN_SCHEDULE_DURATION_MINUTES);
      nextDuration = nextEnd - originalStart;
    }

    const start = minutesToTimeInput(nextStart);
    const layout = getTimeGridBlockLayout(start, nextDuration, rowHeight);
    const end = nextStart + nextDuration;
    return {
      ...layout,
      dayId: day.id,
      start,
      duration: nextDuration,
      mode: "resize",
      label: `${formatTime(start)} - ${formatTime(minutesToTimeInput(end))}`,
      isAvailable: isScheduleSlotAvailable(day.schedule, item.id, start, nextDuration)
    };
  }

  function handlePointerDown(event, item, sourceDayId) {
    if (event.button && event.button !== 0) {
      return;
    }

    pointerDragRef.current = {
      mode: "move",
      itemId: item.id,
      sourceDayId,
      startX: event.clientX,
      startY: event.clientY,
      pointerId: event.pointerId,
      isDragging: false
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleResizePointerDown(event, item, sourceDayId, mode) {
    if (event.button && event.button !== 0) {
      return;
    }

    const originalStartMinutes = parseTimeToMinutes(item.start);
    if (originalStartMinutes === null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    pointerDragRef.current = {
      mode,
      itemId: item.id,
      sourceDayId,
      startX: event.clientX,
      startY: event.clientY,
      pointerId: event.pointerId,
      originalStartMinutes,
      originalDuration: Math.max(MIN_SCHEDULE_DURATION_MINUTES, Number(item.duration) || MIN_SCHEDULE_DURATION_MINUTES),
      isDragging: false
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    const dragState = pointerDragRef.current;
    if (!dragState) {
      return;
    }

    const movement = Math.abs(event.clientX - dragState.startX) + Math.abs(event.clientY - dragState.startY);
    if (!dragState.isDragging && movement < 10) {
      return;
    }

    event.preventDefault();
    dragState.isDragging = true;
    if (dragState.mode === "move") {
      setDraggedItemId(dragState.itemId);
    } else {
      setResizingItemId(dragState.itemId);
    }
    const nextPreview = readInteractionPreview(event, dragState);
    setDropPreview((current) => (areDropPreviewsEqual(current, nextPreview) ? current : nextPreview));
  }

  function handlePointerUp(event) {
    const dragState = pointerDragRef.current;
    pointerDragRef.current = null;

    if (!dragState?.isDragging) {
      clearDragState();
      return;
    }

    const finalPreview = readInteractionPreview(event, dragState);
    suppressClickRef.current = true;
    if (finalPreview?.isAvailable) {
      if (dragState.mode === "move") {
        onScheduleMove(dragState.sourceDayId, dragState.itemId, finalPreview.dayId, finalPreview.start);
      } else {
        onScheduleResize?.(dragState.sourceDayId, dragState.itemId, finalPreview.start, finalPreview.duration);
      }
    }

    clearDragState();
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }

  function handlePointerCancel() {
    pointerDragRef.current = null;
    clearDragState();
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }

  function getDropPreviewForDay(dayId) {
    return dropPreview?.dayId === dayId ? dropPreview : null;
  }

  function shouldSuppressClick() {
    if (!suppressClickRef.current) {
      return false;
    }
    suppressClickRef.current = false;
    return true;
  }

  function hasRecentPointerInteraction() {
    return Boolean(pointerDragRef.current || suppressClickRef.current);
  }

  return {
    draggedItemId,
    resizingItemId,
    getDropPreviewForDay,
    handlePointerDown,
    handleResizePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    shouldSuppressClick,
    hasRecentPointerInteraction
  };
}

function DropSlotIndicator({ preview }) {
  if (!preview) {
    return null;
  }

  return (
    <div
      className={`drop-slot-indicator ${preview.isAvailable ? "is-available" : "is-unavailable"} ${preview.mode === "resize" ? "is-resize-preview" : ""} ${
        preview.mode === "add" ? "is-add-preview" : ""
      }`}
      style={{ top: preview.top, height: preview.height }}
      aria-hidden="true"
    >
      {preview.isAvailable ? preview.label ?? formatTime(preview.start) : "Unavailable"}
    </div>
  );
}

function DayTimeline({
  day,
  hidden = false,
  sortedSchedule,
  stays,
  stats,
  mode,
  allIdeas,
  ideasCount,
  onAdd,
  onEdit,
  onScheduleMove,
  onScheduleResize,
  onDayChange,
  onEditDay,
  onOpenIdeas,
  onRoutePlannerChange,
  onModeChange
}) {
  const slots = buildTimeGridSlots();
  const gridStyle = {
    "--slot-count": slots.length,
    "--time-row-height": `${DAY_TIME_GRID_ROW_HEIGHT}px`
  };
  const dragScheduler = useScheduleDrag({
    days: day ? [day] : [],
    onScheduleMove,
    onScheduleResize,
    rowHeight: DAY_TIME_GRID_ROW_HEIGHT
  });

  if (!day) {
    return null;
  }

  function renderScheduleEvent(item, compact = false) {
    const layout = compact ? undefined : getTimeGridEventLayout(item);
    return (
      <ScheduleEvent
        key={item.id}
        item={item}
        dayCity={day.city}
        compact={compact}
        draggable={!compact}
        isDragging={dragScheduler.draggedItemId === item.id}
        isResizing={dragScheduler.resizingItemId === item.id}
        positioned={!compact}
        dragHandle={!compact}
        resizeHandles={!compact}
        style={layout ? { top: layout.top, height: layout.height } : undefined}
        onPointerDown={compact ? undefined : (event) => dragScheduler.handlePointerDown(event, item, day.id)}
        onResizePointerDown={compact ? undefined : (event, resizeMode) => dragScheduler.handleResizePointerDown(event, item, day.id, resizeMode)}
        onEdit={() => {
          if (dragScheduler.shouldSuppressClick()) {
            return;
          }
          onEdit(item);
        }}
      />
    );
  }

  return (
    <section className="timeline-panel" aria-label="Daily schedule" hidden={hidden}>
      <div className="timeline-header">
        <div>
          <div className="day-title-row">
            <h1>{day.label || `Day ${day.dayNumber}`}</h1>
            <Sun aria-hidden="true" className="sun-mark" size={20} />
          </div>
          <div className="subline">
            <span>{formatHeaderDate(day.date)}</span>
            <span aria-hidden="true">•</span>
            <input
              value={day.city}
              aria-label="Day city or area"
              onChange={(event) => onDayChange((currentDay) => ({ ...currentDay, city: event.target.value }))}
            />
          </div>
        </div>
        <div className="planned-hours">
          <strong>
            <Clock3 size={16} />
            {formatDuration(stats.plannedMinutes)}
          </strong>
        </div>
        <div className="header-actions">
          <button className="ghost-button compact-action" type="button" onClick={onOpenIdeas}>
            Ideas
            <span className="count-badge">{ideasCount}</span>
          </button>
          <button className="ghost-button compact-action" type="button" onClick={onEditDay}>
            Edit Day
          </button>
        </div>
      </div>

      <DayStayCard stays={stays} day={day} onEdit={onEdit} />

      <div className="timeline-toolbar">
        <button className="ghost-button" type="button" onClick={onAdd}>
          <Plus size={17} />
          Add Activity
        </button>
        <button className="ghost-button" type="button" onClick={() => onRoutePlannerChange((current) => ({ ...current, isOpen: true, reviewSuggestion: false }))}>
          <Route size={17} />
          Check day
        </button>
        <span className="toolbar-spacer" />
        <div className="mode-toggle" aria-label="Day view mode">
          <button className={mode === "timeline" ? "is-active" : ""} type="button" onClick={() => onModeChange("timeline")}>
            Timeline
          </button>
          <button className={mode === "compact" ? "is-active" : ""} type="button" onClick={() => onModeChange("compact")}>
            Compact
          </button>
        </div>
      </div>

      {mode === "timeline" ? (
        <>
          <div className="calendar-timeline" style={gridStyle}>
            <div className="time-axis" aria-hidden="true">
              {slots.map((slot) => (
                <span className={slot.minutes % 60 === 0 ? "is-hour" : ""} key={slot.minutes}>
                  {formatMinutesTime(slot.minutes)}
                </span>
              ))}
            </div>
            <div
              className="day-time-column"
              data-drop-day-id={day.id}
              onPointerMove={dragScheduler.handlePointerMove}
              onPointerUp={dragScheduler.handlePointerUp}
              onPointerCancel={dragScheduler.handlePointerCancel}
            >
              <DropSlotIndicator preview={dragScheduler.getDropPreviewForDay(day.id)} />
              {sortedSchedule.map((item) => renderScheduleEvent(item))}
            </div>
          </div>
          <DayNotesCard day={day} onDayChange={onDayChange} />
        </>
      ) : (
        <div className="compact-day-list">
          {sortedSchedule.map((item) => renderScheduleEvent(item, true))}
          <DayNotesCard day={day} onDayChange={onDayChange} />
        </div>
      )}
    </section>
  );
}

function DayStayCard({ stays = [], day, onEdit }) {
  if (!day || !stays.length) {
    return null;
  }

  return (
    <section className="day-stay-card" aria-label="Accommodation">
      <span className="day-stay-eyebrow">
        <Bed size={15} />
        Staying at
      </span>
      <div className="day-stay-list">
        {stays.map(({ item, sourceDayId, isCheckInDay, isCheckOutDay }) => (
          <button className="day-stay-item" type="button" key={`${sourceDayId}-${item.id}`} onClick={() => onEdit(item, sourceDayId)}>
            <span>
              <strong>{item.title}</strong>
              <small>{item.city || day.city}</small>
            </span>
            <span className="day-stay-meta">
              {isCheckInDay ? <em>Check-in {formatTime(item.checkInTime || DEFAULT_CHECK_IN_TIME)}</em> : null}
              {isCheckOutDay ? <em>Check-out {formatTime(item.checkOutTime || DEFAULT_CHECK_OUT_TIME)}</em> : null}
              {!isCheckInDay && !isCheckOutDay ? <em>Overnight stay</em> : null}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function DayNotesCard({ day, onDayChange }) {
  const [isOpen, setIsOpen] = useState(Boolean(day.notes));
  const hasNotes = Boolean(day.notes?.trim());

  useEffect(() => {
    setIsOpen(Boolean(day.notes));
  }, [day.id, day.notes]);

  if (!isOpen && !hasNotes) {
    return (
      <button className="day-notes-toggle" type="button" onClick={() => setIsOpen(true)}>
        Notes
      </button>
    );
  }

  return (
    <div className="day-notes-card">
      <strong className="day-notes-title">Notes</strong>
      <textarea
        value={day.notes}
        placeholder="Add a reminder..."
        aria-label="Day notes"
        onChange={(event) => onDayChange((currentDay) => ({ ...currentDay, notes: event.target.value }))}
      />
    </div>
  );
}

function RoutePlannerModal({ day, days, planner, onPlannerChange, onApplySuggestion, onClose }) {
  const dayCheck = buildDayCheck(day, days);
  const suggestion = dayCheck.suggestion;
  const isReviewing = Boolean(planner.reviewSuggestion && suggestion?.canApply);

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog route-dialog" role="dialog" aria-modal="true" aria-label="Day check">
        <div className="dialog-header">
          <div>
            <h2>{isReviewing ? "Review suggested change" : "Check day"}</h2>
            <p>{isReviewing ? "Nothing changes until you apply it." : "A quick tip to make your day smoother."}</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close day check" data-dialog-close onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <section className="route-planner-panel day-check-panel" aria-label="Day check">
          {isReviewing ? (
            <>
              <div className="day-check-review">
                <div className="day-check-review-card">
                  <span>Keep this day</span>
                  <strong>{day.label || `Day ${day.dayNumber}`}</strong>
                  <ul>
                    {suggestion.keepTitles.map((title) => (
                      <li key={title}>{title}</li>
                    ))}
                  </ul>
                </div>
                <div className="day-check-review-card is-target">
                  <span>Move to</span>
                  <strong>{suggestion.targetDayLabel}</strong>
                  <ul>
                    <li>{suggestion.itemTitle}</li>
                  </ul>
                </div>
              </div>
              <p className="day-check-note">{suggestion.reviewCopy}</p>
            </>
          ) : (
            <>
              <div className="day-check-headline">
                <h3>{dayCheck.coachTitle}</h3>
                <p>{dayCheck.coachSummary}</p>
              </div>

              {suggestion?.canApply ? (
                <DayCheckComparisonCards dayCheck={dayCheck} />
              ) : (
                <div className={`day-check-flow-card is-single tone-${dayCheck.statusTone}`}>
                  <div className="day-check-card-title">
                    <strong>{dayCheck.statusLabel}</strong>
                    <DayCheckBadge label={dayCheck.sourceDayBadge} tone={dayCheck.statusTone} />
                  </div>
                  <DayCheckStatusBanner tone={dayCheck.statusTone} icon="info">
                    {suggestion?.copy || dayCheck.summary}
                  </DayCheckStatusBanner>
                  <DayCheckTimeline titles={dayCheck.currentRouteTitles} tone={dayCheck.statusTone} />
                </div>
              )}
            </>
          )}
        </section>

        {isReviewing ? (
          <div className="dialog-actions">
            <button className="ghost-button" type="button" onClick={() => onPlannerChange((current) => ({ ...current, reviewSuggestion: false }))}>
              Back
            </button>
            <button className="primary-button" type="button" onClick={() => onApplySuggestion(suggestion)}>
              <Check size={17} />
              Apply change
            </button>
          </div>
        ) : (
          <footer className="day-check-footer">
            <div className="day-check-footer-actions">
              <button className="ghost-button" type="button" onClick={onClose}>
                {suggestion?.canApply ? "Keep as planned" : "Done"}
              </button>
              {suggestion?.canApply ? (
                <button className="primary-button" type="button" onClick={() => onPlannerChange((current) => ({ ...current, reviewSuggestion: true }))}>
                  Review change
                </button>
              ) : null}
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

function DayCheckComparisonCards({ dayCheck }) {
  return (
    <div className="day-check-flow-grid" aria-label="Suggested route change">
      <div className="day-check-flow-card is-current">
        <div className="day-check-card-title">
          <strong>Current day</strong>
          <DayCheckBadge label={dayCheck.sourceDayBadge} tone="heavy" />
        </div>
        <DayCheckStatusBanner tone="heavy" icon="info">
          {dayCheck.currentStatusCopy}
        </DayCheckStatusBanner>
        <DayCheckTimeline titles={dayCheck.currentRouteTitles} tone="heavy" />
      </div>

      <div className="day-check-arrow-indicator" aria-hidden="true">
        <ArrowRight size={16} />
      </div>

      <div className="day-check-flow-card is-better">
        <div className="day-check-card-title">
          <strong>Better flow</strong>
          <DayCheckBadge label={dayCheck.sourceDayBadge} tone="good" />
        </div>
        <DayCheckStatusBanner tone="good" icon="check">
          {dayCheck.betterStatusCopy}
        </DayCheckStatusBanner>
        <DayCheckTimeline titles={dayCheck.betterRouteTitles} tone="good" />
        {dayCheck.movedStopTitle ? (
          <div className="day-check-moved-block">
            <div className="day-check-card-title">
              <strong>Moved to</strong>
              <DayCheckBadge label={dayCheck.targetDayBadge} tone="move" />
            </div>
            <DayCheckTimeline titles={[dayCheck.movedStopTitle]} tone="move" compact />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DayCheckBadge({ label, tone = "good" }) {
  if (!label) {
    return null;
  }

  return <span className={`day-check-badge tone-${tone}`}>{label}</span>;
}

function DayCheckStatusBanner({ children, tone = "good", icon = "info" }) {
  const Icon = icon === "check" ? CheckCircle2 : Info;

  return (
    <div className={`day-check-status-banner tone-${tone}`}>
      <Icon size={16} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

function DayCheckTimeline({ titles, tone = "good", compact = false }) {
  if (!titles.length) {
    return <p className="day-check-empty-route">Resolve places to see the route flow.</p>;
  }

  return (
    <ol className={`day-check-timeline tone-${tone} ${compact ? "is-compact" : ""}`}>
      {titles.map((title) => (
        <li key={title}>{title}</li>
      ))}
    </ol>
  );
}

function ScheduleEvent({
  item,
  dayCity = "",
  onEdit,
  compact = false,
  draggable = false,
  isDragging = false,
  isResizing = false,
  positioned = false,
  dragHandle = false,
  resizeHandles = false,
  style,
  onPointerDown,
  onResizePointerDown
}) {
  const tagAssets = useTagAssets();
  const config = getCategoryConfigForAssets(item.category, tagAssets);
  const Icon = config.icon;
  const detail = getScheduleEventDetail(item, dayCity, tagAssets);

  return (
    <article
      className={`schedule-event category-${config.className} ${compact ? "is-compact" : ""} ${draggable ? "is-draggable" : ""} ${
        isDragging ? "is-dragging" : ""
      } ${isResizing ? "is-resizing" : ""} ${positioned ? "is-positioned" : ""} ${dragHandle ? "has-drag-handle" : ""} ${
        resizeHandles ? "has-resize-handles" : ""
      } ${detail.description ? "has-description" : ""} ${detail.showDetailStrip ? "has-detail-strip" : ""
      }`}
      style={style}
      draggable={false}
      data-schedule-id={item.id}
      onPointerDown={dragHandle ? undefined : onPointerDown}
    >
      {dragHandle ? (
        <button
          className="schedule-drag-handle"
          type="button"
          aria-label={`Drag ${item.title}`}
          onPointerDown={onPointerDown}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <GripVertical size={17} />
        </button>
      ) : null}
      {resizeHandles ? (
        <span
          className="resize-handle resize-handle-start"
          aria-hidden="true"
          title="Resize start time"
          onPointerDown={(event) => onResizePointerDown?.(event, "resize-start")}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        />
      ) : null}
      <button className="event-main" type="button" onClick={onEdit}>
        <span className="event-time">{formatTime(item.start)}</span>
        <Icon className="event-icon" size={19} />
        <span className="event-copy">
          <span className="event-title-row">
            <strong>{item.title}</strong>
            {detail.inlineDescription ? <small className="event-inline-description">{detail.inlineDescription}</small> : null}
          </span>
          {!compact && detail.showDetailStrip ? (
            <span className="event-detail-strip">
              {detail.detailDescription ? <small className="event-detail-description">{detail.detailDescription}</small> : null}
              <span className="event-chip-row">
                {detail.chips.map((chip) => (
                  <span className="event-meta-chip" key={chip.key} title={chip.title}>
                    {chip.asset ? <TagIcon src={chip.asset} size="tiny" /> : null}
                    {chip.label}
                  </span>
                ))}
                <span className={`category-pill ${config.className}`}>
                  <TagIcon src={config.asset} size="tiny" />
                  {config.short}
                </span>
              </span>
            </span>
          ) : null}
        </span>
        {!detail.showDetailStrip ? (
          <span className={`category-pill ${config.className}`}>
            <TagIcon src={config.asset} size="tiny" />
            {config.short}
          </span>
        ) : null}
      </button>
      <button className="event-more" type="button" aria-label={`Edit ${item.title}`} onClick={onEdit}>
        <MoreVertical size={18} />
      </button>
      {resizeHandles ? (
        <span
          className="resize-handle resize-handle-end"
          aria-hidden="true"
          title="Resize end time"
          onPointerDown={(event) => onResizePointerDown?.(event, "resize-end")}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        />
      ) : null}
    </article>
  );
}

function AllTripBoard({
  days,
  hidden = false,
  mode,
  dateRangeLabel,
  onModeChange,
  onOpenDay,
  onCheckDay,
  onScheduleMove,
  onScheduleResize,
  onAddScheduleAt,
  onEditSchedule,
  onEditDay
}) {
  const totals = days.reduce(
    (summary, day) => {
      const stats = getDayStats(day);
      return {
        planned: summary.planned + stats.plannedMinutes,
        blocks: summary.blocks + sortActivitySchedule(day.schedule).length
      };
    },
    { planned: 0, blocks: 0 }
  );
  const displayMode = mode === "list" ? "list" : "calendar";

  return (
    <section className="trip-board" aria-label="All Trip itinerary board" hidden={hidden}>
      <div className="trip-board-header">
        <div>
          <h1>{dateRangeLabel}</h1>
          <p>{totals.blocks} activities • {formatDuration(totals.planned)}</p>
        </div>
        <div className="trip-board-actions">
          <div className="mode-toggle" aria-label="All Trip display mode">
            <button className={displayMode === "list" ? "is-active" : ""} type="button" onClick={() => onModeChange("list")}>
              List
            </button>
            <button className={displayMode === "calendar" ? "is-active" : ""} type="button" onClick={() => onModeChange("calendar")}>
              Timeline
            </button>
          </div>
          <button className="primary-button compact-action desktop-section-action" type="button" onClick={() => onAddScheduleAt()}>
            <Plus size={16} />
            Add activity
          </button>
        </div>
      </div>
      <button className="mobile-fab-action" type="button" aria-label="Add activity" title="Add activity" onClick={() => onAddScheduleAt()}>
        <Plus size={22} />
        <span>Add activity</span>
      </button>
      {displayMode === "calendar" ? (
          <TripCalendarBoard
            days={days}
            onOpenDay={onOpenDay}
            onScheduleMove={onScheduleMove}
            onScheduleResize={onScheduleResize}
            onAddScheduleAt={onAddScheduleAt}
          onEditSchedule={onEditSchedule}
        />
      ) : (
        <div className="trip-day-list">
          {days.map((day) => {
            const stats = getDayStats(day);
            const schedule = sortActivitySchedule(day.schedule);
            return (
              <article className={`trip-day-card trip-day-theme-${((day.dayNumber - 1) % 6) + 1}`} key={day.id}>
                <div className="trip-day-summary">
                  <div className="trip-card-topline">
                    <button className="trip-day-heading" type="button" aria-label={`Open ${day.label || `Day ${day.dayNumber}`} itinerary`} onClick={() => onOpenDay(day.id)}>
                      <span>
                        <strong>{day.label || `Day ${day.dayNumber}`}</strong>
                        <small>{formatRailDate(day.date)}</small>
                      </span>
                      <span>
                        <MapPin size={14} aria-hidden="true" />
                        {day.city}
                      </span>
                    </button>
                    <div className="trip-day-actions">
                      <button className="ghost-button compact-action" type="button" aria-label={`Edit ${day.label || `Day ${day.dayNumber}`} settings`} onClick={() => onEditDay(day)}>
                        <Settings size={15} aria-hidden="true" />
                        Edit
                      </button>
                      <button className="trip-check-day-button compact-action" type="button" onClick={() => onCheckDay(day.id)}>
                        <Route size={15} aria-hidden="true" />
                        Check day
                      </button>
                    </div>
                  </div>
                  <div className="mini-stats">
                    <span>{formatDuration(stats.plannedMinutes)} planned</span>
                    <span>{formatDuration(stats.openMinutes)} open</span>
                  </div>
                </div>
                <div className="mini-events">
              {schedule.length ? (
                schedule.map((item) => (
                  <ScheduleEvent key={item.id} item={item} compact onEdit={() => onEditSchedule(day.id, item)} />
                ))
                  ) : (
                    <button className="empty-day" type="button" onClick={() => onAddScheduleAt(day.id)}>
                      <Plus size={16} />
                      Plan this day
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function getTripTimelineRowHeight() {
  if (typeof window === "undefined") {
    return TRIP_TIME_GRID_ROW_HEIGHT;
  }

  if (window.matchMedia(PHONE_TIMELINE_QUERY).matches) {
    return TRIP_TIME_GRID_PHONE_ROW_HEIGHT;
  }

  if (window.matchMedia(TABLET_TIMELINE_QUERY).matches) {
    return TRIP_TIME_GRID_TABLET_ROW_HEIGHT;
  }

  if (window.matchMedia(COMPACT_TIMELINE_QUERY).matches) {
    return TRIP_TIME_GRID_COMPACT_ROW_HEIGHT;
  }

  return TRIP_TIME_GRID_ROW_HEIGHT;
}

function subscribeToMediaQuery(query, listener) {
  if (query.addEventListener) {
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }

  query.addListener(listener);
  return () => query.removeListener(listener);
}

function getMediaQueryMatches(queryText) {
  return typeof window !== "undefined" && window.matchMedia(queryText).matches;
}

function useMediaQueryMatch(queryText) {
  const [matches, setMatches] = useState(() => getMediaQueryMatches(queryText));

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const query = window.matchMedia(queryText);
    const updateMatches = () => setMatches(query.matches);

    updateMatches();
    return subscribeToMediaQuery(query, updateMatches);
  }, [queryText]);

  return matches;
}

function useTripTimelineRowHeight() {
  const [rowHeight, setRowHeight] = useState(getTripTimelineRowHeight);

  useEffect(() => {
    const compactQuery = window.matchMedia(COMPACT_TIMELINE_QUERY);
    const tabletQuery = window.matchMedia(TABLET_TIMELINE_QUERY);
    const phoneQuery = window.matchMedia(PHONE_TIMELINE_QUERY);
    const updateRowHeight = () => setRowHeight(getTripTimelineRowHeight());

    updateRowHeight();
    const unsubscribeCompact = subscribeToMediaQuery(compactQuery, updateRowHeight);
    const unsubscribeTablet = subscribeToMediaQuery(tabletQuery, updateRowHeight);
    const unsubscribePhone = subscribeToMediaQuery(phoneQuery, updateRowHeight);

    return () => {
      unsubscribeCompact();
      unsubscribeTablet();
      unsubscribePhone();
    };
  }, []);

  return rowHeight;
}

function TripCalendarBoard({ days, onOpenDay, onScheduleMove, onScheduleResize, onAddScheduleAt, onEditSchedule }) {
  const slots = buildTimeGridSlots();
  const stayRailItems = useMemo(() => buildStayRailItems(days), [days]);
  const gridWrapRef = useRef(null);
  const stickyStackRef = useRef(null);
  const hasAppliedSmartStartRef = useRef(false);
  const [timelineScrollLeft, setTimelineScrollLeft] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [addPreview, setAddPreview] = useState(null);
  const addPointerRef = useRef(null);
  const rowHeight = useTripTimelineRowHeight();
  const smartStartMinutes = useMemo(() => getTimelineSmartStartMinutes(days), [days]);
  const dragScheduler = useScheduleDrag({ days, onScheduleMove, onScheduleResize, rowHeight });
  const gridStyle = {
    "--day-count": days.length,
    "--slot-count": slots.length,
    "--time-row-height": `${rowHeight}px`
  };

  useEffect(() => {
    updateTimelineScrollState();

    function handleResize() {
      updateTimelineScrollState();
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [days.length]);

  useEffect(() => {
    if (hasAppliedSmartStartRef.current || smartStartMinutes === null || typeof window === "undefined") {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      const grid = gridWrapRef.current;
      const stickyStack = stickyStackRef.current;
      if (!grid || !stickyStack) return;

      const topbarHeight = document.querySelector(".topbar")?.getBoundingClientRect().height ?? 0;
      const stickyStackHeight = stickyStack.getBoundingClientRect().height;
      const smartStartOffset = ((smartStartMinutes - TIME_GRID_START_MINUTES) / TIME_GRID_STEP_MINUTES) * rowHeight;
      const targetTop = Math.max(
        0,
        window.scrollY + grid.getBoundingClientRect().top + smartStartOffset - topbarHeight - stickyStackHeight
      );

      hasAppliedSmartStartRef.current = true;
      window.scrollTo({ top: targetTop, behavior: "auto" });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [rowHeight, smartStartMinutes]);

  function updateTimelineScrollState(node = gridWrapRef.current) {
    if (!node) {
      setTimelineScrollLeft(0);
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }

    const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    const nextScrollLeft = Math.min(node.scrollLeft, maxScrollLeft);
    setTimelineScrollLeft(nextScrollLeft);
    setCanScrollLeft(nextScrollLeft > 4);
    setCanScrollRight(maxScrollLeft - nextScrollLeft > 4);
  }

  function scrollTimeline(direction) {
    const node = gridWrapRef.current;
    if (!node) {
      return;
    }

    const timeColumnWidth = node.querySelector(".trip-time-labels")?.getBoundingClientRect().width ?? 86;
    const dayColumnWidth = node.querySelector(".trip-time-day-column")?.getBoundingClientRect().width ?? 200;
    const scrollAmount = Math.max(dayColumnWidth, node.clientWidth - timeColumnWidth);
    node.scrollBy({ left: direction * scrollAmount, behavior: "smooth" });
  }

  function readAddPreview(event, day) {
    if (dragScheduler.hasRecentPointerInteraction() || event.target.closest(".trip-time-event")) {
      return null;
    }

    const start = getCellStartFromPointer(event.clientY, event.currentTarget, rowHeight);
    if (!isScheduleSlotAvailable(day.schedule, null, start, TIME_GRID_STEP_MINUTES)) {
      return null;
    }

    return {
      ...getTimeGridBlockLayout(start, TIME_GRID_STEP_MINUTES, rowHeight),
      dayId: day.id,
      start,
      duration: TIME_GRID_STEP_MINUTES,
      mode: "add",
      label: `Add at ${formatTime(start)}`,
      isAvailable: true
    };
  }

  function handleAddPointerMove(event, day) {
    const nextPreview = readAddPreview(event, day);
    setAddPreview((current) => (areDropPreviewsEqual(current, nextPreview) ? current : nextPreview));
  }

  function handleAddPointerDown(event, day) {
    if (event.button && event.button !== 0) {
      return;
    }

    if (event.target.closest(".trip-time-event")) {
      addPointerRef.current = null;
      return;
    }

    addPointerRef.current = {
      dayId: day.id,
      startX: event.clientX,
      startY: event.clientY
    };
  }

  function handleAddClick(event, day) {
    if (event.target.closest(".trip-time-event") || dragScheduler.hasRecentPointerInteraction()) {
      return;
    }

    const pointerStart = addPointerRef.current;
    addPointerRef.current = null;
    const movement = pointerStart ? Math.abs(event.clientX - pointerStart.startX) + Math.abs(event.clientY - pointerStart.startY) : 0;
    if (pointerStart?.dayId !== day.id || movement > 8) {
      return;
    }

    const nextPreview = addPreview?.dayId === day.id ? addPreview : readAddPreview(event, day);
    if (!nextPreview) {
      setAddPreview(null);
      return;
    }

    setAddPreview(null);
    onAddScheduleAt(day.id, nextPreview.start);
  }

  function clearAddPreview(dayId) {
    setAddPreview((current) => (current?.dayId === dayId ? null : current));
  }

  return (
    <div
      className="trip-time-grid-shell"
      aria-label="Trip schedule time grid"
      onPointerMove={dragScheduler.handlePointerMove}
      onPointerUp={dragScheduler.handlePointerUp}
      onPointerCancel={dragScheduler.handlePointerCancel}
    >
      <div className="trip-time-sticky-stack" ref={stickyStackRef}>
        <div className="trip-time-navigation" aria-label="Browse trip days">
          <span>Browse days</span>
          <div>
            <button className="trip-time-scroll-button" type="button" aria-label="Scroll to previous days" disabled={!canScrollLeft} onClick={() => scrollTimeline(-1)}>
              <ChevronLeft size={18} />
            </button>
            <button className="trip-time-scroll-button" type="button" aria-label="Scroll to next days" disabled={!canScrollRight} onClick={() => scrollTimeline(1)}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        <div className="trip-time-sticky-header" style={gridStyle}>
          <div className="trip-time-corner">Time</div>
          <div className="trip-time-header-scroll">
            <div className="trip-time-header-days" style={{ transform: `translateX(-${timelineScrollLeft}px)` }}>
              {days.map((day) => (
                <div
                  className={`trip-time-day-header trip-day-theme-${((day.dayNumber - 1) % 6) + 1}`}
                  key={day.id}
                >
                  <button className="trip-time-day-header-main" type="button" onClick={() => onOpenDay(day.id)}>
                    <strong>
                      {day.label || `Day ${day.dayNumber}`} - {formatWeekday(day.date)}
                    </strong>
                    <span>{formatShortDate(day.date)}</span>
                    <small>
                      <MapPin size={12} />
                      {day.city}
                    </small>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <StayRail days={days} stays={stayRailItems} scrollLeft={timelineScrollLeft} gridStyle={gridStyle} onEditSchedule={onEditSchedule} />
      </div>
      <div className="trip-time-grid-wrap" ref={gridWrapRef} onScroll={(event) => updateTimelineScrollState(event.currentTarget)}>
        <div className="trip-time-grid trip-time-body-grid" style={gridStyle}>
          <div className="trip-time-labels">
            {slots.map((slot) => (
              <div className={`trip-time-label ${slot.minutes % 60 === 0 ? "is-hour" : ""}`} key={slot.minutes}>
                {formatMinutesTime(slot.minutes)}
              </div>
            ))}
          </div>
          {days.map((day, index) => (
            <TripTimeDayColumn
              day={day}
              key={day.id}
              columnIndex={index + 2}
              draggedItemId={dragScheduler.draggedItemId}
              resizingItemId={dragScheduler.resizingItemId}
              dropPreview={dragScheduler.getDropPreviewForDay(day.id) ?? (addPreview?.dayId === day.id ? addPreview : null)}
              rowHeight={rowHeight}
              onPointerDown={dragScheduler.handlePointerDown}
              onResizePointerDown={dragScheduler.handleResizePointerDown}
              onAddPointerMove={handleAddPointerMove}
              onAddPointerDown={handleAddPointerDown}
              onAddClick={handleAddClick}
              onAddPointerLeave={clearAddPreview}
              onEditSchedule={onEditSchedule}
              shouldSuppressClick={dragScheduler.shouldSuppressClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StayRail({ days, stays, scrollLeft, gridStyle, onEditSchedule }) {
  if (!stays.length) {
    return null;
  }

  const rowCount = Math.max(1, ...stays.map((stay) => stay.rowIndex + 1));
  const railGridStyle = {
    minHeight: `${rowCount * 36 + Math.max(0, rowCount - 1) * 6 + 10}px`
  };

  return (
    <div className="trip-stay-rail" style={gridStyle} aria-label="Hotel stays">
      <div className="trip-stay-rail-label">Hotels</div>
      <div className="trip-stay-rail-scroll">
        <div className="trip-stay-rail-days" style={{ transform: `translateX(-${scrollLeft}px)` }}>
          <div className="trip-stay-rail-grid" style={railGridStyle}>
            {stays.map((stay) => (
              <button
                className="trip-stay-bar"
                type="button"
                key={`${stay.sourceDayId}-${stay.item.id}`}
                style={{
                  left: `calc(${stay.leftPercent}% + 4px)`,
                  top: `${5 + stay.rowIndex * 42}px`,
                  width: `calc(${stay.widthPercent}% - 8px)`,
                  "--stay-bg": stay.color.background,
                  "--stay-bg-soft": stay.color.backgroundSoft,
                  "--stay-border": stay.color.border,
                  "--stay-text": stay.color.text
                }}
                onClick={() => onEditSchedule(stay.sourceDayId, stay.item)}
              >
                <span>
                  <strong>{stay.item.title}</strong>
                  <small>{stay.dateLabel}</small>
                </span>
                <span className="trip-stay-bar-tags">
                  {stay.startsInView ? <em>Check-in {formatTime(stay.item.checkInTime || DEFAULT_CHECK_IN_TIME)}</em> : null}
                  {stay.endsInView ? <em>Check-out {formatTime(stay.item.checkOutTime || DEFAULT_CHECK_OUT_TIME)}</em> : null}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TripTimeDayColumn({
  day,
  columnIndex,
  draggedItemId,
  resizingItemId,
  dropPreview,
  rowHeight,
  onPointerDown,
  onResizePointerDown,
  onAddPointerMove,
  onAddPointerDown,
  onAddClick,
  onAddPointerLeave,
  onEditSchedule,
  shouldSuppressClick
}) {
  const tagAssets = useTagAssets();
  const schedule = sortActivitySchedule(day.schedule);

  return (
    <div
      className={`trip-time-day-column trip-day-theme-${((day.dayNumber - 1) % 6) + 1}`}
      data-drop-day-id={day.id}
      style={{ gridColumn: columnIndex }}
      onPointerMove={(event) => onAddPointerMove(event, day)}
      onPointerDown={(event) => onAddPointerDown(event, day)}
      onPointerLeave={() => onAddPointerLeave(day.id)}
      onClick={(event) => onAddClick(event, day)}
    >
      <DropSlotIndicator preview={dropPreview} />
      {schedule.map((item) => {
        const config = getCategoryConfigForAssets(item.category, tagAssets);
        const Icon = config.icon;
        const layout = getTimeGridEventLayout(item, rowHeight);
        const detail = getTripTimeEventDetail(item, day.city, tagAssets);

        return (
          <article
            className={`trip-time-event category-${config.className} ${Number(item.duration) >= 60 ? "has-readable-title" : ""} ${layout.isClamped ? "is-clamped" : ""} ${draggedItemId === item.id ? "is-dragging" : ""} ${
              resizingItemId === item.id ? "is-resizing" : ""
            }`}
            role="button"
            tabIndex={0}
            style={{ top: layout.top, height: layout.height }}
            key={item.id}
            data-schedule-id={item.id}
            onPointerDown={(event) => onPointerDown(event, item, day.id)}
            onClick={() => {
              if (shouldSuppressClick()) {
                return;
              }
              onEditSchedule(day.id, item);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onEditSchedule(day.id, item);
              }
            }}
          >
            <span
              className="resize-handle resize-handle-start"
              aria-hidden="true"
              title="Resize start time"
              onPointerDown={(event) => onResizePointerDown(event, item, day.id, "resize-start")}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            />
            <span className="trip-time-event-main">
              <span className="trip-time-event-time">{formatTime(item.start)}</span>
              <Icon size={15} />
              <strong>{item.title}</strong>
            </span>
            <span className={`trip-time-category-label ${config.className}`}>
              <TagIcon src={config.asset} size="tiny" />
              {config.short}
            </span>
            {detail.description ? <span className="trip-time-event-description">{detail.description}</span> : null}
            {detail.meta.length ? (
              <span className="trip-time-event-meta">
                {detail.meta.map((meta) => (
                  <span key={meta.key}>
                    {meta.asset ? <TagIcon src={meta.asset} size="tiny" /> : null}
                    {meta.label}
                  </span>
                ))}
              </span>
            ) : null}
            <span
              className="resize-handle resize-handle-end"
              aria-hidden="true"
              title="Resize end time"
              onPointerDown={(event) => onResizePointerDown(event, item, day.id, "resize-end")}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            />
          </article>
        );
      })}
    </div>
  );
}


function MapSection({ trip, tripId, days, selectedDay, mapsProfile, tagAssets, mapOverview, onAddIdea, onAddActivity, onOpenDay, onPromoteIdea, onEditItem }) {
  const [filters, setFilters] = useState(MAP_DEFAULT_FILTERS);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [isRouteMode, setIsRouteMode] = useState(false);
  const [isMobileMapSearchOpen, setIsMobileMapSearchOpen] = useState(false);
  const [routeSelectedItemIds, setRouteSelectedItemIds] = useState([]);
  const [routeTravelMode, setRouteTravelMode] = useState("WALK");
  const [routePreviewState, setRoutePreviewState] = useState({ status: "idle", data: null, error: "" });
  const [mapLoadError, setMapLoadError] = useState("");
  const [outsideResultCount, setOutsideResultCount] = useState(0);
  const [focusResultsRequest, setFocusResultsRequest] = useState(0);
  const mobileMapSearchInputRef = useRef(null);
  const isPhoneMapView = useMediaQueryMatch(PHONE_TIMELINE_QUERY);
  const [remoteMapConfig, setRemoteMapConfig] = useState({
    status: GOOGLE_MAPS_BROWSER_KEY ? "ready" : "idle",
    apiKey: GOOGLE_MAPS_BROWSER_KEY,
    mapId: GOOGLE_MAPS_MAP_ID,
    message: ""
  });

  const filteredMap = useMemo(() => filterPlannerMapItems(mapOverview, filters, searchQuery), [mapOverview, filters, searchQuery]);
  const initialMapItems = useMemo(
    () => selectInitialMapCluster(mapOverview.mappedItems, selectedDay),
    [mapOverview.mappedItems, selectedDay]
  );
  const visibleItemIds = useMemo(() => new Set(filteredMap.allItems.map((item) => item.id)), [filteredMap.allItems]);
  const selectedItem = filteredMap.mappedItems.find((item) => item.id === selectedItemId) ?? null;
  const routeSelectableItems = useMemo(() => new Map(filteredMap.mappedItems.map((item) => [item.id, item])), [filteredMap.mappedItems]);
  const routeSelectedItems = useMemo(() => routeSelectedItemIds.map((itemId) => routeSelectableItems.get(itemId)).filter(Boolean), [routeSelectedItemIds, routeSelectableItems]);
  const cityOptions = useMemo(() => buildMapCityOptions(mapOverview.allItems), [mapOverview.allItems]);
  const dayOptions = useMemo(() => days.map((day) => ({ value: day.id, label: formatMapDayLabel(day) })), [days]);
  const activeFilterChips = useMemo(() => buildActiveMapFilterChips(filters, { dayOptions, cityOptions }), [filters, dayOptions, cityOptions]);
  const activeFilterCount = activeFilterChips.length;
  const hasActiveMapQuery = activeFilterCount > 0 || Boolean(searchQuery.trim());
  const fallbackCenter = getMapFallbackCenter(mapsProfile);
  const mapApiKey = GOOGLE_MAPS_BROWSER_KEY || remoteMapConfig.apiKey;
  const mapId = GOOGLE_MAPS_MAP_ID || remoteMapConfig.mapId || "DEMO_MAP_ID";
  const mapSetupMessage = getMapSetupMessage(remoteMapConfig);
  const selectedPlacePreview = usePlacePreview(selectedItem?.place?.id, selectedItem ? 520 : 0);
  const handleOutsideResultsChange = useCallback((count) => {
    setOutsideResultCount(hasActiveMapQuery ? count : 0);
  }, [hasActiveMapQuery]);

  useEffect(() => {
    if (GOOGLE_MAPS_BROWSER_KEY) {
      return;
    }

    let isCurrent = true;
    setRemoteMapConfig((current) => ({ ...current, status: "loading", message: "" }));
    loadMapsConfigCached()
      .then((config) => {
        if (!isCurrent) {
          return;
        }
        setRemoteMapConfig({
          status: "ready",
          apiKey: config.apiKey ?? "",
          mapId: config.mapId ?? GOOGLE_MAPS_MAP_ID,
          message: ""
        });
      })
      .catch((error) => {
        if (!isCurrent) {
          return;
        }
        setRemoteMapConfig({
          status: "error",
          apiKey: "",
          mapId: GOOGLE_MAPS_MAP_ID,
          message: error.message
        });
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (selectedItemId && !visibleItemIds.has(selectedItemId)) {
      setSelectedItemId("");
    }
  }, [selectedItemId, visibleItemIds]);

  useEffect(() => {
    if (!hasActiveMapQuery || filteredMap.mappedItems.length === 0) {
      setOutsideResultCount(0);
    }
  }, [filteredMap.mappedItems.length, hasActiveMapQuery]);

  useEffect(() => {
    if (!isMobileMapSearchOpen || typeof window === "undefined") {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      mobileMapSearchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isMobileMapSearchOpen]);

  useEffect(() => {
    setRouteSelectedItemIds((current) => {
      const next = current.filter((itemId) => routeSelectableItems.has(itemId));
      if (next.length !== current.length) {
        setRoutePreviewState({ status: "idle", data: null, error: "" });
      }
      return next;
    });
  }, [routeSelectableItems]);

  useEffect(() => {
    if (!mapApiKey || typeof window === "undefined") {
      return undefined;
    }

    const previousAuthFailure = window.gm_authFailure;
    const handleAuthFailure = () => {
      setMapLoadError("Google rejected this browser map key. Check that GOOGLE_MAPS_BROWSER_KEY allows Maps JavaScript API and the neoncartridgelabs.com referrer.");
      if (typeof previousAuthFailure === "function") {
        previousAuthFailure();
      }
    };

    window.gm_authFailure = handleAuthFailure;

    return () => {
      if (window.gm_authFailure === handleAuthFailure) {
        window.gm_authFailure = previousAuthFailure;
      }
    };
  }, [mapApiKey]);

  function applyFilters(nextFilters) {
    setOutsideResultCount(0);
    setFilters(nextFilters);
    setIsFilterSheetOpen(false);
  }

  function resetFilters() {
    setOutsideResultCount(0);
    setFilters(MAP_DEFAULT_FILTERS);
  }

  function clearMapView() {
    setOutsideResultCount(0);
    setSearchQuery("");
    setFilters(MAP_DEFAULT_FILTERS);
  }

  function reviewMissingLocations() {
    setOutsideResultCount(0);
    setSearchQuery("");
    setFilters({ ...MAP_DEFAULT_FILTERS, location: "Needs location" });
  }

  function handleMapSearchChange(value) {
    setOutsideResultCount(0);
    setSearchQuery(value);
  }

  function toggleRouteMode() {
    setIsRouteMode((current) => {
      const next = !current;
      if (next) {
        setSelectedItemId("");
      } else {
        clearRoutePreview();
      }
      return next;
    });
  }

  function clearRoutePreview() {
    setRouteSelectedItemIds([]);
    setRoutePreviewState({ status: "idle", data: null, error: "" });
  }

  function clearMapSearch(event) {
    setOutsideResultCount(0);
    setSearchQuery("");
    event.currentTarget.closest("label")?.querySelector("input")?.blur();
  }

  function handleMapMarkerSelect(itemId) {
    if (!isRouteMode) {
      setIsMobileMapSearchOpen(false);
      setSelectedItemId(itemId);
      return;
    }

    setSelectedItemId("");
    setRoutePreviewState({ status: "idle", data: null, error: "" });
    setRouteSelectedItemIds((current) => (
      current.includes(itemId)
        ? current.filter((selectedItemId) => selectedItemId !== itemId)
        : [...current, itemId]
    ));
  }

  async function handleRoutePreview() {
    if (routeSelectedItems.length < 2 || routePreviewState.status === "loading") {
      return;
    }

    setRoutePreviewState({ status: "loading", data: null, error: "" });
    try {
      const result = await previewRouteCached({
        travelMode: routeTravelMode,
        countryName: mapsProfile.countryName,
        stops: routeSelectedItems.map((item) => ({
          id: item.id,
          title: item.title,
          latitude: item.position.lat,
          longitude: item.position.lng
        }))
      });
      setRoutePreviewState({ status: "success", data: result, error: "" });
    } catch (error) {
      setRoutePreviewState({ status: "error", data: null, error: error.message || "Could not preview this route." });
    }
  }

  const showNeedsLocation = filters.location !== "Mapped";
  const showMap = filters.location !== "Needs location";
  const showRoutePanel = isRouteMode;
  const emptyState = getMapEmptyState({
    plannerItemCount: mapOverview.allItems.length,
    mappedItemCount: mapOverview.mappedItems.length,
    needsLocationCount: mapOverview.needsLocationItems.length,
    hasActiveQuery: Boolean(searchQuery.trim()) || activeFilterChips.some((chip) => chip.key !== "location"),
    locationFilter: filters.location
  });
  const emptyStateActions = {
    "add-idea": { label: "Add idea", icon: Plus, onClick: onAddIdea },
    "add-activity": { label: "Add activity", icon: CalendarDays, onClick: onAddActivity },
    "clear-view": { label: "Clear filters and search", icon: RefreshCcw, onClick: clearMapView },
    "review-missing": { label: "Review missing locations", icon: MapPin, onClick: reviewMissingLocations },
    "show-mapped": { label: "Show mapped places", icon: MapPin, onClick: clearMapView }
  };

  return (
    <section className="map-section" aria-label="Trip map">
      <div className="map-section-header">
        <div className="map-section-copy">
          <h1>Map</h1>
          <p>{mapOverview.mappedItems.length} mapped places</p>
        </div>
        <span className={`map-location-status${mapOverview.needsLocationItems.length ? " has-missing" : ""}`}>
          {mapOverview.needsLocationItems.length ? `${mapOverview.needsLocationItems.length} need location` : "All mapped"}
        </span>
        <label className="map-search-field">
          <span>
            <Search size={15} />
            <span className="sr-only">Search map</span>
          </span>
          <input type="search" value={searchQuery} placeholder="Search places or cities" onChange={(event) => handleMapSearchChange(event.target.value)} />
          <button className="map-search-clear" type="button" aria-label="Cancel map search" onMouseDown={(event) => event.preventDefault()} onClick={clearMapSearch}>
            <X size={16} />
          </button>
        </label>
      </div>

      <MapFilterToolbar
        activeFilterChips={activeFilterChips}
        activeFilterCount={activeFilterCount}
        isRouteMode={isRouteMode}
        onOpenFilters={() => setIsFilterSheetOpen(true)}
        onReset={resetFilters}
        onToggleRouteMode={toggleRouteMode}
      />

      <div className={`map-workspace${!showNeedsLocation && !showRoutePanel ? " is-map-only" : ""}`}>
        <div className="map-canvas-panel">
          {showMap ? (
            mapApiKey && !mapLoadError ? (
              filteredMap.mappedItems.length ? (
                <React.Suspense fallback={<MapPlaceholder title="Loading map" detail="Preparing your trip places." />}>
                  <LazyPlannerGoogleMap
                    apiKey={mapApiKey}
                    mapId={mapId}
                    items={filteredMap.mappedItems}
                    initialItems={initialMapItems}
                    selectedItemId={isRouteMode ? "" : selectedItemId}
                    routeSelectedItemIds={routeSelectedItemIds}
                    fallbackCenter={fallbackCenter}
                    storageKey={mapCameraStorageKey(tripId)}
                    focusRequest={focusResultsRequest}
                    isPhoneView={isPhoneMapView}
                    onOutsideResultsChange={handleOutsideResultsChange}
                    onSelectItem={handleMapMarkerSelect}
                    onMapError={(error) => setMapLoadError(formatGoogleMapsApiError(error))}
                  />
                </React.Suspense>
              ) : (
                <MapPlaceholder
                  title={emptyState.title}
                  detail={emptyState.detail}
                  primaryAction={emptyStateActions[emptyState.primaryAction]}
                  secondaryAction={emptyStateActions[emptyState.secondaryAction]}
                />
              )
            ) : (
              <MapPlaceholder title={mapLoadError ? "Maps JavaScript key blocked" : mapSetupMessage.title} detail={mapLoadError || mapSetupMessage.detail} />
            )
          ) : (
            <MapPlaceholder
              title={emptyState.title}
              detail={emptyState.detail}
              primaryAction={emptyStateActions[emptyState.primaryAction]}
            />
          )}

          <MapMobileControls
            activeFilterCount={activeFilterCount}
            hasSelectedItem={Boolean(selectedItem && !isRouteMode)}
            isRouteMode={isRouteMode}
            isSearchOpen={isMobileMapSearchOpen}
            missingLocationCount={mapOverview.needsLocationItems.length}
            searchInputRef={mobileMapSearchInputRef}
            searchQuery={searchQuery}
            onCloseSearch={() => setIsMobileMapSearchOpen(false)}
            onOpenFilters={() => setIsFilterSheetOpen(true)}
            onOpenSearch={() => setIsMobileMapSearchOpen(true)}
            onSearchChange={handleMapSearchChange}
            onToggleRouteMode={toggleRouteMode}
          />

          {outsideResultCount > 0 && !selectedItem && !isRouteMode ? (
            <div className="map-outside-results" role="status">
              <span>{outsideResultCount} matching {outsideResultCount === 1 ? "place" : "places"} outside this area</span>
              <button type="button" onClick={() => {
                setOutsideResultCount(0);
                setFocusResultsRequest((value) => value + 1);
              }}>Show results</button>
            </div>
          ) : null}

          {selectedItem && !isRouteMode ? (
            <MapDetailCard
              item={selectedItem}
              previewState={selectedPlacePreview}
              onClose={() => setSelectedItemId("")}
              onEdit={() => onEditItem(selectedItem)}
              onOpenDay={() => selectedItem.dayId ? onOpenDay(selectedItem.dayId) : null}
              onPromoteIdea={() => selectedItem.source === "idea" ? onPromoteIdea(selectedItem.sourceItem) : null}
            />
          ) : null}
        </div>

        {showRoutePanel ? (
          <MapRoutePanel
            selectedItems={routeSelectedItems}
            travelMode={routeTravelMode}
            previewState={routePreviewState}
            onTravelModeChange={(nextTravelMode) => {
              setRouteTravelMode(nextTravelMode);
              setRoutePreviewState({ status: "idle", data: null, error: "" });
            }}
            onPreview={handleRoutePreview}
            onCancel={() => {
              setIsRouteMode(false);
              clearRoutePreview();
            }}
            onRemoveItem={(itemId) => {
              setRouteSelectedItemIds((current) => current.filter((selectedItemId) => selectedItemId !== itemId));
              setRoutePreviewState({ status: "idle", data: null, error: "" });
            }}
          />
        ) : showNeedsLocation ? (
          <aside className="map-side-panel" aria-label="Items that need locations">
            <div className="map-panel-heading">
              <div>
                <strong>Needs location</strong>
                <small>{filteredMap.needsLocationItems.length} items</small>
              </div>
              <MapPin size={18} />
            </div>
            {filteredMap.needsLocationItems.length ? (
              <div className="map-location-list">
                {filteredMap.needsLocationItems.map((item) => (
                  <MapLocationRow item={item} key={item.id} onEdit={() => onEditItem(item)} />
                ))}
              </div>
            ) : (
              <div className="map-panel-empty">
                <CheckCircle2 size={19} />
                <span>Everything in this view has a location.</span>
              </div>
            )}
          </aside>
        ) : null}
      </div>

      {isFilterSheetOpen ? (
        <MapFilterSheet
          filters={filters}
          dayOptions={dayOptions}
          cityOptions={cityOptions}
          onApply={applyFilters}
          onCancel={() => setIsFilterSheetOpen(false)}
        />
      ) : null}
    </section>
  );
}

function MapMobileControls({
  activeFilterCount,
  hasSelectedItem,
  isRouteMode,
  isSearchOpen,
  missingLocationCount,
  searchInputRef,
  searchQuery,
  onCloseSearch,
  onOpenFilters,
  onOpenSearch,
  onSearchChange,
  onToggleRouteMode
}) {
  return (
    <div className={`map-mobile-controls${isSearchOpen ? " is-search-open" : ""}${hasSelectedItem ? " has-selected-card" : ""}${missingLocationCount > 0 ? " has-missing-location" : ""}`} aria-label="Mobile map controls">
      {isSearchOpen ? (
        <label className="map-mobile-search-field">
          <Search size={17} />
          <span className="sr-only">Search map</span>
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            placeholder="Search places or cities"
            onChange={(event) => onSearchChange(event.target.value)}
          />
          <button className="map-mobile-search-close" type="button" aria-label="Close map search" onClick={onCloseSearch}>
            <X size={18} />
          </button>
        </label>
      ) : (
        <div className="map-mobile-control-rail">
          <div className="map-mobile-control-group">
            <button className="map-mobile-control-button" type="button" aria-label="Open map filters" onClick={onOpenFilters}>
              <Filter size={18} />
              {activeFilterCount ? <span aria-label={`${activeFilterCount} active filters`}>{activeFilterCount}</span> : null}
            </button>
            <button className={`map-mobile-control-button${isRouteMode ? " is-active" : ""}`} type="button" aria-label={isRouteMode ? "Exit route mode" : "Open route mode"} aria-pressed={isRouteMode} onClick={onToggleRouteMode}>
              <Route size={18} />
            </button>
          </div>
          <button className="map-mobile-control-button" type="button" aria-label="Search map" onClick={onOpenSearch}>
            <Search size={18} />
          </button>
        </div>
      )}

      {missingLocationCount > 0 && !isSearchOpen ? (
        <span className="map-mobile-status-pill">{missingLocationCount} need location</span>
      ) : null}
    </div>
  );
}

function usePlacePreview(placeId, maxWidthPx) {
  const [previewState, setPreviewState] = useState({ status: "idle", data: null, error: "" });

  useEffect(() => {
    const normalizedPlaceId = String(placeId ?? "").trim();
    if (!normalizedPlaceId) {
      setPreviewState({ status: "idle", data: null, error: "" });
      return undefined;
    }

    let isCurrent = true;
    setPreviewState({ status: "loading", data: null, error: "" });

    loadPlacePreviewCached({ placeId: normalizedPlaceId, maxWidthPx })
      .then((data) => {
        if (!isCurrent) {
          return;
        }
        setPreviewState({ status: "ready", data, error: "" });
      })
      .catch((error) => {
        if (!isCurrent) {
          return;
        }
        setPreviewState({ status: "error", data: null, error: error.message || "Could not load this place preview." });
      });

    return () => {
      isCurrent = false;
    };
  }, [placeId, maxWidthPx]);

  return previewState;
}

function MapFilterToolbar({ activeFilterChips, activeFilterCount, isRouteMode = false, onOpenFilters, onReset, onToggleRouteMode }) {
  return (
    <div className="map-filter-toolbar" aria-label="Map filter controls">
      <button className="ghost-button map-filter-trigger" type="button" onClick={onOpenFilters} aria-haspopup="dialog">
        <Filter size={16} />
        Filters
        {activeFilterCount ? <span aria-label={`${activeFilterCount} active filters`}>{activeFilterCount}</span> : null}
      </button>
      <button className={`ghost-button map-route-trigger${isRouteMode ? " is-active" : ""}`} type="button" onClick={onToggleRouteMode} aria-pressed={isRouteMode}>
        <Route size={16} />
        Route
      </button>
      <div className="map-active-filter-chips" aria-label="Active map filters">
        {activeFilterChips.length ? (
          activeFilterChips.map((chip) => (
            <span className="map-active-filter-chip" key={chip.key}>{chip.label}</span>
          ))
        ) : (
          <span className="map-active-filter-chip is-default">Default view</span>
        )}
        {activeFilterChips.length ? (
          <button className="map-active-filter-chip is-reset" type="button" onClick={onReset}>
            Reset
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MapRoutePanel({ selectedItems, travelMode, previewState, onTravelModeChange, onPreview, onCancel, onRemoveItem }) {
  const canPreview = selectedItems.length >= 2 && previewState.status !== "loading";
  const result = previewState.data;

  return (
    <aside className="map-side-panel map-route-panel" aria-label="Route preview">
      <div className="map-panel-heading">
        <div>
          <strong>Route preview</strong>
          <small>{selectedItems.length} selected</small>
        </div>
        <Route size={18} />
      </div>

      <div className="map-route-panel-body">
        <fieldset className="map-route-mode-group">
          <legend>Travel mode</legend>
          <div className="map-filter-segmented">
            {["WALK", "DRIVE", "TRANSIT"].map((mode) => (
              <button className={travelMode === mode ? "is-active" : ""} type="button" key={mode} aria-pressed={travelMode === mode} onClick={() => onTravelModeChange(mode)}>
                {formatRouteTravelMode(mode)}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="map-route-selected">
          <div className="map-route-section-title">
            <strong>Selected stops</strong>
            <span>Tap markers to add or remove</span>
          </div>
          {selectedItems.length ? (
            <ol className="map-route-stop-list">
              {selectedItems.map((item, index) => (
                <li key={item.id}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.category}{item.city ? ` · ${item.city}` : ""}</small>
                  </div>
                  <button className="icon-button flat" type="button" aria-label={`Remove ${item.title}`} onClick={() => onRemoveItem(item.id)}>
                    <X size={15} />
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="map-route-empty">Select at least two mapped markers to preview travel time.</p>
          )}
        </div>

        <div className="map-route-actions">
          <button className="ghost-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-button" type="button" disabled={!canPreview} onClick={onPreview}>
            {previewState.status === "loading" ? "Previewing..." : "Preview route"}
          </button>
        </div>

        {previewState.status === "error" ? (
          <div className="map-route-warning">
            <Info size={16} />
            <span>{previewState.error}</span>
          </div>
        ) : null}

        {result ? (
          <div className="map-route-result">
            <div className="map-route-result-summary">
              <span>{formatRouteTravelMode(result.travelMode)} route</span>
              <strong>{result.totalTravelMinutes == null ? "Time unavailable" : `About ${formatDuration(result.totalTravelMinutes)} total`}</strong>
            </div>
            <ol className="map-route-leg-list">
              {(result.legs ?? []).map((leg) => (
                <li key={`${leg.originStopId}:${leg.destinationStopId}`}>
                  <div>
                    <strong>To {leg.destinationTitle}</strong>
                    <small>{[leg.durationMinutes == null ? "" : `About ${formatDuration(leg.durationMinutes)}`, formatRouteDistance(leg.distanceMeters), formatRouteFare(leg.fareYen)].filter(Boolean).join(" · ")}</small>
                    <RouteModeChips modes={leg.modes} fallbackMode={result.travelMode} label={leg.summary} />
                  </div>
                  <span>{leg.durationMinutes == null ? "n/a" : formatDuration(leg.durationMinutes)}</span>
                </li>
              ))}
            </ol>
            {result.warnings?.length ? (
              <div className="map-route-note">
                <Info size={16} />
                <span>{humanizeRouteNote(result.warnings[0])}</span>
              </div>
            ) : null}
            {result.googleMapsUrl ? (
              <a className="primary-button compact-action" href={result.googleMapsUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={15} />
                Open live route
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function MapFilterSheet({ filters, dayOptions, cityOptions, onApply, onCancel }) {
  const [draftFilters, setDraftFilters] = useState(filters);
  const draftActiveFilterCount = buildActiveMapFilterChips(draftFilters, { dayOptions, cityOptions }).length;

  function updateDraftFilter(key, value) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="dialog-backdrop map-filter-backdrop">
      <div className="dialog map-filter-dialog" role="dialog" aria-modal="true" aria-labelledby="map-filter-title">
        <div className="dialog-header map-filter-dialog-header">
          <div>
            <h2 id="map-filter-title">Map filters</h2>
            <p>{draftActiveFilterCount} active filter{draftActiveFilterCount === 1 ? "" : "s"}</p>
          </div>
          <button className="icon-button flat" type="button" data-dialog-close onClick={onCancel} aria-label="Close map filters">
            <X size={18} />
          </button>
        </div>

        <div className="map-filter-sheet-body">
          <MapSegmentedControl label="Source" value={draftFilters.source} options={MAP_SOURCE_FILTERS} onChange={(value) => updateDraftFilter("source", value)} />
          <MapSegmentedControl label="Location" value={draftFilters.location} options={MAP_LOCATION_FILTERS} onChange={(value) => updateDraftFilter("location", value)} />

          <div className="map-filter-sheet-selects">
            <MapFilterSelect label="Day" value={draftFilters.dayId} options={[{ value: "All", label: "All days" }, ...dayOptions]} onChange={(value) => updateDraftFilter("dayId", value)} />
            <MapFilterSelect label="City" value={draftFilters.city} options={[{ value: "All", label: "All cities" }, ...cityOptions]} onChange={(value) => updateDraftFilter("city", value)} />
          </div>

          <MapChipChoiceGroup label="Category" value={draftFilters.category} options={CATEGORY_FILTERS} onChange={(value) => updateDraftFilter("category", value)} />
          <MapChipChoiceGroup label="Status" value={draftFilters.status} options={["All", ...STATUSES]} onChange={(value) => updateDraftFilter("status", value)} />
        </div>

        <div className="dialog-actions map-filter-dialog-actions">
          <button className="ghost-button" type="button" onClick={() => setDraftFilters(MAP_DEFAULT_FILTERS)}>
            Reset
          </button>
          <button className="primary-button" type="button" onClick={() => onApply(draftFilters)}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function MapSegmentedControl({ label, value, options, onChange }) {
  return (
    <fieldset className="map-filter-choice-group">
      <legend>{label}</legend>
      <div className="map-filter-segmented">
        {options.map((option) => (
          <button className={option === value ? "is-active" : ""} type="button" key={option} aria-pressed={option === value} onClick={() => onChange(option)}>
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function MapChipChoiceGroup({ label, value, options, onChange }) {
  return (
    <fieldset className="map-filter-choice-group">
      <legend>{label}</legend>
      <div className="map-filter-chip-grid">
        {options.map((option) => (
          <button className={option === value ? "is-active" : ""} type="button" key={option} aria-pressed={option === value} onClick={() => onChange(option)}>
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function MapFilterSelect({ label, value, options, onChange }) {
  return (
    <label className="map-filter-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option value={option.value} key={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function MapPlaceholder({ title, detail, primaryAction = null, secondaryAction = null }) {
  return (
    <div className="map-placeholder">
      <MapPin size={28} />
      <strong>{title}</strong>
      <span>{detail}</span>
      {primaryAction || secondaryAction ? (
        <div className="map-placeholder-actions">
          {primaryAction ? <MapPlaceholderAction action={primaryAction} primary /> : null}
          {secondaryAction ? <MapPlaceholderAction action={secondaryAction} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function MapPlaceholderAction({ action, primary = false }) {
  const Icon = action.icon;
  return (
    <button className={primary ? "primary-button" : "ghost-button"} type="button" onClick={action.onClick}>
      {Icon ? <Icon size={16} aria-hidden="true" /> : null}
      {action.label}
    </button>
  );
}

function getMapSetupMessage(remoteMapConfig = {}) {
  if (remoteMapConfig.status === "loading") {
    return {
      title: "Loading map settings",
      detail: "Reading the Google Maps key from Supabase secrets."
    };
  }

  if (remoteMapConfig.status === "error") {
    return {
      title: "Map settings unavailable",
      detail: remoteMapConfig.message || "Supabase could not return the Google Maps browser key."
    };
  }

  if (GOOGLE_MAPS_EMBED_KEY) {
    return {
      title: "Map settings needed",
      detail: "The app can use a local VITE_GOOGLE_MAPS_BROWSER_KEY or a Supabase maps-config secret to load the interactive map."
    };
  }

  return {
    title: "Map settings needed",
    detail: "Add VITE_GOOGLE_MAPS_BROWSER_KEY locally or configure GOOGLE_MAPS_BROWSER_KEY in Supabase secrets."
  };
}

function formatGoogleMapsApiError(error) {
  const message = String(error?.message ?? error ?? "");
  if (message.includes("ApiTargetBlockedMapError")) {
    return "This key is blocked from the Maps JavaScript API. In Google Cloud, allow Maps JavaScript API on the browser key used by VITE_GOOGLE_MAPS_BROWSER_KEY.";
  }
  if (message.includes("RefererNotAllowedMapError")) {
    return "This key is not allowed for this local preview URL. Add http://127.0.0.1:4173/* to the key's website restrictions.";
  }
  if (message.includes("InvalidKeyMapError") || message.includes("ExpiredKeyMapError")) {
    return "Google rejected this browser map key. Check VITE_GOOGLE_MAPS_BROWSER_KEY in your local environment.";
  }
  return "Google Maps could not load. Check that VITE_GOOGLE_MAPS_BROWSER_KEY is enabled for Maps JavaScript API and allowed on this URL.";
}

function MapDetailCard({ item, previewState, onClose, onEdit, onOpenDay, onPromoteIdea }) {
  const preview = previewState?.data ?? null;
  const address = preview?.address || item.place?.formattedAddress || "";
  const hasPreviewPhoto = Boolean(preview?.photoUri);
  const isIdea = item.source === "idea";

  return (
    <article className="map-detail-card" aria-label={item.title}>
      <button className="map-detail-close" type="button" aria-label="Close map details" onClick={onClose}>
        <X size={15} />
      </button>
      {hasPreviewPhoto ? (
        <figure className="map-detail-preview">
          <img src={preview.photoUri} alt="" aria-hidden="true" loading="lazy" />
          <PhotoAttribution attributions={preview.authorAttributions} />
        </figure>
      ) : null}
      <div className="map-detail-title">
        <span className={`map-detail-icon category-${item.categoryClass}`}>
          <img src={item.iconSrc} alt="" aria-hidden="true" draggable={false} />
        </span>
        <div>
          <strong>{item.title}</strong>
          <small>{item.sourceLabel}{item.dayLabel ? ` · ${item.dayLabel}` : ""}</small>
        </div>
      </div>
      <div className="map-detail-meta">
        <span>{item.category}</span>
        <span>{item.status}</span>
        {item.city ? <span>{item.city}</span> : null}
      </div>
      {address ? <p className="map-detail-address">{address}</p> : null}
      <div className="map-detail-actions">
        {isIdea ? (
          <button className="primary-button compact-action map-detail-promote-action" type="button" onClick={onPromoteIdea}>
            <Plus size={15} />
            Add as activity
          </button>
        ) : null}
        <button className="ghost-button compact-action" type="button" onClick={onEdit}>
          Edit
        </button>
        {item.source === "scheduled" ? (
          <button className="ghost-button compact-action" type="button" onClick={onOpenDay}>
            Day details
          </button>
        ) : null}
        {item.googleMapsUrl ? (
          <a className="ghost-button compact-action" href={item.googleMapsUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={15} />
            Open map
          </a>
        ) : null}
      </div>
    </article>
  );
}

function PhotoAttribution({ attributions = [] }) {
  const attribution = attributions.find((entry) => entry.displayName || entry.uri);
  if (!attribution) {
    return null;
  }

  const label = attribution.displayName || "Photo";
  return (
    <figcaption className="map-detail-attribution">
      {attribution.uri ? (
        <a href={attribution.uri} target="_blank" rel="noreferrer">{label}</a>
      ) : (
        label
      )}
    </figcaption>
  );
}

function MapLocationRow({ item, onEdit }) {
  return (
    <article className="map-location-row">
      <span className={`map-detail-icon category-${item.categoryClass}`}>
        <img src={item.iconSrc} alt="" aria-hidden="true" draggable={false} />
      </span>
      <div>
        <strong>{item.title}</strong>
        <small>{item.sourceLabel}{item.dayLabel ? ` · ${item.dayLabel}` : ""}</small>
        <span>Needs a resolved location to appear on the map.</span>
      </div>
      <button className="ghost-button compact-action" type="button" onClick={onEdit}>
        Add location
      </button>
    </article>
  );
}

function formatRouteTravelMode(mode) {
  const labels = {
    WALK: "Walk",
    DRIVE: "Drive",
    TRANSIT: "Transit"
  };
  return labels[mode] ?? "Walk";
}

function RouteModeChips({ modes = [], fallbackMode = "", label = "" }) {
  const displayModes = normalizeRouteModes(modes, fallbackMode);

  return (
    <div className="map-route-mode-chips" aria-label="Route movement types">
      {displayModes.map((mode) => {
        const config = getRouteModeConfig(mode);
        const Icon = config.icon;
        return (
          <span key={mode}>
            <Icon size={13} aria-hidden="true" />
            {config.label}
          </span>
        );
      })}
      {label ? <em>{label}</em> : null}
    </div>
  );
}

function normalizeRouteModes(modes = [], fallbackMode = "") {
  const normalized = [...new Set((modes ?? []).map((mode) => String(mode).toLowerCase()).filter(Boolean))];
  if (normalized.length) {
    return normalized;
  }
  const fallback = String(fallbackMode).toLowerCase();
  if (fallback === "walk") {
    return ["walk"];
  }
  if (fallback === "drive") {
    return ["car"];
  }
  return ["transit"];
}

function getRouteModeConfig(mode) {
  const configs = {
    walk: { label: "Walk", icon: Footprints },
    train: { label: "Train", icon: Train },
    bus: { label: "Bus", icon: Bus },
    car: { label: "Car", icon: Car },
    transit: { label: "Transit", icon: Route }
  };
  return configs[mode] ?? configs.transit;
}

function humanizeRouteNote(note) {
  const value = String(note ?? "");
  if (!value || value.toLowerCase().includes("navitime") || value.toLowerCase().includes("google")) {
    return "Planning estimate. Check live train times before you go.";
  }
  return value;
}

function formatRouteDistance(distanceMeters) {
  const meters = Number(distanceMeters) || 0;
  if (meters <= 0) {
    return "Distance unavailable";
  }
  return formatDistanceKm(meters / 1000);
}

function formatRouteFare(fareYen) {
  const fare = Number(fareYen);
  if (!Number.isFinite(fare) || fare <= 0) {
    return "";
  }
  return `¥${Math.round(fare).toLocaleString("en-US")}`;
}


function InviteWelcomeModal({ tripName, travelerName, onContinue }) {
  const [name, setName] = useState(travelerName ?? "");
  const trimmedName = name.trim();

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog traveler-identity-dialog invite-welcome-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-welcome-title">
        <div className="dialog-header people-dialog-header">
          <div>
            <span className="identity-kicker">Trip invite</span>
            <h2 id="invite-welcome-title">Welcome to {tripName || "this trip"}</h2>
            <p>Confirm how your name should appear for reactions, plans, and split expenses.</p>
          </div>
        </div>

        <label className="editor-field identity-name-field">
          <span>Your name on this trip</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" autoFocus />
        </label>

        <div className="identity-preview">
          <div className="traveler-avatar" aria-hidden="true">{trimmedName.slice(0, 1) || "?"}</div>
          <div>
            <strong>{trimmedName || "Your name"}</strong>
            <small>This is the traveler identity connected to your account.</small>
          </div>
        </div>

        <div className="dialog-actions identity-dialog-actions">
          <button className="primary-button" type="button" disabled={!trimmedName} onClick={() => onContinue(trimmedName)}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function TravelerIdentityPrompt({ tripName, travelers, currentUserId, defaultTravelerName = "Traveler", isOwnerRecovery = false, recoveryMessage = "", onClaimTraveler, onCreateOwnTraveler }) {
  const title = isOwnerRecovery ? "Link your organizer profile" : "Which traveler are you?";
  const helper = isOwnerRecovery
    ? "We could not link your organizer account automatically. Choose who you are so reactions and split expenses stay under your account."
    : `Choose your traveler for ${tripName || "this trip"} so reactions and split expenses attach to the right person.`;
  const hasAvailableTraveler = travelers.some((traveler) => !traveler.profileId || traveler.profileId === currentUserId);

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog traveler-identity-dialog" role="dialog" aria-modal="true" aria-labelledby="traveler-identity-title">
        <div className="dialog-header people-dialog-header">
          <div>
            <span className="identity-kicker">{tripName || "Trip"}</span>
            <h2 id="traveler-identity-title">{title}</h2>
            <p>{helper}</p>
          </div>
        </div>

        {isOwnerRecovery && recoveryMessage ? <p className="identity-recovery-note">{recoveryMessage}</p> : null}

        <div className="traveler-card-grid">
          {travelers.map((traveler) => {
            const isCurrentUser = traveler.profileId === currentUserId;
            const canChooseTraveler = !traveler.profileId;
            const accountLabel = traveler.email || (traveler.profileId && traveler.displayName !== traveler.name ? traveler.displayName : "");
            return (
              <article className={`traveler-card${isCurrentUser ? " is-current-user" : ""}`} key={traveler.id}>
                <div className="traveler-avatar" aria-hidden="true">{traveler.name.slice(0, 1)}</div>
                <div className="traveler-card-main">
                  <h3>{traveler.name}</h3>
                  {accountLabel ? <p>{accountLabel}</p> : null}
                </div>
                {canChooseTraveler ? (
                  <button className="primary-button compact-action" type="button" onClick={() => onClaimTraveler(traveler.id)}>
                    Choose
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>

        {!hasAvailableTraveler ? (
          <div className="expense-empty identity-empty-action">
            <p>No open traveler is available for your account yet.</p>
            <button className="primary-button compact-action" type="button" onClick={onCreateOwnTraveler}>
              Create traveler for {defaultTravelerName}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}


function IdeaFilters({ activeCategory, onChange }) {
  const tagAssets = useTagAssets();

  return (
    <div className="category-filters" aria-label="Idea category filters">
      <span className="category-filter-label">
        <Filter size={15} />
        Category
      </span>
      <div className="category-filter-options">
        {CATEGORY_FILTERS.map((category) => {
          const config = category === "All" ? null : getCategoryConfigForAssets(category, tagAssets);
          const Icon = config?.icon ?? Filter;
          return (
            <button className={activeCategory === category ? "is-active" : ""} type="button" key={category} aria-pressed={activeCategory === category} onClick={() => onChange(category)}>
              {config?.asset ? <TagIcon src={config.asset} size="chip" /> : <Icon size={15} />}
              {formatCategoryFilterLabel(category)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ActivityIdeaPicker({ ideas, searchQuery, activeCategory, pendingIdeaId, onCategoryChange, onPickIdea }) {
  const isAdding = Boolean(pendingIdeaId);
  const hasSearchQuery = Boolean(searchQuery.trim());

  return (
    <div className="activity-idea-picker">
      <IdeaFilters activeCategory={activeCategory} onChange={onCategoryChange} />

      <div className="activity-idea-list" aria-label="Pick one idea to add">
        {ideas.map((idea) => (
          <IdeaPickerRow
            idea={idea}
            key={idea.id}
            disabled={isAdding}
            isPending={pendingIdeaId === idea.id}
            onPick={() => onPickIdea(idea)}
          />
        ))}
        {!ideas.length ? (
          <p className="activity-idea-empty">{hasSearchQuery ? "No ideas match this search." : "No ideas match these filters."}</p>
        ) : null}
      </div>
    </div>
  );
}

function IdeaPickerRow({ idea, disabled, isPending, onPick }) {
  const tagAssets = useTagAssets();
  const config = getCategoryConfigForAssets(idea.category, tagAssets);

  return (
    <article className="idea-row idea-picker-row">
      <button className={`idea-thumb category-${config.className}`} type="button" disabled={disabled} onClick={onPick} aria-label={`Add ${idea.title}`}>
        <TagIcon src={config.asset} size="thumb" />
      </button>
      <button className="idea-main" type="button" disabled={disabled} onClick={onPick}>
        <strong>{idea.title}</strong>
        <small>{idea.city || "Japan"}</small>
      </button>
      <span className={`status-pill idea-status ${STATUS_CLASS[idea.status]}`}>
        <TagIcon src={getStatusAsset(idea.status, tagAssets)} size="tiny" />
        {idea.status}
      </span>
      <div className="idea-actions">
        {idea.cost ? <span className="idea-cost-chip">{idea.cost}</span> : null}
        <button className="promote-button" type="button" disabled={disabled} onClick={onPick}>
          <Plus size={16} />
          {isPending ? "Adding..." : "Add"}
        </button>
      </div>
    </article>
  );
}

function SharingModal(props) {
  return (
    <React.Suspense fallback={<FeatureLoading label="people forms" />}>
      <LazyValidatedForm schema="invite" defaultValues={{ email: "", role: "editor" }}>
        {(inviteForm) => (
          <LazyValidatedForm schema="passwordUser" defaultValues={{ email: "", displayName: "", password: "", role: "editor" }}>
            {(passwordUserForm) => <SharingModalContent {...props} inviteForm={inviteForm} passwordUserForm={passwordUserForm} />}
          </LazyValidatedForm>
        )}
      </LazyValidatedForm>
    </React.Suspense>
  );
}

function SharingModalContent({
  collaboration,
  currentUserId,
  currentMember,
  currentTraveler,
  canManage,
  syncStatus,
  status,
  latestInviteUrl,
  pendingInvitations,
  onSubmitInvite,
  onCreatePasswordUser,
  onCopyInvite,
  onRevokeInvite,
  onClaimTraveler,
  onRenameTraveler,
  onClose,
  inviteForm,
  passwordUserForm
}) {
  const [activePeopleTab, setActivePeopleTab] = useState("share");
  const [activeShareMethod, setActiveShareMethod] = useState("invite");
  const [travelerRenameDraft, setTravelerRenameDraft] = useState(null);
  const currentRole = formatRoleLabel(currentMember?.role ?? "editor");
  const {
    formState: { errors: inviteErrors, isSubmitting: isInviteSubmitting },
    handleSubmit: submitInviteForm,
    register: registerInvite,
    setValue: setInviteValue,
    watch: watchInvite
  } = inviteForm;
  const inviteValues = watchInvite();
  const {
    formState: { errors: passwordUserErrors, isSubmitting: isPasswordUserSubmitting },
    handleSubmit: submitPasswordUserForm,
    register: registerPasswordUser,
    reset: resetPasswordUserForm,
    watch: watchPasswordUser
  } = passwordUserForm;
  const passwordUserValues = watchPasswordUser();

  async function handleInviteFormSubmit(formValues) {
    const didCreate = await onSubmitInvite(formValues);
    if (didCreate) {
      setInviteValue("email", "", { shouldDirty: false });
      setInviteValue("role", formValues.role, { shouldDirty: false });
    }
  }

  async function handlePasswordUserFormSubmit(formValues) {
    const didCreate = await onCreatePasswordUser(formValues);
    if (didCreate) {
      resetPasswordUserForm({
        email: "",
        displayName: "",
        password: "",
        role: formValues.role
      });
    }
  }

  async function handleTravelerRenameSubmit(event) {
    event.preventDefault();
    if (!travelerRenameDraft) {
      return;
    }

    const didRename = await onRenameTraveler(travelerRenameDraft.id, travelerRenameDraft.name);
    if (didRename) {
      setTravelerRenameDraft(null);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog sharing-dialog people-dialog" role="dialog" aria-modal="true" aria-label="People">
        <div className="dialog-header people-dialog-header">
          <div>
            <h2>People</h2>
            <p>Invite people and manage who can access this trip.</p>
          </div>
          <div className="people-header-actions">
            <span className={`role-pill role-${currentMember?.role ?? "editor"}`}>{currentRole}</span>
            <button className="icon-button" type="button" aria-label="Close dialog" data-dialog-close onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="people-tabs" role="tablist" aria-label="People sections">
          <button className={activePeopleTab === "share" ? "is-active" : ""} type="button" role="tab" aria-selected={activePeopleTab === "share"} onClick={() => setActivePeopleTab("share")}>
            People &amp; access
          </button>
          <button className={activePeopleTab === "travelers" ? "is-active" : ""} type="button" role="tab" aria-selected={activePeopleTab === "travelers"} onClick={() => setActivePeopleTab("travelers")}>
            Travelers
          </button>
        </div>

        {activePeopleTab === "share" ? (
          <div className="people-tab-panel" role="tabpanel" aria-label="People and access">
            <section className="sharing-section people-access-section" aria-labelledby="people-access-title">
              <div className="sharing-section-title">
                <div>
                  <strong id="people-access-title">Trip access</strong>
                  <small>People who can open this trip.</small>
                </div>
                <span className="people-section-count">{collaboration.members.length} {collaboration.members.length === 1 ? "person" : "people"}</span>
              </div>
              <div className="sharing-list people-member-list">
                {collaboration.members.map((member) => (
                  <div className="sharing-row" key={member.profileId}>
                    <span>
                      <strong>{member.displayName}</strong>
                      <small>{member.email || "No email"}</small>
                    </span>
                    <span className={`role-pill role-${member.role}`}>{formatRoleLabel(member.role)}</span>
                  </div>
                ))}
                {!collaboration.members.length ? <p className="empty-trip-list">No people with access yet.</p> : null}
              </div>

              {pendingInvitations.length ? (
                <div className="people-pending-invites" aria-labelledby="pending-invites-title">
                  <div className="sharing-section-title compact-title">
                    <strong id="pending-invites-title">Pending invitations</strong>
                    <span className="people-section-count">{pendingInvitations.length}</span>
                  </div>
                  <div className="sharing-list">
                    {pendingInvitations.map((invite) => (
                      <div className="sharing-row" key={invite.id}>
                        <span>
                          <strong>{invite.email}</strong>
                          <small>{formatRoleLabel(invite.role)} • expires {formatShortDate(invite.expiresAt)}</small>
                        </span>
                        <button className="ghost-button compact-action" type="button" onClick={() => onRevokeInvite(invite.id)}>
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            {canManage ? (
              <section className="sharing-section people-add-section" aria-labelledby="add-person-title">
                <div className="sharing-section-title">
                  <div>
                    <strong id="add-person-title">Add person</strong>
                    <small>Choose how you want to give someone access.</small>
                  </div>
                </div>
                <div className="people-method-tabs" role="tablist" aria-label="Add person method">
                  <button className={activeShareMethod === "invite" ? "is-active" : ""} type="button" role="tab" aria-selected={activeShareMethod === "invite"} onClick={() => setActiveShareMethod("invite")}>
                    Invite by link
                  </button>
                  <button className={activeShareMethod === "password" ? "is-active" : ""} type="button" role="tab" aria-selected={activeShareMethod === "password"} onClick={() => setActiveShareMethod("password")}>
                    Password account
                  </button>
                </div>

                {activeShareMethod === "invite" ? (
                  <div className="people-method-panel" role="tabpanel" aria-label="Invite by link">
                    <p className="people-method-description">Create a link for someone to join this trip.</p>
                    <form className="invite-form" onSubmit={submitInviteForm(handleInviteFormSubmit)}>
                      <label className="editor-field">
                        Email
                        <input {...registerInvite("email")} type="email" placeholder="friend@example.com" />
                      </label>
                      <label className="editor-field">
                        Access
                        <select {...registerInvite("role")}>
                          <option value="editor">Can edit</option>
                          <option value="viewer">View only</option>
                        </select>
                      </label>
                      <button className="primary-button" type="submit" disabled={isInviteSubmitting || !inviteValues.email?.trim()}>
                        <UserPlus size={17} />
                        Create invite link
                      </button>
                    </form>
                    {inviteErrors.email?.message || inviteErrors.role?.message ? (
                      <p className="expense-form-error">{inviteErrors.email?.message || inviteErrors.role?.message}</p>
                    ) : null}
                    {latestInviteUrl ? (
                      <div className="invite-link-box">
                        <label className="editor-field">
                          Invite link
                          <input value={latestInviteUrl} readOnly onFocus={(event) => event.target.select()} />
                        </label>
                        <button className="ghost-button" type="button" onClick={onCopyInvite}>
                          <Copy size={17} />
                          Copy link
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="people-method-panel" role="tabpanel" aria-label="Password account">
                    <p className="people-method-description">Create or update an account without sending an auth email.</p>
                    <form className="password-user-form" onSubmit={submitPasswordUserForm(handlePasswordUserFormSubmit)}>
                      <label className="editor-field people-password-email">
                        Email
                        <input {...registerPasswordUser("email")} type="email" placeholder="tester@example.com" />
                      </label>
                      <label className="editor-field people-password-name">
                        Display name
                        <input {...registerPasswordUser("displayName")} placeholder="Tester" />
                      </label>
                      <label className="editor-field">
                        Password
                        <input {...registerPasswordUser("password")} type="password" placeholder="At least 6 characters" autoComplete="new-password" />
                      </label>
                      <label className="editor-field">
                        Access
                        <select {...registerPasswordUser("role")}>
                          <option value="editor">Can edit</option>
                          <option value="viewer">View only</option>
                        </select>
                      </label>
                      <button className="primary-button" type="submit" disabled={isPasswordUserSubmitting || !passwordUserValues.email?.trim() || !passwordUserValues.password}>
                        <UserPlus size={17} />
                        Create account
                      </button>
                    </form>
                    {passwordUserErrors.email?.message || passwordUserErrors.password?.message || passwordUserErrors.role?.message ? (
                      <p className="expense-form-error">{passwordUserErrors.email?.message || passwordUserErrors.password?.message || passwordUserErrors.role?.message}</p>
                    ) : null}
                  </div>
                )}
              </section>
            ) : (
              <p className="dialog-note">{status === "loading" ? "Loading people..." : "Only the trip owner can invite people."}</p>
            )}
          </div>
        ) : (
          <div className="people-tab-panel" role="tabpanel" aria-label="Travelers">
            <section className="sharing-section people-section">
              <div className="sharing-section-title">
                <div>
                  <strong>Travelers</strong>
                  <small>These names are used for reactions and split expenses.</small>
                </div>
              </div>
              <div className="traveler-card-grid">
                {collaboration.travelers.map((traveler) => {
                  const isCurrentUser = traveler.profileId === currentUserId;
                  const canChooseTraveler = !traveler.profileId;
                  const canRenameTraveler = isCurrentUser || canManage;
                  const isRenamingTraveler = travelerRenameDraft?.id === traveler.id;
                  const accountLabel = traveler.email || (traveler.profileId && traveler.displayName !== traveler.name ? traveler.displayName : "");
                  return (
                    <article className={`traveler-card${isCurrentUser ? " is-current-user" : ""}`} key={traveler.id}>
                      <div className="traveler-avatar" aria-hidden="true">{traveler.name.slice(0, 1)}</div>
                      <div className="traveler-card-main">
                        <h3>{traveler.name}</h3>
                        {accountLabel ? <p>{accountLabel}</p> : null}
                        {isRenamingTraveler ? (
                          <form className="traveler-rename-form" onSubmit={handleTravelerRenameSubmit}>
                            <input
                              value={travelerRenameDraft.name}
                              aria-label={`Traveler name for ${traveler.name}`}
                              onChange={(event) => setTravelerRenameDraft({ ...travelerRenameDraft, name: event.target.value })}
                              autoFocus
                            />
                            <button className="primary-button compact-action" type="submit" disabled={!travelerRenameDraft.name.trim()}>
                              Save
                            </button>
                            <button className="ghost-button compact-action" type="button" onClick={() => setTravelerRenameDraft(null)}>
                              Cancel
                            </button>
                          </form>
                        ) : null}
                      </div>
                      <div className="traveler-card-actions">
                        {canRenameTraveler && !isRenamingTraveler ? (
                          <button className="ghost-button compact-action" type="button" onClick={() => setTravelerRenameDraft({ id: traveler.id, name: traveler.name })}>
                            Edit name
                          </button>
                        ) : null}
                        {canChooseTraveler ? (
                          <button className="ghost-button compact-action" type="button" onClick={() => onClaimTraveler(traveler.id)}>
                            Choose
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
                {!collaboration.travelers.length ? <p className="empty-trip-list">No travelers loaded yet.</p> : null}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function EditScheduleModal({ payload, days = [], ideas = [], travelers = [], mapsProfile = MAPS_PROFILES.japan, resolvingTarget, onResolvePlace, onCancel, onSave, onAddIdea, onMoveToIdeas, onDelete }) {
  const defaultValues = getScheduleFormDefaultValues(payload.item, { dayId: payload.dayId, days });
  return (
    <React.Suspense fallback={<FeatureLoading label="activity editor" />}>
      <LazyValidatedForm schema="schedule" defaultValues={defaultValues}>
        {(form) => (
          <EditScheduleModalContent
            form={form}
            payload={payload}
            days={days}
            ideas={ideas}
            travelers={travelers}
            mapsProfile={mapsProfile}
            resolvingTarget={resolvingTarget}
            onResolvePlace={onResolvePlace}
            onCancel={onCancel}
            onSave={onSave}
            onAddIdea={onAddIdea}
            onMoveToIdeas={onMoveToIdeas}
            onDelete={onDelete}
          />
        )}
      </LazyValidatedForm>
    </React.Suspense>
  );
}

function EditScheduleModalContent({ form, payload, days, ideas, travelers, mapsProfile, resolvingTarget, onResolvePlace, onCancel, onSave, onAddIdea, onMoveToIdeas, onDelete }) {
  const { getValues, handleSubmit, register, setValue, watch } = form;
  const values = watch();
  const [entryMode, setEntryMode] = useState("new");
  const [pickerCategory, setPickerCategory] = useState("All");
  const [pickerSearchQuery, setPickerSearchQuery] = useState("");
  const [pendingIdeaId, setPendingIdeaId] = useState("");
  const [showCost, setShowCost] = useState(Boolean(payload.item.cost));
  const [costCurrency, setCostCurrency] = useState(() => detectCostCurrency(payload.item.cost));
  const [placeSessionToken, setPlaceSessionToken] = useState(() => createPlacesSessionToken());
  const [isLocationActive, setIsLocationActive] = useState(false);
  const mapPreview = getMapPreview(values.mapLink || values.place?.googleMapsUri, values.place);
  const isResolving = resolvingTarget === getResolveTargetKey("schedule_item", values.id);
  const normalizedLocationInput = normalizeGoogleMapsUrlInput(values.locationInput);
  const isLocationMapsLink = isGoogleMapsLink(normalizedLocationInput);
  const isHotelStayMode = values.category === HOTEL_CATEGORY;
  const canPickIdeas = payload.mode === "new";
  const isPickingIdea = canPickIdeas && entryMode === "ideas";
  const pickerIdeas = useMemo(
    () => filterActivityPickerIdeas(filterIdeas(ideas, "All", pickerCategory), pickerSearchQuery),
    [ideas, pickerCategory, pickerSearchQuery]
  );
  const nextDayId = getNextDayId(days, payload.dayId) || payload.dayId;
  const placeAutocomplete = usePlaceAutocomplete({
    query: values.locationInput,
    sessionToken: placeSessionToken,
    mapsProfile,
    enabled: isLocationActive && !isLocationMapsLink
  });
  const startMinutes = clampMinutes(parseTimeToMinutes(values.start) ?? TIME_GRID_START_MINUTES, TIME_GRID_START_MINUTES, TIME_GRID_END_MINUTES - MIN_SCHEDULE_DURATION_MINUTES);
  const durationMinutes = getClampedTimelineDuration(values.start, values.duration, DEFAULT_NEW_BLOCK.duration);

  function cancelPickerSearch(event) {
    setPickerSearchQuery("");
    event.currentTarget.closest("label")?.querySelector("input")?.blur();
  }

  const autoResolve = useAutoResolveMapLink({
    mapLink: values.mapLink,
    isResolving,
    onResolve: async (options) => {
      const place = await onResolvePlace(getScheduleResolveDraft(getValues()), options);
      if (place) {
        applyResolvedPlaceToScheduleForm(place);
      }
      return place;
    }
  });

  function updateFormValue(name, value, options = {}) {
    setValue(name, value, { shouldDirty: true, ...options });
  }

  function handleStartTimeChange(start) {
    const currentDuration = Number(getValues("duration")) || DEFAULT_NEW_BLOCK.duration;
    const nextDuration = getClampedTimelineDuration(start, currentDuration, DEFAULT_NEW_BLOCK.duration);
    updateFormValue("start", start);
    if (nextDuration !== currentDuration) {
      updateFormValue("duration", nextDuration);
    }
  }

  function handleCostCurrencyChange(event) {
    const nextCurrency = normalizeCostCurrency(event.target.value);
    setCostCurrency(nextCurrency);
    updateFormValue("cost", formatCostForCurrency(getValues("cost"), nextCurrency));
  }

  function handleCostAmountChange(event) {
    updateFormValue("cost", formatCostForCurrency(event.target.value, costCurrency));
  }

  function enterHotelStayMode() {
    const currentValues = getValues();
    updateFormValue("itemKind", STAY_KIND);
    updateFormValue("stayStartDayId", currentValues.stayStartDayId || payload.dayId);
    updateFormValue("stayEndDayId", currentValues.stayEndDayId || nextDayId);
    updateFormValue("checkInTime", currentValues.checkInTime || DEFAULT_CHECK_IN_TIME);
    updateFormValue("checkOutTime", currentValues.checkOutTime || DEFAULT_CHECK_OUT_TIME);
    updateFormValue("start", currentValues.checkInTime || DEFAULT_CHECK_IN_TIME);
  }

  function handleCategoryChange(event) {
    const nextCategory = event.target.value;
    updateFormValue("category", nextCategory);
    if (nextCategory === HOTEL_CATEGORY) {
      enterHotelStayMode();
      return;
    }
    updateFormValue("itemKind", ACTIVITY_KIND);
  }

  useEffect(() => {
    if (isHotelStayMode) {
      enterHotelStayMode();
    }
  }, [isHotelStayMode, payload.dayId]);

  function adjustDuration(deltaMinutes) {
    const maxDuration = Math.max(MIN_SCHEDULE_DURATION_MINUTES, TIME_GRID_END_MINUTES - startMinutes);
    const nextDuration = clampMinutes(durationMinutes + deltaMinutes, MIN_SCHEDULE_DURATION_MINUTES, maxDuration);
    updateFormValue("duration", nextDuration);
  }

  function handleLocationInputChange(event) {
    const nextValue = event.target.value;
    const normalizedLink = normalizeGoogleMapsUrlInput(nextValue);
    updateFormValue("locationInput", nextValue);

    if (isGoogleMapsLink(normalizedLink)) {
      updateFormValue("mapLink", normalizedLink);
      return;
    }

    updateFormValue("mapLink", "");
    updateFormValue("place", null);
  }

  function applyResolvedPlaceToScheduleForm(place, options = {}) {
    const currentValues = getValues();
    const locationLabel = options.locationLabel || place.name || place.formattedAddress || currentValues.locationInput || "";
    const nextValues = enrichDraftWithPlace(currentValues, place, { emptyTitleFallback: "" });
    updateFormValue("place", place);
    updateFormValue("mapLink", normalizeGoogleMapsUrlInput(nextValues.mapLink) || place.googleMapsUri || "");
    updateFormValue("locationInput", locationLabel);
    if (shouldFillEmptyText(currentValues.title)) {
      updateFormValue("title", place.name || options.titleHint || locationLabel);
    }
    if (nextValues.city && shouldFillEmptyText(currentValues.city, DEFAULT_NEW_BLOCK.city)) {
      updateFormValue("city", nextValues.city);
    }
  }

  async function handlePlaceSuggestionSelect(suggestion) {
    const locationLabel = suggestion.text || suggestion.mainText || "";
    updateFormValue("locationInput", locationLabel);
    const currentValues = getValues();
    const place = await onResolvePlace(getScheduleResolveDraft(currentValues), {
      placeId: suggestion.placeId,
      sessionToken: placeSessionToken,
      displayNameHint: suggestion.mainText || locationLabel,
      mapLink: "",
      silent: true
    });
    if (place) {
      applyResolvedPlaceToScheduleForm(place, {
        locationLabel,
        titleHint: suggestion.mainText
      });
      setPlaceSessionToken(createPlacesSessionToken());
      setIsLocationActive(false);
    }
  }

  function handleSave(formValues) {
    const isStay = formValues.category === HOTEL_CATEGORY;
    const stayStartDayId = formValues.stayStartDayId || payload.dayId;
    const stayEndDayId = formValues.stayEndDayId || stayStartDayId;
    const checkInTime = formValues.checkInTime || DEFAULT_CHECK_IN_TIME;
    const checkOutTime = formValues.checkOutTime || DEFAULT_CHECK_OUT_TIME;
    const activityDuration = getClampedTimelineDuration(formValues.start, formValues.duration, DEFAULT_NEW_BLOCK.duration);

    onSave({
      ...payload.item,
      ...formValues,
      itemKind: isStay ? STAY_KIND : ACTIVITY_KIND,
      title: formValues.title?.trim() || (isStay ? "Hotel stay" : "Untitled plan"),
      city: formValues.city?.trim() ?? "",
      start: isStay ? checkInTime : formValues.start,
      duration: isStay ? DEFAULT_NEW_BLOCK.duration : activityDuration,
      notes: formValues.notes?.trim() ?? "",
      cost: showCost ? formValues.cost?.trim() ?? "" : "",
      link: payload.item.link?.trim() ?? "",
      mapLink: normalizeGoogleMapsUrlInput(formValues.mapLink || (isGoogleMapsLink(formValues.locationInput) ? formValues.locationInput : "")),
      stayStartDayId: isStay ? stayStartDayId : "",
      stayEndDayId: isStay ? stayEndDayId : "",
      checkInTime: isStay ? checkInTime : "",
      checkOutTime: isStay ? checkOutTime : ""
    });
  }

  function handleIdeaPick(idea) {
    if (!onAddIdea || pendingIdeaId) {
      return;
    }

    setPendingIdeaId(idea.id);
    const didAdd = onAddIdea(idea);
    if (!didAdd) {
      setPendingIdeaId("");
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog editor-dialog" role="dialog" aria-modal="true" aria-label={payload.mode === "new" ? "Add activity" : "Edit activity"}>
        <DialogHeader title={payload.mode === "new" ? "Add activity" : "Edit activity"} onClose={onCancel} />
        <form className="schedule-editor" onSubmit={handleSubmit(handleSave)}>
          {canPickIdeas ? (
            <div className="activity-modal-controls">
              <div className="activity-modal-tabs" role="tablist" aria-label="Activity entry mode">
                <button className={entryMode === "new" ? "is-active" : ""} type="button" role="tab" aria-selected={entryMode === "new"} onClick={() => setEntryMode("new")}>
                  New activity
                </button>
                <button className={entryMode === "ideas" ? "is-active" : ""} type="button" role="tab" aria-selected={entryMode === "ideas"} onClick={() => setEntryMode("ideas")}>
                  From ideas
                </button>
              </div>
              {isPickingIdea ? (
                <label className="activity-idea-search">
                  <span>
                    <Search size={15} />
                    <span className="sr-only">Search ideas</span>
                  </span>
                  <input type="search" value={pickerSearchQuery} onChange={(event) => setPickerSearchQuery(event.target.value)} placeholder="Search ideas by title or city" />
                  <button className="activity-idea-search-clear" type="button" aria-label="Cancel idea search" onMouseDown={(event) => event.preventDefault()} onClick={cancelPickerSearch}>
                    <X size={16} />
                  </button>
                </label>
              ) : null}
            </div>
          ) : null}

          {isPickingIdea ? (
            <ActivityIdeaPicker
              ideas={pickerIdeas}
              searchQuery={pickerSearchQuery}
              activeCategory={pickerCategory}
              pendingIdeaId={pendingIdeaId}
              onCategoryChange={setPickerCategory}
              onPickIdea={handleIdeaPick}
            />
          ) : (
            <>
          <div className="activity-title-row">
            <label className="editor-field editor-field-title">
              {isHotelStayMode ? "Hotel name" : "Title"}
              <input {...register("title")} placeholder={isHotelStayMode ? "Hotel name" : "Coffee, temple visit, shopping..."} />
            </label>
            <div className={`activity-paid-section${showCost ? " is-expanded" : ""}`}>
              {showCost ? (
                <div className="activity-cost-inline">
                  <select className="activity-cost-currency" aria-label="Cost currency" value={costCurrency} onChange={handleCostCurrencyChange}>
                    {COST_CURRENCY_OPTIONS.map((currency) => <option key={currency}>{currency}</option>)}
                  </select>
                  <input aria-label="Estimated cost" value={getCostAmountInputValue(values.cost)} onChange={handleCostAmountChange} placeholder="5000, 40, TBD..." />
                  <button
                    className="activity-cost-remove"
                    type="button"
                    onClick={() => {
                      updateFormValue("cost", "");
                      setShowCost(false);
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button className="activity-paid-toggle" type="button" aria-expanded="false" onClick={() => setShowCost(true)}>
                  <span className="activity-paid-checkbox" aria-hidden="true" />
                  <strong>Paid activity</strong>
                </button>
              )}
            </div>
          </div>
          <label className="editor-field editor-location-field">
            Location
            <input
              value={values.locationInput ?? ""}
              onBlur={() => window.setTimeout(() => setIsLocationActive(false), 180)}
              onChange={handleLocationInputChange}
              onFocus={() => setIsLocationActive(true)}
              placeholder="Search a place or paste a Google Maps link"
            />
            <small>{mapsProfile.autocompleteHint} Custom activities can skip this.</small>
          </label>
          {isLocationActive && placeAutocomplete.status !== "idle" ? (
            <div className="place-autocomplete-panel">
              {placeAutocomplete.status === "loading" ? <span className="place-autocomplete-status">Searching places...</span> : null}
              {placeAutocomplete.status === "error" ? <span className="place-autocomplete-status is-error">{placeAutocomplete.errorMessage || "Could not load suggestions."}</span> : null}
              {placeAutocomplete.suggestions.map((suggestion) => (
                <button className="place-autocomplete-option" type="button" key={suggestion.placeId} onMouseDown={(event) => event.preventDefault()} onClick={() => handlePlaceSuggestionSelect(suggestion)}>
                  <MapPin size={15} />
                  <span>
                    <strong>{suggestion.mainText || suggestion.text}</strong>
                    {suggestion.secondaryText ? <small>{suggestion.secondaryText}</small> : null}
                  </span>
                </button>
              ))}
              {placeAutocomplete.status === "ready" && !placeAutocomplete.suggestions.length ? <span className="place-autocomplete-status">No matching places found.</span> : null}
              {placeAutocomplete.suggestions.length ? <span className="place-autocomplete-powered">Powered by Google</span> : null}
            </div>
          ) : null}
          {(autoResolve.status === "pending" || autoResolve.status === "resolving" || autoResolve.status === "ready" || autoResolve.status === "error") ? (
            <div className="editor-inline-status">
              <AutoResolveStatus status={autoResolve.status} place={values.place} errorMessage={autoResolve.errorMessage} onRetry={autoResolve.retry} />
            </div>
          ) : null}
          {mapPreview ? <MapPreview preview={mapPreview} /> : null}
          {isHotelStayMode ? (
            <div className="hotel-stay-grid">
              <label className="editor-field">
                Check-in day
                <select {...register("stayStartDayId")}>
                  {days.map((day) => (
                    <option value={day.id} key={day.id}>
                      Day {day.dayNumber} - {formatShortDate(day.date)}
                    </option>
                  ))}
                </select>
              </label>
              <TimeSelectControl label="Check-in time" value={values.checkInTime || DEFAULT_CHECK_IN_TIME} onChange={(time) => updateFormValue("checkInTime", time)} />
              <label className="editor-field">
                Check-out day
                <select {...register("stayEndDayId")}>
                  {days.map((day) => (
                    <option value={day.id} key={day.id}>
                      Day {day.dayNumber} - {formatShortDate(day.date)}
                    </option>
                  ))}
                </select>
              </label>
              <TimeSelectControl label="Check-out time" value={values.checkOutTime || DEFAULT_CHECK_OUT_TIME} onChange={(time) => updateFormValue("checkOutTime", time)} />
              <label className="editor-field">
                Category
                <select value={values.category || DEFAULT_NEW_BLOCK.category} onChange={handleCategoryChange}>
                  {CATEGORIES.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className="editor-field">
                Status
                <select {...register("status")}>
                  {STATUSES.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="editor-core-grid">
              <div className="editor-timing-row">
                <TimeSelectControl value={values.start} onChange={handleStartTimeChange} />
                <StepperControl
                  label="Duration"
                  value={formatDuration(durationMinutes)}
                  detail={`${durationMinutes} min`}
                  decreaseLabel="Decrease duration by 15 minutes"
                  increaseLabel="Increase duration by 15 minutes"
                  decreaseDisabled={durationMinutes <= MIN_SCHEDULE_DURATION_MINUTES}
                  increaseDisabled={durationMinutes >= Math.max(MIN_SCHEDULE_DURATION_MINUTES, TIME_GRID_END_MINUTES - startMinutes)}
                  onDecrease={() => adjustDuration(-RESIZE_STEP_MINUTES)}
                  onIncrease={() => adjustDuration(RESIZE_STEP_MINUTES)}
                />
              </div>
              <label className="editor-field activity-category-field">
                Category
                <select value={values.category || DEFAULT_NEW_BLOCK.category} onChange={handleCategoryChange}>
                  {CATEGORIES.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className="editor-field activity-area-field">
                Area
                <input {...register("city")} placeholder="City, neighborhood, or area" />
              </label>
              <label className="editor-field activity-status-field">
                Status
                <select {...register("status")}>
                  {STATUSES.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <label className="editor-field editor-field-notes">
            Notes
            <textarea {...register("notes")} placeholder="Reservation details, reminders, links, or planning notes..." />
          </label>
            </>
          )}
          <div className="dialog-actions">
            {payload.mode === "edit" ? (
              <button className="ghost-button" type="button" onClick={onMoveToIdeas}>
                <FileUp size={17} />
                Move to Ideas
              </button>
            ) : null}
            {payload.mode === "edit" ? (
              <button className="ghost-button danger" type="button" onClick={onDelete}>
                <Trash2 size={17} />
                Delete
              </button>
            ) : null}
            {isPickingIdea ? null : (
              <button className="primary-button" type="submit">
                Save
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function getScheduleFormDefaultValues(item, { dayId = "", days = [] } = {}) {
  const draft = { ...DEFAULT_NEW_BLOCK, ...item };
  const placeLabel = draft.place?.name || draft.place?.formattedAddress || "";
  const isHotelStay = draft.category === HOTEL_CATEGORY || isStayItem(draft);
  const nextDayId = getNextDayId(days, dayId) || dayId;
  return {
    ...draft,
    itemKind: isHotelStay ? STAY_KIND : draft.itemKind || ACTIVITY_KIND,
    title: draft.title ?? "",
    locationInput: draft.mapLink || placeLabel,
    category: isHotelStay ? HOTEL_CATEGORY : draft.category || DEFAULT_NEW_BLOCK.category,
    city: draft.city ?? "",
    start: isHotelStay ? draft.checkInTime || draft.start || DEFAULT_CHECK_IN_TIME : draft.start || DEFAULT_NEW_BLOCK.start,
    duration: Number(draft.duration) || DEFAULT_NEW_BLOCK.duration,
    status: draft.status || DEFAULT_NEW_BLOCK.status,
    notes: draft.notes ?? "",
    cost: draft.cost ?? "",
    link: draft.link ?? "",
    mapLink: draft.mapLink ?? "",
    stayStartDayId: draft.stayStartDayId || (isHotelStay ? dayId : ""),
    stayEndDayId: draft.stayEndDayId || (isHotelStay ? nextDayId : ""),
    checkInTime: draft.checkInTime || (isHotelStay ? DEFAULT_CHECK_IN_TIME : ""),
    checkOutTime: draft.checkOutTime || (isHotelStay ? DEFAULT_CHECK_OUT_TIME : ""),
    place: draft.place ?? null
  };
}

function getScheduleResolveDraft(values) {
  return {
    ...values,
    title: values.title ?? "",
    mapLink: normalizeGoogleMapsUrlInput(values.mapLink || (isGoogleMapsLink(values.locationInput) ? values.locationInput : "")),
    city: values.city ?? ""
  };
}

function createPlacesSessionToken() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getErrorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function usePlaceAutocomplete({ query, sessionToken, mapsProfile = MAPS_PROFILES.japan, enabled }) {
  const [state, setState] = useState({ status: "idle", suggestions: [], errorMessage: "" });
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmedQuery = String(query ?? "").trim();
    if (!enabled || trimmedQuery.length < 2) {
      setState({ status: "idle", suggestions: [], errorMessage: "" });
      return undefined;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState((current) => ({ ...current, status: "loading", errorMessage: "" }));

    const timer = window.setTimeout(async () => {
      try {
        const result = await autocompletePlaceCached({
          query: trimmedQuery,
          sessionToken,
          regionCodes: mapsProfile.regionCodes,
          languageCode: mapsProfile.languageCode
        });
        if (requestIdRef.current === requestId) {
          setState({ status: "ready", suggestions: result.suggestions ?? [], errorMessage: "" });
        }
      } catch (error) {
        if (requestIdRef.current === requestId) {
          setState({
            status: "error",
            suggestions: [],
            errorMessage: getErrorMessage(error, "Could not load suggestions.")
          });
        }
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [enabled, query, sessionToken, mapsProfile]);

  return state;
}

function TimeSelectControl({ label = "Start time", value, onChange }) {
  const options = getStartTimeOptions(value);

  return (
    <div className="editor-time-select" role="group" aria-label={label}>
      <span className="editor-control-label">{label}</span>
      <div className="time-select-shell">
        <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option} value={option}>
              {formatTime(option)}
            </option>
          ))}
        </select>
        <span className="time-select-chevron" aria-hidden="true">
          <ChevronDown size={17} />
        </span>
      </div>
    </div>
  );
}

function StepperControl({ label, value, detail, decreaseLabel, increaseLabel, decreaseDisabled, increaseDisabled, onDecrease, onIncrease }) {
  return (
    <div className="editor-stepper" role="group" aria-label={label}>
      <span className="editor-control-label">{label}</span>
      <div className="stepper-shell">
        <button className="stepper-button" type="button" aria-label={decreaseLabel} title={decreaseLabel} disabled={decreaseDisabled} onClick={onDecrease}>
          <Minus size={16} />
        </button>
        <span className="stepper-value" aria-live="polite">
          <strong>{value}</strong>
          <small>{detail}</small>
        </span>
        <button className="stepper-button" type="button" aria-label={increaseLabel} title={increaseLabel} disabled={increaseDisabled} onClick={onIncrease}>
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

function MapPreview({ preview }) {
  return (
    <div className={`map-preview-card${preview.isInvalid ? " is-invalid" : ""}${preview.embedSrc ? " has-embed" : ""}`}>
      {preview.embedSrc ? (
        <iframe className="map-preview-frame" src={preview.embedSrc} title="Google Maps preview" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
      ) : (
        <div className="map-preview-thumb" aria-hidden="true">
          <MapPin size={24} />
        </div>
      )}
      <div className="map-preview-meta">
        <div className="map-preview-copy">
          <strong>{preview.title}</strong>
          <span>{preview.detail}</span>
        </div>
        {preview.href ? (
          <a className="map-preview-link" href={preview.href} target="_blank" rel="noreferrer">
            <ExternalLink size={15} />
            Open
          </a>
        ) : null}
      </div>
    </div>
  );
}

function PlaceSummary({ place, fallback = "No place resolved yet" }) {
  if (!place?.id && !place?.name && !place?.formattedAddress) {
    return (
      <span className="place-summary is-empty">
        <MapPin size={15} />
        {fallback}
      </span>
    );
  }

  return (
    <span className="place-summary">
      <MapPin size={15} />
      <span>
        <strong>{place.name || "Resolved place"}</strong>
        <small>{place.formattedAddress || "Coordinates saved"}</small>
      </span>
    </span>
  );
}

function AutoResolveStatus({ status, place, errorMessage, onRetry }) {
  if (status === "pending" || status === "resolving") {
    return <span className="resolve-status-pill is-working">Resolving...</span>;
  }

  if (status === "ready" || place?.formattedAddress || place?.name || hasPlaceCoordinates(place)) {
    return <span className="resolve-status-pill is-ready">Place ready</span>;
  }

  if (status === "error") {
    return (
      <span className="resolve-status-error">
        <button className="ghost-button compact-action resolve-retry-button" type="button" onClick={onRetry}>
          Retry
        </button>
        {errorMessage ? <small>{errorMessage}</small> : null}
      </span>
    );
  }

  return <span className="resolve-status-pill">Paste a Google Maps link</span>;
}

function useAutoResolveMapLink({ mapLink, isResolving, onResolve }) {
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const lastResolvedLinkRef = useRef("");
  const failedLinkRef = useRef("");
  const resolveRef = useRef(onResolve);

  useEffect(() => {
    resolveRef.current = onResolve;
  }, [onResolve]);

  useEffect(() => {
    const normalizedLink = normalizeGoogleMapsUrlInput(mapLink);
    if (!normalizedLink || !isGoogleMapsLink(normalizedLink)) {
      failedLinkRef.current = "";
      lastResolvedLinkRef.current = "";
      setStatus("idle");
      setErrorMessage("");
      return undefined;
    }

    if (failedLinkRef.current === normalizedLink) {
      setStatus("error");
      return undefined;
    }

    if (isResolving || lastResolvedLinkRef.current === normalizedLink) {
      return undefined;
    }

    setErrorMessage("");
    setStatus("pending");
    const timer = window.setTimeout(async () => {
      lastResolvedLinkRef.current = normalizedLink;
      setStatus("resolving");
      try {
        const place = await resolveRef.current({ silent: true, throwOnError: true });
        if (place) {
          failedLinkRef.current = "";
          setErrorMessage("");
          setStatus("ready");
        } else {
          failedLinkRef.current = normalizedLink;
          setErrorMessage("Could not resolve this Google Maps link.");
          setStatus("error");
        }
      } catch (error) {
        failedLinkRef.current = normalizedLink;
        setErrorMessage(getErrorMessage(error, "Could not resolve this Google Maps link."));
        setStatus("error");
      }
    }, 700);

    return () => window.clearTimeout(timer);
  }, [mapLink, isResolving]);

  async function retry() {
    const normalizedLink = normalizeGoogleMapsUrlInput(mapLink);
    if (!normalizedLink || !isGoogleMapsLink(normalizedLink)) {
      setStatus("idle");
      return;
    }

    failedLinkRef.current = "";
    lastResolvedLinkRef.current = normalizedLink;
    setErrorMessage("");
    setStatus("resolving");
    try {
      const place = await resolveRef.current({ silent: false, throwOnError: true });
      if (place) {
        setErrorMessage("");
        setStatus("ready");
      } else {
        failedLinkRef.current = normalizedLink;
        setErrorMessage("Could not resolve this Google Maps link.");
        setStatus("error");
      }
    } catch (error) {
      failedLinkRef.current = normalizedLink;
      setErrorMessage(getErrorMessage(error, "Could not resolve this Google Maps link."));
      setStatus("error");
    }
  }

  return { status, errorMessage, retry };
}

function EditIdeaModal({ idea, mapsProfile = MAPS_PROFILES.japan, resolvingTarget, onResolvePlace, onCancel, onSave, onDelete }) {
  const defaultValues = getIdeaFormDefaultValues(idea);
  return (
    <React.Suspense fallback={<FeatureLoading label="idea editor" />}>
      <LazyValidatedForm schema="idea" defaultValues={defaultValues}>
        {(form) => (
          <EditIdeaModalContent
            form={form}
            idea={idea}
            mapsProfile={mapsProfile}
            resolvingTarget={resolvingTarget}
            onResolvePlace={onResolvePlace}
            onCancel={onCancel}
            onSave={onSave}
            onDelete={onDelete}
          />
        )}
      </LazyValidatedForm>
    </React.Suspense>
  );
}

function EditIdeaModalContent({ form, idea, mapsProfile, resolvingTarget, onResolvePlace, onCancel, onSave, onDelete }) {
  const { getValues, handleSubmit, register, setValue, watch } = form;
  const values = watch();
  const [showCost, setShowCost] = useState(Boolean(idea.cost));
  const [costCurrency, setCostCurrency] = useState(() => detectCostCurrency(idea.cost));
  const [placeSessionToken, setPlaceSessionToken] = useState(() => createPlacesSessionToken());
  const [isLocationActive, setIsLocationActive] = useState(false);
  const mapPreview = getMapPreview(values.mapLink || values.place?.googleMapsUri, values.place);
  const isResolving = resolvingTarget === getResolveTargetKey("idea", values.id);
  const isNewIdea = idea._mode === "new";
  const normalizedLocationInput = normalizeGoogleMapsUrlInput(values.locationInput);
  const isLocationMapsLink = isGoogleMapsLink(normalizedLocationInput);
  const placeAutocomplete = usePlaceAutocomplete({
    query: values.locationInput,
    sessionToken: placeSessionToken,
    mapsProfile,
    enabled: isLocationActive && !isLocationMapsLink
  });

  function updateFormValue(name, value, options = {}) {
    setValue(name, value, { shouldDirty: true, ...options });
  }

  function handleCostCurrencyChange(event) {
    const nextCurrency = normalizeCostCurrency(event.target.value);
    setCostCurrency(nextCurrency);
    updateFormValue("cost", formatCostForCurrency(getValues("cost"), nextCurrency));
  }

  function handleCostAmountChange(event) {
    updateFormValue("cost", formatCostForCurrency(event.target.value, costCurrency));
  }

  const autoResolve = useAutoResolveMapLink({
    mapLink: values.mapLink,
    isResolving,
    onResolve: async (options) => {
      const place = await onResolvePlace(getIdeaResolveDraft(getValues()), options);
      if (place) {
        applyResolvedPlaceToIdeaForm(place);
      }
      return place;
    }
  });

  function handleLocationInputChange(event) {
    const nextValue = event.target.value;
    const normalizedLink = normalizeGoogleMapsUrlInput(nextValue);
    updateFormValue("locationInput", nextValue);

    if (isGoogleMapsLink(normalizedLink)) {
      updateFormValue("mapLink", normalizedLink);
      return;
    }

    updateFormValue("mapLink", "");
    updateFormValue("place", null);
  }

  function applyResolvedPlaceToIdeaForm(place, options = {}) {
    const currentValues = getValues();
    const locationLabel = options.locationLabel || place.name || place.formattedAddress || currentValues.locationInput || "";
    const nextValues = enrichDraftWithPlace(currentValues, place, { emptyTitleFallback: "" });
    updateFormValue("place", place);
    updateFormValue("mapLink", normalizeGoogleMapsUrlInput(nextValues.mapLink) || place.googleMapsUri || "");
    updateFormValue("locationInput", locationLabel);
    if (shouldFillEmptyText(currentValues.title)) {
      updateFormValue("title", place.name || options.titleHint || locationLabel);
    }
    if (nextValues.city && shouldFillEmptyText(currentValues.city, DEFAULT_NEW_IDEA.city)) {
      updateFormValue("city", nextValues.city);
    }
  }

  async function handlePlaceSuggestionSelect(suggestion) {
    const locationLabel = suggestion.text || suggestion.mainText || "";
    updateFormValue("locationInput", locationLabel);
    const currentValues = getValues();
    const place = await onResolvePlace(getIdeaResolveDraft(currentValues), {
      placeId: suggestion.placeId,
      sessionToken: placeSessionToken,
      displayNameHint: suggestion.mainText || locationLabel,
      mapLink: "",
      silent: true
    });
    if (place) {
      applyResolvedPlaceToIdeaForm(place, {
        locationLabel,
        titleHint: suggestion.mainText
      });
      setPlaceSessionToken(createPlacesSessionToken());
      setIsLocationActive(false);
    }
  }

  function handleSave(formValues) {
    onSave({
      ...idea,
      ...formValues,
      title: formValues.title?.trim() || "Untitled idea",
      city: formValues.city?.trim() ?? "",
      notes: formValues.notes?.trim() ?? "",
      cost: showCost ? formValues.cost?.trim() ?? "" : "",
      link: idea.link?.trim() ?? "",
      mapLink: normalizeGoogleMapsUrlInput(formValues.mapLink || (isGoogleMapsLink(formValues.locationInput) ? formValues.locationInput : ""))
    });
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog editor-dialog" role="dialog" aria-modal="true" aria-label={isNewIdea ? "Add idea" : "Edit idea"}>
        <DialogHeader title={isNewIdea ? "Add idea" : "Edit idea"} onClose={onCancel} />
        <form className="schedule-editor idea-editor" onSubmit={handleSubmit(handleSave)}>
          <div className="activity-title-row">
            <label className="editor-field editor-field-title">
              Title
              <input {...register("title")} placeholder="Late-night ramen, museum, day trip..." />
            </label>
            <div className={`activity-paid-section${showCost ? " is-expanded" : ""}`}>
              {showCost ? (
                <div className="activity-cost-inline">
                  <select className="activity-cost-currency" aria-label="Cost currency" value={costCurrency} onChange={handleCostCurrencyChange}>
                    {COST_CURRENCY_OPTIONS.map((currency) => <option key={currency}>{currency}</option>)}
                  </select>
                  <input aria-label="Estimated cost" value={getCostAmountInputValue(values.cost)} onChange={handleCostAmountChange} placeholder="5000, 40, TBD..." />
                  <button
                    className="activity-cost-remove"
                    type="button"
                    onClick={() => {
                      updateFormValue("cost", "");
                      setShowCost(false);
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button className="activity-paid-toggle" type="button" aria-expanded="false" onClick={() => setShowCost(true)}>
                  <span className="activity-paid-checkbox" aria-hidden="true" />
                  <strong>Paid idea</strong>
                </button>
              )}
            </div>
          </div>
          <label className="editor-field editor-location-field">
            Location
            <input
              value={values.locationInput ?? ""}
              onBlur={() => window.setTimeout(() => setIsLocationActive(false), 180)}
              onChange={handleLocationInputChange}
              onFocus={() => setIsLocationActive(true)}
              placeholder="Search a place or paste a Google Maps link"
            />
            <small>{mapsProfile.autocompleteHint} Custom ideas can skip this.</small>
          </label>
          {isLocationActive && placeAutocomplete.status !== "idle" ? (
            <div className="place-autocomplete-panel">
              {placeAutocomplete.status === "loading" ? <span className="place-autocomplete-status">Searching places...</span> : null}
              {placeAutocomplete.status === "error" ? <span className="place-autocomplete-status is-error">{placeAutocomplete.errorMessage || "Could not load suggestions."}</span> : null}
              {placeAutocomplete.suggestions.map((suggestion) => (
                <button className="place-autocomplete-option" type="button" key={suggestion.placeId} onMouseDown={(event) => event.preventDefault()} onClick={() => handlePlaceSuggestionSelect(suggestion)}>
                  <MapPin size={15} />
                  <span>
                    <strong>{suggestion.mainText || suggestion.text}</strong>
                    {suggestion.secondaryText ? <small>{suggestion.secondaryText}</small> : null}
                  </span>
                </button>
              ))}
              {placeAutocomplete.status === "ready" && !placeAutocomplete.suggestions.length ? <span className="place-autocomplete-status">No matching places found.</span> : null}
              {placeAutocomplete.suggestions.length ? <span className="place-autocomplete-powered">Powered by Google</span> : null}
            </div>
          ) : null}
          {(autoResolve.status === "pending" || autoResolve.status === "resolving" || autoResolve.status === "ready" || autoResolve.status === "error") ? (
            <div className="editor-inline-status">
              <AutoResolveStatus status={autoResolve.status} place={values.place} errorMessage={autoResolve.errorMessage} onRetry={autoResolve.retry} />
            </div>
          ) : null}
          {mapPreview ? <MapPreview preview={mapPreview} /> : null}
          <div className="idea-core-grid">
            <label className="editor-field idea-category-field">
              Category
              <select {...register("category")}>
                {CATEGORIES.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="editor-field idea-area-field">
              Area
              <input {...register("city")} placeholder="City, neighborhood, or area" />
            </label>
            <label className="editor-field idea-status-field">
              Status
              <select {...register("status")}>
                {STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="editor-field editor-field-notes">
            Notes
            <textarea {...register("notes")} placeholder="Why it sounds good, links, reminders, or planning notes..." />
          </label>
          <div className="dialog-actions">
            {onDelete ? (
              <button className="ghost-button danger" type="button" onClick={onDelete}>
                <Trash2 size={17} />
                Delete
              </button>
            ) : null}
            <button className="primary-button" type="submit">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function getIdeaFormDefaultValues(idea) {
  const draft = { ...DEFAULT_NEW_IDEA, ...idea };
  const placeLabel = draft.place?.name || draft.place?.formattedAddress || "";
  return {
    ...draft,
    title: draft.title ?? "",
    locationInput: draft.mapLink || placeLabel,
    category: draft.category || DEFAULT_NEW_IDEA.category,
    city: draft.city ?? "",
    status: draft.status || DEFAULT_NEW_IDEA.status,
    notes: draft.notes ?? "",
    cost: draft.cost ?? "",
    link: draft.link ?? "",
    mapLink: draft.mapLink ?? "",
    place: draft.place ?? null,
    reactions: normalizeIdeaReactions(draft),
    votes: draft.votes ?? {},
    _mode: draft._mode
  };
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

function getIdeaResolveDraft(values) {
  return {
    ...values,
    title: values.title ?? "",
    mapLink: normalizeGoogleMapsUrlInput(values.mapLink || (isGoogleMapsLink(values.locationInput) ? values.locationInput : "")),
    city: values.city ?? ""
  };
}

function EditDayModal({ day, canDelete, mapsProfile = MAPS_PROFILES.japan, resolvingTarget, onResolveBase, onCancel, onSave, onDelete }) {
  const defaultValues = {
    ...day,
    label: day.label ?? "",
    locationInput: day.basePlace?.name || day.city || "",
    city: day.city ?? "",
    notes: day.notes ?? "",
    baseMapLink: day.baseMapLink ?? "",
    basePlace: day.basePlace ?? null
  };
  return (
    <React.Suspense fallback={<FeatureLoading label="day editor" />}>
      <LazyValidatedForm schema="day" defaultValues={defaultValues}>
        {(form) => (
          <EditDayModalContent
            form={form}
            day={day}
            canDelete={canDelete}
            mapsProfile={mapsProfile}
            resolvingTarget={resolvingTarget}
            onResolveBase={onResolveBase}
            onCancel={onCancel}
            onSave={onSave}
            onDelete={onDelete}
          />
        )}
      </LazyValidatedForm>
    </React.Suspense>
  );
}

function EditDayModalContent({ form, day, canDelete, mapsProfile, resolvingTarget, onResolveBase, onCancel, onSave, onDelete }) {
  const {
    getValues,
    handleSubmit: submitDayForm,
    register,
    setValue,
    watch
  } = form;
  const values = watch();
  const [placeSessionToken, setPlaceSessionToken] = useState(() => createPlacesSessionToken());
  const [isLocationActive, setIsLocationActive] = useState(false);
  const mapPreview = getMapPreview(values.baseMapLink || values.basePlace?.googleMapsUri, values.basePlace);
  const isResolving = resolvingTarget === getResolveTargetKey("trip_day_base", values.id);
  const normalizedLocationInput = normalizeGoogleMapsUrlInput(values.locationInput);
  const isLocationMapsLink = isGoogleMapsLink(normalizedLocationInput);
  const placeAutocomplete = usePlaceAutocomplete({
    query: values.locationInput,
    sessionToken: placeSessionToken,
    mapsProfile,
    enabled: isLocationActive && !isLocationMapsLink
  });

  function updateDayValue(name, value, options = {}) {
    setValue(name, value, { shouldDirty: true, ...options });
  }

  const autoResolve = useAutoResolveMapLink({
    mapLink: values.baseMapLink,
    isResolving,
    onResolve: async (options) => {
      const place = await onResolveBase(getValues(), options);
      if (place) {
        applyResolvedBasePlace(place);
      }
      return place;
    }
  });

  function handleDayLocationInputChange(event) {
    const nextValue = event.target.value;
    const normalizedLink = normalizeGoogleMapsUrlInput(nextValue);
    updateDayValue("locationInput", nextValue);

    if (isGoogleMapsLink(normalizedLink)) {
      updateDayValue("baseMapLink", normalizedLink);
      return;
    }

    updateDayValue("city", nextValue);
    updateDayValue("baseMapLink", "");
    updateDayValue("basePlace", null);
  }

  function applyResolvedBasePlace(place, options = {}) {
    const locationLabel = options.locationLabel || place.name || place.formattedAddress || getValues().locationInput || "";
    const nextValues = enrichDayDraftWithBasePlace(getValues(), place);
    updateDayValue("basePlace", place);
    updateDayValue("baseMapLink", normalizeGoogleMapsUrlInput(nextValues.baseMapLink) || place.googleMapsUri || "");
    updateDayValue("locationInput", locationLabel);
    updateDayValue("city", inferCityFromAddress(place.formattedAddress) || place.name || locationLabel);
  }

  async function handleDayPlaceSuggestionSelect(suggestion) {
    const locationLabel = suggestion.text || suggestion.mainText || "";
    updateDayValue("locationInput", locationLabel);
    const currentValues = getValues();
    const place = await onResolveBase({
      ...currentValues,
      baseMapLink: ""
    }, {
      placeId: suggestion.placeId,
      sessionToken: placeSessionToken,
      displayNameHint: suggestion.mainText || locationLabel,
      mapLink: "",
      silent: true
    });
    if (place) {
      applyResolvedBasePlace(place, { locationLabel });
      setPlaceSessionToken(createPlacesSessionToken());
      setIsLocationActive(false);
    }
  }

  function handleDaySave(formValues) {
    onSave({
      ...day,
      ...formValues,
      label: formValues.label?.trim() ?? "",
      city: (formValues.city || formValues.locationInput)?.trim() ?? "",
      notes: formValues.notes ?? "",
      baseMapLink: normalizeGoogleMapsUrlInput(formValues.baseMapLink)
    });
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog editor-dialog" role="dialog" aria-modal="true" aria-label="Day settings">
        <DialogHeader title="Day settings" onClose={onCancel} />
        <form className="form-grid" onSubmit={submitDayForm(handleDaySave)}>
          <label>
            Label
            <input {...register("label")} placeholder={`Day ${day.dayNumber}`} />
          </label>
          <label>
            Date
            <input {...register("date")} type="date" />
          </label>
          <label className="span-two editor-field editor-location-field">
            City or Area
            <input
              value={values.locationInput ?? ""}
              onBlur={() => window.setTimeout(() => setIsLocationActive(false), 180)}
              onChange={handleDayLocationInputChange}
              onFocus={() => setIsLocationActive(true)}
              placeholder="Search a city, neighborhood, hotel, or paste a Google Maps link"
            />
            <small>{mapsProfile.autocompleteHint} You can also type a custom area.</small>
          </label>
          <input type="hidden" {...register("locationInput")} />
          <input type="hidden" {...register("city")} />
          <input type="hidden" {...register("baseMapLink")} />
          {isLocationActive && placeAutocomplete.status !== "idle" ? (
            <div className="span-two place-autocomplete-panel">
              {placeAutocomplete.status === "loading" ? <span className="place-autocomplete-status">Searching places...</span> : null}
              {placeAutocomplete.status === "error" ? <span className="place-autocomplete-status is-error">{placeAutocomplete.errorMessage || "Could not load suggestions."}</span> : null}
              {placeAutocomplete.suggestions.map((suggestion) => (
                <button className="place-autocomplete-option" type="button" key={suggestion.placeId} onMouseDown={(event) => event.preventDefault()} onClick={() => handleDayPlaceSuggestionSelect(suggestion)}>
                  <MapPin size={15} />
                  <span>
                    <strong>{suggestion.mainText || suggestion.text}</strong>
                    {suggestion.secondaryText ? <small>{suggestion.secondaryText}</small> : null}
                  </span>
                </button>
              ))}
              {placeAutocomplete.status === "ready" && !placeAutocomplete.suggestions.length ? <span className="place-autocomplete-status">No matching places found.</span> : null}
              {placeAutocomplete.suggestions.length ? <span className="place-autocomplete-powered">Powered by Google</span> : null}
            </div>
          ) : null}
          {(autoResolve.status === "pending" || autoResolve.status === "resolving" || autoResolve.status === "ready" || autoResolve.status === "error") ? (
            <div className="span-two editor-inline-status">
              <AutoResolveStatus status={autoResolve.status} place={values.basePlace} errorMessage={autoResolve.errorMessage} onRetry={autoResolve.retry} />
            </div>
          ) : null}
          {mapPreview ? (
            <div className="span-two">
              <MapPreview preview={mapPreview} />
            </div>
          ) : null}
          <label className="span-two">
            Notes
            <textarea {...register("notes")} rows={3} placeholder="Arrival details, area notes, or reminders" />
          </label>
          <div className="dialog-actions span-two">
            <button className="ghost-button danger" type="button" disabled={!canDelete} onClick={onDelete}>
              <Trash2 size={17} />
              Remove Day
            </button>
            <button className="primary-button" type="submit">
              Save Day
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DialogHeader({ title, onClose }) {
  return (
    <div className="dialog-header">
      <h2>{title}</h2>
      <button className="icon-button" type="button" aria-label="Close dialog" data-dialog-close onClick={onClose}>
        <X size={18} />
      </button>
    </div>
  );
}

function getMapPreview(link, place = null) {
  const normalizedLink = normalizeGoogleMapsUrlInput(link);
  const placeQuery = getPlaceEmbedQuery(place);
  if (!normalizedLink && !placeQuery) {
    return null;
  }

  const placeHref = normalizeGoogleMapsUrlInput(place?.googleMapsUri ?? "");
  try {
    const url = new URL(normalizedLink);
    const host = url.hostname.replace(/^www\./, "");
    const isGoogleMap = isGoogleMapsUrl(url);
    const embedQuery = placeQuery || (isGoogleMap ? getGoogleMapsEmbedQuery(url) : "");
    const embedSrc = getGoogleMapsEmbedSrc(embedQuery);

    return {
      href: url.href,
      title: isGoogleMap ? "Google Maps saved" : "Map link saved",
      detail: getMapPreviewDetail({ embedSrc, isGoogleMap: isGoogleMap || Boolean(placeQuery), host }),
      embedSrc
    };
  } catch {
    if (placeQuery) {
      const embedSrc = getGoogleMapsEmbedSrc(placeQuery);
      return {
        href: placeHref,
        title: "Google Maps saved",
        detail: getMapPreviewDetail({ embedSrc, isGoogleMap: true, host: "Google Maps" }),
        embedSrc
      };
    }

    return {
      href: "",
      title: "Check map link",
      detail: "Paste a Google Maps link like maps.app.goo.gl/..."
    };
  }
}

function isGoogleMapsLink(link) {
  try {
    return isGoogleMapsUrl(new URL(normalizeGoogleMapsUrlInput(link)));
  } catch {
    return false;
  }
}

function normalizeGoogleMapsUrlInput(link) {
  const trimmedLink = String(link ?? "").trim();
  if (!trimmedLink) {
    return "";
  }

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(trimmedLink)) {
    return trimmedLink;
  }

  if (/\s/.test(trimmedLink)) {
    return trimmedLink;
  }

  try {
    const candidateUrl = new URL(`https://${trimmedLink}`);
    return isGoogleMapsUrl(candidateUrl) ? candidateUrl.href : trimmedLink;
  } catch {
    return trimmedLink;
  }
}

function isGoogleMapsUrl(url) {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  return host === "maps.app.goo.gl" || host === "goo.gl" || host.startsWith("maps.google.") || (host.startsWith("google.") && url.pathname.startsWith("/maps"));
}

function getMapPreviewDetail({ embedSrc, isGoogleMap, host }) {
  if (!isGoogleMap) {
    return host;
  }

  if (!GOOGLE_MAPS_EMBED_KEY) {
    return "Add VITE_GOOGLE_MAPS_EMBED_KEY to show an embedded preview.";
  }

  if (embedSrc) {
    return "Embedded Google Maps preview.";
  }

  return "Open the saved place or route when you need it.";
}

function getGoogleMapsEmbedSrc(query) {
  if (!GOOGLE_MAPS_EMBED_KEY) {
    return "";
  }

  if (!query) {
    return "";
  }

  const embedUrl = new URL("https://www.google.com/maps/embed/v1/place");
  embedUrl.searchParams.set("key", GOOGLE_MAPS_EMBED_KEY);
  embedUrl.searchParams.set("q", query);
  return embedUrl.href;
}

function getPlaceEmbedQuery(place) {
  if (place?.id) {
    return `place_id:${place.id}`;
  }

  if (hasPlaceCoordinates(place)) {
    return `${place.latitude},${place.longitude}`;
  }

  return place?.name || place?.formattedAddress || "";
}

function getGoogleMapsEmbedQuery(url) {
  const queryParam = url.searchParams.get("query") || url.searchParams.get("q") || url.searchParams.get("destination");
  if (queryParam) {
    const placeId = url.searchParams.get("query_place_id") || url.searchParams.get("destination_place_id");
    return placeId ? `place_id:${placeId}` : queryParam;
  }

  const placePathMatch = url.pathname.match(/\/maps\/place\/([^/@]+)/);
  if (placePathMatch?.[1]) {
    return decodeURIComponent(placePathMatch[1].replace(/\+/g, " "));
  }

  const coordinatesMatch = url.href.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),/) || url.href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (coordinatesMatch) {
    return `${coordinatesMatch[1]},${coordinatesMatch[2]}`;
  }

  return "";
}

function getResolveTargetKey(targetType, targetClientId) {
  return `${targetType}:${targetClientId}`;
}

function hasPlaceCoordinates(place) {
  return Number.isFinite(Number(place?.latitude)) && Number.isFinite(Number(place?.longitude));
}

function buildPlannerMapItems(trip, days = [], tagAssets = DEFAULT_TAG_ASSETS) {
  const mappedItems = [];
  const needsLocationItems = [];
  const allItems = [];
  const scheduledSignatures = new Set();
  const scheduledStaySignatures = new Set();

  days.forEach((day) => {
    sortSchedule(day.schedule ?? []).forEach((item) => {
      if (!isMapEligiblePlannerItem(item)) {
        return;
      }

      const mapItem = buildPlannerMapItem({
        source: "scheduled",
        sourceItem: item,
        day,
        days,
        tagAssets
      });

      const signature = getMapDuplicateSignature(mapItem);
      if (isStayItem(item)) {
        const staySignature = signature || getMapStayDuplicateSignature(item);
        if (staySignature && scheduledStaySignatures.has(staySignature)) {
          return;
        }
        if (staySignature) {
          scheduledStaySignatures.add(staySignature);
        }
      }

      addMapItem(mapItem, { mappedItems, needsLocationItems, allItems });

      if (signature) {
        scheduledSignatures.add(signature);
      }
    });
  });

  (trip.ideas ?? []).forEach((idea) => {
    if (!isMapEligiblePlannerItem(idea)) {
      return;
    }

    const mapItem = buildPlannerMapItem({
      source: "idea",
      sourceItem: idea,
      tagAssets
    });
    const signature = getMapDuplicateSignature(mapItem);
    if (signature && scheduledSignatures.has(signature)) {
      return;
    }
    addMapItem(mapItem, { mappedItems, needsLocationItems, allItems });
  });

  return { mappedItems, needsLocationItems, allItems };
}

function addMapItem(item, groups) {
  groups.allItems.push(item);
  if (item.isMapped) {
    groups.mappedItems.push(item);
  } else {
    groups.needsLocationItems.push(item);
  }
}

function buildPlannerMapItem({ source, sourceItem, day = null, days = [], tagAssets = DEFAULT_TAG_ASSETS }) {
  const config = getCategoryConfigForAssets(sourceItem.category, tagAssets);
  const place = sourceItem.place ?? null;
  const isMapped = hasPlaceCoordinates(place);
  const city = sourceItem.city || day?.city || inferCityFromAddress(place?.formattedAddress) || "";
  const dayIds = day ? getMapItemDayIds(sourceItem, day.id, days) : [];

  return {
    id: `${source}:${sourceItem.id}`,
    source,
    sourceLabel: source === "idea" ? "Idea" : "Scheduled",
    sourceItem,
    dayId: day?.id ?? "",
    dayIds,
    dayLabel: day ? formatMapItemDayLabel(sourceItem, day, days) : "",
    title: sourceItem.title || place?.name || "Untitled place",
    category: sourceItem.category || "Open Time",
    categoryClass: config.className,
    iconSrc: config.asset,
    city,
    status: sourceItem.status || "Proposed",
    mapLink: normalizeGoogleMapsUrlInput(sourceItem.mapLink),
    place,
    isMapped,
    googleMapsUrl: place?.googleMapsUri || normalizeGoogleMapsUrlInput(sourceItem.mapLink) || "",
    position: isMapped ? { lat: Number(place.latitude), lng: Number(place.longitude) } : null
  };
}

function isMapEligiblePlannerItem(item) {
  if (!item || item.status === "Skipped") {
    return false;
  }
  return !EXCLUDED_MAP_CATEGORIES.has(item.category);
}

function getMapItemDayIds(item, sourceDayId, days = []) {
  if (!sourceDayId) {
    return [];
  }
  if (!isStayItem(item)) {
    return [sourceDayId];
  }

  const { startIndex, endIndex } = getStayDayIndexes(item, sourceDayId, days);
  const stayDays = days.slice(startIndex, endIndex + 1).filter((day) => day?.id);
  return stayDays.length ? stayDays.map((day) => day.id) : [sourceDayId];
}

function formatMapItemDayLabel(item, sourceDay, days = []) {
  if (!isStayItem(item)) {
    return formatMapDayLabel(sourceDay);
  }

  const { startIndex, endIndex } = getStayDayIndexes(item, sourceDay.id, days);
  const startDay = days[startIndex] ?? sourceDay;
  const endDay = days[endIndex] ?? startDay;
  if (!startDay || startDay.id === endDay.id) {
    return formatMapDayLabel(sourceDay);
  }

  const cityLabel = startDay.city && startDay.city === endDay.city ? ` · ${startDay.city}` : "";
  return `Day ${startDay.dayNumber} - Day ${endDay.dayNumber}${cityLabel}`;
}

function getMapDuplicateSignature(item) {
  const normalizedTitle = normalizeMapSignaturePart(item.title);
  const placeKey = item.place?.id
    || (hasPlaceCoordinates(item.place) ? `${Number(item.place.latitude).toFixed(5)},${Number(item.place.longitude).toFixed(5)}` : "")
    || normalizeMapSignaturePart(item.mapLink)
    || normalizeMapSignaturePart(item.place?.name)
    || normalizeMapSignaturePart(item.place?.formattedAddress);

  if (!normalizedTitle || !placeKey) {
    return "";
  }

  return `${normalizedTitle}:${placeKey}`;
}

function getMapStayDuplicateSignature(item) {
  return normalizeMapSignaturePart(item.id)
    || [item.title, item.city].map(normalizeMapSignaturePart).filter(Boolean).join(":");
}

function normalizeMapSignaturePart(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function filterPlannerMapItems(mapOverview, filters, searchQuery = "") {
  const normalizedSearch = String(searchQuery ?? "").trim().toLowerCase();
  const filteredItems = mapOverview.allItems.filter((item) => {
    if (filters.source === "Ideas" && item.source !== "idea") {
      return false;
    }
    if (filters.source === "Scheduled" && item.source !== "scheduled") {
      return false;
    }
    if (filters.dayId !== "All" && !(item.dayIds ?? [item.dayId]).includes(filters.dayId)) {
      return false;
    }
    if (filters.city !== "All" && item.city !== filters.city) {
      return false;
    }
    if (filters.category !== "All" && item.category !== filters.category) {
      return false;
    }
    if (filters.status !== "All" && item.status !== filters.status) {
      return false;
    }
    if (filters.location === "Mapped" && !item.isMapped) {
      return false;
    }
    if (filters.location === "Needs location" && item.isMapped) {
      return false;
    }
    if (normalizedSearch && !mapItemMatchesSearch(item, normalizedSearch)) {
      return false;
    }
    return true;
  });

  return {
    allItems: filteredItems,
    mappedItems: filteredItems.filter((item) => item.isMapped),
    needsLocationItems: filteredItems.filter((item) => !item.isMapped)
  };
}

function mapItemMatchesSearch(item, normalizedSearch) {
  const searchableText = [
    item.title,
    item.city,
    item.category,
    item.status,
    item.sourceLabel,
    item.dayLabel,
    item.place?.name,
    item.place?.formattedAddress
  ].filter(Boolean).join(" ").toLowerCase();
  return searchableText.includes(normalizedSearch);
}

function buildActiveMapFilterChips(filters, { dayOptions = [], cityOptions = [] } = {}) {
  const chips = [];
  if (filters.source !== MAP_DEFAULT_FILTERS.source) {
    chips.push({ key: "source", label: `Source: ${filters.source}` });
  }
  if (filters.dayId !== MAP_DEFAULT_FILTERS.dayId) {
    chips.push({ key: "day", label: `Day: ${findMapOptionLabel(dayOptions, filters.dayId, filters.dayId)}` });
  }
  if (filters.city !== MAP_DEFAULT_FILTERS.city) {
    chips.push({ key: "city", label: `City: ${findMapOptionLabel(cityOptions, filters.city, filters.city)}` });
  }
  if (filters.category !== MAP_DEFAULT_FILTERS.category) {
    chips.push({ key: "category", label: `Category: ${filters.category}` });
  }
  if (filters.status !== MAP_DEFAULT_FILTERS.status) {
    chips.push({ key: "status", label: `Status: ${filters.status}` });
  }
  if (filters.location !== MAP_DEFAULT_FILTERS.location) {
    chips.push({ key: "location", label: `Location: ${filters.location}` });
  }
  return chips;
}

function findMapOptionLabel(options, value, fallback) {
  return options.find((option) => String(option.value) === String(value))?.label ?? fallback;
}

function buildMapCityOptions(items) {
  return [...new Set(items.map((item) => item.city).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .map((city) => ({ value: city, label: city }));
}

function formatMapDayLabel(day) {
  return `Day ${day.dayNumber}${day.city ? ` · ${day.city}` : ""}`;
}

function getMapFallbackCenter(mapsProfile) {
  return MAP_PROFILE_CENTERS[mapsProfile?.id] ?? MAP_PROFILE_CENTERS.global;
}

function formatDistanceKm(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 km";
  }
  return value >= 10 ? `${Math.round(value)} km` : `${value.toFixed(1)} km`;
}

function enrichDraftWithPlace(draft, place, { emptyTitleFallback = "" } = {}) {
  const nextDraft = {
    ...draft,
    place,
    mapLink: normalizeGoogleMapsUrlInput(draft.mapLink) || place.googleMapsUri || ""
  };

  if (shouldFillEmptyText(draft.title, emptyTitleFallback) && place.name) {
    nextDraft.title = place.name;
  }

  const city = inferCityFromAddress(place.formattedAddress);
  if (shouldFillEmptyText(draft.city) && city) {
    nextDraft.city = city;
  }

  return nextDraft;
}

function enrichDayDraftWithBasePlace(draft, place) {
  const nextDraft = {
    ...draft,
    basePlace: place,
    baseMapLink: normalizeGoogleMapsUrlInput(draft.baseMapLink) || place.googleMapsUri || ""
  };

  const city = inferCityFromAddress(place.formattedAddress);
  if (shouldFillEmptyText(draft.city) && city) {
    nextDraft.city = city;
  }

  return nextDraft;
}

function shouldFillEmptyText(value, fallback = "") {
  const normalizedValue = String(value ?? "").trim().toLowerCase();
  const normalizedFallback = String(fallback ?? "").trim().toLowerCase();
  return !normalizedValue || Boolean(normalizedFallback && normalizedValue === normalizedFallback);
}

function getTripMapsProfile(trip, days = []) {
  const profileText = [
    trip?.name,
    trip?.dateRangeLabel,
    ...(days ?? []).flatMap((day) => [day.city, day.basePlace?.name, day.basePlace?.formattedAddress]),
    ...(trip?.ideas ?? []).flatMap((idea) => [idea.city, idea.place?.name, idea.place?.formattedAddress])
  ].join(" ").toLowerCase();

  if (/\b(cdmx|mexico city|ciudad de mexico|ciudad de méxico|mexico|méxico)\b/.test(profileText)) {
    return MAPS_PROFILES.mexicoCity;
  }

  if (/\b(japan|tokyo|kyoto|osaka|nara|hakone|yokohama|kobe|hiroshima|nagoya|sapporo|fukuoka|kamakura|kanazawa|nikko)\b/.test(profileText)) {
    return MAPS_PROFILES.japan;
  }

  return MAPS_PROFILES.global;
}

function inferCityFromAddress(address) {
  const normalizedAddress = String(address ?? "").trim();
  if (!normalizedAddress) {
    return "";
  }

  if (/\b(cdmx|mexico city|ciudad de mexico|ciudad de méxico)\b/i.test(normalizedAddress)) {
    return "Mexico City";
  }

  const knownCities = [
    "Mexico City",
    "Tokyo",
    "Kyoto",
    "Osaka",
    "Nara",
    "Hakone",
    "Yokohama",
    "Kobe",
    "Hiroshima",
    "Nagoya",
    "Sapporo",
    "Fukuoka",
    "Kamakura",
    "Uji",
    "Himeji",
    "Kanazawa",
    "Nikko"
  ];
  return knownCities.find((city) => normalizedAddress.toLowerCase().includes(city.toLowerCase())) ?? "";
}

function applyResolvedPlace(trip, { targetType, targetClientId, dayId, mapLink }, place) {
  if (!place) {
    return trip;
  }

  if (targetType === "idea") {
    return {
      ...trip,
      ideas: trip.ideas.map((idea) =>
        idea.id === targetClientId
          ? {
              ...idea,
              place,
              mapLink: normalizeGoogleMapsUrlInput(idea.mapLink) || mapLink || place.googleMapsUri || ""
            }
          : idea
      )
    };
  }

  if (targetType === "trip_day_base") {
    return {
      ...trip,
      days: trip.days.map((day) =>
        day.id === targetClientId
          ? {
              ...day,
              basePlace: place,
              baseMapLink: normalizeGoogleMapsUrlInput(day.baseMapLink) || mapLink || place.googleMapsUri || ""
            }
          : day
      )
    };
  }

  return {
    ...trip,
    days: trip.days.map((day) =>
      day.id === dayId
        ? {
            ...day,
            schedule: (day.schedule ?? []).map((item) =>
              item.id === targetClientId
                ? {
                    ...item,
                    place,
                    mapLink: normalizeGoogleMapsUrlInput(item.mapLink) || mapLink || place.googleMapsUri || ""
                  }
                : item
            )
          }
        : day
    )
  };
}

function FormGrid({ children }) {
  return <div className="form-grid">{children}</div>;
}

function TravelStrip() {
  return (
    <div className="travel-strip" aria-hidden="true">
      <img src={FOOTER_STRIP_ASSET} alt="" />
    </div>
  );
}

function getCategoryConfig(category) {
  return getCategoryConfigForAssets(category, DEFAULT_TAG_ASSETS);
}

function getCategoryConfigForAssets(category, tagAssets = DEFAULT_TAG_ASSETS) {
  const baseConfig = CATEGORY_CONFIG_BASE[category] ?? CATEGORY_CONFIG_BASE["Open Time"];
  return {
    ...baseConfig,
    asset: tagAssets.category[category] ?? tagAssets.category["Open Time"]
  };
}

function getStatusAsset(status, tagAssets = DEFAULT_TAG_ASSETS) {
  if (status === "Proposed") {
    return tagAssets.meta.notes;
  }
  return tagAssets.status[status] ?? tagAssets.meta.notes;
}

function getTagAssetsForMapsProfile(mapsProfile) {
  return mapsProfile?.id === "japan" ? TAG_ASSET_THEMES.japan : TAG_ASSET_THEMES.generic;
}

function getTripMarkAssetForMapsProfile(mapsProfile) {
  return mapsProfile?.id === "japan" ? FLAG_ASSET : GENERIC_TRIP_MARK_ASSET;
}

function useTagAssets() {
  return React.useContext(TagAssetsContext);
}

function formatCategoryFilterLabel(category) {
  if (category === "All") {
    return "All";
  }
  if (category === "Open Time") {
    return "Open";
  }
  return getCategoryConfig(category).label;
}

function formatSyncStatus(status) {
  const labels = {
    idle: "Ready",
    loading: "Loading",
    saving: "Saving",
    saved: "Saved",
    synced: "Synced",
    error: "Sync issue"
  };

  return labels[status] ?? "Ready";
}

function formatRoleLabel(role) {
  const labels = {
    owner: "Owner",
    editor: "Can edit",
    viewer: "View only"
  };

  return labels[role] ?? "Can edit";
}

function getDayStats(day) {
  if (!day) {
    return { plannedMinutes: 0, openMinutes: DAY_MINUTES };
  }
  const plannedMinutes = day.schedule
    .filter((item) => item.status !== "Skipped" && !isStayItem(item))
    .reduce((total, item) => total + Number(item.duration || 0), 0);
  return {
    plannedMinutes,
    openMinutes: Math.max(0, DAY_MINUTES - plannedMinutes)
  };
}

function sortSchedule(schedule) {
  return [...(schedule ?? [])].sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));
}

function sortActivitySchedule(schedule) {
  return sortSchedule(schedule).filter((item) => !isStayItem(item));
}

function isStayItem(item) {
  return item?.itemKind === STAY_KIND || Boolean(item?.stayStartDayId || item?.stayEndDayId || item?.checkInTime || item?.checkOutTime) || item?.category === HOTEL_CATEGORY;
}

function getNextDayId(days, dayId) {
  const index = days.findIndex((day) => day.id === dayId);
  return index >= 0 ? days[index + 1]?.id ?? "" : "";
}

function getStayDayIndexes(item, sourceDayId, days) {
  const fallbackIndex = Math.max(0, days.findIndex((day) => day.id === sourceDayId));
  const startIndex = days.findIndex((day) => day.id === (item.stayStartDayId || sourceDayId));
  const endIndex = days.findIndex((day) => day.id === (item.stayEndDayId || item.stayStartDayId || sourceDayId));
  const normalizedStart = startIndex >= 0 ? startIndex : fallbackIndex;
  const normalizedEnd = endIndex >= 0 ? endIndex : normalizedStart;
  return {
    startIndex: Math.min(normalizedStart, normalizedEnd),
    endIndex: Math.max(normalizedStart, normalizedEnd)
  };
}

function createScheduleItemFromIdea(idea, targetDay, days, preferredStart) {
  const isHotelIdea = idea.category === HOTEL_CATEGORY;
  const nextStayDayId = getNextDayId(days, targetDay.id) || targetDay.id;
  const duration = isHotelIdea ? DEFAULT_NEW_BLOCK.duration : Number(idea.duration) || DEFAULT_NEW_BLOCK.duration;
  const preferredStartIsAvailable = preferredStart && isScheduleSlotAvailable(targetDay.schedule, null, preferredStart, duration);
  const start = isHotelIdea
    ? DEFAULT_CHECK_IN_TIME
    : preferredStartIsAvailable
      ? preferredStart
      : findAvailableScheduleStart(targetDay.schedule, duration) || preferredStart || suggestNextTimelineStart(targetDay.schedule, duration);

  return {
    ...DEFAULT_NEW_BLOCK,
    id: `sched-${idea.id}-${Date.now()}`,
    itemKind: isHotelIdea ? STAY_KIND : ACTIVITY_KIND,
    title: idea.title,
    category: idea.category,
    city: idea.city || targetDay.city,
    start,
    duration,
    status: idea.status === "Skipped" ? "Proposed" : idea.status,
    notes: idea.notes ?? "",
    cost: idea.cost ?? "",
    link: idea.link ?? "",
    mapLink: idea.mapLink ?? "",
    place: idea.place ?? null,
    stayStartDayId: isHotelIdea ? targetDay.id : "",
    stayEndDayId: isHotelIdea ? nextStayDayId : "",
    checkInTime: isHotelIdea ? DEFAULT_CHECK_IN_TIME : "",
    checkOutTime: isHotelIdea ? DEFAULT_CHECK_OUT_TIME : ""
  };
}

function createIdeaFromScheduleItem(item, sourceDay, days, travelers = []) {
  const isStay = isStayItem(item);
  const { startIndex, endIndex } = getStayDayIndexes(item, sourceDay.id, days);
  const startDay = days[startIndex] ?? sourceDay;
  const endDay = days[endIndex] ?? sourceDay;
  const context = isStay
    ? `Previously scheduled: ${formatShortDate(startDay.date)} - ${formatShortDate(endDay.date)}, check-in ${formatTime(item.checkInTime || DEFAULT_CHECK_IN_TIME)}, check-out ${formatTime(item.checkOutTime || DEFAULT_CHECK_OUT_TIME)}.`
    : `Previously scheduled: Day ${sourceDay.dayNumber} - ${formatShortDate(sourceDay.date)}, ${formatTime(item.start)}.`;
  const notes = [item.notes?.trim(), context].filter(Boolean).join("\n\n");

  return {
    ...DEFAULT_NEW_IDEA,
    id: `idea-${item.id}-${Date.now()}`,
    title: item.title?.trim() || "Untitled idea",
    category: item.category || DEFAULT_NEW_IDEA.category,
    city: item.city || sourceDay.city || "",
    duration: Number(item.duration) || DEFAULT_NEW_BLOCK.duration,
    status: item.status || DEFAULT_NEW_IDEA.status,
    notes,
    cost: item.cost ?? "",
    link: item.link ?? "",
    mapLink: item.mapLink ?? "",
    place: item.place ?? null,
    reactions: Object.fromEntries(travelers.map((name) => [name, ""]))
  };
}

function getStaysForDay(day, days) {
  if (!day) {
    return [];
  }
  const dayIndex = days.findIndex((candidate) => candidate.id === day.id);
  if (dayIndex < 0) {
    return [];
  }

  return days.flatMap((sourceDay) =>
    (sourceDay.schedule ?? [])
      .filter(isStayItem)
      .map((item) => {
        const { startIndex, endIndex } = getStayDayIndexes(item, sourceDay.id, days);
        return {
          item,
          sourceDayId: sourceDay.id,
          startIndex,
          endIndex,
          isCheckInDay: dayIndex === startIndex,
          isCheckOutDay: dayIndex === endIndex
        };
      })
      .filter((stay) => dayIndex >= stay.startIndex && dayIndex <= stay.endIndex)
  );
}

function getStayRailColor(index) {
  return STAY_RAIL_COLORS[index % STAY_RAIL_COLORS.length];
}

function buildStayRailItems(days) {
  const dayCount = Math.max(days.length, 1);
  const rowEnds = [];
  const stays = days.flatMap((sourceDay, sourceIndex) =>
    (sourceDay.schedule ?? [])
      .filter(isStayItem)
      .map((item) => {
        const { startIndex, endIndex } = getStayDayIndexes(item, sourceDay.id, days);
        const startDay = days[startIndex];
        const endDay = days[endIndex];
        const startPosition = Math.min(dayCount, startIndex + 0.5);
        const endPosition = Math.min(dayCount, Math.max(endIndex + 0.5, startPosition + 0.5));
        return {
          item,
          sourceDayId: sourceDay.id,
          sourceIndex,
          startIndex,
          endIndex,
          startPosition,
          endPosition,
          leftPercent: (startPosition / dayCount) * 100,
          widthPercent: ((endPosition - startPosition) / dayCount) * 100,
          startsInView: Boolean(startDay),
          endsInView: Boolean(endDay),
          dateLabel: startDay && endDay ? `${formatShortDate(startDay.date)} - ${formatShortDate(endDay.date)}` : ""
        };
      })
  );

  return stays
    .sort((a, b) => a.startPosition - b.startPosition || a.endPosition - b.endPosition || a.sourceIndex - b.sourceIndex || a.item.title.localeCompare(b.item.title))
    .map((stay, index) => {
      const reusableRowIndex = rowEnds.findIndex((rowEnd) => stay.startPosition >= rowEnd);
      const rowIndex = reusableRowIndex >= 0 ? reusableRowIndex : rowEnds.length;
      rowEnds[rowIndex] = stay.endPosition;
      return {
        ...stay,
        rowIndex,
        color: getStayRailColor(index)
      };
    });
}

function deriveTripDays(days) {
  return [...(days ?? [])]
    .map((day, index) => ({
      ...day,
      id: day.id ?? `day-${index}`,
      date: day.date ?? getTodayDate(),
      label: day.label ?? "",
      city: day.city ?? "",
      notes: day.notes ?? "",
      schedule: day.schedule ?? [],
      sortIndex: index
    }))
    .sort((a, b) => {
      const dateSort = dateSortValue(a.date) - dateSortValue(b.date);
      return dateSort || a.sortIndex - b.sortIndex;
    })
    .map((day, index) => ({ ...day, dayNumber: index + 1 }));
}

function dateSortValue(dateValue) {
  const time = new Date(`${dateValue}T12:00:00`).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function getTimeGridEventLayout(item, rowHeight = DAY_TIME_GRID_ROW_HEIGHT) {
  return getTimeGridBlockLayout(item.start, Number(item.duration) || TIME_GRID_STEP_MINUTES, rowHeight);
}

function getTimeGridBlockLayout(startTime, durationMinutes, rowHeight = DAY_TIME_GRID_ROW_HEIGHT) {
  const parsedStart = parseTimeToMinutes(startTime);
  const start = parsedStart ?? TIME_GRID_START_MINUTES;
  const duration = Math.max(MIN_SCHEDULE_DURATION_MINUTES, Number(durationMinutes) || MIN_SCHEDULE_DURATION_MINUTES);
  const end = start + duration;
  const clampedStart = Math.min(Math.max(start, TIME_GRID_START_MINUTES), TIME_GRID_END_MINUTES - MIN_SCHEDULE_DURATION_MINUTES);
  const clampedEnd = Math.min(Math.max(end, clampedStart + MIN_SCHEDULE_DURATION_MINUTES), TIME_GRID_END_MINUTES);
  const rowStart = (clampedStart - TIME_GRID_START_MINUTES) / TIME_GRID_STEP_MINUTES;
  const rowSpan = Math.max(MIN_SCHEDULE_DURATION_MINUTES / TIME_GRID_STEP_MINUTES, (clampedEnd - clampedStart) / TIME_GRID_STEP_MINUTES);

  return {
    top: `${rowStart * rowHeight}px`,
    height: `${Math.max(18, rowSpan * rowHeight - 6)}px`,
    isClamped: start !== clampedStart || end !== clampedEnd
  };
}

function getTripTimeEventDetail(item, dayCity = "", tagAssets = DEFAULT_TAG_ASSETS) {
  const duration = Number(item.duration) || TIME_GRID_STEP_MINUTES;
  const description = duration >= 45 ? (item.notes ?? "").trim() : "";
  const itemCity = (item.city ?? "").trim();
  const normalizedDayCity = dayCity.trim().toLowerCase();
  const meta = [];

  if (duration >= 90) {
    meta.push({ key: "duration", label: formatDuration(duration), asset: tagAssets.meta.calendar });
    if (itemCity && itemCity.toLowerCase() !== normalizedDayCity) {
      meta.push({ key: "location", label: itemCity, asset: tagAssets.meta.map });
    }
  }

  return { description, meta };
}

function getScheduleEventDetail(item, dayCity = "", tagAssets = DEFAULT_TAG_ASSETS) {
  const duration = Number(item.duration) || TIME_GRID_STEP_MINUTES;
  const description = (item.notes ?? "").trim();
  const chips = [];
  const itemCity = (item.city ?? "").trim();
  const normalizedDayCity = dayCity.trim().toLowerCase();
  const shouldShowLocation = itemCity && itemCity.toLowerCase() !== normalizedDayCity;
  const cost = (item.cost ?? "").trim();
  const hasMap = Boolean((item.mapLink ?? "").trim());
  const hasLink = Boolean((item.link ?? "").trim());

  if (duration >= 60) {
    chips.push({ key: "duration", label: formatDuration(duration), title: "Duration", asset: tagAssets.meta.calendar });
  }

  if (shouldShowLocation) {
    chips.push({ key: "location", label: itemCity, title: "Area", asset: tagAssets.meta.map });
  }

  if (cost) {
    chips.push({ key: "cost", label: cost, title: "Cost", asset: tagAssets.meta.budget });
  }

  if (hasMap) {
    chips.push({ key: "map", label: "Map", title: "Map link saved", asset: tagAssets.meta.map });
  }

  if (hasLink) {
    chips.push({ key: "link", label: "Link", title: "Website or booking link saved", asset: tagAssets.meta.link });
  }

  return {
    description,
    inlineDescription: duration < 90 ? description : "",
    detailDescription: duration >= 90 ? description : "",
    chips,
    showDetailStrip: duration >= 60 && (duration >= 90 ? Boolean(description) || chips.length > 0 : chips.length > 0)
  };
}

function getDropStartFromPointer(clientY, column, durationMinutes, rowHeight = DAY_TIME_GRID_ROW_HEIGHT) {
  const rect = column.getBoundingClientRect();
  const offsetY = Math.min(Math.max(clientY - rect.top, 0), rect.height);
  const rawMinutes = TIME_GRID_START_MINUTES + (offsetY / rowHeight) * TIME_GRID_STEP_MINUTES;
  const snappedMinutes = snapTimelineMinutes(rawMinutes);
  const clampedMinutes = clampMinutes(snappedMinutes, TIME_GRID_START_MINUTES, getLatestTimelineStart(durationMinutes));
  return minutesToTimeInput(clampedMinutes);
}

function getCellStartFromPointer(clientY, column, rowHeight = DAY_TIME_GRID_ROW_HEIGHT) {
  const rect = column.getBoundingClientRect();
  const offsetY = Math.min(Math.max(clientY - rect.top, 0), Math.max(0, rect.height - 1));
  const rawMinutes = TIME_GRID_START_MINUTES + (offsetY / rowHeight) * TIME_GRID_STEP_MINUTES;
  const snappedMinutes = snapTimelineMinutes(rawMinutes, "floor");
  const clampedMinutes = clampMinutes(snappedMinutes, TIME_GRID_START_MINUTES, getLatestTimelineStart(TIME_GRID_STEP_MINUTES));
  return minutesToTimeInput(clampedMinutes);
}

function getResizeDeltaMinutes(clientY, startY, rowHeight = DAY_TIME_GRID_ROW_HEIGHT) {
  const rawMinutes = ((clientY - startY) / rowHeight) * TIME_GRID_STEP_MINUTES;
  return Math.round(rawMinutes / RESIZE_STEP_MINUTES) * RESIZE_STEP_MINUTES;
}

function findAvailableScheduleStart(schedule, durationMinutes) {
  const duration = Math.max(MIN_SCHEDULE_DURATION_MINUTES, Number(durationMinutes) || MIN_SCHEDULE_DURATION_MINUTES);
  for (let minutes = TIME_GRID_START_MINUTES; minutes <= TIME_GRID_END_MINUTES - duration; minutes += RESIZE_STEP_MINUTES) {
    const start = minutesToTimeInput(minutes);
    if (isScheduleSlotAvailable(schedule, null, start, duration)) {
      return start;
    }
  }
  return "";
}

function isScheduleSlotAvailable(schedule, movingItemId, targetStart, durationMinutes) {
  const start = parseTimeToMinutes(targetStart);
  const duration = Math.max(MIN_SCHEDULE_DURATION_MINUTES, Number(durationMinutes) || MIN_SCHEDULE_DURATION_MINUTES);
  if (start === null || !isWithinTimelineRange(targetStart, duration)) {
    return false;
  }

  return (schedule ?? []).every((item) => {
    if (item.id === movingItemId) {
      return true;
    }
    if (isStayItem(item)) {
      return true;
    }
    const itemStart = parseTimeToMinutes(item.start);
    if (itemStart === null) {
      return true;
    }
    const itemDuration = Number(item.duration) || TIME_GRID_STEP_MINUTES;
    return !timeRangesOverlap(start, duration, itemStart, itemDuration);
  });
}

function areDropPreviewsEqual(first, second) {
  if (!first || !second) {
    return first === second;
  }
  return first.dayId === second.dayId && first.start === second.start && first.duration === second.duration && first.isAvailable === second.isAvailable;
}

function formatTripRange(days) {
  if (!days.length) {
    return "No trip days";
  }
  const first = days[0].date;
  const last = days[days.length - 1].date;
  return `${formatShortDate(first)} - ${formatShortDate(last)} • ${days.length} ${days.length === 1 ? "day" : "days"}`;
}

function filterIdeas(ideas, tab, category) {
  return ideas.filter((idea) => {
    const matchesTab =
      tab === "All" ||
      tab === "Ideas" ||
      (tab === "Booked" && idea.status === "Booked") ||
      (tab === "Maybe" && idea.status === "Maybe");
    const matchesCategory = !category || category === "All" || idea.category === category;
    return matchesTab && matchesCategory;
  });
}

function filterActivityPickerIdeas(ideas, query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return ideas;
  }

  return ideas.filter((idea) => {
    const searchableText = `${idea.title ?? ""} ${idea.city ?? ""}`.toLowerCase();
    return searchableText.includes(normalizedQuery);
  });
}

function countStatus(ideas, status) {
  return ideas.filter((idea) => idea.status === status).length;
}

function findFirstAvailableTraveler(travelers) {
  return travelers.find((traveler) => !traveler.profileId) ?? travelers[0];
}

function getTravelerName(travelers, travelerId) {
  return travelers.find((traveler) => String(traveler.id) === String(travelerId))?.name ?? "Traveler";
}

function getSearchParam(name) {
  if (typeof window === "undefined") {
    return "";
  }
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

function clearSearchParam(name) {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.delete(name);
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function isDeletedAuthSessionError(error) {
  const message = String(error?.message ?? "");
  return message.includes("profiles_id_fkey") || message.includes("violates foreign key constraint");
}

function readPendingInviteToken() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.localStorage.getItem(PENDING_INVITE_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function writePendingInviteToken(inviteToken) {
  if (typeof window === "undefined" || !inviteToken) {
    return;
  }

  try {
    window.localStorage.setItem(PENDING_INVITE_TOKEN_KEY, inviteToken);
  } catch {
    // The invite token also lives in the URL; storage is only redirect backup.
  }
}

function clearPendingInviteToken() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
  } catch {
    // Safe to ignore.
  }
}

function getLastSelectedTripStorageKey(profileId) {
  const normalizedProfileId = String(profileId ?? "").trim();
  return normalizedProfileId ? `${LAST_SELECTED_TRIP_KEY}:${normalizedProfileId}` : "";
}

function readLastSelectedTripId(storageKey) {
  if (typeof window === "undefined" || !storageKey) {
    return null;
  }

  try {
    const value = Number(window.localStorage.getItem(storageKey));
    return value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeLastSelectedTripId(storageKey, tripId) {
  const nextTripId = Number(tripId);
  if (typeof window === "undefined" || !storageKey || !nextTripId) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, String(nextTripId));
  } catch {
    // This only controls refresh convenience; picking a trip still works.
  }
}

function clearLastSelectedTripId(storageKey) {
  if (typeof window === "undefined" || !storageKey) {
    return;
  }

  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Safe to ignore.
  }
}

function getSeenExpensesStorageKey(profileId, tripId) {
  if (!tripId) {
    return "";
  }

  return `${SEEN_EXPENSE_IDS_KEY}:${profileId || "local"}:${tripId}`;
}

function getExpenseAttentionId(expense) {
  return String(expense?.clientId ?? expense?.id ?? "");
}

function readSeenExpenseIds(storageKey) {
  if (typeof window === "undefined" || !storageKey) {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) {
      return null;
    }
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function writeSeenExpenseIds(storageKey, expenseIds) {
  if (typeof window === "undefined" || !storageKey) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...new Set(expenseIds.map(String))]));
  } catch {
    // This badge is a local convenience; the app still works if storage is unavailable.
  }
}

function detectCostCurrency(value, fallbackCurrency = "JPY") {
  const parsed = parseMoneyValue(value, fallbackCurrency);
  if (parsed?.currency) {
    return parsed.currency;
  }

  const rawValue = String(value ?? "").trim().toUpperCase();
  if (rawValue.includes("MXN") || rawValue.includes("MX$")) {
    return "MXN";
  }
  if (rawValue.includes("USD") || rawValue.includes("$")) {
    return "USD";
  }
  if (rawValue.includes("JPY") || rawValue.includes("YEN") || rawValue.includes("¥") || rawValue.includes("￥")) {
    return "JPY";
  }
  return normalizeCostCurrency(fallbackCurrency);
}

function normalizeCostCurrency(currency = "JPY") {
  const normalized = String(currency || "JPY").trim().toUpperCase();
  return COST_CURRENCY_OPTIONS.includes(normalized) ? normalized : "JPY";
}

function getCostAmountInputValue(value) {
  const rawValue = String(value ?? "").trim();
  if (/^\$+$/.test(rawValue)) {
    return rawValue;
  }
  return rawValue
    .replace(/MX\$/gi, "")
    .replace(/\b(MXN|USD|JPY|YEN)\b/gi, "")
    .replace(/[¥￥$]/g, "")
    .trim();
}

function formatCostForCurrency(value, currency = "JPY") {
  const amountValue = getCostAmountInputValue(value);
  if (!amountValue) {
    return "";
  }
  if (/^(tbd|unknown|varies|variable|included|free|n\/a|none|\$+)$/i.test(amountValue)) {
    return amountValue;
  }
  return `${normalizeCostCurrency(currency)} ${amountValue}`;
}

function formatShortDate(dateValue) {
  const value = String(dateValue ?? "");
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function formatWeekday(dateValue) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date(`${dateValue}T12:00:00`));
}

function formatRailDate(dateValue) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${dateValue}T12:00:00`));
}

function formatHeaderDate(dateValue) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${dateValue}T12:00:00`));
}

function formatTime(time) {
  if (!time) {
    return "TBD";
  }
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatMinutesTime(totalMinutes) {
  const date = new Date();
  date.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatDuration(minutes) {
  const safeMinutes = Number(minutes) || 0;
  const hours = Math.floor(safeMinutes / 60);
  const remaining = safeMinutes % 60;
  if (hours === 0) {
    return `${remaining}m`;
  }
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

export default App;
