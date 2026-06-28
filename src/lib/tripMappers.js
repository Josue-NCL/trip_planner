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
      mapLink: item.map_link,
      place: mapPlaceFromRow(item)
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
      baseMapLink: day.base_map_link ?? "",
      basePlace: mapBasePlaceFromRow(day),
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
      place: mapPlaceFromRow(idea),
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
    notes: day.notes ?? "",
    base_map_link: day.baseMapLink ?? "",
    ...mapBasePlaceToRow(day.basePlace)
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
        ...mapPlaceToRow(item.place),
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
    ...mapPlaceToRow(idea.place),
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

function mapPlaceFromRow(row) {
  if (!row.place_id && row.latitude == null && row.longitude == null && !row.place_name && !row.formatted_address) {
    return null;
  }

  return {
    id: row.place_id ?? "",
    name: row.place_name ?? "",
    formattedAddress: row.formatted_address ?? "",
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    googleMapsUri: row.google_maps_uri ?? "",
    resolvedAt: row.place_resolved_at ?? ""
  };
}

function mapBasePlaceFromRow(row) {
  if (!row.base_place_id && row.base_latitude == null && row.base_longitude == null && !row.base_place_name && !row.base_formatted_address) {
    return null;
  }

  return {
    id: row.base_place_id ?? "",
    name: row.base_place_name ?? "",
    formattedAddress: row.base_formatted_address ?? "",
    latitude: row.base_latitude ?? null,
    longitude: row.base_longitude ?? null,
    googleMapsUri: row.base_google_maps_uri ?? "",
    resolvedAt: row.base_place_resolved_at ?? ""
  };
}

function mapPlaceToRow(place) {
  return {
    place_id: place?.id ?? null,
    place_name: place?.name ?? null,
    formatted_address: place?.formattedAddress ?? null,
    latitude: place?.latitude ?? null,
    longitude: place?.longitude ?? null,
    google_maps_uri: place?.googleMapsUri ?? null,
    place_resolved_at: place?.resolvedAt ?? null
  };
}

function mapBasePlaceToRow(place) {
  return {
    base_place_id: place?.id ?? null,
    base_place_name: place?.name ?? null,
    base_formatted_address: place?.formattedAddress ?? null,
    base_latitude: place?.latitude ?? null,
    base_longitude: place?.longitude ?? null,
    base_google_maps_uri: place?.googleMapsUri ?? null,
    base_place_resolved_at: place?.resolvedAt ?? null
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
