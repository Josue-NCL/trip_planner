import { requireSupabase, supabase } from "./supabaseClient.js";
import { buildTripRows, mapRowsToTrip } from "./tripMappers.js";

const REALTIME_TABLES = ["trips", "trip_members", "trip_travelers", "trip_days", "schedule_items", "ideas", "idea_votes", "trip_invitations"];

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

export async function createTripFromPayload(payload, ownerId, ownerName = "") {
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
  await linkOwnerTraveler(trip.id, ownerId, ownerName);
  return trip.id;
}

export async function deleteTrip({ tripId, ownerId, expectedName }) {
  const normalizedName = String(expectedName ?? "").trim();
  if (!tripId || !ownerId || !normalizedName) {
    throw new Error("The trip delete request is missing its safety checks.");
  }

  const client = requireSupabase();
  const { data, error } = await client
    .from("trips")
    .delete()
    .eq("id", tripId)
    .eq("owner_id", ownerId)
    .eq("name", normalizedName)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data?.id) {
    throw new Error("The trip could not be deleted. Only its owner can delete it.");
  }

  return data.id;
}

export async function replaceTripPayload(tripId, payload) {
  const client = requireSupabase();
  const rows = buildTripRows(tripId, payload);

  const { error } = await client.rpc("replace_trip_payload", {
    target_trip_id: tripId,
    payload: rows
  });
  throwIfError(error);
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

async function linkOwnerTraveler(tripId, ownerId, ownerName = "") {
  const client = requireSupabase();
  const { data: travelers, error: travelersError } = await client
    .from("trip_travelers")
    .select("id, name, profile_id, sort_order")
    .eq("trip_id", tripId)
    .order("sort_order");
  throwIfError(travelersError);

  const targetTraveler = findPreferredOwnerTraveler(travelers ?? [], ownerId);
  if (!targetTraveler) {
    return;
  }

  const { error } = await client
    .from("trip_travelers")
    .update({
      profile_id: ownerId,
      ...(shouldReplaceGenericTravelerName(targetTraveler.name, ownerName) ? { name: ownerName.trim() } : {})
    })
    .eq("id", targetTraveler.id);
  throwIfError(error);

  const { error: votesError } = await client
    .from("idea_votes")
    .update({ profile_id: ownerId })
    .eq("traveler_id", targetTraveler.id)
    .is("profile_id", null);
  throwIfError(votesError);
}

function shouldReplaceGenericTravelerName(currentName, nextName) {
  const current = String(currentName ?? "").trim().toLowerCase();
  const next = String(nextName ?? "").trim();
  return Boolean(next) && ["me", "traveler"].includes(current) && next.toLowerCase() !== current;
}

function findPreferredOwnerTraveler(travelers, ownerId) {
  const availableTravelers = travelers.filter((traveler) => !traveler.profile_id || traveler.profile_id === ownerId);
  return (
    availableTravelers.find((traveler) => String(traveler.name ?? "").trim().toLowerCase() === "me") ??
    availableTravelers[0] ??
    null
  );
}

function throwIfError(error) {
  if (error) {
    throw error;
  }
}
