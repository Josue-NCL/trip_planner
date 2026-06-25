import { requireSupabase, supabase } from "./supabaseClient.js";
import { buildTripRows, mapRowsToTrip, travelerClientId } from "./tripMappers.js";

const REALTIME_TABLES = ["trips", "trip_members", "trip_travelers", "trip_days", "schedule_items", "ideas", "idea_votes"];

export async function listTrips(profileId) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("trips")
    .select("id, name, date_range_label, updated_at, trip_members(role, profile_id)")
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((trip) => {
    const membership = trip.trip_members?.find((member) => member.profile_id === profileId) ?? trip.trip_members?.[0];
    return {
      id: trip.id,
      name: trip.name,
      dateRangeLabel: trip.date_range_label,
      updatedAt: trip.updated_at,
      role: membership?.role ?? "editor"
    };
  });
}

export async function loadRemoteTrip(tripId) {
  const client = requireSupabase();
  const { data: trip, error: tripError } = await client.from("trips").select("*").eq("id", tripId).single();
  if (tripError) {
    throw tripError;
  }

  const [travelersResult, daysResult, ideasResult] = await Promise.all([
    client.from("trip_travelers").select("*").eq("trip_id", tripId).order("sort_order"),
    client.from("trip_days").select("*").eq("trip_id", tripId).order("day_number"),
    client.from("ideas").select("*").eq("trip_id", tripId).order("sort_order")
  ]);

  throwIfError(travelersResult.error);
  throwIfError(daysResult.error);
  throwIfError(ideasResult.error);

  const dayIds = (daysResult.data ?? []).map((day) => day.id);
  const ideaIds = (ideasResult.data ?? []).map((idea) => idea.id);

  const [scheduleResult, votesResult] = await Promise.all([
    dayIds.length
      ? client.from("schedule_items").select("*").in("trip_day_id", dayIds).order("sort_order")
      : Promise.resolve({ data: [], error: null }),
    ideaIds.length
      ? client.from("idea_votes").select("*").in("idea_id", ideaIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  throwIfError(scheduleResult.error);
  throwIfError(votesResult.error);

  return mapRowsToTrip({
    trip,
    travelers: travelersResult.data,
    days: daysResult.data,
    scheduleItems: scheduleResult.data,
    ideas: ideasResult.data,
    votes: votesResult.data
  });
}

export async function createTripFromPayload(payload, ownerId) {
  const client = requireSupabase();
  const rows = buildTripRows(null, payload);
  const { data: trip, error: tripError } = await client
    .from("trips")
    .insert({
      owner_id: ownerId,
      name: rows.trip.name,
      date_range_label: rows.trip.date_range_label,
      schema_version: rows.trip.schema_version
    })
    .select("id")
    .single();

  if (tripError) {
    throw tripError;
  }

  const { error: memberError } = await client.from("trip_members").insert({
    trip_id: trip.id,
    profile_id: ownerId,
    role: "owner"
  });

  if (memberError) {
    throw memberError;
  }

  await replaceTripPayload(trip.id, payload);
  return trip.id;
}

export async function replaceTripPayload(tripId, payload) {
  const client = requireSupabase();
  const rows = buildTripRows(tripId, payload);

  const { error: tripError } = await client
    .from("trips")
    .update(rows.trip)
    .eq("id", tripId);
  throwIfError(tripError);

  const { data: existingDays, error: daysReadError } = await client.from("trip_days").select("id").eq("trip_id", tripId);
  throwIfError(daysReadError);
  const { data: existingIdeas, error: ideasReadError } = await client.from("ideas").select("id").eq("trip_id", tripId);
  throwIfError(ideasReadError);

  const dayIds = (existingDays ?? []).map((day) => day.id);
  const ideaIds = (existingIdeas ?? []).map((idea) => idea.id);

  if (ideaIds.length) {
    throwIfError((await client.from("idea_votes").delete().in("idea_id", ideaIds)).error);
  }
  if (dayIds.length) {
    throwIfError((await client.from("schedule_items").delete().in("trip_day_id", dayIds)).error);
  }

  throwIfError((await client.from("ideas").delete().eq("trip_id", tripId)).error);
  throwIfError((await client.from("trip_travelers").delete().eq("trip_id", tripId)).error);
  throwIfError((await client.from("trip_days").delete().eq("trip_id", tripId)).error);

  const travelerRows = await insertRows("trip_travelers", rows.travelers);
  const dayRows = await insertRows("trip_days", rows.days);

  const dayIdByClientId = new Map(dayRows.map((day) => [day.client_id, day.id]));
  const scheduleRows = rows.scheduleItems
    .map(({ day_client_id, ...item }) => ({
      ...item,
      trip_day_id: dayIdByClientId.get(day_client_id)
    }))
    .filter((item) => item.trip_day_id);
  await insertRows("schedule_items", scheduleRows);

  const ideaRows = await insertRows(
    "ideas",
    rows.ideas.map(({ votes: _votes, ...idea }) => idea)
  );

  const travelerIdByName = new Map(travelerRows.map((traveler) => [traveler.name, traveler.id]));
  const travelerIdByClientId = new Map(travelerRows.map((traveler) => [traveler.client_id, traveler.id]));
  const ideaIdByClientId = new Map(ideaRows.map((idea) => [idea.client_id, idea.id]));
  const voteRows = rows.ideas.flatMap((idea) => {
    const ideaId = ideaIdByClientId.get(idea.client_id);
    if (!ideaId) {
      return [];
    }

    return Object.entries(idea.votes ?? {})
      .filter(([, vote]) => Boolean(vote))
      .map(([travelerName, vote]) => ({
        idea_id: ideaId,
        traveler_id: travelerIdByName.get(travelerName) ?? travelerIdByClientId.get(travelerClientId(travelerName)),
        vote
      }))
      .filter((vote) => vote.traveler_id);
  });

  await insertRows("idea_votes", voteRows);
}

export function subscribeToTripChanges(tripId, onChange) {
  if (!supabase || !tripId) {
    return () => {};
  }

  let channel = supabase.channel(`trip-${tripId}`);
  REALTIME_TABLES.forEach((table) => {
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
  });
  channel.subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

async function insertRows(table, rows) {
  if (!rows.length) {
    return [];
  }

  const client = requireSupabase();
  const { data, error } = await client.from(table).insert(rows).select("*");
  if (error) {
    throw error;
  }

  return data ?? [];
}

function throwIfError(error) {
  if (error) {
    throw error;
  }
}
