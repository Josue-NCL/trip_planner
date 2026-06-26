import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bed,
  CalendarDays,
  Check,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileUp,
  Filter,
  GripVertical,
  Heart,
  Landmark,
  LogOut,
  Mail,
  MapPin,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCcw,
  ShoppingBag,
  Sun,
  Train,
  Trash2,
  Utensils,
  UserPlus,
  Users,
  X
} from "lucide-react";
import { CATEGORIES, makeInitialTrip, STATUSES } from "./data/tripData.js";
import { ensureUserProfile, getCurrentSession, onAuthSessionChange, sendMagicLink, signOut } from "./lib/auth.js";
import { acceptTripInvite, claimTripTraveler, createTripInvite, listTripCollaboration, revokeTripInvite } from "./lib/collaborationRepository.js";
import { downloadTripExport } from "./lib/export.js";
import { isSupabaseConfigured } from "./lib/supabaseClient.js";
import { isValidTrip, loadTrip, mergeIdeas } from "./lib/storage.js";
import { createTripFromPayload, listTrips, loadRemoteTrip, replaceTripPayload, subscribeToTripChanges } from "./lib/tripRepository.js";

const DAY_MINUTES = 12 * 60;
const FILTER_TABS = ["Ideas", "All", "Booked", "Maybe"];
const CATEGORY_FILTERS = ["All", "Food", "Culture", "Transit", "Hotel", "Shopping", "Open Time"];
const TIME_GRID_START_MINUTES = 7 * 60;
const TIME_GRID_END_MINUTES = 22 * 60;
const TIME_GRID_STEP_MINUTES = 30;
const DAY_TIME_GRID_ROW_HEIGHT = 48;
const TRIP_TIME_GRID_ROW_HEIGHT = 60;
const ICON_BASE = `${import.meta.env.BASE_URL}assets/icons/`;

const TAG_ASSETS = {
  category: {
    Food: `${ICON_BASE}tag-food.png`,
    Culture: `${ICON_BASE}tag-culture.png`,
    Transit: `${ICON_BASE}tag-transit.png`,
    Hotel: `${ICON_BASE}tag-hotel.png`,
    Shopping: `${ICON_BASE}tag-shopping.png`,
    "Open Time": `${ICON_BASE}tag-open-time.png`
  },
  status: {
    Booked: `${ICON_BASE}tag-booked.png`,
    Maybe: `${ICON_BASE}tag-maybe.png`,
    Skipped: `${ICON_BASE}tag-skipped.png`
  },
  meta: {
    budget: `${ICON_BASE}tag-budget.png`,
    calendar: `${ICON_BASE}tag-calendar.png`,
    link: `${ICON_BASE}tag-link.png`,
    map: `${ICON_BASE}tag-map-pin.png`,
    notes: `${ICON_BASE}tag-notes.png`,
    reservation: `${ICON_BASE}tag-reservation.png`
  }
};

const CATEGORY_CONFIG = {
  Food: { icon: Utensils, asset: TAG_ASSETS.category.Food, className: "food", label: "Food", short: "Food" },
  Culture: { icon: Landmark, asset: TAG_ASSETS.category.Culture, className: "culture", label: "Culture", short: "See" },
  Transit: { icon: Train, asset: TAG_ASSETS.category.Transit, className: "transit", label: "Transit", short: "Go" },
  Hotel: { icon: Bed, asset: TAG_ASSETS.category.Hotel, className: "hotel", label: "Hotel", short: "Hotel" },
  Shopping: { icon: ShoppingBag, asset: TAG_ASSETS.category.Shopping, className: "shopping", label: "Shopping", short: "Shop" },
  "Open Time": { icon: Clock3, asset: TAG_ASSETS.category["Open Time"], className: "open", label: "Open Time", short: "Open" }
};

const STATUS_CLASS = {
  Proposed: "proposed",
  Maybe: "maybe",
  Booked: "booked",
  Skipped: "skipped"
};

const STATUS_ASSETS = {
  Proposed: TAG_ASSETS.meta.notes,
  Maybe: TAG_ASSETS.status.Maybe,
  Booked: TAG_ASSETS.status.Booked,
  Skipped: TAG_ASSETS.status.Skipped
};

const DEFAULT_NEW_IDEA = {
  title: "",
  category: "Culture",
  city: "",
  status: "Proposed",
  notes: "",
  cost: "",
  link: "",
  imageKey: ""
};

const DEFAULT_NEW_BLOCK = {
  title: "",
  category: "Open Time",
  city: "",
  start: "10:00",
  duration: 60,
  status: "Proposed",
  notes: "",
  cost: "",
  link: "",
  mapLink: ""
};

const VOTE_ORDER = ["", "maybe", "like", "love"];
const VOTE_LABELS = {
  "": "Vote",
  maybe: "Maybe",
  like: "Like",
  love: "Love"
};

const IS_DEV_LOCAL_PREVIEW = import.meta.env.DEV;
const EMPTY_COLLABORATION = {
  members: [],
  travelers: [],
  invitations: []
};

function App() {
  const [trip, setTrip] = useState(loadTrip);
  const [selectedDayId, setSelectedDayId] = useState(() => trip.days[0]?.id);
  const [isLocalPreview, setIsLocalPreview] = useState(() => {
    if (!IS_DEV_LOCAL_PREVIEW || typeof window === "undefined") {
      return false;
    }
    return new URLSearchParams(window.location.search).get("preview") === "1";
  });
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [tripSummaries, setTripSummaries] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [tripListStatus, setTripListStatus] = useState("idle");
  const [tripLoading, setTripLoading] = useState(false);
  const [tripLoaded, setTripLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [inviteToken, setInviteToken] = useState(() => getSearchParam("invite"));
  const [inviteAcceptStatus, setInviteAcceptStatus] = useState("idle");
  const [collaboration, setCollaboration] = useState(EMPTY_COLLABORATION);
  const [collaborationStatus, setCollaborationStatus] = useState("idle");
  const [isSharingOpen, setIsSharingOpen] = useState(false);
  const [newInvite, setNewInvite] = useState({ email: "", travelerId: "" });
  const [latestInviteUrl, setLatestInviteUrl] = useState("");
  const [activeView, setActiveView] = useState("trip");
  const [tripBoardMode, setTripBoardMode] = useState("calendar");
  const [dayViewMode, setDayViewMode] = useState("timeline");
  const [isDateRailCollapsed, setIsDateRailCollapsed] = useState(false);
  const [ideaTab, setIdeaTab] = useState("Ideas");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [newIdea, setNewIdea] = useState(DEFAULT_NEW_IDEA);
  const [ideaPromotion, setIdeaPromotion] = useState(null);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [editingIdea, setEditingIdea] = useState(null);
  const [editingDay, setEditingDay] = useState(null);
  const [pendingImport, setPendingImport] = useState(null);
  const [toasts, setToasts] = useState([]);
  const fileInputRef = useRef(null);
  const pickerFileInputRef = useRef(null);
  const toastTimersRef = useRef(new Map());
  const saveTimerRef = useRef(null);
  const realtimeTimerRef = useRef(null);
  const skipNextSaveRef = useRef(false);
  const acceptingInviteRef = useRef("");

  useEffect(() => {
    if (!isSupabaseConfigured || isLocalPreview) {
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

    const unsubscribe = onAuthSessionChange((nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setSelectedTripId(null);
        setTripLoaded(false);
        setTripSummaries([]);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
      toastTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      toastTimersRef.current.clear();
      window.clearTimeout(saveTimerRef.current);
      window.clearTimeout(realtimeTimerRef.current);
    };
  }, [isLocalPreview]);

  useEffect(() => {
    if (!session || isLocalPreview) {
      return;
    }

    ensureUserProfile(session)
      .then(() => refreshTripSummaries())
      .catch((error) => {
        setTripListStatus("error");
        showToast({ type: "error", message: error.message });
      });
  }, [session, isLocalPreview]);

  useEffect(() => {
    if (isLocalPreview || !session || !inviteToken || acceptingInviteRef.current === inviteToken) {
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
        setInviteToken("");
        setInviteAcceptStatus("accepted");
        if (tripId) {
          await refreshTripSummaries({ silent: true });
          setSelectedTripId(tripId);
          setActiveView("trip");
          showToast({ type: "success", message: "Invite accepted" });
        }
      })
      .catch((error) => {
        if (isCurrent) {
          setInviteAcceptStatus("error");
          showToast({ type: "error", message: error.message });
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [inviteToken, isLocalPreview, session]);

  const sortedDays = useMemo(() => deriveTripDays(trip.days), [trip.days]);

  const selectedDay = useMemo(
    () => sortedDays.find((day) => day.id === selectedDayId) ?? sortedDays[0],
    [selectedDayId, sortedDays]
  );

  useEffect(() => {
    if (!selectedDay && sortedDays[0]) {
      setSelectedDayId(sortedDays[0].id);
    }
  }, [selectedDay, sortedDays]);

  const sortedSchedule = useMemo(() => sortSchedule(selectedDay?.schedule ?? []), [selectedDay]);
  const dayStats = useMemo(() => getDayStats(selectedDay), [selectedDay]);
  const filteredIdeas = useMemo(
    () => filterIdeas(trip.ideas, ideaTab, categoryFilter),
    [trip.ideas, ideaTab, categoryFilter]
  );
  const dateRangeLabel = useMemo(() => formatTripRange(sortedDays), [sortedDays]);
  const currentMember = useMemo(
    () => collaboration.members.find((member) => member.profileId === session?.user?.id),
    [collaboration.members, session?.user?.id]
  );
  const currentTraveler = useMemo(
    () => collaboration.travelers.find((traveler) => traveler.profileId === session?.user?.id),
    [collaboration.travelers, session?.user?.id]
  );
  const currentTravelerName = currentTraveler?.name ?? "";
  const canManageSharing = currentMember?.role === "owner";
  const peopleCount = collaboration.travelers.length || trip.travelers.length;
  const pendingInvitations = useMemo(
    () => collaboration.invitations.filter((invite) => invite.status === "pending"),
    [collaboration.invitations]
  );

  useEffect(() => {
    if (isLocalPreview || !session || !selectedTripId) {
      setCollaboration(EMPTY_COLLABORATION);
      return;
    }

    let isCurrent = true;
    setTripLoading(true);
    setTripLoaded(false);
    setSyncStatus("loading");
    loadRemoteTrip(selectedTripId)
      .then((remoteTrip) => {
        if (!isCurrent) {
          return;
        }
        skipNextSaveRef.current = true;
        setTrip(remoteTrip);
        const remoteDays = deriveTripDays(remoteTrip.days);
        setSelectedDayId(remoteDays[0]?.id);
        setActiveView("trip");
        setTripBoardMode("calendar");
        setTripLoaded(true);
        setSyncStatus("synced");
      })
      .catch((error) => {
        if (isCurrent) {
          setSyncStatus("error");
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
  }, [selectedTripId, session, isLocalPreview]);

  useEffect(() => {
    if (isLocalPreview || !session || !selectedTripId || !tripLoaded) {
      setCollaboration(EMPTY_COLLABORATION);
      return;
    }

    refreshCollaboration({ silent: true });
  }, [selectedTripId, session, tripLoaded, isLocalPreview]);

  useEffect(() => {
    if (isLocalPreview || !session || !selectedTripId || !tripLoaded) {
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
      replaceTripPayload(selectedTripId, snapshot)
        .then(() => {
          setSyncStatus("saved");
          refreshTripSummaries({ silent: true });
        })
        .catch((error) => {
          setSyncStatus("error");
          showToast({ type: "error", message: error.message });
        });
    }, 800);

    return () => {
      window.clearTimeout(saveTimerRef.current);
    };
  }, [trip, dateRangeLabel, selectedTripId, session, tripLoaded, isLocalPreview]);

  useEffect(() => {
    if (isLocalPreview || !session || !selectedTripId || !tripLoaded) {
      return undefined;
    }

    return subscribeToTripChanges(selectedTripId, () => {
      window.clearTimeout(realtimeTimerRef.current);
      realtimeTimerRef.current = window.setTimeout(() => {
        loadRemoteTrip(selectedTripId)
          .then((remoteTrip) => {
            skipNextSaveRef.current = true;
            setTrip(remoteTrip);
            setSyncStatus("synced");
            refreshCollaboration({ silent: true });
          })
          .catch((error) => {
            setSyncStatus("error");
            showToast({ type: "error", message: error.message });
          });
      }, 1000);
    });
  }, [selectedTripId, session, tripLoaded, isLocalPreview]);

  async function refreshTripSummaries({ silent = false } = {}) {
    if (!silent) {
      setTripListStatus("loading");
    }
    const summaries = await listTrips(session?.user?.id);
    setTripSummaries(summaries);
    setTripListStatus("ready");
  }

  async function refreshCollaboration({ silent = false } = {}) {
    if (!selectedTripId || isLocalPreview) {
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
      setNewInvite((current) => ({
        ...current,
        travelerId: current.travelerId || String(findFirstAvailableTraveler(nextCollaboration.travelers)?.id ?? "")
      }));
    } catch (error) {
      setCollaborationStatus("error");
      showToast({ type: "error", message: error.message });
    }
  }

  async function handleCreateInvite(event) {
    event.preventDefault();
    if (!selectedTripId || !session?.user || !newInvite.email.trim() || !newInvite.travelerId) {
      return;
    }

    try {
      const invite = await createTripInvite({
        tripId: selectedTripId,
        email: newInvite.email,
        travelerId: Number(newInvite.travelerId),
        invitedBy: session.user.id
      });
      setLatestInviteUrl(invite.inviteUrl);
      setNewInvite({ email: "", travelerId: newInvite.travelerId });
      await refreshCollaboration({ silent: true });
      showToast({ type: "success", message: "Invite created" });
    } catch (error) {
      showToast({ type: "error", message: error.message });
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

  async function handleClaimTraveler(travelerId) {
    try {
      await claimTripTraveler(travelerId);
      await refreshCollaboration({ silent: true });
      showToast({ type: "success", message: "Traveler linked" });
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

  async function handleSignOut() {
    try {
      await signOut();
      setSession(null);
      setSelectedTripId(null);
      setTripLoaded(false);
      setSyncStatus("idle");
    } catch (error) {
      showToast({ type: "error", message: error.message });
    }
  }

  function startLocalPreview() {
    setIsLocalPreview(true);
    setAuthLoading(false);
    setSession(null);
    setSelectedTripId(null);
    setTripLoaded(false);
    setSyncStatus("preview");
    showToast({ type: "info", message: "Local preview mode" });
  }

  function stopLocalPreview() {
    setIsLocalPreview(false);
    setSyncStatus("idle");
  }

  async function createTrip(payload) {
    if (!session?.user) {
      return;
    }

    setTripListStatus("loading");
    try {
      const nextTripId = await createTripFromPayload({ ...payload, dateRangeLabel: formatTripRange(deriveTripDays(payload.days)) }, session.user.id);
      await refreshTripSummaries({ silent: true });
      setSelectedTripId(nextTripId);
      showToast({ type: "success", message: "Trip created" });
    } catch (error) {
      setTripListStatus("error");
      showToast({ type: "error", message: error.message });
    }
  }

  function createStarterTrip() {
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

  function dismissToast(toastId) {
    const timer = toastTimersRef.current.get(toastId);
    if (timer) {
      window.clearTimeout(timer);
      toastTimersRef.current.delete(toastId);
    }
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }

  function showToast({ type = "info", message }) {
    const toast = {
      id: `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
      message
    };

    setToasts((current) => {
      const next = [...current, toast].slice(-3);
      current
        .filter((existingToast) => !next.some((nextToast) => nextToast.id === existingToast.id))
        .forEach((droppedToast) => {
          const timer = toastTimersRef.current.get(droppedToast.id);
          if (timer) {
            window.clearTimeout(timer);
            toastTimersRef.current.delete(droppedToast.id);
          }
        });
      return next;
    });

    const timer = window.setTimeout(() => dismissToast(toast.id), 4000);
    toastTimersRef.current.set(toast.id, timer);
  }

  function addTripDay() {
    const lastDay = sortedDays[sortedDays.length - 1];
    const nextDate = addDateDays(lastDay?.date ?? "2026-10-05", 1);
    const newDay = {
      id: `day-${Date.now()}`,
      date: nextDate,
      label: "",
      city: lastDay?.city ?? "Tokyo",
      notes: "",
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
              city: dayDraft.city.trim() || "Japan",
              notes: dayDraft.notes ?? ""
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
      return;
    }

    const isExistingActivity = Boolean(targetDay?.schedule.some((scheduleItem) => scheduleItem.id === item.id));

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
        duration: Number(item.duration) || 60
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
      message: consumedIdeaId ? "Added to itinerary" : isExistingActivity ? "Activity updated" : "Activity added"
    });
  }

  function deleteScheduleItem(dayId, itemId) {
    updateDay(dayId, (day) => ({
      ...day,
      schedule: day.schedule.filter((item) => item.id !== itemId)
    }));
    setEditingSchedule(null);
    showToast({ type: "success", message: "Activity deleted" });
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

  function openNewScheduleModal() {
    if (!selectedDay) {
      return;
    }
    setEditingSchedule({
      mode: "new",
      dayId: selectedDay.id,
      item: {
        ...DEFAULT_NEW_BLOCK,
        id: `sched-${Date.now()}`,
        city: selectedDay.city,
        start: suggestNextStart(selectedDay.schedule)
      }
    });
  }

  function autoArrangeSelectedDay() {
    if (!selectedDay) {
      return;
    }
    updateDay(selectedDay.id, (day) => ({ ...day, schedule: sortSchedule(day.schedule) }));
  }

  function addIdea(event) {
    event.preventDefault();
    if (!newIdea.title.trim()) {
      return;
    }

    setTrip((current) => ({
      ...current,
      ideas: [
        {
          ...newIdea,
          id: `idea-${Date.now()}`,
          title: newIdea.title.trim(),
          city: newIdea.city.trim(),
          notes: newIdea.notes.trim(),
          votes: Object.fromEntries(current.travelers.map((name) => [name, ""]))
        },
        ...current.ideas
      ]
    }));
    setNewIdea(DEFAULT_NEW_IDEA);
    showToast({ type: "success", message: "Idea saved" });
  }

  function saveIdea(idea) {
    setTrip((current) => ({
      ...current,
      ideas: current.ideas.map((currentIdea) =>
        currentIdea.id === idea.id
          ? { ...idea, title: idea.title.trim() || "Untitled idea", notes: idea.notes?.trim() ?? "" }
          : currentIdea
      )
    }));
    setEditingIdea(null);
  }

  function deleteIdea(ideaId) {
    setTrip((current) => ({
      ...current,
      ideas: current.ideas.filter((idea) => idea.id !== ideaId)
    }));
    setEditingIdea(null);
  }

  function cycleVote(ideaId, traveler) {
    if (!isLocalPreview && selectedTripId && (!currentTravelerName || traveler !== currentTravelerName)) {
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
      item: {
        ...DEFAULT_NEW_BLOCK,
        id: `sched-${idea.id}-${Date.now()}`,
        title: idea.title,
        category: idea.category,
        city: idea.city || targetDay.city,
        start: suggestNextStart(targetDay.schedule),
        status: idea.status === "Skipped" ? "Proposed" : idea.status,
        notes: idea.notes ?? "",
        cost: idea.cost ?? "",
        link: idea.link ?? "",
        mapLink: idea.mapLink ?? ""
      }
    });
  }

  function exportTrip() {
    downloadTripExport({ ...trip, dateRangeLabel });
    showToast({ type: "info", message: "Trip export downloaded" });
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

  function replaceWithImport() {
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

  function resetPlanner() {
    if (!window.confirm("Reset this Supabase trip to the starter Japan 2026 trip?")) {
      return;
    }
    const starterTrip = makeInitialTrip();
    const starterDays = deriveTripDays(starterTrip.days);
    setTrip(starterTrip);
    setSelectedDayId(starterDays[0]?.id);
    setActiveView("trip");
    setTripBoardMode("calendar");
    showToast({ type: "success", message: "Planner reset" });
  }

  if (!isSupabaseConfigured && !isLocalPreview) {
    return <ConfigState title="Supabase needs environment variables" message="Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the Vite dev server." />;
  }

  if (!isLocalPreview && authLoading) {
    return <ConfigState title="Checking session" message="Restoring your Supabase session..." />;
  }

  if (!isLocalPreview && !session) {
    return (
      <AuthScreen
        email={authEmail}
        message={authMessage}
        hasInvite={Boolean(inviteToken)}
        onEmailChange={setAuthEmail}
        onSubmit={handleMagicLinkSubmit}
        canPreview={IS_DEV_LOCAL_PREVIEW}
        onPreview={startLocalPreview}
      />
    );
  }

  if (!isLocalPreview && session && inviteToken && inviteAcceptStatus === "loading") {
    return <ConfigState title="Accepting invite" message="Linking this trip to your account..." />;
  }

  if (!isLocalPreview && !selectedTripId) {
    return (
      <TripPicker
        email={session.user.email}
        trips={tripSummaries}
        status={tripListStatus}
        pickerFileInputRef={pickerFileInputRef}
        onRefresh={() => refreshTripSummaries()}
        onSelect={setSelectedTripId}
        onCreateStarter={createStarterTrip}
        onImportLocal={importLocalPlanner}
        onImportFile={handlePickerImportFile}
        onSignOut={handleSignOut}
      />
    );
  }

  if (!isLocalPreview && tripLoading && !tripLoaded) {
    return <ConfigState title="Loading trip" message="Pulling the latest planner from Supabase..." />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <img className="title-flag" src="./assets/japan-flag-title.png" alt="" aria-hidden="true" />
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

        <ViewSwitcher activeView={activeView} ideasCount={trip.ideas.length} onChange={setActiveView} />

        <div className="topbar-actions">
          {!isLocalPreview ? (
            <select className="trip-select" value={selectedTripId ?? ""} onChange={(event) => setSelectedTripId(Number(event.target.value))} aria-label="Switch trip">
              {tripSummaries.map((summary) => (
                <option key={summary.id} value={summary.id}>
                  {summary.name}
                </option>
              ))}
            </select>
          ) : null}
          <span className={`sync-badge is-${isLocalPreview ? "preview" : syncStatus}`}>{isLocalPreview ? "Local preview" : formatSyncStatus(syncStatus)}</span>
          {!isLocalPreview && selectedTripId ? (
            <button className="ghost-button" type="button" onClick={() => setIsSharingOpen(true)}>
              <Users size={17} />
              People
              <span className="people-count-badge">{peopleCount}</span>
            </button>
          ) : null}
          <button className="ghost-button" type="button" onClick={exportTrip}>
            <Download size={17} />
            Export
          </button>
          <button className="ghost-button" type="button" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={17} />
            Import
          </button>
          <input ref={fileInputRef} className="file-input" type="file" accept="application/json" onChange={handleImportFile} />
          <button className="icon-button" type="button" aria-label="Reset planner" onClick={resetPlanner}>
            <RefreshCcw size={18} />
          </button>
          <button className="icon-button" type="button" aria-label={isLocalPreview ? "Back to sign in" : "Sign out"} onClick={isLocalPreview ? stopLocalPreview : handleSignOut}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <ToastRegion toasts={toasts} onDismiss={dismissToast} />

      <main className={`planner-grid is-${activeView}-view ${activeView === "day" && isDateRailCollapsed ? "is-rail-collapsed" : ""}`}>
        {activeView === "day" ? (
          <DateRail
            days={sortedDays}
            selectedDayId={selectedDay?.id}
            isCollapsed={isDateRailCollapsed}
            onToggleCollapsed={() => setIsDateRailCollapsed((isCollapsed) => !isCollapsed)}
            onSelect={(dayId) => {
              setSelectedDayId(dayId);
              setActiveView("day");
            }}
            onAddDay={addTripDay}
          />
        ) : null}

        {activeView === "day" ? (
          <DayTimeline
            day={selectedDay}
            sortedSchedule={sortedSchedule}
            stats={dayStats}
            mode={dayViewMode}
            ideasCount={trip.ideas.length}
            onAdd={openNewScheduleModal}
            onEdit={(item) => setEditingSchedule({ mode: "edit", dayId: selectedDay.id, item })}
            onScheduleMove={moveScheduleItem}
            onDayChange={(updater) => updateDay(selectedDay.id, updater)}
            onEditDay={() => setEditingDay(selectedDay)}
            onOpenIdeas={() => setActiveView("ideas")}
            onAutoArrange={autoArrangeSelectedDay}
            onModeChange={setDayViewMode}
          />
        ) : null}

        {activeView === "trip" ? (
          <AllTripBoard
            days={sortedDays}
            mode={tripBoardMode}
            dateRangeLabel={dateRangeLabel}
            ideasCount={trip.ideas.length}
            onModeChange={setTripBoardMode}
            onOpenIdeas={() => setActiveView("ideas")}
            onOpenDay={(dayId) => {
              setSelectedDayId(dayId);
              setActiveView("day");
            }}
            onScheduleMove={moveScheduleItem}
            onEditSchedule={(dayId, item) => setEditingSchedule({ mode: "edit", dayId, item })}
            onEditDay={(day) => setEditingDay(day)}
          />
        ) : null}

        {activeView === "ideas" ? (
          <IdeasSection
            ideas={filteredIdeas}
            allIdeas={trip.ideas}
            travelers={trip.travelers}
            currentTravelerName={currentTravelerName}
            canVoteAllTravelers={isLocalPreview || !selectedTripId}
            isLocalPreview={isLocalPreview}
            ideaTab={ideaTab}
            categoryFilter={categoryFilter}
            newIdea={newIdea}
            onTabChange={setIdeaTab}
            onCategoryChange={setCategoryFilter}
            onNewIdeaChange={setNewIdea}
            onAddIdea={addIdea}
            onEditIdea={setEditingIdea}
            onDeleteIdea={deleteIdea}
            onVote={cycleVote}
            onPromote={openIdeaPromotion}
          />
        ) : null}
      </main>

      <TravelStrip />

      {editingSchedule ? (
        <EditScheduleModal
          payload={editingSchedule}
          onCancel={() => setEditingSchedule(null)}
          onSave={(item) => saveScheduleItem(editingSchedule.dayId, item, editingSchedule.consumedIdeaId)}
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
          onCancel={() => setEditingIdea(null)}
          onSave={saveIdea}
          onDelete={() => deleteIdea(editingIdea.id)}
        />
      ) : null}

      {editingDay ? (
        <EditDayModal
          day={editingDay}
          canDelete={sortedDays.length > 1}
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
          newInvite={newInvite}
          latestInviteUrl={latestInviteUrl}
          pendingInvitations={pendingInvitations}
          onNewInviteChange={setNewInvite}
          onSubmitInvite={handleCreateInvite}
          onCopyInvite={copyLatestInvite}
          onRevokeInvite={handleRevokeInvite}
          onClaimTraveler={handleClaimTraveler}
          onRefresh={() => refreshCollaboration()}
          onClose={() => setIsSharingOpen(false)}
        />
      ) : null}
    </div>
  );
}

function AuthScreen({ email, message, hasInvite, canPreview, onEmailChange, onSubmit, onPreview }) {
  return (
    <main className="auth-shell auth-landing-shell">
      <section className="auth-landing" aria-labelledby="auth-title">
        <div className="auth-landing-brand">
          <img className="title-flag" src="./assets/japan-flag-title.png" alt="" aria-hidden="true" />
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
                <img src="./assets/japan-flag-title.png" alt="" />
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
                  <img src={`./assets/icons/${icon}`} alt="" />
                </span>
              ))}
              <span className="auth-preview-add">+</span>
            </div>
            <div className="auth-preview-tags">
              {["tag-food.png", "tag-culture.png", "tag-transit.png", "tag-hotel.png", "tag-shopping.png", "tag-open-time.png", "tag-map-pin.png"].map((icon) => (
                <span key={icon}>
                  <img src={`./assets/icons/${icon}`} alt="" />
                </span>
              ))}
            </div>
          </div>

          <div className="auth-benefits" aria-label="Planner benefits">
            <span>
              <img src="./assets/icons/tag-favorite.png" alt="" aria-hidden="true" />
              <strong>Plan together</strong>
              <small>Share ideas and votes.</small>
            </span>
            <span>
              <img src="./assets/icons/tag-flexible.png" alt="" aria-hidden="true" />
              <strong>Always in sync</strong>
              <small>Changes follow the trip.</small>
            </span>
            <span>
              <img src="./assets/icons/tag-booked.png" alt="" aria-hidden="true" />
              <strong>Private & secure</strong>
              <small>Your planner stays yours.</small>
            </span>
          </div>
        </div>

        <aside className="auth-card" aria-label="Sign in">
          <div className="auth-card-header">
            <h2>Sign in</h2>
            <p>Use your email to open the shared planner.</p>
            {hasInvite ? <span className="invite-auth-note">Invite link ready</span> : null}
          </div>
          <form className="auth-form" onSubmit={onSubmit}>
            <label>
              Email
              <input type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="you@example.com" required />
            </label>
            <button className="primary-button" type="submit">
              <Mail size={17} />
              Send magic link
            </button>
          </form>
          {canPreview ? (
            <>
              <div className="auth-divider"><span>or</span></div>
              <button className="ghost-button full-width" type="button" onClick={onPreview}>
                Open local preview
              </button>
            </>
          ) : null}
          {message ? <p className="auth-message">{message}</p> : null}
        </aside>
      </section>
      <img className="auth-footer-strip" src="./assets/japan-footer-strip.png" alt="" aria-hidden="true" />
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
  onCreateStarter,
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
            <img className="title-flag" src="./assets/japan-flag-title.png" alt="" aria-hidden="true" />
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
          <button className="primary-button" type="button" onClick={onCreateStarter} disabled={isLoading}>
            <Plus size={17} />
            New Japan 2026 trip
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
          {!trips.length && !isLoading ? <p className="empty-trip-list">No Supabase trips yet. Create one from the starter trip or import your local planner.</p> : null}
          {isLoading ? <p className="empty-trip-list">Loading trips...</p> : null}
        </div>
      </section>
    </main>
  );
}

function ConfigState({ title, message }) {
  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="config-title">
        <div className="auth-brand">
          <img className="title-flag" src="./assets/japan-flag-title.png" alt="" aria-hidden="true" />
          <div>
            <p>Japan 2026</p>
            <h1 id="config-title">{title}</h1>
          </div>
        </div>
        <p className="auth-message">{message}</p>
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

function ToastRegion({ toasts, onDismiss }) {
  if (!toasts.length) {
    return null;
  }

  return (
    <div className="toast-region" role="status" aria-live="polite" aria-relevant="additions text">
      {toasts.map((toast) => (
        <div className={`toast toast-${toast.type}`} key={toast.id}>
          <span className="toast-marker" aria-hidden="true" />
          <span className="toast-message">{toast.message}</span>
          <button className="toast-close" type="button" aria-label={`Dismiss ${toast.message}`} onClick={() => onDismiss(toast.id)}>
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ViewSwitcher({ activeView, ideasCount, onChange }) {
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
        <span>{ideasCount}</span>
      </button>
    </div>
  );
}

function DateRail({ days, selectedDayId, isCollapsed, onToggleCollapsed, onSelect, onAddDay }) {
  return (
    <aside className={`date-rail ${isCollapsed ? "is-collapsed" : ""}`} aria-label="Itinerary days">
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

function useScheduleDrag({ days, onScheduleMove, rowHeight = DAY_TIME_GRID_ROW_HEIGHT }) {
  const [draggedItemId, setDraggedItemId] = useState(null);
  const [dropPreview, setDropPreview] = useState(null);
  const pointerDragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const daysById = useMemo(() => new Map(days.map((day) => [day.id, day])), [days]);

  function clearDragState() {
    setDraggedItemId(null);
    setDropPreview(null);
  }

  function readDropPreview(event, dragState) {
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
      isAvailable: isScheduleSlotAvailable(targetDay.schedule, item.id, start, duration)
    };
  }

  function handlePointerDown(event, item, sourceDayId) {
    if (event.button && event.button !== 0) {
      return;
    }

    pointerDragRef.current = {
      itemId: item.id,
      sourceDayId,
      startX: event.clientX,
      startY: event.clientY,
      pointerId: event.pointerId,
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
    setDraggedItemId(dragState.itemId);
    const nextPreview = readDropPreview(event, dragState);
    setDropPreview((current) => (areDropPreviewsEqual(current, nextPreview) ? current : nextPreview));
  }

  function handlePointerUp(event) {
    const dragState = pointerDragRef.current;
    pointerDragRef.current = null;

    if (!dragState?.isDragging) {
      clearDragState();
      return;
    }

    const finalPreview = readDropPreview(event, dragState);
    suppressClickRef.current = true;
    if (finalPreview?.isAvailable) {
      onScheduleMove(dragState.sourceDayId, dragState.itemId, finalPreview.dayId, finalPreview.start);
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

  return {
    draggedItemId,
    getDropPreviewForDay,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    shouldSuppressClick
  };
}

function DropSlotIndicator({ preview }) {
  if (!preview) {
    return null;
  }

  return (
    <div
      className={`drop-slot-indicator ${preview.isAvailable ? "is-available" : "is-unavailable"}`}
      style={{ top: preview.top, height: preview.height }}
      aria-hidden="true"
    >
      {preview.isAvailable ? formatTime(preview.start) : "Unavailable"}
    </div>
  );
}

function DayTimeline({
  day,
  sortedSchedule,
  stats,
  mode,
  ideasCount,
  onAdd,
  onEdit,
  onScheduleMove,
  onDayChange,
  onEditDay,
  onOpenIdeas,
  onAutoArrange,
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
        positioned={!compact}
        dragHandle={!compact}
        style={layout ? { top: layout.top, height: layout.height } : undefined}
        onPointerDown={compact ? undefined : (event) => dragScheduler.handlePointerDown(event, item, day.id)}
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
    <section className="timeline-panel" aria-label="Daily schedule">
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

      <div className="timeline-toolbar">
        <button className="ghost-button" type="button" onClick={onAdd}>
          <Plus size={17} />
          Add Activity
        </button>
        <span className="toolbar-spacer" />
        <button className="ghost-button flat-toolbar" type="button" onClick={onAutoArrange}>
          Auto Arrange
        </button>
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

function ScheduleEvent({
  item,
  dayCity = "",
  onEdit,
  compact = false,
  draggable = false,
  isDragging = false,
  positioned = false,
  dragHandle = false,
  style,
  onPointerDown
}) {
  const config = getCategoryConfig(item.category);
  const Icon = config.icon;
  const detail = getScheduleEventDetail(item, dayCity);

  return (
    <article
      className={`schedule-event category-${config.className} ${compact ? "is-compact" : ""} ${draggable ? "is-draggable" : ""} ${
        isDragging ? "is-dragging" : ""
      } ${positioned ? "is-positioned" : ""} ${dragHandle ? "has-drag-handle" : ""} ${detail.description ? "has-description" : ""} ${
        detail.showDetailStrip ? "has-detail-strip" : ""
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
    </article>
  );
}

function AllTripBoard({ days, mode, dateRangeLabel, ideasCount, onModeChange, onOpenIdeas, onOpenDay, onScheduleMove, onEditSchedule, onEditDay }) {
  const totals = days.reduce(
    (summary, day) => {
      const stats = getDayStats(day);
      return {
        planned: summary.planned + stats.plannedMinutes,
        blocks: summary.blocks + day.schedule.length
      };
    },
    { planned: 0, blocks: 0 }
  );

  return (
    <section className="trip-board" aria-label="All Trip itinerary board">
      <div className="trip-board-header">
        <div>
          <h1>{dateRangeLabel}</h1>
          <p>{totals.blocks} activities • {formatDuration(totals.planned)}</p>
        </div>
        <div className="trip-board-actions">
          <button className="ghost-button compact-action" type="button" onClick={onOpenIdeas}>
            Ideas
            <span className="count-badge">{ideasCount}</span>
          </button>
          <div className="mode-toggle" aria-label="All Trip display mode">
            <button className={mode === "grid" ? "is-active" : ""} type="button" onClick={() => onModeChange("grid")}>
              Grid
            </button>
            <button className={mode === "list" ? "is-active" : ""} type="button" onClick={() => onModeChange("list")}>
              List
            </button>
            <button className={mode === "calendar" ? "is-active" : ""} type="button" onClick={() => onModeChange("calendar")}>
              Timeline
            </button>
          </div>
        </div>
      </div>
      {mode === "calendar" ? (
        <TripCalendarBoard days={days} onOpenDay={onOpenDay} onScheduleMove={onScheduleMove} onEditSchedule={onEditSchedule} />
      ) : (
        <div className={mode === "grid" ? "trip-day-grid" : "trip-day-list"}>
          {days.map((day) => {
            const stats = getDayStats(day);
            const schedule = sortSchedule(day.schedule);
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

function TripCalendarBoard({ days, onOpenDay, onScheduleMove, onEditSchedule }) {
  const slots = buildTimeGridSlots();
  const [timelineScrollLeft, setTimelineScrollLeft] = useState(0);
  const dragScheduler = useScheduleDrag({ days, onScheduleMove, rowHeight: TRIP_TIME_GRID_ROW_HEIGHT });
  const gridStyle = {
    "--day-count": days.length,
    "--slot-count": slots.length,
    "--time-row-height": `${TRIP_TIME_GRID_ROW_HEIGHT}px`
  };

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
      </div>
      <div className="trip-time-grid-wrap" onScroll={(event) => setTimelineScrollLeft(event.currentTarget.scrollLeft)}>
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
              dropPreview={dragScheduler.getDropPreviewForDay(day.id)}
              onPointerDown={dragScheduler.handlePointerDown}
              onEditSchedule={onEditSchedule}
              shouldSuppressClick={dragScheduler.shouldSuppressClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TripTimeDayColumn({ day, columnIndex, draggedItemId, dropPreview, onPointerDown, onEditSchedule, shouldSuppressClick }) {
  const schedule = sortSchedule(day.schedule);

  return (
    <div className={`trip-time-day-column trip-day-theme-${((day.dayNumber - 1) % 6) + 1}`} data-drop-day-id={day.id} style={{ gridColumn: columnIndex }}>
      <DropSlotIndicator preview={dropPreview} />
      {schedule.map((item) => {
        const config = getCategoryConfig(item.category);
        const Icon = config.icon;
        const layout = getTimeGridEventLayout(item, TRIP_TIME_GRID_ROW_HEIGHT);
        const detail = getTripTimeEventDetail(item, day.city);

        return (
          <button
            className={`trip-time-event category-${config.className} ${layout.isClamped ? "is-clamped" : ""} ${draggedItemId === item.id ? "is-dragging" : ""}`}
            type="button"
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
          >
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
          </button>
        );
      })}
    </div>
  );
}

function IdeasSection({
  ideas,
  allIdeas,
  travelers,
  currentTravelerName,
  canVoteAllTravelers,
  isLocalPreview,
  ideaTab,
  categoryFilter,
  newIdea,
  onTabChange,
  onCategoryChange,
  onNewIdeaChange,
  onAddIdea,
  onEditIdea,
  onDeleteIdea,
  onVote,
  onPromote
}) {
  return (
    <section className="ideas-section" aria-label="Ideas and proposals">
      <div className="ideas-section-header">
        <div>
          <h1>Ideas</h1>
          <p>{allIdeas.length} saved</p>
        </div>
      </div>

      <div className="ideas-workspace">
        <form className="idea-form" onSubmit={onAddIdea}>
          <input
            value={newIdea.title}
            placeholder="New idea"
            aria-label="New idea title"
            onChange={(event) => onNewIdeaChange((current) => ({ ...current, title: event.target.value }))}
          />
          <div className="form-row">
            <select
              value={newIdea.category}
              aria-label="New idea category"
              onChange={(event) => onNewIdeaChange((current) => ({ ...current, category: event.target.value }))}
            >
              {CATEGORIES.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
            <input
              value={newIdea.city}
              placeholder="City or area"
              aria-label="New idea city"
              onChange={(event) => onNewIdeaChange((current) => ({ ...current, city: event.target.value }))}
            />
          </div>
          <div className="form-row">
            <select
              value={newIdea.status}
              aria-label="New idea status"
              onChange={(event) => onNewIdeaChange((current) => ({ ...current, status: event.target.value }))}
            >
              {STATUSES.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </div>
          <textarea
            value={newIdea.notes}
            placeholder="Why it sounds good"
            aria-label="New idea notes"
            onChange={(event) => onNewIdeaChange((current) => ({ ...current, notes: event.target.value }))}
          />
          <button className="primary-button full-width" type="submit">
            <Plus size={17} />
            Add
          </button>
        </form>

        <div className="ideas-browser">
          {!isLocalPreview && currentTravelerName ? (
            <div className="voting-identity-note">
              <Heart size={15} />
              Voting as <strong>{currentTravelerName}</strong>
            </div>
          ) : null}

          <div className="ideas-tabs">
            {FILTER_TABS.map((tab) => (
              <button className={ideaTab === tab ? "is-active" : ""} type="button" key={tab} onClick={() => onTabChange(tab)}>
                {tab}
                {tab === "Booked" ? <span>{countStatus(allIdeas, "Booked")}</span> : null}
                {tab === "Maybe" ? <span>{countStatus(allIdeas, "Maybe")}</span> : null}
              </button>
            ))}
          </div>

          <IdeaFilters activeCategory={categoryFilter} onChange={onCategoryChange} />

          <div className="idea-list">
            {ideas.map((idea) => (
              <IdeaRow
                idea={idea}
                key={idea.id}
                travelers={travelers}
                currentTravelerName={currentTravelerName}
                canVoteAllTravelers={canVoteAllTravelers}
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

function IdeaFilters({ activeCategory, onChange }) {
  return (
    <div className="category-filters" aria-label="Idea category filters">
      {CATEGORY_FILTERS.map((category) => {
        const config = category === "All" ? null : getCategoryConfig(category);
        const Icon = config?.icon ?? Filter;
        return (
          <button className={activeCategory === category ? "is-active" : ""} type="button" key={category} onClick={() => onChange(category)}>
            {config?.asset ? <TagIcon src={config.asset} size="chip" /> : <Icon size={17} />}
            {formatCategoryFilterLabel(category)}
          </button>
        );
      })}
    </div>
  );
}

function IdeaRow({ idea, travelers, currentTravelerName, canVoteAllTravelers, onEdit, onDelete, onVote, onPromote }) {
  const config = getCategoryConfig(idea.category);

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
            <TagIcon src={STATUS_ASSETS[idea.status]} size="tiny" />
            {idea.status}
          </span>
        </span>
      </button>
      <div className="idea-votes" aria-label={`${idea.title} traveler votes`}>
        {travelers.map((traveler) => {
          const vote = idea.votes?.[traveler] ?? "";
          const isLinkedTraveler = canVoteAllTravelers || currentTravelerName === traveler;
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
  newInvite,
  latestInviteUrl,
  pendingInvitations,
  onNewInviteChange,
  onSubmitInvite,
  onCopyInvite,
  onRevokeInvite,
  onClaimTraveler,
  onRefresh,
  onClose
}) {
  const availableInviteTravelers = collaboration.travelers.filter((traveler) => !traveler.profileId);
  const inviteTravelerOptions = availableInviteTravelers.length ? availableInviteTravelers : collaboration.travelers;
  const currentRole = formatRoleLabel(currentMember?.role ?? "editor");
  const currentTravelerLabel = currentTraveler?.name ?? "Not linked yet";

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog sharing-dialog people-dialog" role="dialog" aria-modal="true" aria-label="People">
        <DialogHeader title="People" onClose={onClose} />

        <section className="people-summary" aria-label="Your trip identity">
          <div>
            <span>You are planning as</span>
            <strong>{currentTravelerLabel}</strong>
            <small>{currentTraveler?.email || currentTraveler?.displayName || "Choose a traveler below"}</small>
          </div>
          <div>
            <span>Trip role</span>
            <strong>{currentRole}</strong>
            <small>{canManage ? "Can invite people" : "Can edit the planner"}</small>
          </div>
          <div>
            <span>Sync</span>
            <strong>{formatSyncStatus(syncStatus)}</strong>
            <small>{status === "loading" ? "Refreshing people" : "Shared through Supabase"}</small>
          </div>
        </section>

        <section className="sharing-section people-section">
          <div className="sharing-section-title">
            <div>
              <strong>Travelers</strong>
              <small>Pick who each signed-in person represents for voting.</small>
            </div>
            <button className="icon-button flat" type="button" aria-label="Refresh people" onClick={onRefresh}>
              <RefreshCcw size={16} />
            </button>
          </div>
          <div className="traveler-card-grid">
            {collaboration.travelers.map((traveler) => {
              const isCurrentUser = traveler.profileId === currentUserId;
              const canUseTraveler = !traveler.profileId || isCurrentUser;
              const accountLabel = traveler.email || (traveler.profileId ? traveler.displayName : "No account linked");
              return (
                <article className={`traveler-card${isCurrentUser ? " is-current-user" : ""}`} key={traveler.id}>
                  <div className="traveler-avatar" aria-hidden="true">{traveler.name.slice(0, 1)}</div>
                  <div className="traveler-card-main">
                    <h3>{traveler.name}</h3>
                    <p>{accountLabel}</p>
                    <div className="traveler-card-tags">
                      {isCurrentUser ? <span className="role-pill role-you">You</span> : null}
                      <span className={`role-pill ${traveler.profileId ? "role-linked" : "role-unlinked"}`}>
                        {traveler.profileId ? "Linked" : "Available"}
                      </span>
                      {isCurrentUser ? <span className="role-pill role-editor">Voting identity</span> : null}
                    </div>
                  </div>
                  {isCurrentUser ? (
                    <span className="traveler-card-action">Planning as you</span>
                  ) : (
                    <button className="ghost-button compact-action" type="button" disabled={!canUseTraveler} onClick={() => onClaimTraveler(traveler.id)}>
                      {traveler.profileId ? "Linked" : "Use this as me"}
                    </button>
                  )}
                </article>
              );
            })}
            {!collaboration.travelers.length ? <p className="empty-trip-list">No travelers loaded yet.</p> : null}
          </div>
        </section>

        {canManage ? (
          <section className="sharing-section invite-panel people-invite-panel">
            <div className="sharing-section-title">
              <div>
                <strong>Invite someone</strong>
                <small>They will join as an editor and vote as the traveler you choose.</small>
              </div>
            </div>
            <form className="invite-form" onSubmit={onSubmitInvite}>
              <label className="editor-field">
                Their email
                <input
                  type="email"
                  value={newInvite.email}
                  placeholder="wife@example.com"
                  onChange={(event) => onNewInviteChange((current) => ({ ...current, email: event.target.value }))}
                  required
                />
              </label>
              <label className="editor-field">
                They will plan as
                <select
                  value={newInvite.travelerId}
                  onChange={(event) => onNewInviteChange((current) => ({ ...current, travelerId: event.target.value }))}
                  required
                >
                  <option value="">Choose traveler</option>
                  {inviteTravelerOptions.map((traveler) => (
                    <option value={traveler.id} key={traveler.id}>
                      {traveler.name}{traveler.profileId ? " (linked)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary-button" type="submit" disabled={!newInvite.email.trim() || !newInvite.travelerId}>
                <UserPlus size={17} />
                Create invite link
              </button>
            </form>

            {latestInviteUrl ? (
              <div className="invite-link-box">
                <label className="editor-field">
                  Invite link
                  <input value={latestInviteUrl} readOnly onFocus={(event) => event.target.select()} />
                </label>
                <button className="ghost-button" type="button" onClick={onCopyInvite}>
                  <Copy size={17} />
                  Copy
                </button>
              </div>
            ) : null}

            <div className="sharing-list">
              <div className="sharing-section-title compact-title">
                <strong>Pending invites</strong>
              </div>
              {pendingInvitations.map((invite) => (
                <div className="sharing-row" key={invite.id}>
                  <span>
                    <strong>{invite.email}</strong>
                    <small>{getTravelerName(collaboration.travelers, invite.travelerId)} • expires {formatShortDate(invite.expiresAt)}</small>
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
              <strong>Account access</strong>
              <small>These signed-in accounts can open and edit this trip.</small>
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
            {!collaboration.members.length ? <p className="empty-trip-list">No account access loaded yet.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function PromoteIdeaModal({ promotion, days, onDayChange, onCancel, onContinue }) {
  const selectedDay = days.find((day) => day.id === promotion.dayId) ?? days[0];

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog promote-dialog" role="dialog" aria-modal="true" aria-label="Add idea as activity">
        <DialogHeader title="Add as activity" onClose={onCancel} />
        <div className="promote-summary">
          <TagIcon src={getCategoryConfig(promotion.idea.category).asset} size="chip" />
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

function EditScheduleModal({ payload, onCancel, onSave, onDelete }) {
  const [draft, setDraft] = useState({ ...DEFAULT_NEW_BLOCK, ...payload.item });
  const [showCost, setShowCost] = useState(Boolean(payload.item.cost));
  const mapPreview = getMapPreview(draft.mapLink);

  function updateDraft(changes) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  function handleSave() {
    onSave({
      ...draft,
      title: draft.title.trim() || "Untitled plan",
      city: draft.city.trim(),
      duration: Number(draft.duration) || 60,
      notes: draft.notes?.trim() ?? "",
      cost: showCost ? draft.cost?.trim() ?? "" : "",
      link: draft.link?.trim() ?? "",
      mapLink: draft.mapLink?.trim() ?? ""
    });
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog editor-dialog" role="dialog" aria-modal="true" aria-label={payload.mode === "new" ? "Add activity" : "Edit activity"}>
        <DialogHeader title={payload.mode === "new" ? "Add activity" : "Edit activity"} onClose={onCancel} />
        <div className="schedule-editor">
          <section className="editor-section editor-section-main" aria-label="Plan details">
            <p className="editor-section-title">Plan</p>
            <label className="editor-field editor-field-title">
              Title
              <input value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} placeholder="Coffee, train, temple visit..." />
            </label>
            <div className="editor-field-grid">
              <label className="editor-field">
                Time
                <input type="time" value={draft.start} onChange={(event) => updateDraft({ start: event.target.value })} />
              </label>
              <label className="editor-field">
                Duration
                <div className="duration-input">
                  <input min="15" step="15" type="number" value={draft.duration} onChange={(event) => updateDraft({ duration: Number(event.target.value) })} />
                  <span>min</span>
                </div>
              </label>
              <label className="editor-field">
                Category
                <select value={draft.category} onChange={(event) => updateDraft({ category: event.target.value })}>
                  {CATEGORIES.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className="editor-field">
                Location
                <input value={draft.city} onChange={(event) => updateDraft({ city: event.target.value })} placeholder="Kyoto, Shibuya, hotel area..." />
              </label>
            </div>
          </section>

          <section className="editor-section" aria-label="Map and links">
            <p className="editor-section-title">Map & Links</p>
            <label className="editor-field">
              Google Maps link
              <input type="url" value={draft.mapLink ?? ""} onChange={(event) => updateDraft({ mapLink: event.target.value })} placeholder="Paste a Google Maps place or directions link" />
            </label>
            {mapPreview ? <MapPreview preview={mapPreview} /> : null}
            <label className="editor-field">
              Website / booking link
              <input type="url" value={draft.link ?? ""} onChange={(event) => updateDraft({ link: event.target.value })} placeholder="Restaurant, hotel, ticket, or website link" />
            </label>
          </section>

          <section className="editor-section editor-section-support" aria-label="Optional details">
            <p className="editor-section-title">Details</p>
            <div className="editor-field-grid">
              <label className="editor-field">
                Status
                <select value={draft.status} onChange={(event) => updateDraft({ status: event.target.value })}>
                  {STATUSES.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label className="cost-toggle">
                <span>
                  <strong>Add cost</strong>
                  <small>Optional estimate</small>
                </span>
                <input
                  type="checkbox"
                  checked={showCost}
                  onChange={(event) => {
                    setShowCost(event.target.checked);
                    if (!event.target.checked) {
                      updateDraft({ cost: "" });
                    }
                  }}
                />
              </label>
              {showCost ? (
                <label className="editor-field">
                  Cost
                  <input value={draft.cost ?? ""} onChange={(event) => updateDraft({ cost: event.target.value })} placeholder="$40, ¥5000, TBD..." />
                </label>
              ) : null}
            </div>
            <label className="editor-field">
              Notes
              <textarea value={draft.notes ?? ""} onChange={(event) => updateDraft({ notes: event.target.value })} placeholder="Private planning notes, reservation details, reminders..." />
            </label>
          </section>
        </div>
        <div className="dialog-actions">
          {payload.mode === "edit" ? (
            <button className="ghost-button danger" type="button" onClick={onDelete}>
              <Trash2 size={17} />
              Delete
            </button>
          ) : null}
          <button className="ghost-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-button" type="button" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function MapPreview({ preview }) {
  return (
    <div className={`map-preview-card${preview.isInvalid ? " is-invalid" : ""}`}>
      <div className="map-preview-thumb" aria-hidden="true">
        <MapPin size={24} />
      </div>
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
  );
}

function EditIdeaModal({ idea, onCancel, onSave, onDelete }) {
  const [draft, setDraft] = useState(idea);

  function updateDraft(changes) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog editor-dialog" role="dialog" aria-modal="true" aria-label="Edit idea">
        <DialogHeader title="Edit idea" onClose={onCancel} />
        <FormGrid>
          <label>
            Title
            <input value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} />
          </label>
          <label>
            Status
            <select value={draft.status} onChange={(event) => updateDraft({ status: event.target.value })}>
              {STATUSES.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select value={draft.category} onChange={(event) => updateDraft({ category: event.target.value })}>
              {CATEGORIES.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            City
            <input value={draft.city} onChange={(event) => updateDraft({ city: event.target.value })} />
          </label>
          <label>
            Cost
            <input value={draft.cost ?? ""} onChange={(event) => updateDraft({ cost: event.target.value })} />
          </label>
          <label className="span-two">
            Notes
            <textarea value={draft.notes} onChange={(event) => updateDraft({ notes: event.target.value })} />
          </label>
          <label className="span-two">
            Link
            <input value={draft.link ?? ""} onChange={(event) => updateDraft({ link: event.target.value })} />
          </label>
        </FormGrid>
        <div className="dialog-actions">
          <button className="ghost-button danger" type="button" onClick={onDelete}>
            <Trash2 size={17} />
            Delete
          </button>
          <button className="ghost-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-button" type="button" onClick={() => onSave(draft)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function EditDayModal({ day, canDelete, onCancel, onSave, onDelete }) {
  const [draft, setDraft] = useState({
    ...day,
    label: day.label ?? "",
    notes: day.notes ?? ""
  });

  function updateDraft(changes) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog editor-dialog" role="dialog" aria-modal="true" aria-label="Day settings">
        <DialogHeader title="Day settings" onClose={onCancel} />
        <FormGrid>
          <label>
            Label
            <input value={draft.label} placeholder={`Day ${day.dayNumber}`} onChange={(event) => updateDraft({ label: event.target.value })} />
          </label>
          <label>
            Date
            <input type="date" value={draft.date} onChange={(event) => updateDraft({ date: event.target.value })} />
          </label>
          <label className="span-two">
            City or Area
            <input value={draft.city} onChange={(event) => updateDraft({ city: event.target.value })} />
          </label>
          <label className="span-two">
            Notes
            <textarea value={draft.notes} onChange={(event) => updateDraft({ notes: event.target.value })} />
          </label>
        </FormGrid>
        <div className="dialog-actions">
          <button className="ghost-button danger" type="button" disabled={!canDelete} onClick={onDelete}>
            <Trash2 size={17} />
            Remove Day
          </button>
          <button className="ghost-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-button" type="button" onClick={() => onSave(draft)}>
            Save Day
          </button>
        </div>
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

function getMapPreview(link) {
  const trimmedLink = link?.trim();
  if (!trimmedLink) {
    return null;
  }

  try {
    const url = new URL(trimmedLink);
    const host = url.hostname.replace(/^www\./, "");
    const isGoogleMap = host.includes("google.") || host === "maps.app.goo.gl" || host.includes("goo.gl");

    return {
      href: url.href,
      title: isGoogleMap ? "Google Maps saved" : "Map link saved",
      detail: isGoogleMap ? "Open the saved place or route when you need it." : host
    };
  } catch {
    return {
      href: "",
      title: "Check map link",
      detail: "Paste a full URL like https://maps.google.com/..."
    };
  }
}

function FormGrid({ children }) {
  return <div className="form-grid">{children}</div>;
}

function TravelStrip() {
  return (
    <div className="travel-strip" aria-hidden="true">
      <img src="./assets/japan-footer-strip.png" alt="" />
    </div>
  );
}

function getCategoryConfig(category) {
  return CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG["Open Time"];
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
    editor: "Editor"
  };

  return labels[role] ?? "Editor";
}

function getDayStats(day) {
  if (!day) {
    return { plannedMinutes: 0, openMinutes: DAY_MINUTES };
  }
  const plannedMinutes = day.schedule
    .filter((item) => item.status !== "Skipped")
    .reduce((total, item) => total + Number(item.duration || 0), 0);
  return {
    plannedMinutes,
    openMinutes: Math.max(0, DAY_MINUTES - plannedMinutes)
  };
}

function sortSchedule(schedule) {
  return [...(schedule ?? [])].sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));
}

function deriveTripDays(days) {
  return [...(days ?? [])]
    .map((day, index) => ({
      ...day,
      id: day.id ?? `day-${index}`,
      date: day.date ?? "2026-09-25",
      label: day.label ?? "",
      city: day.city ?? "Japan",
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
  const duration = Math.max(TIME_GRID_STEP_MINUTES, Number(durationMinutes) || TIME_GRID_STEP_MINUTES);
  const end = start + duration;
  const clampedStart = Math.min(Math.max(start, TIME_GRID_START_MINUTES), TIME_GRID_END_MINUTES - TIME_GRID_STEP_MINUTES);
  const clampedEnd = Math.min(Math.max(end, clampedStart + TIME_GRID_STEP_MINUTES), TIME_GRID_END_MINUTES);
  const rowStart = (clampedStart - TIME_GRID_START_MINUTES) / TIME_GRID_STEP_MINUTES;
  const rowSpan = Math.max(1, (clampedEnd - clampedStart) / TIME_GRID_STEP_MINUTES);

  return {
    top: `${rowStart * rowHeight}px`,
    height: `${Math.max(rowHeight - 6, rowSpan * rowHeight - 6)}px`,
    isClamped: start !== clampedStart || end !== clampedEnd
  };
}

function getTripTimeEventDetail(item, dayCity = "") {
  const duration = Number(item.duration) || TIME_GRID_STEP_MINUTES;
  const description = duration >= 45 ? (item.notes ?? "").trim() : "";
  const itemCity = (item.city ?? "").trim();
  const normalizedDayCity = dayCity.trim().toLowerCase();
  const meta = [];

  if (duration >= 90) {
    meta.push({ key: "duration", label: formatDuration(duration), asset: TAG_ASSETS.meta.calendar });
    if (itemCity && itemCity.toLowerCase() !== normalizedDayCity) {
      meta.push({ key: "location", label: itemCity, asset: TAG_ASSETS.meta.map });
    }
  }

  return { description, meta };
}

function getScheduleEventDetail(item, dayCity = "") {
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
    chips.push({ key: "duration", label: formatDuration(duration), title: "Duration", asset: TAG_ASSETS.meta.calendar });
  }

  if (shouldShowLocation) {
    chips.push({ key: "location", label: itemCity, title: "Location", asset: TAG_ASSETS.meta.map });
  }

  if (cost) {
    chips.push({ key: "cost", label: cost, title: "Cost", asset: TAG_ASSETS.meta.budget });
  }

  if (hasMap) {
    chips.push({ key: "map", label: "Map", title: "Map link saved", asset: TAG_ASSETS.meta.map });
  }

  if (hasLink) {
    chips.push({ key: "link", label: "Link", title: "Website or booking link saved", asset: TAG_ASSETS.meta.link });
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

function minutesToTimeInput(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function isScheduleSlotAvailable(schedule, movingItemId, targetStart, durationMinutes) {
  const start = parseTimeToMinutes(targetStart);
  const duration = Math.max(TIME_GRID_STEP_MINUTES, Number(durationMinutes) || TIME_GRID_STEP_MINUTES);
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
  return first.dayId === second.dayId && first.start === second.start && first.isAvailable === second.isAvailable;
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
