const HOTEL_CATEGORY = "Hotel";

export function createNewTripDayDraft(days = [], { createId = () => `day-${Date.now()}`, today = todayDate() } = {}) {
  const orderedDays = sortDaysByDate(days);
  const lastDay = orderedDays.at(-1);
  return {
    id: createId(),
    dayNumber: orderedDays.length + 1,
    date: addDateDays(lastDay?.date || today, 1),
    label: "",
    city: lastDay?.city ?? "",
    notes: "",
    baseMapLink: "",
    basePlace: null,
    schedule: []
  };
}

export function commitNewTripDay(trip, dayDraft) {
  return {
    ...trip,
    days: sortDaysByDate([...(trip.days ?? []), { ...dayDraft, schedule: dayDraft.schedule ?? [] }])
  };
}

export function removeTripDayToIdeas(trip, dayId, { createIdeaId = defaultIdeaId } = {}) {
  const days = sortDaysByDate(trip.days ?? []);
  if (days.length <= 1) {
    return { trip, removed: false, movedCount: 0, expenseSourceMappings: [], nextDayId: days[0]?.id ?? "" };
  }

  const removedIndex = days.findIndex((day) => day.id === dayId);
  if (removedIndex < 0) {
    return { trip, removed: false, movedCount: 0, expenseSourceMappings: [], nextDayId: "" };
  }

  const removedDay = days[removedIndex];
  const remainingDays = days.filter((day) => day.id !== dayId);
  const nextDay = remainingDays[Math.min(removedIndex, remainingDays.length - 1)];
  const movedIdeas = (removedDay.schedule ?? []).map((item, index) => scheduleItemToIdea(
    item,
    removedDay,
    days,
    trip.travelers ?? [],
    createIdeaId(item, index)
  ));
  const expenseSourceMappings = (removedDay.schedule ?? []).map((item, index) => ({
    scheduleItemId: item.id,
    ideaId: movedIdeas[index].id
  }));

  const repairedDays = remainingDays.map((day) => ({
    ...day,
    schedule: (day.schedule ?? []).map((item) => repairStayDayReferences(item, day.id, dayId, removedIndex, remainingDays))
  }));

  return {
    trip: {
      ...trip,
      days: repairedDays,
      ideas: [...movedIdeas, ...(trip.ideas ?? [])]
    },
    removed: true,
    movedCount: movedIdeas.length,
    expenseSourceMappings,
    nextDayId: nextDay?.id ?? remainingDays[0]?.id ?? ""
  };
}

function scheduleItemToIdea(item, sourceDay, days, travelers, ideaId) {
  const context = buildPriorScheduleContext(item, sourceDay, days);
  return {
    id: ideaId,
    title: item.title?.trim() || "Untitled idea",
    category: item.category || "Open Time",
    city: item.city || sourceDay.city || "",
    duration: Number(item.duration) || 60,
    status: item.status || "Proposed",
    notes: [item.notes?.trim(), context].filter(Boolean).join("\n\n"),
    cost: item.cost ?? "",
    link: item.link ?? "",
    mapLink: item.mapLink ?? "",
    place: item.place ?? null,
    imageKey: "",
    reactions: Object.fromEntries(travelers.map((name) => [name, ""]))
  };
}

function buildPriorScheduleContext(item, sourceDay, days) {
  if (isStayItem(item)) {
    const startDay = days.find((day) => day.id === (item.stayStartDayId || sourceDay.id)) ?? sourceDay;
    const endDay = days.find((day) => day.id === (item.stayEndDayId || item.stayStartDayId || sourceDay.id)) ?? startDay;
    return `Previously scheduled: ${formatShortDate(startDay.date)} - ${formatShortDate(endDay.date)}, check-in ${formatTime(item.checkInTime || "15:00")}, check-out ${formatTime(item.checkOutTime || "11:00")}.`;
  }
  return `Previously scheduled: Day ${sourceDay.dayNumber ?? ""} - ${formatShortDate(sourceDay.date)}, ${formatTime(item.start)}.`;
}

function repairStayDayReferences(item, sourceDayId, removedDayId, removedIndex, remainingDays) {
  if (!isStayItem(item) || (item.stayStartDayId !== removedDayId && item.stayEndDayId !== removedDayId)) {
    return item;
  }

  const nextStartDayId = item.stayStartDayId === removedDayId
    ? remainingDays[Math.min(removedIndex, remainingDays.length - 1)]?.id ?? sourceDayId
    : item.stayStartDayId || sourceDayId;
  const nextEndDayId = item.stayEndDayId === removedDayId
    ? remainingDays[Math.max(0, removedIndex - 1)]?.id ?? nextStartDayId
    : item.stayEndDayId || nextStartDayId;
  const startIndex = Math.max(0, remainingDays.findIndex((day) => day.id === nextStartDayId));
  const endIndex = Math.max(0, remainingDays.findIndex((day) => day.id === nextEndDayId));

  return {
    ...item,
    stayStartDayId: remainingDays[Math.min(startIndex, endIndex)]?.id ?? sourceDayId,
    stayEndDayId: remainingDays[Math.max(startIndex, endIndex)]?.id ?? sourceDayId
  };
}

function isStayItem(item) {
  return item?.itemKind === "stay"
    || item?.category === HOTEL_CATEGORY
    || Boolean(item?.stayStartDayId || item?.stayEndDayId || item?.checkInTime || item?.checkOutTime);
}

function sortDaysByDate(days) {
  return [...days].sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
}

function addDateDays(date, amount) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatShortDate(date) {
  if (!date) return "No date";
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(parsed);
}

function formatTime(value) {
  if (!value) return "No time";
  const [hoursValue, minutesValue = "00"] = String(value).split(":");
  const hours = Number(hoursValue);
  if (!Number.isFinite(hours)) return value;
  const suffix = hours >= 12 ? "PM" : "AM";
  const normalizedHours = hours % 12 || 12;
  return `${normalizedHours}:${minutesValue} ${suffix}`;
}

function defaultIdeaId(item, index) {
  return `idea-${item.id}-${Date.now()}-${index}`;
}
