import React, { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Toaster, toast } from "sonner";
import "sonner/dist/styles.css";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Bed,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coffee,
  Copy,
  Download,
  ExternalLink,
  FileUp,
  Filter,
  GripVertical,
  Heart,
  Info,
  Landmark,
  LogIn,
  LogOut,
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
  ShoppingBag,
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
import { acceptPendingTripInvite, acceptTripInvite, claimTripTraveler, createTripInvite, listTripCollaboration, prepareInviteSession, revokeTripInvite, updateTripTravelerName } from "./lib/collaborationRepository.js";
import { clearTripExpenses, deleteTripExpense, listTripExpenses, saveTripExpense, subscribeToExpenseChanges } from "./lib/expenseRepository.js";
import { EXPENSE_SOURCE_TYPES, buildTravelerOptions, calculateExpenseSummary, createExpenseDraft, deriveExpenseSuggestions, getExpenseSourceKey, prepareExpenseForSave } from "./lib/expenses.js";
import { downloadTripExport } from "./lib/export.js";
import { formatMajorAmount, formatMoney, parseMoneyValue, SUPPORTED_CURRENCIES } from "./lib/money.js";
import { isSupabaseConfigured } from "./lib/supabaseClient.js";
import { autocompletePlace, resolvePlace } from "./lib/mapsRepository.js";
import { isValidTrip, loadTrip, mergeIdeas } from "./lib/storage.js";
import { createTripFromPayload, listTrips, loadRemoteTrip, replaceTripPayload, subscribeToTripChanges } from "./lib/tripRepository.js";

const DAY_MINUTES = 12 * 60;
const FILTER_TABS = ["All", "Booked", "Maybe"];
const CATEGORY_FILTERS = ["All", "Food", "Coffee/Bar", "Culture", "Transit", "Hotel", "Shopping", "Open Time"];
const TIME_GRID_START_MINUTES = 7 * 60;
const TIME_GRID_END_MINUTES = 22 * 60;
const TIME_GRID_STEP_MINUTES = 30;
const RESIZE_STEP_MINUTES = 15;
const MIN_SCHEDULE_DURATION_MINUTES = 15;
const DAY_TIME_GRID_ROW_HEIGHT = 48;
const TRIP_TIME_GRID_ROW_HEIGHT = 60;
const ASSET_BASE = `${import.meta.env.BASE_URL}assets/`;
const ICON_BASE = `${import.meta.env.BASE_URL}assets/icons/`;
const FLAG_ASSET = `${ASSET_BASE}japan-flag-title.png`;
const GENERIC_TRIP_MARK_ASSET = `${ICON_BASE}tag-priority-generic.png`;
const FOOTER_STRIP_ASSET = `${ASSET_BASE}japan-footer-strip.png`;
const GOOGLE_MAPS_EMBED_KEY = import.meta.env.VITE_GOOGLE_MAPS_EMBED_KEY ?? "";
const LOCAL_REALTIME_ECHO_SUPPRESSION_MS = 4000;
const PENDING_INVITE_TOKEN_KEY = "japan-2026-pending-invite-token:v1";
const SEEN_EXPENSE_IDS_KEY = "japan-2026-seen-expenses:v1";
const BUDGET_CURRENCY_SETTINGS_KEY = "japan-2026-budget-currency:v1";
const DEFAULT_JPY_PER_USD = 160;
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
const BUDGET_CURRENCY_VIEWS = [
  { value: "native", label: "Original" },
  { value: "JPY", label: "JPY" },
  { value: "USD", label: "USD" }
];
const COST_CURRENCY_OPTIONS = SUPPORTED_CURRENCIES;
function buildTagAssets(suffix = "") {
  return {
    category: {
      Food: `${ICON_BASE}tag-food${suffix}.png`,
      "Coffee/Bar": `${ICON_BASE}tag-coffee-bar${suffix}.png`,
      Culture: `${ICON_BASE}tag-culture${suffix}.png`,
      Transit: `${ICON_BASE}tag-transit${suffix}.png`,
      Hotel: `${ICON_BASE}tag-hotel${suffix}.png`,
      Shopping: `${ICON_BASE}tag-shopping${suffix}.png`,
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
  Food: { icon: Utensils, className: "food", label: "Food", short: "Food" },
  "Coffee/Bar": { icon: Coffee, className: "coffee", label: "Coffee/Bar", short: "Cafe" },
  Culture: { icon: Landmark, className: "culture", label: "Culture", short: "See" },
  Transit: { icon: Train, className: "transit", label: "Transit", short: "Go" },
  Hotel: { icon: Bed, className: "hotel", label: "Hotel", short: "Hotel" },
  Shopping: { icon: ShoppingBag, className: "shopping", label: "Shopping", short: "Shop" },
  "Open Time": { icon: Clock3, className: "open", label: "Open Time", short: "Open" }
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

const SCHEDULE_FORM_SCHEMA = z.object({
  id: z.string().min(1),
  itemKind: z.string().optional().default(DEFAULT_NEW_BLOCK.itemKind),
  title: z.string().optional().default(""),
  locationInput: z.string().optional().default(""),
  category: z.string().optional().default(DEFAULT_NEW_BLOCK.category),
  city: z.string().optional().default(""),
  start: z.string().optional().default(DEFAULT_NEW_BLOCK.start),
  duration: z.coerce.number().min(MIN_SCHEDULE_DURATION_MINUTES).default(DEFAULT_NEW_BLOCK.duration),
  status: z.string().optional().default(DEFAULT_NEW_BLOCK.status),
  notes: z.string().optional().default(""),
  cost: z.string().optional().default(""),
  link: z.string().optional().default(""),
  mapLink: z.string().optional().default(""),
  stayStartDayId: z.string().optional().default(""),
  stayEndDayId: z.string().optional().default(""),
  checkInTime: z.string().optional().default(""),
  checkOutTime: z.string().optional().default(""),
  place: z.any().optional()
});

const IDEA_FORM_SCHEMA = z.object({
  id: z.string().min(1),
  title: z.string().optional().default(""),
  locationInput: z.string().optional().default(""),
  category: z.string().optional().default(DEFAULT_NEW_IDEA.category),
  city: z.string().optional().default(""),
  status: z.string().optional().default(DEFAULT_NEW_IDEA.status),
  notes: z.string().optional().default(""),
  cost: z.string().optional().default(""),
  link: z.string().optional().default(""),
  mapLink: z.string().optional().default(""),
  place: z.any().optional(),
  votes: z.any().optional(),
  _mode: z.string().optional()
});

const EXPENSE_FORM_SCHEMA = z
  .object({
    title: z.string().trim().min(1, "Add a title for this expense."),
    amountInput: z.string().trim().min(1, "Enter a real amount."),
    currency: z.string().min(1, "Choose a currency."),
    paidByTravelerClientId: z.string().min(1, "Choose who paid."),
    expenseDate: z.string().optional().default(""),
    participantTravelerClientIds: z.array(z.string()).min(1, "Choose at least one person to split with."),
    notes: z.string().optional().default("")
  })
  .superRefine((value, context) => {
    if (!parseMoneyValue(`${value.currency} ${value.amountInput}`, value.currency)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amountInput"],
        message: "Enter a real amount."
      });
    }
  });

const INVITE_FORM_SCHEMA = z.object({
  email: z.string().trim().email("Enter a valid email."),
  role: z.enum(["editor", "viewer"]).default("editor")
});

const PASSWORD_USER_FORM_SCHEMA = z.object({
  email: z.string().trim().email("Enter a valid email."),
  displayName: z.string().trim().optional().default(""),
  password: z.string().min(6, "Use at least 6 characters."),
  role: z.enum(["editor", "viewer"]).default("editor")
});

const DAY_FORM_SCHEMA = z.object({
  id: z.string().min(1),
  label: z.string().optional().default(""),
  date: z.string().min(1, "Choose a date."),
  locationInput: z.string().optional().default(""),
  city: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  baseMapLink: z.string().optional().default(""),
  basePlace: z.any().optional()
});

const CREATE_TRIP_FORM_SCHEMA = z
  .object({
    name: z.string().trim().min(1, "Add a trip name."),
    startDate: z.string().min(1, "Choose a start date."),
    endDate: z.string().min(1, "Choose an end date."),
    city: z.string().optional().default(""),
    travelerName: z.string().trim().min(1, "Add at least one traveler.")
  })
  .superRefine((value, context) => {
    if (dateSortValue(value.endDate) < dateSortValue(value.startDate)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date must be on or after the start date."
      });
    }
  });

const VOTE_ORDER = ["", "maybe", "like", "love"];
const VOTE_LABELS = {
  "": "Vote",
  maybe: "Maybe",
  like: "Like",
  love: "Love"
};

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

function App() {
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
  const [tripBoardMode, setTripBoardMode] = useState("calendar");
  const [dayViewMode, setDayViewMode] = useState("timeline");
  const [isDateRailCollapsed, setIsDateRailCollapsed] = useState(false);
  const [ideaTab, setIdeaTab] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [ideaPromotion, setIdeaPromotion] = useState(null);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [editingIdea, setEditingIdea] = useState(null);
  const [editingExpense, setEditingExpense] = useState(null);
  const [editingDay, setEditingDay] = useState(null);
  const [isCreateTripOpen, setIsCreateTripOpen] = useState(false);
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
  const realtimeTimerRef = useRef(null);
  const skipNextSaveRef = useRef(false);
  const localRealtimeSuppressionUntilRef = useRef(0);
  const acceptingInviteRef = useRef("");
  const openingInviteRef = useRef("");
  const sessionUserId = session?.user?.id ?? "";

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
  const filteredIdeas = useMemo(
    () => filterIdeas(trip.ideas, ideaTab, categoryFilter),
    [trip.ideas, ideaTab, categoryFilter]
  );
  const dateRangeLabel = useMemo(() => formatTripRange(sortedDays), [sortedDays]);
  const currentMember = useMemo(
    () => collaboration.members.find((member) => member.profileId === sessionUserId),
    [collaboration.members, sessionUserId]
  );
  const currentTraveler = useMemo(
    () => collaboration.travelers.find((traveler) => traveler.profileId === sessionUserId),
    [collaboration.travelers, sessionUserId]
  );
  const currentTravelerName = currentTraveler?.name ?? "";
  const currentTravelerClientId = currentTraveler?.clientId ?? "";
  const canManageSharing = currentMember?.role === "owner";
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
  const peopleCount = collaboration.travelers.length || trip.travelers.length;
  const travelerOptions = useMemo(
    () => buildTravelerOptions(trip.travelers, collaboration.travelers),
    [trip.travelers, collaboration.travelers]
  );
  const expenseSuggestions = useMemo(
    () => deriveExpenseSuggestions(trip, expenses),
    [trip, expenses]
  );
  const expenseSummary = useMemo(
    () => calculateExpenseSummary(expenses, travelerOptions),
    [expenses, travelerOptions]
  );
  const expenseSeenStorageKey = useMemo(
    () => getSeenExpensesStorageKey(sessionUserId, selectedTripId),
    [sessionUserId, selectedTripId]
  );
  const seenExpenseIdSet = useMemo(() => new Set(seenExpenseIds), [seenExpenseIds]);
  const expenseAttentionCount = useMemo(
    () => expenses.filter((expense) => !seenExpenseIdSet.has(getExpenseAttentionId(expense))).length,
    [expenses, seenExpenseIdSet]
  );
  const ideasAttentionCount = useMemo(
    () => currentTravelerName
      ? trip.ideas.filter((idea) => !idea.votes?.[currentTravelerName]).length
      : 0,
    [trip.ideas, currentTravelerName]
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
        setActiveView("trip");
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
  }, [ownerNeedsTravelerIdentity, selectedTripId, sessionUserId, ownerTravelerLink.tripId, ownerTravelerLink.status, collaboration.travelers]);

  useEffect(() => {
    if (!sessionUserId || !selectedTripId || !tripLoaded) {
      return undefined;
    }

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return undefined;
    }

    window.clearTimeout(saveTimerRef.current);
    setSyncStatus("saving");
    const snapshot = { ...trip, dateRangeLabel };
    saveTimerRef.current = window.setTimeout(() => {
      queueTripSave(snapshot);
    }, 800);

    return () => {
      window.clearTimeout(saveTimerRef.current);
    };
  }, [trip, dateRangeLabel, selectedTripId, sessionUserId, tripLoaded]);

  useEffect(() => {
    if (!sessionUserId || !selectedTripId || !tripLoaded) {
      return undefined;
    }

    const handleRemoteChange = () => {
      if (isLocalRealtimeEcho()) {
        window.clearTimeout(realtimeTimerRef.current);
        return;
      }

      window.clearTimeout(realtimeTimerRef.current);
      realtimeTimerRef.current = window.setTimeout(() => {
        Promise.all([loadRemoteTrip(selectedTripId), listTripExpenses(selectedTripId)])
          .then(([remoteTrip, remoteExpenses]) => {
            skipNextSaveRef.current = true;
            setTrip(remoteTrip);
            setExpenses(remoteExpenses);
            setExpensesStatus("ready");
            setSyncStatus("synced");
            refreshCollaboration({ silent: true });
          })
          .catch((error) => {
            setSyncStatus("error");
            setExpensesStatus("error");
            showToast({ type: "error", message: error.message });
          });
      }, 1000);
    };

    const unsubscribeTrip = subscribeToTripChanges(selectedTripId, handleRemoteChange);
    const unsubscribeExpenses = subscribeToExpenseChanges(selectedTripId, handleRemoteChange);

    return () => {
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
  }

  function openTripPicker() {
    setSelectedTripId(null);
    setTripLoaded(false);
    setTripLoading(false);
    setSyncStatus("idle");
    setCollaboration(EMPTY_COLLABORATION);
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

  async function createTrip(payload) {
    if (!session?.user) {
      return;
    }

    setTripListStatus("loading");
    try {
      const nextTripId = await createTripFromPayload({ ...payload, dateRangeLabel: formatTripRange(deriveTripDays(payload.days)) }, session.user.id);
      await refreshTripSummaries({ silent: true });
      selectTrip(nextTripId);
      showToast({ type: "success", message: "Trip created" });
    } catch (error) {
      setTripListStatus("error");
      showToast({ type: "error", message: error.message });
    }
  }

  function openCreateTripModal() {
    setIsCreateTripOpen(true);
  }

  function createCustomTrip(formValues) {
    const travelerName = formValues.travelerName?.trim() || "Me";
    const payload = buildCustomTrip({
      name: formValues.name,
      startDate: formValues.startDate,
      endDate: formValues.endDate,
      city: formValues.city,
      travelers: [travelerName]
    });
    setIsCreateTripOpen(false);
    createTrip(payload);
  }

  function createJapanTemplateTrip() {
    createTrip(makeInitialTrip());
  }

  function importLocalPlanner() {
    createTrip(loadTrip());
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

  function queueTripSave(snapshot) {
    if (!selectedTripId) {
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

    const snapshot = pendingSaveSnapshotRef.current;
    pendingSaveSnapshotRef.current = null;
    saveInFlightRef.current = true;
    suppressLocalRealtimeEcho();
    replaceTripPayload(selectedTripId, snapshot)
      .then(() => {
        suppressLocalRealtimeEcho();
        if (pendingSaveSnapshotRef.current) {
          flushQueuedTripSave();
          return;
        }
        saveInFlightRef.current = false;
        setSyncStatus("saved");
        refreshTripSummaries({ silent: true });
      })
      .catch((error) => {
        saveInFlightRef.current = false;
        localRealtimeSuppressionUntilRef.current = 0;
        setSyncStatus("error");
        showToast({ type: "error", message: error.message });
      });
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

  function addTripDay() {
    const lastDay = sortedDays[sortedDays.length - 1];
    const nextDate = addDateDays(lastDay?.date ?? getTodayDate(), 1);
    const newDay = {
      id: `day-${Date.now()}`,
      date: nextDate,
      label: "",
      city: lastDay?.city ?? "",
      notes: "",
      baseMapLink: "",
      basePlace: null,
      schedule: []
    };

    setTrip((current) => ({ ...current, days: [...current.days, newDay] }));
    setSelectedDayId(newDay.id);
    setActiveView("day");
    setEditingDay(newDay);
    showToast({ type: "success", message: "Day added" });
  }

  function saveTripDay(dayDraft) {
    setTrip((current) => ({
      ...current,
      days: current.days.map((day) =>
        day.id === dayDraft.id
          ? {
              ...day,
              date: dayDraft.date,
              label: dayDraft.label?.trim() ?? "",
              city: (dayDraft.city ?? "").trim(),
              notes: dayDraft.notes ?? "",
              baseMapLink: normalizeGoogleMapsUrlInput(dayDraft.baseMapLink),
              basePlace: dayDraft.basePlace ?? null
            }
          : day
      )
    }));
    setEditingDay(null);
    showToast({ type: "success", message: "Day updated" });
  }

  function deleteTripDay(dayId) {
    if (sortedDays.length <= 1) {
      return;
    }
    const day = sortedDays.find((candidate) => candidate.id === dayId);
    if (!window.confirm(`Remove ${day?.label || `Day ${day?.dayNumber ?? ""}`} and all of its scheduled activities?`)) {
      return;
    }

    const remainingDays = sortedDays.filter((candidate) => candidate.id !== dayId);
    const nextSelection = remainingDays.find((candidate) => candidate.sortIndex > (day?.sortIndex ?? -1)) ?? remainingDays[remainingDays.length - 1];

    setTrip((current) => ({
      ...current,
      days: current.days.filter((candidate) => candidate.id !== dayId)
    }));
    setSelectedDayId(nextSelection.id);
    setIdeaPromotion((currentPromotion) =>
      currentPromotion?.dayId === dayId ? { ...currentPromotion, dayId: nextSelection.id } : currentPromotion
    );
    setEditingDay(null);
    showToast({ type: "success", message: "Day removed" });
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

  async function repointScheduleExpensesToIdea(scheduleItemId, ideaId) {
    const linkedExpenses = expenses.filter(
      (expense) => expense.sourceType === EXPENSE_SOURCE_TYPES.SCHEDULE_ITEM && expense.sourceClientId === scheduleItemId
    );
    if (!linkedExpenses.length) {
      return;
    }

    const nextLocalExpenses = expenses.map((expense) =>
      expense.sourceType === EXPENSE_SOURCE_TYPES.SCHEDULE_ITEM && expense.sourceClientId === scheduleItemId
        ? { ...expense, sourceType: EXPENSE_SOURCE_TYPES.IDEA, sourceClientId: ideaId }
        : expense
    );
    setExpenses(nextLocalExpenses);

    if (!selectedTripId) {
      return;
    }

    try {
      setExpensesStatus("saving");
      suppressLocalRealtimeEcho();
      let nextExpenses = nextLocalExpenses;
      for (const expense of linkedExpenses) {
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
    setCategoryFilter("All");
    showToast({ type: "success", message: "Moved back to Ideas" });
    void repointScheduleExpensesToIdea(itemId, movedIdea.id);
  }

  async function resolveTripPlace({ targetType, targetClientId, dayId, placeId, sessionToken, displayNameHint, mapLink, query, title, city, silent = false }) {
    if (!selectedTripId) {
      if (!silent) {
        showToast({ type: "error", message: "Open a Supabase trip before resolving places." });
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
    setTrip((current) => {
      const sourceDay = current.days.find((day) => day.id === sourceDayId);
      const targetDay = current.days.find((day) => day.id === targetDayId);
      const sourceItem = sourceDay?.schedule.find((item) => item.id === itemId);
      if (!sourceDay || !targetDay || !sourceItem || !targetStart) {
        return current;
      }

      const duration = Number(sourceItem.duration) || TIME_GRID_STEP_MINUTES;
      if (!isScheduleSlotAvailable(targetDay.schedule, itemId, targetStart, duration)) {
        return current;
      }

      const movedItem = {
        ...sourceItem,
        start: targetStart,
        city: sourceItem.city || targetDay.city
      };

      return {
        ...current,
        days: current.days.map((day) => {
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
    });
  }

  function resizeScheduleItem(dayId, itemId, nextStart, nextDuration) {
    setTrip((current) => {
      const targetDay = current.days.find((day) => day.id === dayId);
      const targetItem = targetDay?.schedule.find((item) => item.id === itemId);
      if (!targetDay || !targetItem || !nextStart) {
        return current;
      }

      const duration = Math.max(MIN_SCHEDULE_DURATION_MINUTES, Number(nextDuration) || MIN_SCHEDULE_DURATION_MINUTES);
      if (!isScheduleSlotAvailable(targetDay.schedule, itemId, nextStart, duration)) {
        return current;
      }

      const resizedItem = {
        ...targetItem,
        start: nextStart,
        duration
      };

      return {
        ...current,
        days: current.days.map((day) => {
          if (day.id !== dayId) {
            return day;
          }

          return {
            ...day,
            schedule: day.schedule.map((item) => (item.id === itemId ? resizedItem : item))
          };
        })
      };
    });
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
        start: startTime ?? (findAvailableScheduleStart(targetDay.schedule, DEFAULT_NEW_BLOCK.duration) || suggestNextStart(targetDay.schedule))
      }
    });
  }

  function openNewIdeaModal() {
    setEditingIdea({
      ...DEFAULT_NEW_IDEA,
      id: `idea-${Date.now()}`,
      votes: Object.fromEntries(trip.travelers.map((name) => [name, ""])),
      _mode: "new"
    });
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

    setTrip((current) => ({
      ...current,
      ideas: current.ideas.some((currentIdea) => currentIdea.id === idea.id)
        ? current.ideas.map((currentIdea) => (currentIdea.id === idea.id ? normalizedIdea : currentIdea))
        : [normalizedIdea, ...current.ideas]
    }));
    setEditingIdea(null);
    showToast({ type: "success", message: idea._mode === "new" ? "Idea saved" : "Idea updated" });
  }

  function deleteIdea(ideaId) {
    setTrip((current) => ({
      ...current,
      ideas: current.ideas.filter((idea) => idea.id !== ideaId)
    }));
    setEditingIdea(null);
  }

  function cycleVote(ideaId, traveler) {
    if (!currentTravelerName || traveler !== currentTravelerName) {
      return;
    }

    setTrip((current) => ({
      ...current,
      ideas: current.ideas.map((idea) => {
        if (idea.id !== ideaId) {
          return idea;
        }
        const currentVote = idea.votes?.[traveler] ?? "";
        const nextVote = VOTE_ORDER[(VOTE_ORDER.indexOf(currentVote) + 1) % VOTE_ORDER.length];
        return { ...idea, votes: { ...idea.votes, [traveler]: nextVote } };
      })
    }));
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
      <>
        <TripPicker
          email={session.user.email}
          trips={tripSummaries}
          status={tripListStatus}
          pickerFileInputRef={pickerFileInputRef}
          onRefresh={() => refreshTripSummaries()}
          onSelect={selectTrip}
          onCreateTrip={openCreateTripModal}
          onCreateJapanTemplate={createJapanTemplateTrip}
          onImportLocal={importLocalPlanner}
          onImportFile={handlePickerImportFile}
          onSignOut={handleSignOut}
        />
        {isCreateTripOpen ? (
          <CreateTripModal
            onCancel={() => setIsCreateTripOpen(false)}
            onCreate={createCustomTrip}
          />
        ) : null}
      </>
    );
  }

  if (tripLoading && !tripLoaded) {
    return <ConfigState title="Loading trip" message="Pulling the latest planner from Supabase..." />;
  }

  return (
    <TagAssetsContext.Provider value={tagAssets}>
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <img className="title-flag" src={tripMarkAsset} alt="" aria-hidden="true" />
          <div className="trip-name-wrap">
            <input
              className="trip-title-input"
              value={trip.name}
              aria-label="Trip name"
              onChange={(event) => updateTripDetails({ name: event.target.value })}
            />
            <p>{dateRangeLabel}</p>
          </div>
        </div>

        <ViewSwitcher activeView={activeView} ideasCount={ideasAttentionCount} expensesCount={expenseAttentionCount} onChange={setActiveView} />

        <div className="topbar-actions">
          <button className="icon-button" type="button" aria-label="Choose another trip" title="Choose another trip" onClick={openTripPicker}>
            <CalendarDays size={18} />
          </button>
          <span className={`sync-badge is-${syncStatus}`}>{formatSyncStatus(syncStatus)}</span>
          <button className="icon-button" type="button" aria-label={`People, ${peopleCount}`} title="People" onClick={() => setIsSharingOpen(true)}>
            <Users size={17} />
            <span className="people-count-badge" aria-hidden="true">{peopleCount}</span>
          </button>
          <button className="icon-button" type="button" aria-label="Export trip" title="Export" onClick={exportTrip}>
            <Download size={17} />
          </button>
          <button className="icon-button" type="button" aria-label="Import trip" title="Import" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={17} />
          </button>
          <input ref={fileInputRef} className="file-input" type="file" accept="application/json" onChange={handleImportFile} />
          <button className="icon-button" type="button" aria-label="Sign out" title="Sign out" onClick={handleSignOut}>
            <LogOut size={18} />
          </button>
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
          onAddDay={addTripDay}
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
          onModeChange={setTripBoardMode}
          onOpenDay={(dayId) => {
            setSelectedDayId(dayId);
            setActiveView("day");
          }}
          onScheduleMove={moveScheduleItem}
          onScheduleResize={resizeScheduleItem}
          onAddScheduleAt={openNewScheduleModalForDay}
          onEditSchedule={(dayId, item) => setEditingSchedule({ mode: "edit", dayId, item })}
          onEditDay={(day) => setEditingDay(day)}
        />

        <IdeasSection
          ideas={filteredIdeas}
          allIdeas={trip.ideas}
          hidden={activeView !== "ideas"}
          travelers={trip.travelers}
          currentTravelerName={currentTravelerName}
          ideaTab={ideaTab}
          categoryFilter={categoryFilter}
          onTabChange={setIdeaTab}
          onCategoryChange={setCategoryFilter}
          onAddIdea={openNewIdeaModal}
          onEditIdea={setEditingIdea}
          onDeleteIdea={deleteIdea}
          onVote={cycleVote}
          onPromote={openIdeaPromotion}
        />

        <ExpensesSection
          hidden={activeView !== "expenses"}
          trip={trip}
          status={expensesStatus}
          expenses={expenses}
          suggestions={expenseSuggestions}
          summary={expenseSummary}
          travelers={travelerOptions}
          currentTravelerClientId={currentTravelerClientId}
          onAddExpense={openManualExpense}
          onTrackSuggestion={openTrackedExpense}
          onEditExpense={openEditExpense}
          onDeleteExpense={removeExpense}
        />
      </main>

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
        <PromoteIdeaModal
          promotion={ideaPromotion}
          days={sortedDays}
          onDayChange={(dayId) => setIdeaPromotion((current) => (current ? { ...current, dayId } : current))}
          onCancel={() => setIdeaPromotion(null)}
          onContinue={() => promoteIdeaToDay(ideaPromotion.idea, ideaPromotion.dayId)}
        />
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
        <ExpenseModal
          mode={editingExpense.mode}
          expense={editingExpense.expense}
          travelers={travelerOptions}
          onCancel={() => setEditingExpense(null)}
          onSave={saveExpense}
          onDelete={editingExpense.mode === "edit" ? () => removeExpense(editingExpense.expense.clientId) : null}
        />
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
          onCancel={() => setEditingDay(null)}
          onSave={saveTripDay}
          onDelete={() => deleteTripDay(editingDay.id)}
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
              <button className="ghost-button" type="button" onClick={() => setPendingImport(null)}>
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
          onClose={() => setIsSharingOpen(false)}
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
          isOwnerRecovery={ownerNeedsTravelerIdentity}
          recoveryMessage={ownerTravelerLink.message}
          onClaimTraveler={handleClaimTraveler}
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
        <div className="auth-landing-brand">
          <img className="title-flag" src={GENERIC_TRIP_MARK_ASSET} alt="" aria-hidden="true" />
          <strong>Japan 2026</strong>
        </div>

        <div className="auth-hero">
          <div className="auth-hero-copy">
            <h1 id="auth-title">Plan the trip together</h1>
            <p>Sync plans, ideas, bookings, and day-by-day details for Japan 2026.</p>
          </div>

          <div className="auth-preview-card" aria-hidden="true">
            <div className="auth-preview-top">
              <span>
                <img src={GENERIC_TRIP_MARK_ASSET} alt="" />
                Japan 2026
              </span>
              <strong>Synced</strong>
            </div>
            <div className="auth-preview-days">
              {[
                ["Sep 25", "Tokyo", "tag-food.png"],
                ["Sep 26", "Kyoto", "tag-culture.png"],
                ["Sep 27", "Osaka", "tag-transit.png"],
                ["Sep 28", "Hakone", "tag-hotel.png"]
              ].map(([date, city, icon]) => (
                <span className="auth-preview-day" key={date}>
                  <small>{date}</small>
                  <strong>{city}</strong>
                  <img src={`${ICON_BASE}${icon}`} alt="" />
                </span>
              ))}
              <span className="auth-preview-add">+</span>
            </div>
            <div className="auth-preview-tags">
              {["tag-food.png", "tag-culture.png", "tag-transit.png", "tag-hotel.png", "tag-shopping.png", "tag-open-time.png", "tag-map-pin.png"].map((icon) => (
                <span key={icon}>
                  <img src={`${ICON_BASE}${icon}`} alt="" />
                </span>
              ))}
            </div>
          </div>

          <div className="auth-benefits" aria-label="Planner benefits">
            <span>
              <img src={`${ICON_BASE}tag-favorite.png`} alt="" aria-hidden="true" />
              <strong>Plan together</strong>
              <small>Share ideas and votes.</small>
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
  onImportLocal,
  onImportFile,
  onSignOut
}) {
  const isLoading = status === "loading";

  return (
    <main className="trip-picker-shell">
      <section className="trip-picker" aria-labelledby="trip-picker-title">
        <header className="trip-picker-header">
          <div className="auth-brand">
            <img className="title-flag" src={GENERIC_TRIP_MARK_ASSET} alt="" aria-hidden="true" />
            <div>
              <p>{email}</p>
              <h1 id="trip-picker-title">Choose a trip</h1>
            </div>
          </div>
          <button className="icon-button" type="button" aria-label="Sign out" onClick={onSignOut}>
            <LogOut size={18} />
          </button>
        </header>

        <div className="trip-picker-actions">
          <button className="primary-button" type="button" onClick={onCreateTrip} disabled={isLoading}>
            <Plus size={17} />
            Create trip
          </button>
          <button className="ghost-button" type="button" onClick={onCreateJapanTemplate} disabled={isLoading}>
            <CalendarDays size={17} />
            Japan 2026 template
          </button>
          <button className="ghost-button" type="button" onClick={onImportLocal} disabled={isLoading}>
            <RefreshCcw size={17} />
            Import local planner
          </button>
          <button className="ghost-button" type="button" onClick={() => pickerFileInputRef.current?.click()} disabled={isLoading}>
            <FileUp size={17} />
            Import JSON
          </button>
          <button className="ghost-button" type="button" onClick={onRefresh} disabled={isLoading}>
            <RefreshCcw size={17} />
            Refresh
          </button>
          <input ref={pickerFileInputRef} className="file-input" type="file" accept="application/json" onChange={onImportFile} />
        </div>

        <div className="trip-list">
          {trips.map((tripSummary) => (
            <button className="trip-list-item" key={tripSummary.id} type="button" onClick={() => onSelect(tripSummary.id)}>
              <span>
                <strong>{tripSummary.name}</strong>
                <small>{tripSummary.dateRangeLabel || "No date range"} · {tripSummary.role}</small>
              </span>
              <ExternalLink size={16} />
            </button>
          ))}
          {!trips.length && !isLoading ? <p className="empty-trip-list">No Supabase trips yet. Create a trip or import your local planner.</p> : null}
          {isLoading ? <p className="empty-trip-list">Loading trips...</p> : null}
        </div>
      </section>
    </main>
  );
}

function CreateTripModal({ onCancel, onCreate }) {
  const today = getTodayDate();
  const {
    formState: { errors },
    getValues,
    handleSubmit,
    register,
    setValue
  } = useForm({
    resolver: zodResolver(CREATE_TRIP_FORM_SCHEMA),
    defaultValues: {
      name: "",
      startDate: today,
      endDate: today,
      city: "",
      travelerName: "Me"
    }
  });
  const [endDateMin, setEndDateMin] = useState(today);
  const startDateField = register("startDate");
  const endDateField = register("endDate");

  function keepEndDateAfterStart(event) {
    const nextStartDate = event.target.value;
    setEndDateMin(nextStartDate || today);
    const endDateElement = event.currentTarget.form?.elements.namedItem("endDate");
    const currentEndDate = typeof endDateElement?.value === "string" ? endDateElement.value : getValues("endDate");

    if (nextStartDate && currentEndDate && dateSortValue(currentEndDate) < dateSortValue(nextStartDate)) {
      setValue("endDate", nextStartDate, { shouldDirty: true, shouldValidate: true });
    }
  }

  function handleStartDateChange(event) {
    startDateField.onChange(event);
    keepEndDateAfterStart(event);
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog editor-dialog" role="dialog" aria-modal="true" aria-label="Create trip">
        <DialogHeader title="Create trip" onClose={onCancel} />
        <form className="form-grid" onSubmit={handleSubmit(onCreate)}>
          <label className="span-two">
            Trip name
            <input {...register("name")} autoFocus placeholder="Summer vacation, Birthday weekend..." />
            {errors.name ? <small className="form-error">{errors.name.message}</small> : null}
          </label>
          <label>
            Start date
            <input {...startDateField} type="date" onChange={handleStartDateChange} onInput={handleStartDateChange} />
            {errors.startDate ? <small className="form-error">{errors.startDate.message}</small> : null}
          </label>
          <label>
            End date
            <input {...endDateField} type="date" min={endDateMin} />
            {errors.endDate ? <small className="form-error">{errors.endDate.message}</small> : null}
          </label>
          <label>
            First city or area
            <input {...register("city")} placeholder="Optional" />
          </label>
          <label>
            Default traveler
            <input {...register("travelerName")} />
            {errors.travelerName ? <small className="form-error">{errors.travelerName.message}</small> : null}
          </label>
          <div className="dialog-actions span-two">
            <button className="ghost-button" type="button" onClick={onCancel}>
              Cancel
            </button>
            <button className="primary-button" type="submit">
              Create trip
            </button>
          </div>
        </form>
      </div>
    </div>
  );
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

function TagIcon({ src, size = "chip" }) {
  if (!src) {
    return null;
  }

  return <img className={`tag-icon tag-icon-${size}`} src={src} alt="" aria-hidden="true" draggable={false} />;
}

function ViewSwitcher({ activeView, ideasCount, expensesCount, onChange }) {
  return (
    <div className="view-switcher" aria-label="Planner view">
      <button className={activeView === "trip" ? "is-active" : ""} type="button" onClick={() => onChange("trip")}>
        All Trip
      </button>
      <button className={activeView === "day" ? "is-active" : ""} type="button" onClick={() => onChange("day")}>
        Day View
      </button>
      <button className={activeView === "ideas" ? "is-active" : ""} type="button" onClick={() => onChange("ideas")}>
        Ideas
        {ideasCount > 0 ? <span>{ideasCount}</span> : null}
      </button>
      <button className={activeView === "expenses" ? "is-active" : ""} type="button" onClick={() => onChange("expenses")}>
        Expenses
        {expensesCount > 0 ? <span>{expensesCount}</span> : null}
      </button>
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

    const start = getDropStartFromPointer(event.clientY, column, rowHeight);
    const duration = Number(item.duration) || TIME_GRID_STEP_MINUTES;
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
          <button className="icon-button" type="button" aria-label="Close day check" onClick={onClose}>
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
                Keep my day
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
          Too much backtracking
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
          Smoother route, less backtracking
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
          <button className="ghost-button compact-action" type="button" onClick={() => onAddScheduleAt()}>
            <Plus size={16} />
            Add activity
          </button>
          <div className="mode-toggle" aria-label="All Trip display mode">
            <button className={displayMode === "list" ? "is-active" : ""} type="button" onClick={() => onModeChange("list")}>
              List
            </button>
            <button className={displayMode === "calendar" ? "is-active" : ""} type="button" onClick={() => onModeChange("calendar")}>
              Timeline
            </button>
          </div>
        </div>
      </div>
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
                <div className="trip-card-topline">
                  <button className="trip-day-heading" type="button" onClick={() => onOpenDay(day.id)}>
                    <span>
                      <strong>{day.label || `Day ${day.dayNumber}`}</strong>
                      <small>{formatRailDate(day.date)}</small>
                    </span>
                    <span>
                      <MapPin size={14} />
                      {day.city}
                    </span>
                  </button>
                  <button className="ghost-button compact-action" type="button" onClick={() => onEditDay(day)}>
                    Edit
                  </button>
                </div>
                <div className="mini-stats">
                  <span>{formatDuration(stats.plannedMinutes)} planned</span>
                  <span>{formatDuration(stats.openMinutes)} open</span>
                </div>
                <div className="mini-events">
              {schedule.length ? (
                schedule.map((item) => (
                  <ScheduleEvent key={item.id} item={item} compact onEdit={() => onEditSchedule(day.id, item)} />
                ))
                  ) : (
                    <button className="empty-day" type="button" onClick={() => onOpenDay(day.id)}>
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

function TripCalendarBoard({ days, onOpenDay, onScheduleMove, onScheduleResize, onAddScheduleAt, onEditSchedule }) {
  const slots = buildTimeGridSlots();
  const stayRailItems = useMemo(() => buildStayRailItems(days), [days]);
  const gridWrapRef = useRef(null);
  const [timelineScrollLeft, setTimelineScrollLeft] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [addPreview, setAddPreview] = useState(null);
  const addPointerRef = useRef(null);
  const dragScheduler = useScheduleDrag({ days, onScheduleMove, onScheduleResize, rowHeight: TRIP_TIME_GRID_ROW_HEIGHT });
  const gridStyle = {
    "--day-count": days.length,
    "--slot-count": slots.length,
    "--time-row-height": `${TRIP_TIME_GRID_ROW_HEIGHT}px`
  };

  useEffect(() => {
    updateTimelineScrollState();

    function handleResize() {
      updateTimelineScrollState();
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [days.length]);

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

    const start = getCellStartFromPointer(event.clientY, event.currentTarget, TRIP_TIME_GRID_ROW_HEIGHT);
    if (!isScheduleSlotAvailable(day.schedule, null, start, TIME_GRID_STEP_MINUTES)) {
      return null;
    }

    return {
      ...getTimeGridBlockLayout(start, TIME_GRID_STEP_MINUTES, TRIP_TIME_GRID_ROW_HEIGHT),
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
      <div className="trip-time-sticky-header" style={gridStyle}>
        <div className="trip-time-corner">Time</div>
        <div className="trip-time-header-scroll">
          <div className="trip-time-header-days" style={{ transform: `translateX(-${timelineScrollLeft}px)` }}>
            {days.map((day) => (
              <button
                className={`trip-time-day-header trip-day-theme-${((day.dayNumber - 1) % 6) + 1}`}
                type="button"
                key={day.id}
                onClick={() => onOpenDay(day.id)}
              >
                <strong>
                  {day.label || `Day ${day.dayNumber}`} - {formatWeekday(day.date)}
                </strong>
                <span>{formatShortDate(day.date)}</span>
                <small>
                  <MapPin size={12} />
                  {day.city}
                </small>
              </button>
            ))}
          </div>
        </div>
        {canScrollLeft ? (
          <button className="trip-time-scroll-button trip-time-scroll-button-left" type="button" aria-label="Scroll to previous days" onClick={() => scrollTimeline(-1)}>
            <ChevronLeft size={20} />
          </button>
        ) : null}
        {canScrollRight ? (
          <button className="trip-time-scroll-button trip-time-scroll-button-right" type="button" aria-label="Scroll to next days" onClick={() => scrollTimeline(1)}>
            <ChevronRight size={20} />
          </button>
        ) : null}
      </div>
      <StayRail days={days} stays={stayRailItems} scrollLeft={timelineScrollLeft} gridStyle={gridStyle} onEditSchedule={onEditSchedule} />
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
        const layout = getTimeGridEventLayout(item, TRIP_TIME_GRID_ROW_HEIGHT);
        const detail = getTripTimeEventDetail(item, day.city, tagAssets);

        return (
          <article
            className={`trip-time-event category-${config.className} ${layout.isClamped ? "is-clamped" : ""} ${draggedItemId === item.id ? "is-dragging" : ""} ${
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

function IdeasSection({
  ideas,
  allIdeas,
  hidden = false,
  travelers,
  currentTravelerName,
  ideaTab,
  categoryFilter,
  onTabChange,
  onCategoryChange,
  onAddIdea,
  onEditIdea,
  onDeleteIdea,
  onVote,
  onPromote
}) {
  return (
    <section className="ideas-section" aria-label="Ideas and proposals" hidden={hidden}>
      <div className="ideas-section-header">
        <div>
          <h1>Ideas</h1>
          <p>{allIdeas.length} saved</p>
        </div>
      </div>

      <div className="ideas-workspace">
        <div className="ideas-browser">
          <div className="ideas-tabs">
            <div className="ideas-tab-list" role="tablist" aria-label="Idea views">
              {FILTER_TABS.map((tab) => (
                <button className={ideaTab === tab ? "is-active" : ""} type="button" role="tab" aria-selected={ideaTab === tab} key={tab} onClick={() => onTabChange(tab)}>
                  {tab}
                  {tab === "Booked" ? <span className="idea-tab-count is-booked">{countStatus(allIdeas, "Booked")}</span> : null}
                  {tab === "Maybe" ? <span className="idea-tab-count is-maybe">{countStatus(allIdeas, "Maybe")}</span> : null}
                </button>
              ))}
            </div>
            <button className="primary-button ideas-add-button" type="button" onClick={onAddIdea}>
              <Plus size={17} />
              Add idea
            </button>
          </div>

          <IdeaFilters activeCategory={categoryFilter} onChange={onCategoryChange} />

          <div className="idea-list">
            {ideas.map((idea) => (
              <IdeaRow
                idea={idea}
                key={idea.id}
                travelers={travelers}
                currentTravelerName={currentTravelerName}
                onEdit={() => onEditIdea(idea)}
                onDelete={() => onDeleteIdea(idea.id)}
                onVote={(traveler) => onVote(idea.id, traveler)}
                onPromote={() => onPromote(idea)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ExpensesSection({
  hidden = false,
  trip,
  status,
  expenses,
  suggestions,
  summary,
  travelers,
  currentTravelerClientId,
  onAddExpense,
  onTrackSuggestion,
  onEditExpense,
  onDeleteExpense
}) {
  const [activeExpenseTab, setActiveExpenseTab] = useState("budget");
  const [budgetCategoryFilter, setBudgetCategoryFilter] = useState("All");
  const [budgetCurrencySettings, setBudgetCurrencySettings] = useState(() => readBudgetCurrencySettings());
  const travelerNameByClientId = useMemo(
    () => new Map(travelers.map((traveler) => [traveler.clientId, traveler.name])),
    [travelers]
  );
  const expenseSourceLookup = useMemo(() => buildExpenseSourceLookup(trip), [trip]);
  const budgetRows = useMemo(
    () => buildBudgetRows({ expenses, suggestions, sourceLookup: expenseSourceLookup }),
    [expenses, suggestions, expenseSourceLookup]
  );
  const budgetFilters = useMemo(() => buildBudgetFilters(budgetRows), [budgetRows]);
  const filteredBudgetRows = useMemo(
    () => budgetRows.filter((row) => budgetCategoryFilter === "All" || row.filterValue === budgetCategoryFilter),
    [budgetRows, budgetCategoryFilter]
  );
  const budgetJpyPerUsd = normalizeExchangeRate(budgetCurrencySettings.jpyPerUsd);
  const budgetCurrencyView = budgetCurrencySettings.view;
  const budgetTotalLabel = useMemo(
    () => formatBudgetTotal(budgetRows, budgetCurrencyView, budgetJpyPerUsd),
    [budgetRows, budgetCurrencyView, budgetJpyPerUsd]
  );
  const budgetDisplayRows = useMemo(
    () => filteredBudgetRows.map((row) => formatBudgetDisplayRow(row, budgetCurrencyView, budgetJpyPerUsd)),
    [filteredBudgetRows, budgetCurrencyView, budgetJpyPerUsd]
  );
  const primaryCurrency = summary.primaryCurrency;
  const currentBalance = currentTravelerClientId ? primaryCurrency.balancesByTraveler[currentTravelerClientId] ?? 0 : 0;

  useEffect(() => {
    if (!budgetFilters.includes(budgetCategoryFilter)) {
      setBudgetCategoryFilter("All");
    }
  }, [budgetFilters, budgetCategoryFilter]);

  function updateBudgetCurrencySettings(nextSettings) {
    const nextValue = { ...budgetCurrencySettings, ...nextSettings };
    setBudgetCurrencySettings(nextValue);
    writeBudgetCurrencySettings(nextValue);
  }

  return (
    <section className="expenses-section" aria-label="Trip expenses" hidden={hidden}>
      <div className="ideas-section-header expenses-section-header">
        <div>
          <h1>Expenses</h1>
          <p>{budgetRows.length} budget items · {expenses.length} split expenses</p>
        </div>
        <button className="primary-button" type="button" onClick={onAddExpense}>
          <Plus size={17} />
          Add expense
        </button>
      </div>

      <div className="expenses-workspace">
        <div className="expense-toolbar">
          <div className="expense-view-tabs" role="tablist" aria-label="Expense views">
            <button className={activeExpenseTab === "budget" ? "is-active" : ""} type="button" role="tab" aria-selected={activeExpenseTab === "budget"} onClick={() => setActiveExpenseTab("budget")}>
              Trip budget
            </button>
            <button className={activeExpenseTab === "split" ? "is-active" : ""} type="button" role="tab" aria-selected={activeExpenseTab === "split"} onClick={() => setActiveExpenseTab("split")}>
              Split
            </button>
          </div>

          {activeExpenseTab === "budget" ? (
            <div className="expense-budget-currency-bar" aria-label="Budget currency display">
              <div className="expense-currency-toggle" role="group" aria-label="Show budget as">
                {BUDGET_CURRENCY_VIEWS.map((option) => (
                  <button
                    className={budgetCurrencyView === option.value ? "is-active" : ""}
                    type="button"
                    key={option.value}
                    onClick={() => updateBudgetCurrencySettings({ view: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {budgetCurrencyView !== "native" ? (
                <label className="expense-rate-field">
                  <span>Rate</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={budgetCurrencySettings.jpyPerUsd}
                    onChange={(event) => updateBudgetCurrencySettings({ jpyPerUsd: event.target.value })}
                  />
                  <span>JPY / USD</span>
                </label>
              ) : (
                <span className="expense-currency-note">Original currencies</span>
              )}
            </div>
          ) : null}
        </div>

        {activeExpenseTab === "budget" ? (
          <section className="expense-panel expense-budget-panel" aria-label="Trip budget" role="tabpanel">
            <div className="expense-budget-hero">
              <div>
                <span>Trip budget</span>
                <h2>Estimated total</h2>
                <p>Tracked expenses plus planned trip costs. Treat this as a working estimate.</p>
              </div>
              <div className="expense-budget-total">
                <strong>{budgetTotalLabel}</strong>
                <span>{budgetRows.length} budget items</span>
              </div>
            </div>
            <ExpenseBudgetFilters filters={budgetFilters} activeFilter={budgetCategoryFilter} onChange={setBudgetCategoryFilter} />
            <div className="expense-budget-list">
              {budgetDisplayRows.map((row) => (
                <BudgetExpenseRow
                  row={row}
                  key={row.id}
                  onTrack={row.suggestion ? () => onTrackSuggestion(row.suggestion) : null}
                />
              ))}
              {!budgetRows.length ? <p className="expense-empty">Add costs to activities, ideas, hotels, flights, or manual expenses to build a trip estimate.</p> : null}
              {budgetRows.length && !filteredBudgetRows.length ? <p className="expense-empty">No budget items match this filter.</p> : null}
            </div>
          </section>
        ) : (
          <>
            <div className="expense-summary-grid expense-split-summary" role="tabpanel" aria-label="Split summary">
              <ExpenseMetric label="Tracked total" value={formatMoneyList(summary.currencies)} />
              <ExpenseMetric label="Split expenses" value={`${expenses.length}`} detail={status === "saving" ? "Saving..." : status === "loading" ? "Loading..." : "Synced"} />
              <ExpenseMetric label="My balance" value={currentTravelerClientId ? formatSignedMoney(currentBalance, primaryCurrency.currency) : "Choose traveler"} detail="Positive means you are owed" />
            </div>

            <div className="expenses-columns expense-split-columns">
              <section className="expense-panel" aria-label="Tracked split expenses">
                <div className="expense-panel-heading">
                  <div>
                    <h2>Split expenses</h2>
                    <p>Real amounts used for paid/owed calculations.</p>
                  </div>
                </div>
                <div className="tracked-expense-list">
                  {expenses.map((expense) => (
                    <ExpenseRow
                      expense={expense}
                      key={expense.clientId}
                      travelerNameByClientId={travelerNameByClientId}
                      onEdit={() => onEditExpense(expense)}
                      onDelete={() => onDeleteExpense(expense.clientId)}
                    />
                  ))}
                  {!expenses.length ? <p className="expense-empty">Add a split expense or track a budget item to start settlement math.</p> : null}
                </div>
              </section>

              <section className="expense-panel settlement-panel" aria-label="Settlement recommendations">
                <div className="expense-panel-heading">
                  <div>
                    <h2>Who pays who</h2>
                    <p>Optimized equal-split settlement.</p>
                  </div>
                </div>
                <div className="settlement-list">
                  {summary.currencies.flatMap((currencySummary) =>
                    currencySummary.settlements.map((settlement) => (
                      <div className="settlement-row" key={`${settlement.currency}-${settlement.fromTravelerClientId}-${settlement.toTravelerClientId}-${settlement.amountMinor}`}>
                        <span>{settlement.fromName}</span>
                        <ArrowRight size={16} />
                        <span>{settlement.toName}</span>
                        <strong>{formatMoney(settlement.amountMinor, settlement.currency)}</strong>
                      </div>
                    ))
                  )}
                  {expenses.length && !summary.currencies.some((currencySummary) => currencySummary.settlements.length) ? (
                    <p className="expense-empty">Everyone is even.</p>
                  ) : null}
                  {!expenses.length ? <p className="expense-empty">No settlement needed yet.</p> : null}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function ExpenseBudgetFilters({ filters, activeFilter, onChange }) {
  const tagAssets = useTagAssets();

  if (filters.length <= 1) {
    return null;
  }

  return (
    <div className="category-filters expense-budget-filters" aria-label="Expense category filters">
      <span className="category-filter-label">
        <Filter size={15} />
        Category
      </span>
      <div className="category-filter-options">
        {filters.map((filter) => {
          const config = filter === "All" || filter === "Expense" ? null : getCategoryConfigForAssets(filter, tagAssets);
          return (
            <button className={activeFilter === filter ? "is-active" : ""} type="button" key={filter} onClick={() => onChange(filter)}>
              {config?.asset ? <TagIcon src={config.asset} size="tiny" /> : null}
              {filter}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ExpenseMetric({ label, value, detail = "" }) {
  return (
    <div className="expense-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function BudgetExpenseRow({ row, onTrack }) {
  const tagAssets = useTagAssets();
  const config = row.category ? getCategoryConfigForAssets(row.category, tagAssets) : null;

  return (
    <article className={`budget-expense-row${row.isEstimate ? " is-estimate" : ""}`}>
      <span className={`budget-expense-type category-${config?.className ?? "expense"}`}>
        <span className="budget-expense-type-icon">
          {config?.asset ? <TagIcon src={config.asset} size="tiny" /> : <ReceiptText size={14} />}
        </span>
        <span>{row.typeLabel}</span>
      </span>
      <div className="budget-expense-main">
        <strong>{row.title}</strong>
        <small>{row.context || (row.isEstimate ? "Planned cost" : "Tracked expense")}</small>
      </div>
      <div className="budget-expense-cost">
        <strong>{row.displayAmountLabel ?? row.amountLabel}</strong>
        <small>{row.displayMetaLabel ?? (row.isEstimate ? "Estimate" : "Tracked")}</small>
        {onTrack ? (
          <button className="ghost-button compact-action" type="button" onClick={onTrack}>
            Track split
          </button>
        ) : null}
      </div>
    </article>
  );
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
            <p>Confirm how your name should appear for votes, plans, and split expenses.</p>
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

function TravelerIdentityPrompt({ tripName, travelers, currentUserId, isOwnerRecovery = false, recoveryMessage = "", onClaimTraveler }) {
  const title = isOwnerRecovery ? "Link your organizer profile" : "Which traveler are you?";
  const helper = isOwnerRecovery
    ? "We could not link your organizer account automatically. Choose who you are so votes and split expenses stay under your account."
    : `Choose your traveler for ${tripName || "this trip"} so votes and split expenses attach to the right person.`;

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

        {!travelers.some((traveler) => !traveler.profileId || traveler.profileId === currentUserId) ? (
          <p className="expense-empty">All travelers are already linked. Ask the trip owner to add or free up a traveler.</p>
        ) : null}
      </div>
    </div>
  );
}

function buildExpenseSourceLookup(trip) {
  const lookup = new Map();
  let sortIndex = 0;

  (trip?.days ?? []).forEach((day) => {
    (day.schedule ?? []).forEach((item) => {
      lookup.set(getExpenseSourceKey(EXPENSE_SOURCE_TYPES.SCHEDULE_ITEM, item.id), {
        title: item.title,
        category: item.category,
        city: item.city || day.city,
        date: day.date,
        sourceLabel: `Day ${day.dayNumber}`,
        sortIndex
      });
      sortIndex += 1;
    });
  });

  (trip?.ideas ?? []).forEach((idea) => {
    lookup.set(getExpenseSourceKey(EXPENSE_SOURCE_TYPES.IDEA, idea.id), {
      title: idea.title,
      category: idea.category,
      city: idea.city,
      date: "",
      sourceLabel: "Idea",
      sortIndex
    });
    sortIndex += 1;
  });

  return lookup;
}

function buildBudgetRows({ expenses = [], suggestions = [], sourceLookup = new Map() }) {
  const trackedRows = expenses.map((expense, index) => {
    const source = expense.sourceClientId ? sourceLookup.get(getExpenseSourceKey(expense.sourceType, expense.sourceClientId)) : null;
    const category = source?.category || deriveBudgetCategory(expense.sourceType);
    return {
      id: `tracked-${expense.clientId}`,
      title: expense.title || source?.title || "Untitled expense",
      typeLabel: deriveBudgetTypeLabel({ sourceType: expense.sourceType, category }),
      category,
      context: [source?.sourceLabel || formatSourceType(expense.sourceType), source?.city, expense.expenseDate].filter(Boolean).join(" · "),
      amountMinor: expense.amountMinor,
      currency: expense.currency,
      amountLabel: formatMoney(expense.amountMinor, expense.currency),
      filterValue: category || "Expense",
      sortDate: source?.date || expense.expenseDate || "",
      sortIndex: source?.sortIndex ?? 10000 + index,
      isEstimate: false
    };
  });

  const estimateRows = suggestions.map((suggestion, index) => {
    const category = suggestion.category || deriveBudgetCategory(suggestion.sourceType);
    return {
      id: `estimate-${suggestion.sourceType}-${suggestion.sourceClientId}`,
      title: suggestion.title || "Untitled cost",
      typeLabel: deriveBudgetTypeLabel({ sourceType: suggestion.sourceType, category }),
      category,
      context: [suggestion.sourceLabel, suggestion.city].filter(Boolean).join(" · "),
      amountMinor: suggestion.parsedCost?.amountMinor ?? 0,
      currency: suggestion.parsedCost?.currency ?? "JPY",
      amountLabel: suggestion.parsedCost ? formatMoney(suggestion.parsedCost.amountMinor, suggestion.parsedCost.currency) : suggestion.rawCost,
      filterValue: category || "Expense",
      sortDate: suggestion.date || "",
      sortIndex: 20000 + index,
      isEstimate: true,
      suggestion
    };
  });

  return [...trackedRows, ...estimateRows].sort((a, b) => {
    if (a.sortDate && b.sortDate && a.sortDate !== b.sortDate) {
      return a.sortDate.localeCompare(b.sortDate);
    }
    if (a.sortDate !== b.sortDate) {
      return a.sortDate ? -1 : 1;
    }
    return a.sortIndex - b.sortIndex;
  });
}

function buildBudgetFilters(rows = []) {
  const filters = rows.reduce((list, row) => {
    if (row.filterValue && !list.includes(row.filterValue)) {
      list.push(row.filterValue);
    }
    return list;
  }, []);

  return ["All", ...filters];
}

function summarizeBudgetRows(rows = []) {
  const totalsByCurrency = new Map();
  rows.forEach((row) => {
    if (!row.amountMinor || row.amountMinor <= 0) {
      return;
    }
    totalsByCurrency.set(row.currency, (totalsByCurrency.get(row.currency) ?? 0) + row.amountMinor);
  });

  return Array.from(totalsByCurrency.entries()).map(([currency, total]) => ({ currency, total }));
}

function formatBudgetTotal(rows = [], currencyView = "native", jpyPerUsd = DEFAULT_JPY_PER_USD) {
  if (currencyView === "native") {
    return formatMoneyList(summarizeBudgetRows(rows));
  }

  const normalizedView = currencyView === "USD" ? "USD" : "JPY";
  const total = rows.reduce((sum, row) => {
    if (!row.amountMinor || row.amountMinor <= 0) {
      return sum;
    }
    return sum + convertMoneyMinor(row.amountMinor, row.currency, normalizedView, jpyPerUsd);
  }, 0);

  return `~${formatMoney(total, normalizedView)}`;
}

function formatBudgetDisplayRow(row, currencyView = "native", jpyPerUsd = DEFAULT_JPY_PER_USD) {
  if (currencyView === "native" || !row.amountMinor || row.amountMinor <= 0) {
    return {
      ...row,
      displayAmountLabel: row.amountLabel,
      displayMetaLabel: row.isEstimate ? "Estimate" : "Tracked"
    };
  }

  const normalizedView = currencyView === "USD" ? "USD" : "JPY";
  const convertedAmount = convertMoneyMinor(row.amountMinor, row.currency, normalizedView, jpyPerUsd);
  const baseMeta = row.isEstimate ? "Estimate" : "Tracked";

  return {
    ...row,
    displayAmountLabel: `~${formatMoney(convertedAmount, normalizedView)}`,
    displayMetaLabel: row.currency === normalizedView ? baseMeta : `${baseMeta} · from ${row.currency}`
  };
}

function convertMoneyMinor(amountMinor, sourceCurrency = "JPY", targetCurrency = "JPY", jpyPerUsd = DEFAULT_JPY_PER_USD) {
  const amount = Math.max(0, Number(amountMinor) || 0);
  const source = String(sourceCurrency || "JPY").toUpperCase();
  const target = String(targetCurrency || "JPY").toUpperCase();
  const rate = normalizeExchangeRate(jpyPerUsd);

  if (source === target) {
    return Math.round(amount);
  }

  if (source === "JPY" && target === "USD") {
    return Math.round((amount / rate) * 100);
  }

  if (source === "USD" && target === "JPY") {
    return Math.round((amount / 100) * rate);
  }

  return Math.round(amount);
}

function normalizeExchangeRate(value) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_JPY_PER_USD;
}

function deriveBudgetCategory(sourceType) {
  if (sourceType === EXPENSE_SOURCE_TYPES.SCHEDULE_ITEM) {
    return "";
  }
  if (sourceType === EXPENSE_SOURCE_TYPES.IDEA) {
    return "";
  }
  return "";
}

function deriveBudgetTypeLabel({ sourceType, category }) {
  if (sourceType === EXPENSE_SOURCE_TYPES.MANUAL) {
    return "Expense";
  }
  if (category) {
    return category;
  }
  if (sourceType === EXPENSE_SOURCE_TYPES.SCHEDULE_ITEM) {
    return "Activity expense";
  }
  if (sourceType === EXPENSE_SOURCE_TYPES.IDEA) {
    return "Idea expense";
  }
  return "Expense";
}

function ExpenseRow({ expense, travelerNameByClientId, onEdit, onDelete }) {
  const paidByName = travelerNameByClientId.get(expense.paidByTravelerClientId) ?? "Traveler";
  const participants = expense.participantTravelerClientIds
    .map((clientId) => travelerNameByClientId.get(clientId))
    .filter(Boolean)
    .join(", ");

  return (
    <article className="tracked-expense-row">
      <button className="tracked-expense-main" type="button" onClick={onEdit}>
        <span>
          <strong>{expense.title}</strong>
          <small>{[expense.expenseDate, formatSourceType(expense.sourceType)].filter(Boolean).join(" · ") || "Manual"}</small>
        </span>
        <span>
          <strong>{formatMoney(expense.amountMinor, expense.currency)}</strong>
          <small>Paid by {paidByName}</small>
        </span>
        <small>Split: {participants || "No one selected"}</small>
      </button>
      <button className="icon-button flat" type="button" aria-label={`Delete ${expense.title}`} onClick={onDelete}>
        <Trash2 size={16} />
      </button>
    </article>
  );
}

function ExpenseModal({ mode, expense, travelers, onCancel, onSave, onDelete }) {
  const {
    formState: { errors },
    handleSubmit: submitExpenseForm,
    register,
    setValue,
    watch
  } = useForm({
    resolver: zodResolver(EXPENSE_FORM_SCHEMA),
    defaultValues: {
      title: expense.title ?? "",
      amountInput: expense.amountMinor ? formatMajorAmount(expense.amountMinor, expense.currency) : "",
      currency: expense.currency ?? SUPPORTED_CURRENCIES[0],
      paidByTravelerClientId: expense.paidByTravelerClientId ?? travelers[0]?.clientId ?? "",
      expenseDate: expense.expenseDate ?? "",
      participantTravelerClientIds: expense.participantTravelerClientIds ?? [],
      notes: expense.notes ?? ""
    }
  });
  const participantTravelerClientIds = watch("participantTravelerClientIds") ?? [];

  function toggleParticipant(travelerClientId) {
    const nextParticipants = participantTravelerClientIds.includes(travelerClientId)
      ? participantTravelerClientIds.filter((clientId) => clientId !== travelerClientId)
      : [...participantTravelerClientIds, travelerClientId];
    setValue("participantTravelerClientIds", nextParticipants, { shouldDirty: true, shouldValidate: true });
  }

  function handleExpenseSave(formValues) {
    const parsedAmount = parseMoneyValue(`${formValues.currency} ${formValues.amountInput}`, formValues.currency);
    onSave({
      ...expense,
      ...formValues,
      title: formValues.title.trim(),
      amountMinor: parsedAmount?.amountMinor ?? expense.amountMinor,
      currency: parsedAmount?.currency ?? formValues.currency,
      notes: formValues.notes?.trim() ?? ""
    });
  }
  const formError = errors.title?.message || errors.amountInput?.message || errors.paidByTravelerClientId?.message || errors.participantTravelerClientIds?.message;

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog editor-dialog expense-dialog" role="dialog" aria-modal="true" aria-label={mode === "edit" ? "Edit expense" : "Add expense"}>
        <DialogHeader title={mode === "edit" ? "Edit expense" : "Add expense"} onClose={onCancel} />
        <form className="expense-form" onSubmit={submitExpenseForm(handleExpenseSave)}>
          <label className="editor-field editor-field-title">
            Title
            <input {...register("title")} placeholder="TeamLab tickets, train cards, dinner..." />
          </label>

          <div className="expense-form-grid">
            <label className="editor-field">
              Amount
              <input {...register("amountInput")} inputMode="decimal" placeholder="6400" />
            </label>
            <label className="editor-field">
              Currency
              <select {...register("currency")}>
                {SUPPORTED_CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}
              </select>
            </label>
            <label className="editor-field">
              Paid by
              <select {...register("paidByTravelerClientId")}>
                {travelers.map((traveler) => (
                  <option value={traveler.clientId} key={traveler.clientId}>{traveler.name}</option>
                ))}
              </select>
            </label>
            <label className="editor-field">
              Date
              <input {...register("expenseDate")} type="date" />
            </label>
          </div>

          <fieldset className="expense-participants">
            <legend>Split between</legend>
            <div>
              {travelers.map((traveler) => (
                <label key={traveler.clientId}>
                  <input
                    type="checkbox"
                    checked={participantTravelerClientIds.includes(traveler.clientId)}
                    onChange={() => toggleParticipant(traveler.clientId)}
                  />
                  <span>{traveler.name}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="editor-field editor-field-notes">
            Notes
            <textarea {...register("notes")} placeholder="Reservation number, who reimbursed outside the app, or anything useful..." />
          </label>

          {formError ? <p className="expense-form-error">{formError}</p> : null}

          <div className="dialog-actions">
            {onDelete ? (
              <button className="ghost-button danger" type="button" onClick={onDelete}>
                <Trash2 size={17} />
                Delete
              </button>
            ) : null}
            <button className="ghost-button" type="button" onClick={onCancel}>
              Cancel
            </button>
            <button className="primary-button" type="submit">
              <Check size={17} />
              Save
            </button>
          </div>
        </form>
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

function ActivityIdeaPicker({ ideas, allIdeas, travelers, activeTab, activeCategory, pendingIdeaId, onTabChange, onCategoryChange, onPickIdea }) {
  const isAdding = Boolean(pendingIdeaId);

  return (
    <div className="activity-idea-picker">
      <div className="activity-idea-tabs">
        <div className="ideas-tab-list" role="tablist" aria-label="Activity idea views">
          {FILTER_TABS.map((tab) => (
            <button className={activeTab === tab ? "is-active" : ""} type="button" role="tab" aria-selected={activeTab === tab} key={tab} onClick={() => onTabChange(tab)}>
              {tab}
              {tab === "Booked" ? <span className="idea-tab-count is-booked">{countStatus(allIdeas, "Booked")}</span> : null}
              {tab === "Maybe" ? <span className="idea-tab-count is-maybe">{countStatus(allIdeas, "Maybe")}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <IdeaFilters activeCategory={activeCategory} onChange={onCategoryChange} />

      <div className="activity-idea-list" aria-label="Pick one idea to add">
        {ideas.map((idea) => (
          <IdeaPickerRow
            idea={idea}
            key={idea.id}
            travelers={travelers}
            disabled={isAdding}
            isPending={pendingIdeaId === idea.id}
            onPick={() => onPickIdea(idea)}
          />
        ))}
        {!ideas.length ? (
          <p className="activity-idea-empty">No ideas match these filters.</p>
        ) : null}
      </div>
    </div>
  );
}

function IdeaPickerRow({ idea, travelers, disabled, isPending, onPick }) {
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
        <span className="idea-meta-line">
          <span className={`status-pill ${STATUS_CLASS[idea.status]}`}>
            <TagIcon src={getStatusAsset(idea.status, tagAssets)} size="tiny" />
            {idea.status}
          </span>
          {idea.cost ? <span>{idea.cost}</span> : null}
        </span>
      </button>
      <div className="idea-votes" aria-label={`${idea.title} traveler votes`}>
        {travelers.map((traveler) => {
          const vote = idea.votes?.[traveler] ?? "";
          return (
            <span className={`vote-icon vote-${vote || "none"}`} key={traveler} title={`${traveler}: ${VOTE_LABELS[vote]}`}>
              <span>{traveler.slice(0, 1)}</span>
              <Heart size={19} fill={vote === "love" ? "currentColor" : "none"} />
            </span>
          );
        })}
      </div>
      <button className="promote-button" type="button" disabled={disabled} onClick={onPick}>
        <Plus size={16} />
        {isPending ? "Adding..." : "Add"}
      </button>
    </article>
  );
}

function IdeaRow({ idea, travelers, currentTravelerName, onEdit, onDelete, onVote, onPromote }) {
  const tagAssets = useTagAssets();
  const config = getCategoryConfigForAssets(idea.category, tagAssets);

  return (
    <article className="idea-row">
      <button className={`idea-thumb category-${config.className}`} type="button" onClick={onEdit} aria-label={`Edit ${idea.title}`}>
        <TagIcon src={config.asset} size="thumb" />
      </button>
      <button className="idea-main" type="button" onClick={onEdit}>
        <strong>{idea.title}</strong>
        <small>{idea.city || "Japan"}</small>
        <span className="idea-meta-line">
          <span className={`status-pill ${STATUS_CLASS[idea.status]}`}>
            <TagIcon src={getStatusAsset(idea.status, tagAssets)} size="tiny" />
            {idea.status}
          </span>
        </span>
      </button>
      <div className="idea-votes" aria-label={`${idea.title} traveler votes`}>
        {travelers.map((traveler) => {
          const vote = idea.votes?.[traveler] ?? "";
          const isLinkedTraveler = currentTravelerName === traveler;
          return (
            <button
              className={`vote-icon vote-${vote || "none"}`}
              type="button"
              key={traveler}
              disabled={!isLinkedTraveler}
              onClick={() => onVote(traveler)}
              title={isLinkedTraveler ? `${traveler}: ${VOTE_LABELS[vote]}` : `Only ${traveler} can vote here`}
            >
              <span>{traveler.slice(0, 1)}</span>
              <Heart size={19} fill={vote === "love" ? "currentColor" : "none"} />
            </button>
          );
        })}
      </div>
      <button className="promote-button" type="button" onClick={onPromote}>
        <Plus size={16} />
        Add as Activity
      </button>
    </article>
  );
}

function SharingModal({
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
  onClose
}) {
  const [activePeopleTab, setActivePeopleTab] = useState("share");
  const currentRole = formatRoleLabel(currentMember?.role ?? "editor");
  const {
    formState: { errors: inviteErrors, isSubmitting: isInviteSubmitting },
    handleSubmit: submitInviteForm,
    register: registerInvite,
    setValue: setInviteValue,
    watch: watchInvite
  } = useForm({
    resolver: zodResolver(INVITE_FORM_SCHEMA),
    defaultValues: {
      email: "",
      role: "editor"
    }
  });
  const inviteValues = watchInvite();
  const {
    formState: { errors: passwordUserErrors, isSubmitting: isPasswordUserSubmitting },
    handleSubmit: submitPasswordUserForm,
    register: registerPasswordUser,
    reset: resetPasswordUserForm,
    watch: watchPasswordUser
  } = useForm({
    resolver: zodResolver(PASSWORD_USER_FORM_SCHEMA),
    defaultValues: {
      email: "",
      displayName: "",
      password: "",
      role: "editor"
    }
  });
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
            <button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="people-tabs" role="tablist" aria-label="People sections">
          <button className={activePeopleTab === "share" ? "is-active" : ""} type="button" role="tab" aria-selected={activePeopleTab === "share"} onClick={() => setActivePeopleTab("share")}>
            Share trip
          </button>
          <button className={activePeopleTab === "travelers" ? "is-active" : ""} type="button" role="tab" aria-selected={activePeopleTab === "travelers"} onClick={() => setActivePeopleTab("travelers")}>
            Travelers
          </button>
        </div>

        {activePeopleTab === "share" ? (
          <div className="people-tab-panel" role="tabpanel" aria-label="Share trip">
            {canManage ? (
              <section className="sharing-section people-invite-panel">
                <div className="sharing-section-title">
                  <div>
                    <strong>Invite someone</strong>
                    <small>Send an invite link. They will confirm their traveler name when they join.</small>
                  </div>
                </div>
                <form className="invite-form" onSubmit={submitInviteForm(handleInviteFormSubmit)}>
                  <label className="editor-field">
                    Email
                    <input
                      {...registerInvite("email")}
                      type="email"
                      placeholder="friend@example.com"
                    />
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

                <div className="auth-divider">
                  <small>or</small>
                </div>

                <div className="sharing-section-title compact-title">
                  <div>
                    <strong>Create password user</strong>
                    <small>Create or update an account without sending auth email.</small>
                  </div>
                </div>
                <form className="invite-form password-user-form" onSubmit={submitPasswordUserForm(handlePasswordUserFormSubmit)}>
                  <label className="editor-field">
                    Email
                    <input
                      {...registerPasswordUser("email")}
                      type="email"
                      placeholder="tester@example.com"
                    />
                  </label>
                  <label className="editor-field">
                    Display name
                    <input
                      {...registerPasswordUser("displayName")}
                      placeholder="Tester"
                    />
                  </label>
                  <label className="editor-field">
                    Password
                    <input
                      {...registerPasswordUser("password")}
                      type="password"
                      placeholder="At least 6 characters"
                      autoComplete="new-password"
                    />
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
                    Create user
                  </button>
                </form>
                {passwordUserErrors.email?.message || passwordUserErrors.password?.message || passwordUserErrors.role?.message ? (
                  <p className="expense-form-error">{passwordUserErrors.email?.message || passwordUserErrors.password?.message || passwordUserErrors.role?.message}</p>
                ) : null}

                <div className="sharing-list">
                  <div className="sharing-section-title compact-title">
                    <strong>Pending invites</strong>
                  </div>
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
                  {!pendingInvitations.length ? <p className="empty-trip-list">No pending invites.</p> : null}
                </div>
              </section>
            ) : (
              <p className="dialog-note">{status === "loading" ? "Loading people..." : "Only the trip owner can invite people."}</p>
            )}

            <section className="sharing-section people-members-section">
              <div className="sharing-section-title">
                <div>
                  <strong>People with access</strong>
                  <small>Signed-in accounts that can open this trip.</small>
                </div>
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
            </section>
          </div>
        ) : (
          <div className="people-tab-panel" role="tabpanel" aria-label="Travelers">
            <section className="sharing-section people-section">
              <div className="sharing-section-title">
                <div>
                  <strong>Travelers</strong>
                  <small>These names are used for votes and split expenses.</small>
                </div>
              </div>
              <div className="traveler-card-grid">
                {collaboration.travelers.map((traveler) => {
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
                        <button className="ghost-button compact-action" type="button" onClick={() => onClaimTraveler(traveler.id)}>
                          Choose
                        </button>
                      ) : null}
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

function PromoteIdeaModal({ promotion, days, onDayChange, onCancel, onContinue }) {
  const tagAssets = useTagAssets();
  const selectedDay = days.find((day) => day.id === promotion.dayId) ?? days[0];

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog promote-dialog" role="dialog" aria-modal="true" aria-label="Add idea as activity">
        <DialogHeader title="Add as activity" onClose={onCancel} />
        <div className="promote-summary">
          <TagIcon src={getCategoryConfigForAssets(promotion.idea.category, tagAssets).asset} size="chip" />
          <div>
            <strong>{promotion.idea.title}</strong>
            <span>{promotion.idea.city || "Japan"}</span>
          </div>
        </div>
        <label className="editor-field">
          Choose day
          <select value={selectedDay?.id ?? ""} onChange={(event) => onDayChange(event.target.value)}>
            {days.map((day) => (
              <option value={day.id} key={day.id}>
                Day {day.dayNumber} - {formatShortDate(day.date)} - {day.city}
              </option>
            ))}
          </select>
        </label>
        <p className="dialog-note">Next you can set the exact time, duration, map, cost, and notes.</p>
        <div className="dialog-actions">
          <button className="ghost-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-button" type="button" onClick={onContinue} disabled={!selectedDay}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function EditScheduleModal({ payload, days = [], ideas = [], travelers = [], mapsProfile = MAPS_PROFILES.japan, resolvingTarget, onResolvePlace, onCancel, onSave, onAddIdea, onMoveToIdeas, onDelete }) {
  const form = useForm({
    resolver: zodResolver(SCHEDULE_FORM_SCHEMA),
    defaultValues: getScheduleFormDefaultValues(payload.item, { dayId: payload.dayId, days })
  });
  const { getValues, handleSubmit, register, setValue, watch } = form;
  const values = watch();
  const [entryMode, setEntryMode] = useState("new");
  const [pickerTab, setPickerTab] = useState("All");
  const [pickerCategory, setPickerCategory] = useState("All");
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
  const pickerIdeas = useMemo(() => filterIdeas(ideas, pickerTab, pickerCategory), [ideas, pickerTab, pickerCategory]);
  const nextDayId = getNextDayId(days, payload.dayId) || payload.dayId;
  const placeAutocomplete = usePlaceAutocomplete({
    query: values.locationInput,
    sessionToken: placeSessionToken,
    mapsProfile,
    enabled: isLocationActive && !isLocationMapsLink
  });
  const startMinutes = clampMinutes(parseTimeToMinutes(values.start) ?? TIME_GRID_START_MINUTES, TIME_GRID_START_MINUTES, TIME_GRID_END_MINUTES - MIN_SCHEDULE_DURATION_MINUTES);
  const durationMinutes = clampMinutes(Number(values.duration) || DEFAULT_NEW_BLOCK.duration, MIN_SCHEDULE_DURATION_MINUTES, TIME_GRID_END_MINUTES - startMinutes);

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

    onSave({
      ...payload.item,
      ...formValues,
      itemKind: isStay ? STAY_KIND : ACTIVITY_KIND,
      title: formValues.title?.trim() || (isStay ? "Hotel stay" : "Untitled plan"),
      city: formValues.city?.trim() ?? "",
      start: isStay ? checkInTime : formValues.start,
      duration: isStay ? DEFAULT_NEW_BLOCK.duration : Number(formValues.duration) || 60,
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
            <div className="activity-modal-tabs" role="tablist" aria-label="Activity entry mode">
              <button className={entryMode === "new" ? "is-active" : ""} type="button" role="tab" aria-selected={entryMode === "new"} onClick={() => setEntryMode("new")}>
                New activity
              </button>
              <button className={entryMode === "ideas" ? "is-active" : ""} type="button" role="tab" aria-selected={entryMode === "ideas"} onClick={() => setEntryMode("ideas")}>
                From ideas
              </button>
            </div>
          ) : null}

          {isPickingIdea ? (
            <ActivityIdeaPicker
              ideas={pickerIdeas}
              allIdeas={ideas}
              travelers={travelers}
              activeTab={pickerTab}
              activeCategory={pickerCategory}
              pendingIdeaId={pendingIdeaId}
              onTabChange={setPickerTab}
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
              {placeAutocomplete.status === "error" ? <span className="place-autocomplete-status is-error">Could not load suggestions.</span> : null}
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
              <AutoResolveStatus status={autoResolve.status} place={values.place} onRetry={autoResolve.retry} />
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
              <TimeSelectControl value={values.start} onChange={(start) => updateFormValue("start", start)} />
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
              <label className="editor-field">
                Category
                <select value={values.category || DEFAULT_NEW_BLOCK.category} onChange={handleCategoryChange}>
                  {CATEGORIES.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className="editor-field activity-area-field">
                Area
                <input {...register("city")} placeholder="Kyoto, Shibuya, hotel area..." />
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
            <button className="ghost-button" type="button" onClick={onCancel}>
              Cancel
            </button>
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

function usePlaceAutocomplete({ query, sessionToken, mapsProfile = MAPS_PROFILES.japan, enabled }) {
  const [state, setState] = useState({ status: "idle", suggestions: [] });
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmedQuery = String(query ?? "").trim();
    if (!enabled || trimmedQuery.length < 2) {
      setState({ status: "idle", suggestions: [] });
      return undefined;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState((current) => ({ ...current, status: "loading" }));

    const timer = window.setTimeout(async () => {
      try {
        const result = await autocompletePlace({
          query: trimmedQuery,
          sessionToken,
          regionCodes: mapsProfile.regionCodes,
          languageCode: mapsProfile.languageCode
        });
        if (requestIdRef.current === requestId) {
          setState({ status: "ready", suggestions: result.suggestions ?? [] });
        }
      } catch {
        if (requestIdRef.current === requestId) {
          setState({ status: "error", suggestions: [] });
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
      </div>
    </div>
  );
}

function getStartTimeOptions(selectedValue = "") {
  const options = [];
  for (let minutes = TIME_GRID_START_MINUTES; minutes <= TIME_GRID_END_MINUTES - MIN_SCHEDULE_DURATION_MINUTES; minutes += RESIZE_STEP_MINUTES) {
    options.push(minutesToTimeInput(minutes));
  }
  if (selectedValue && !options.includes(selectedValue)) {
    return [...options, selectedValue].sort((first, second) => (parseTimeToMinutes(first) ?? 0) - (parseTimeToMinutes(second) ?? 0));
  }
  return options;
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

function AutoResolveStatus({ status, place, onRetry }) {
  if (status === "pending" || status === "resolving") {
    return <span className="resolve-status-pill is-working">Resolving...</span>;
  }

  if (status === "ready" || place?.formattedAddress || place?.name || hasPlaceCoordinates(place)) {
    return <span className="resolve-status-pill is-ready">Place ready</span>;
  }

  if (status === "error") {
    return (
      <button className="ghost-button compact-action resolve-retry-button" type="button" onClick={onRetry}>
        Retry
      </button>
    );
  }

  return <span className="resolve-status-pill">Paste a Google Maps link</span>;
}

function useAutoResolveMapLink({ mapLink, isResolving, onResolve }) {
  const [status, setStatus] = useState("idle");
  const lastResolvedLinkRef = useRef("");
  const resolveRef = useRef(onResolve);

  useEffect(() => {
    resolveRef.current = onResolve;
  }, [onResolve]);

  useEffect(() => {
    const normalizedLink = normalizeGoogleMapsUrlInput(mapLink);
    if (!normalizedLink || !isGoogleMapsLink(normalizedLink)) {
      setStatus("idle");
      return undefined;
    }

    if (isResolving || lastResolvedLinkRef.current === normalizedLink) {
      return undefined;
    }

    setStatus("pending");
    const timer = window.setTimeout(async () => {
      lastResolvedLinkRef.current = normalizedLink;
      setStatus("resolving");
      const place = await resolveRef.current({ silent: true });
      if (place) {
        setStatus("ready");
      } else {
        lastResolvedLinkRef.current = "";
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

    lastResolvedLinkRef.current = normalizedLink;
    setStatus("resolving");
    const place = await resolveRef.current({ silent: false });
    if (place) {
      setStatus("ready");
    } else {
      lastResolvedLinkRef.current = "";
      setStatus("error");
    }
  }

  return { status, retry };
}

function EditIdeaModal({ idea, mapsProfile = MAPS_PROFILES.japan, resolvingTarget, onResolvePlace, onCancel, onSave, onDelete }) {
  const form = useForm({
    resolver: zodResolver(IDEA_FORM_SCHEMA),
    defaultValues: getIdeaFormDefaultValues(idea)
  });
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
              {placeAutocomplete.status === "error" ? <span className="place-autocomplete-status is-error">Could not load suggestions.</span> : null}
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
              <AutoResolveStatus status={autoResolve.status} place={values.place} onRetry={autoResolve.retry} />
            </div>
          ) : null}
          {mapPreview ? <MapPreview preview={mapPreview} /> : null}
          <div className="idea-core-grid">
            <label className="editor-field">
              Category
              <select {...register("category")}>
                {CATEGORIES.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="editor-field">
              Area
              <input {...register("city")} placeholder="Kyoto, Shibuya, hotel area..." />
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
            <button className="ghost-button" type="button" onClick={onCancel}>
              Cancel
            </button>
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
    votes: draft.votes ?? {},
    _mode: draft._mode
  };
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
  const {
    getValues,
    handleSubmit: submitDayForm,
    register,
    setValue,
    watch
  } = useForm({
    resolver: zodResolver(DAY_FORM_SCHEMA),
    defaultValues: {
      ...day,
      label: day.label ?? "",
      locationInput: day.basePlace?.name || day.city || "",
      city: day.city ?? "",
      notes: day.notes ?? "",
      baseMapLink: day.baseMapLink ?? "",
      basePlace: day.basePlace ?? null
    }
  });
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
              {placeAutocomplete.status === "error" ? <span className="place-autocomplete-status is-error">Could not load suggestions.</span> : null}
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
              <AutoResolveStatus status={autoResolve.status} place={values.basePlace} onRetry={autoResolve.retry} />
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
            <button className="ghost-button" type="button" onClick={onCancel}>
              Cancel
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
      <button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}>
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

function buildDayCheck(day, days) {
  const scheduledStops = buildDayCheckStops(day);
  const routeStops = buildDayRouteStops(day, scheduledStops);
  const status = getDayCheckStatus(scheduledStops, routeStops);
  const suggestion = buildDayCheckSuggestion(day, days, scheduledStops, status);
  const currentRouteTitles = scheduledStops.map((stop) => stop.title);
  const betterRouteTitles = suggestion?.canApply
    ? scheduledStops.filter((stop) => stop.item.id !== suggestion.itemId).map((stop) => stop.title)
    : currentRouteTitles;
  const coachCopy = getDayCheckCoachCopy(status, suggestion, scheduledStops);
  const sourceDayBadge = formatDayCheckBadgeLabel(day);

  return {
    ...status,
    suggestion,
    stops: scheduledStops,
    currentRouteTitles,
    betterRouteTitles,
    movedStopLabel: suggestion?.canApply ? `Move ${suggestion.itemTitle} to ${suggestion.targetDayLabel}` : "",
    movedStopTitle: suggestion?.canApply ? suggestion.itemTitle : "",
    sourceDayBadge,
    targetDayBadge: suggestion?.targetDayBadge ?? "",
    coachTitle: coachCopy.title,
    coachSummary: coachCopy.summary
  };
}

function buildDayCheckStops(day) {
  return sortActivitySchedule(day?.schedule ?? [])
    .filter((item) => item.status !== "Skipped" && hasPlaceCoordinates(item.place))
    .map((item) => ({
      id: item.id,
      title: item.title || item.place?.name || "Untitled stop",
      city: item.city || day.city,
      item,
      latitude: Number(item.place.latitude),
      longitude: Number(item.place.longitude)
    }));
}

function getDayCheckCoachCopy(status, suggestion, scheduledStops) {
  if (suggestion?.canApply) {
    return {
      title: "Move one stop to make this day easier",
      summary: "This day has too much backtracking. Moving one stop will make the route easier to follow."
    };
  }

  if (["spread", "heavy"].includes(status.statusTone)) {
    return {
      title: "This day has some travel",
      summary: "There is not one obvious stop to move. Review the order before locking the day."
    };
  }

  if (status.statusTone === "some") {
    return {
      title: "This day has a few moves",
      summary: "It should still be manageable. Keep an eye on the order and pacing."
    };
  }

  if (scheduledStops.length === 0) {
    return {
      title: "Add mapped places to check the day",
      summary: "Once activities have Google Maps places, the planner can flag hard travel days."
    };
  }

  return {
    title: "This day looks easy to follow",
    summary: "No obvious travel problem stands out."
  };
}

function buildDayRouteStops(day, scheduledStops) {
  const baseStop = hasPlaceCoordinates(day?.basePlace)
    ? {
        id: `${day.id}:base`,
        title: day.basePlace.name || day.basePlace.formattedAddress || "Hotel",
        city: day.city,
        latitude: Number(day.basePlace.latitude),
        longitude: Number(day.basePlace.longitude)
      }
    : null;

  if (baseStop && scheduledStops.length) {
    return [baseStop, ...scheduledStops, { ...baseStop, id: `${baseStop.id}:return` }];
  }

  return scheduledStops;
}

function getDayCheckStatus(scheduledStops, routeStops) {
  if (scheduledStops.length === 0) {
    return {
      statusTone: "good",
      statusLabel: "Looks good",
      summary: "Add resolved places to this day when you want a travel check.",
      why: "There are no mapped activities to compare yet."
    };
  }

  if (scheduledStops.length === 1) {
    return {
      statusTone: "good",
      statusLabel: "Looks good",
      summary: "This day has one mapped stop, so it should be simple to follow.",
      why: "There is only one activity to route from your base."
    };
  }

  const legDistances = [];
  for (let index = 0; index < routeStops.length - 1; index += 1) {
    legDistances.push(distanceKm(routeStops[index], routeStops[index + 1]));
  }

  const totalKm = legDistances.reduce((sum, distance) => sum + distance, 0);
  const maxLegKm = legDistances.reduce((max, distance) => Math.max(max, distance), 0);
  const stopCount = scheduledStops.length;
  const distanceSummary = `The mapped stops create about ${formatDistanceKm(totalKm)} of straight-line movement, with the longest jump around ${formatDistanceKm(maxLegKm)}.`;

  if (totalKm >= 30 || maxLegKm >= 10 || stopCount >= 5) {
    return {
      statusTone: "heavy",
      statusLabel: "Too spread out",
      summary: "This day may feel travel-heavy. Consider moving one stop before committing.",
      why: distanceSummary
    };
  }

  if (totalKm >= 20 || maxLegKm >= 7 || stopCount >= 4) {
    return {
      statusTone: "spread",
      statusLabel: "Spread out",
      summary: "This day is possible, but it crosses enough distance that you should review the order.",
      why: distanceSummary
    };
  }

  if (totalKm >= 10 || maxLegKm >= 4 || stopCount >= 3) {
    return {
      statusTone: "some",
      statusLabel: "Some travel",
      summary: "This day has a few moves, but it should still be manageable.",
      why: distanceSummary
    };
  }

  return {
    statusTone: "good",
    statusLabel: "Looks good",
    summary: "This day looks manageable.",
    why: distanceSummary
  };
}

function buildDayCheckSuggestion(day, days, stops, status) {
  if (!["spread", "heavy"].includes(status.statusTone) || stops.length < 3) {
    return null;
  }

  const outlier = findOutlierStop(stops);
  if (!outlier || outlier.averageDistanceKm < 8.5) {
    return {
      canApply: false,
      copy: "This day has some distance, but there is not one obvious stop to move. Review the order before finalizing the day."
    };
  }

  const targetDay = findCompatibleTargetDay(days, day, outlier.stop);
  const keepTitles = stops.filter((stop) => stop.id !== outlier.stop.id).map((stop) => stop.title);
  const targetDayLabel = targetDay ? formatDayCheckDayLabel(targetDay) : "";
  const placeDirection = describeRelativeArea(outlier.stop, keepTitles.length ? stops.find((stop) => stop.id !== outlier.stop.id) : null);

  if (!targetDay) {
    return {
      canApply: false,
      copy: `Consider moving ${outlier.stop.title} to a lighter ${outlier.stop.city || day.city || "nearby"} day. It appears ${placeDirection} from the rest of this plan, and there is not a clear existing day with enough open time.`
    };
  }

  const keepCopy = keepTitles.length
    ? `Keep ${formatTitleList(keepTitles)} together on ${formatDayCheckDayLabel(day)}.`
    : `Keep the rest of ${formatDayCheckDayLabel(day)} unchanged.`;

  return {
    canApply: true,
    sourceDayId: day.id,
    targetDayId: targetDay.id,
    itemId: outlier.stop.item.id,
    itemTitle: outlier.stop.title,
    keepTitles,
    targetDayLabel,
    targetDayBadge: formatDayCheckBadgeLabel(targetDay),
    copy: `Move ${outlier.stop.title} to ${targetDayLabel}. ${keepCopy}`,
    reviewCopy: `This will move ${outlier.stop.title} into the first open slot on ${targetDayLabel}. No other stops change.`
  };
}

function findOutlierStop(stops) {
  let candidate = null;

  for (const stop of stops) {
    const others = stops.filter((other) => other.id !== stop.id);
    if (!others.length) {
      continue;
    }
    const averageDistanceKm = others.reduce((sum, other) => sum + distanceKm(stop, other), 0) / others.length;
    if (!candidate || averageDistanceKm > candidate.averageDistanceKm) {
      candidate = { stop, averageDistanceKm };
    }
  }

  return candidate;
}

function findCompatibleTargetDay(days, sourceDay, stop) {
  const stopRegionTokens = getRegionTokens([stop.city, stop.item?.place?.formattedAddress, stop.item?.place?.name].join(" "));
  const sourceRegionTokens = getRegionTokens([sourceDay.city, sourceDay.basePlace?.formattedAddress, sourceDay.basePlace?.name].join(" "));
  const acceptableTokens = new Set([...stopRegionTokens, ...sourceRegionTokens]);
  const duration = Math.max(MIN_SCHEDULE_DURATION_MINUTES, Number(stop.item?.duration) || MIN_SCHEDULE_DURATION_MINUTES);

  const candidates = (days ?? [])
    .filter((day) => day.id !== sourceDay.id)
    .map((day) => {
      const dayTokens = getRegionTokens([day.city, day.basePlace?.formattedAddress, day.basePlace?.name].join(" "));
      const isCompatible = !acceptableTokens.size || dayTokens.some((token) => acceptableTokens.has(token));
      const start = findAvailableScheduleStart(day.schedule ?? [], duration);
      const stats = getDayStats(day);
      return { day, isCompatible, start, plannedMinutes: stats.plannedMinutes };
    })
    .filter((candidate) => candidate.isCompatible && candidate.start)
    .sort((first, second) => first.plannedMinutes - second.plannedMinutes || (first.day.dayNumber ?? 0) - (second.day.dayNumber ?? 0));

  return candidates[0]?.day ?? null;
}

function findAvailableScheduleStart(schedule, durationMinutes) {
  const duration = Math.max(MIN_SCHEDULE_DURATION_MINUTES, Number(durationMinutes) || MIN_SCHEDULE_DURATION_MINUTES);
  for (let minutes = TIME_GRID_START_MINUTES; minutes <= TIME_GRID_END_MINUTES - duration; minutes += TIME_GRID_STEP_MINUTES) {
    const start = minutesToTimeInput(minutes);
    if (isScheduleSlotAvailable(schedule, null, start, duration)) {
      return start;
    }
  }
  return "";
}

function distanceKm(first, second) {
  const earthRadiusKm = 6371;
  const lat1 = toRadians(Number(first.latitude));
  const lat2 = toRadians(Number(second.latitude));
  const deltaLat = toRadians(Number(second.latitude) - Number(first.latitude));
  const deltaLon = toRadians(Number(second.longitude) - Number(first.longitude));
  const a = (Math.sin(deltaLat / 2) ** 2) + (Math.cos(lat1) * Math.cos(lat2) * (Math.sin(deltaLon / 2) ** 2));
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function formatDistanceKm(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 km";
  }
  return value >= 10 ? `${Math.round(value)} km` : `${value.toFixed(1)} km`;
}

function formatTitleList(titles) {
  if (titles.length <= 2) {
    return titles.join(" and ");
  }
  return `${titles.slice(0, -1).join(", ")}, and ${titles[titles.length - 1]}`;
}

function formatDayCheckDayLabel(day) {
  return `${day.label || `Day ${day.dayNumber}`}${day.city ? ` (${day.city})` : ""}`;
}

function formatDayCheckBadgeLabel(day) {
  if (!day) {
    return "";
  }
  return Number.isFinite(Number(day.dayNumber)) ? `Day ${day.dayNumber}` : day.label || "Day";
}

function getRegionTokens(value) {
  const text = String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  const regions = [
    "mexico city",
    "ciudad de mexico",
    "cdmx",
    "condesa",
    "roma norte",
    "roma sur",
    "polanco",
    "coyoacan",
    "chapultepec",
    "centro historico",
    "tokyo",
    "kyoto",
    "osaka",
    "nara",
    "hakone",
    "yokohama",
    "kobe",
    "hiroshima",
    "nagoya",
    "sapporo",
    "fukuoka",
    "kamakura",
    "uji",
    "himeji",
    "kanazawa",
    "nikko",
    "arashiyama"
  ];
  return regions.filter((region) => text.includes(region));
}

function describeRelativeArea(stop, comparisonStop) {
  if (!comparisonStop) {
    return "away from the rest of the day";
  }
  const latDelta = Number(stop.latitude) - Number(comparisonStop.latitude);
  const lonDelta = Number(stop.longitude) - Number(comparisonStop.longitude);
  const vertical = Math.abs(latDelta) > 0.025 ? (latDelta > 0 ? "north" : "south") : "";
  const horizontal = Math.abs(lonDelta) > 0.025 ? (lonDelta > 0 ? "east" : "west") : "";
  return [vertical, horizontal].filter(Boolean).join("/") || "away from the rest of the day";
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

function formatMoneyList(currencySummaries = []) {
  const totals = currencySummaries
    .filter((summary) => summary.total > 0)
    .map((summary) => formatMoney(summary.total, summary.currency));
  return totals.length ? totals.join(" + ") : formatMoney(0, "JPY");
}

function formatSignedMoney(amountMinor, currency) {
  if (amountMinor === 0) {
    return formatMoney(0, currency);
  }
  const prefix = amountMinor > 0 ? "+" : "-";
  return `${prefix}${formatMoney(Math.abs(amountMinor), currency)}`;
}

function formatSourceType(sourceType) {
  if (sourceType === "schedule_item") {
    return "Activity";
  }
  if (sourceType === "idea") {
    return "Idea";
  }
  return "Manual";
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
      : findAvailableScheduleStart(targetDay.schedule, duration) || preferredStart || suggestNextStart(targetDay.schedule);

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
    votes: Object.fromEntries(travelers.map((name) => [name, ""]))
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

function addDateDays(dateValue, days) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildTimeGridSlots() {
  const slots = [];
  for (let minutes = TIME_GRID_START_MINUTES; minutes <= TIME_GRID_END_MINUTES; minutes += TIME_GRID_STEP_MINUTES) {
    slots.push({ minutes });
  }
  return slots;
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

function getDropStartFromPointer(clientY, column, rowHeight = DAY_TIME_GRID_ROW_HEIGHT) {
  const rect = column.getBoundingClientRect();
  const offsetY = Math.min(Math.max(clientY - rect.top, 0), rect.height);
  const rawMinutes = TIME_GRID_START_MINUTES + (offsetY / rowHeight) * TIME_GRID_STEP_MINUTES;
  const snappedMinutes = Math.round(rawMinutes / TIME_GRID_STEP_MINUTES) * TIME_GRID_STEP_MINUTES;
  const clampedMinutes = Math.min(Math.max(snappedMinutes, TIME_GRID_START_MINUTES), TIME_GRID_END_MINUTES);
  return minutesToTimeInput(clampedMinutes);
}

function getCellStartFromPointer(clientY, column, rowHeight = DAY_TIME_GRID_ROW_HEIGHT) {
  const rect = column.getBoundingClientRect();
  const offsetY = Math.min(Math.max(clientY - rect.top, 0), Math.max(0, rect.height - 1));
  const rawMinutes = TIME_GRID_START_MINUTES + (offsetY / rowHeight) * TIME_GRID_STEP_MINUTES;
  const snappedMinutes = Math.floor(rawMinutes / TIME_GRID_STEP_MINUTES) * TIME_GRID_STEP_MINUTES;
  const clampedMinutes = Math.min(Math.max(snappedMinutes, TIME_GRID_START_MINUTES), TIME_GRID_END_MINUTES - TIME_GRID_STEP_MINUTES);
  return minutesToTimeInput(clampedMinutes);
}

function getResizeDeltaMinutes(clientY, startY, rowHeight = DAY_TIME_GRID_ROW_HEIGHT) {
  const rawMinutes = ((clientY - startY) / rowHeight) * TIME_GRID_STEP_MINUTES;
  return Math.round(rawMinutes / RESIZE_STEP_MINUTES) * RESIZE_STEP_MINUTES;
}

function minutesToTimeInput(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function clampMinutes(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isScheduleSlotAvailable(schedule, movingItemId, targetStart, durationMinutes) {
  const start = parseTimeToMinutes(targetStart);
  const duration = Math.max(MIN_SCHEDULE_DURATION_MINUTES, Number(durationMinutes) || MIN_SCHEDULE_DURATION_MINUTES);
  if (start === null) {
    return false;
  }

  const end = start + duration;
  if (start < TIME_GRID_START_MINUTES || end > TIME_GRID_END_MINUTES) {
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
    const itemEnd = itemStart + (Number(item.duration) || TIME_GRID_STEP_MINUTES);
    return end <= itemStart || start >= itemEnd;
  });
}

function areDropPreviewsEqual(first, second) {
  if (!first || !second) {
    return first === second;
  }
  return first.dayId === second.dayId && first.start === second.start && first.duration === second.duration && first.isAvailable === second.isAvailable;
}

function parseTimeToMinutes(time) {
  if (!time) {
    return null;
  }
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
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
    const matchesCategory = category === "All" || idea.category === category;
    return matchesTab && matchesCategory;
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
    .replace(/\b(USD|JPY|YEN)\b/gi, "")
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

function readBudgetCurrencySettings() {
  if (typeof window === "undefined") {
    return { view: "native", jpyPerUsd: DEFAULT_JPY_PER_USD };
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(BUDGET_CURRENCY_SETTINGS_KEY) ?? "{}");
    const view = BUDGET_CURRENCY_VIEWS.some((option) => option.value === parsed.view) ? parsed.view : "native";
    return {
      view,
      jpyPerUsd: normalizeExchangeRate(parsed.jpyPerUsd ?? DEFAULT_JPY_PER_USD)
    };
  } catch {
    return { view: "native", jpyPerUsd: DEFAULT_JPY_PER_USD };
  }
}

function writeBudgetCurrencySettings(settings) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const view = BUDGET_CURRENCY_VIEWS.some((option) => option.value === settings.view) ? settings.view : "native";
    window.localStorage.setItem(BUDGET_CURRENCY_SETTINGS_KEY, JSON.stringify({
      view,
      jpyPerUsd: normalizeExchangeRate(settings.jpyPerUsd)
    }));
  } catch {
    // Currency display preferences are local-only and safe to lose.
  }
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

function suggestNextStart(schedule) {
  if (!schedule.length) {
    return "10:00";
  }

  const latestEnd = schedule.reduce((max, item) => {
    const [hours, minutes] = item.start.split(":").map(Number);
    return Math.max(max, hours * 60 + minutes + Number(item.duration || 60));
  }, 10 * 60);

  const rounded = Math.min(22 * 60, Math.ceil(latestEnd / 30) * 30);
  const hours = String(Math.floor(rounded / 60)).padStart(2, "0");
  const minutes = String(rounded % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export default App;
