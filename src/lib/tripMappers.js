import { TRIP_VERSION } from "../data/tripData.js";

export function mapRowsToTrip({ trip, travelers = [], days = [], scheduleItems = [], ideas = [], votes = [] }) {
  const travelerRows = [...travelers].sort(sortByOrderThenName);
  const travelerNames = travelerRows.map((traveler) => traveler.name);
  const travelerNameById = new Map(travelerRows.map((traveler) => [String(traveler.id), traveler.name]));
  const votesByIdeaId = new Map();

  votes.forEach((vote) => {
    const travelerName = travelerNameById.get(String(vote.traveler_id));
    if (!travelerName || !vote.vote) {
      return;
    }

    const ideaVotes = votesByIdeaId.get(String(vote.idea_id)) ?? {};
    ideaVotes[travelerName] = vote.vote;
    votesByIdeaId.set(String(vote.idea_id), ideaVotes);
  });

  const scheduleByDayId = new Map();
  scheduleItems.forEach((item) => {
    const row = {
      id: item.client_id,
      title: item.title,
      category: item.category,
      city: item.city,
      start: normalizeTime(item.start_time),
      duration: item.duration_minutes,
      status: item.status,
      notes: item.notes,
      cost: item.cost,
      link: item.link,
      mapLink: item.map_link
    };
    const dayItems = scheduleByDayId.get(String(item.trip_day_id)) ?? [];
    dayItems.push(row);
    scheduleByDayId.set(String(item.trip_day_id), dayItems);
  });

  return {
    version: trip.schema_version ?? TRIP_VERSION,
    name: trip.name,
    dateRangeLabel: trip.date_range_label ?? "",
    travelers: travelerNames,
    days: [...days].sort((a, b) => a.day_number - b.day_number).map((day) => ({
      id: day.client_id,
      date: day.trip_date,
      dayNumber: day.day_number,
      city: day.city,
      notes: day.notes,
      schedule: (scheduleByDayId.get(String(day.id)) ?? []).sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""))
    })),
    ideas: [...ideas].sort((a, b) => a.sort_order - b.sort_order).map((idea) => ({
      id: idea.client_id,
      title: idea.title,
      category: idea.category,
      city: idea.city,
      duration: idea.duration_minutes,
      status: idea.status,
      notes: idea.notes,
      cost: idea.cost,
      link: idea.link,
      mapLink: idea.map_link,
      imageKey: idea.image_key,
      votes: {
        ...Object.fromEntries(travelerNames.map((name) => [name, ""])),
        ...(votesByIdeaId.get(String(idea.id)) ?? {})
      }
    })),
    updatedAt: trip.updated_at
  };
}

export function buildTripRows(tripId, trip) {
  const travelers = normalizeTravelerNames(trip.travelers).map((name, index) => ({
    trip_id: tripId,
    client_id: travelerClientId(name),
    name,
    sort_order: index
  }));

  const days = (trip.days ?? []).map((day, index) => ({
    trip_id: tripId,
    client_id: String(day.id ?? day.date ?? `day-${index}`),
    trip_date: day.date,
    day_number: index + 1,
    city: day.city ?? "",
    notes: day.notes ?? ""
  }));

  const scheduleItems = [];
  (trip.days ?? []).forEach((day) => {
    (day.schedule ?? []).forEach((item, index) => {
      scheduleItems.push({
        day_client_id: String(day.id ?? day.date),
        client_id: String(item.id ?? `schedule-${Date.now()}-${index}`),
        title: item.title?.trim() || "Untitled plan",
        category: item.category || "Open Time",
        city: item.city ?? day.city ?? "",
        start_time: item.start || "10:00",
        duration_minutes: Number(item.duration) || 60,
        status: item.status || "Proposed",
        notes: item.notes ?? "",
        cost: item.cost ?? "",
        link: item.link ?? "",
        map_link: item.mapLink ?? "",
        sort_order: index
      });
    });
  });

  const ideas = (trip.ideas ?? []).map((idea, index) => ({
    trip_id: tripId,
    client_id: String(idea.id ?? `idea-${Date.now()}-${index}`),
    title: idea.title?.trim() || "Untitled idea",
    category: idea.category || "Culture",
    city: idea.city ?? "",
    duration_minutes: Number(idea.duration) || 60,
    status: idea.status || "Proposed",
    notes: idea.notes ?? "",
    cost: idea.cost ?? "",
    link: idea.link ?? "",
    map_link: idea.mapLink ?? "",
    image_key: idea.imageKey ?? "",
    sort_order: index,
    votes: idea.votes ?? {}
  }));

  return {
    trip: {
      name: trip.name?.trim() || "Untitled trip",
      date_range_label: trip.dateRangeLabel ?? "",
      schema_version: trip.version ?? TRIP_VERSION
    },
    travelers,
    days,
    scheduleItems,
    ideas
  };
}

export function travelerClientId(name) {
  return `traveler-${String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "guest"}`;
}

function normalizeTime(value) {
  return String(value ?? "").slice(0, 5);
}

function normalizeTravelerNames(names) {
  const seen = new Set();
  return (names ?? [])
    .map((name) => String(name).trim())
    .filter((name) => {
      if (!name || seen.has(name)) {
        return false;
      }
      seen.add(name);
      return true;
    });
}

function sortByOrderThenName(a, b) {
  return (a.sort_order - b.sort_order) || a.name.localeCompare(b.name);
}
