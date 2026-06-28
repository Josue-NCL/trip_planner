import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { buildGoogleDirectionsUrl, computeRouteMatrix, type RouteStop } from "../_shared/googleMaps.ts";

type RouteDayRequest = {
  tripId?: number;
  dayClientId?: string;
  ideaClientIds?: string[];
  travelMode?: "TRANSIT" | "WALK" | "DRIVE";
  returnToBase?: boolean;
};

type MatrixEntry = {
  originIndex?: number;
  destinationIndex?: number;
  duration?: string;
  distanceMeters?: number;
  status?: { code?: number; message?: string };
  condition?: string;
};

type RouteInput =
  | {
    status: "ok";
    stops: RouteStop[];
    scheduledStopIds: string[];
    ideaStopIds: string[];
    warnings: string[];
    missing: Array<Record<string, unknown>>;
  }
  | {
    status: "needs_place_data";
    warnings: string[];
    missing: Array<Record<string, unknown>>;
  };

type TripDayRow = {
  id: number;
  client_id: string;
  city: string;
  base_place_name: string | null;
  base_latitude: number | null;
  base_longitude: number | null;
};

type PlaceRow = {
  client_id: string;
  title: string;
  latitude: number | null;
  longitude: number | null;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorResponse("Use POST for this function.", 405, "method_not_allowed");
  }

  try {
    const payload = await request.json() as RouteDayRequest;
    const validationError = validatePayload(payload);
    if (validationError) {
      return errorResponse(validationError, 400, "invalid_request");
    }

    const apiKey = Deno.env.get("GOOGLE_MAPS_SERVER_KEY");
    if (!apiKey) {
      return errorResponse("GOOGLE_MAPS_SERVER_KEY is not configured in Supabase secrets.", 500, "missing_google_key");
    }

    const supabase = createUserSupabaseClient(request);
    const { data: userResult, error: userError } = await supabase.auth.getUser();
    if (userError || !userResult.user) {
      return errorResponse("Sign in before routing a day.", 401, "not_authenticated");
    }

    const routeInput = await loadRouteInput(supabase, payload as Required<Pick<RouteDayRequest, "tripId" | "dayClientId">> & RouteDayRequest);
    if (routeInput.status !== "ok") {
      return jsonResponse(routeInput);
    }

    const matrix = await computeRouteMatrix(apiKey, routeInput.stops, payload.travelMode ?? "TRANSIT") as MatrixEntry[];
    const matrixLookup = buildMatrixLookup(matrix);
    const recommendation = buildRecommendation({
      stops: routeInput.stops,
      scheduledStopIds: routeInput.scheduledStopIds,
      ideaStopIds: routeInput.ideaStopIds,
      matrixLookup,
      returnToBase: payload.returnToBase ?? true,
      warnings: routeInput.warnings
    });

    return jsonResponse({
      status: "ok",
      travelMode: payload.travelMode ?? "TRANSIT",
      base: routeInput.stops[0],
      ...recommendation
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not build this route.", 500, "route_failed");
  }
});

function validatePayload(payload: RouteDayRequest) {
  if (!payload.tripId || !Number.isFinite(Number(payload.tripId))) {
    return "tripId is required.";
  }
  if (!payload.dayClientId?.trim()) {
    return "dayClientId is required.";
  }
  if (payload.travelMode && !["TRANSIT", "WALK", "DRIVE"].includes(payload.travelMode)) {
    return "travelMode must be TRANSIT, WALK, or DRIVE.";
  }
  return "";
}

function createUserSupabaseClient(request: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase function environment is missing SUPABASE_URL or SUPABASE_ANON_KEY.");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: request.headers.get("Authorization") ?? ""
      }
    }
  });
}

async function loadRouteInput(supabase: ReturnType<typeof createClient<any>>, payload: Required<Pick<RouteDayRequest, "tripId" | "dayClientId">> & RouteDayRequest): Promise<RouteInput> {
  const warnings: string[] = [];
  const { data: day, error: dayError } = await supabase
    .from("trip_days")
    .select("*")
    .eq("trip_id", payload.tripId)
    .eq("client_id", payload.dayClientId)
    .single();
  throwIfError(dayError, "Could not load this trip day.");

  if (!day || !hasCoordinates(day as Record<string, unknown>, "base_")) {
    return {
      status: "needs_place_data",
      warnings: ["Resolve a base or hotel place for this day before planning a route."],
      missing: [{ targetType: "trip_day_base", targetClientId: payload.dayClientId }]
    };
  }

  const { data: scheduleItems, error: scheduleError } = await supabase
    .from("schedule_items")
    .select("*")
    .eq("trip_day_id", (day as TripDayRow).id)
    .order("start_time");
  throwIfError(scheduleError, "Could not load scheduled activities.");
  const scheduleRows = (scheduleItems ?? []) as PlaceRow[];

  const ideaClientIds = [...new Set(payload.ideaClientIds ?? [])].filter(Boolean);
  const { data: ideas, error: ideaError } = ideaClientIds.length
    ? await supabase
      .from("ideas")
      .select("*")
      .eq("trip_id", payload.tripId)
      .in("client_id", ideaClientIds)
    : { data: [], error: null };
  throwIfError(ideaError, "Could not load selected ideas.");
  const ideaRows = (ideas ?? []) as PlaceRow[];

  const missing = [
    ...scheduleRows
      .filter((item) => !hasCoordinates(item as unknown as Record<string, unknown>))
      .map((item) => ({ targetType: "schedule_item", targetClientId: item.client_id, title: item.title })),
    ...ideaRows
      .filter((idea) => !hasCoordinates(idea as unknown as Record<string, unknown>))
      .map((idea) => ({ targetType: "idea", targetClientId: idea.client_id, title: idea.title }))
  ];

  if (missing.length) {
    warnings.push(`${missing.length} selected or scheduled place${missing.length === 1 ? " is" : "s are"} missing resolved coordinates.`);
  }

  const dayRow = day as TripDayRow;
  const baseStop = {
    id: `base:${dayRow.client_id}`,
    title: dayRow.base_place_name || dayRow.city || "Day base",
    latitude: dayRow.base_latitude as number,
    longitude: dayRow.base_longitude as number
  };
  const scheduledStops = scheduleRows
    .filter((item) => hasCoordinates(item as unknown as Record<string, unknown>))
    .map((item) => ({
      id: `schedule:${item.client_id}`,
      title: item.title,
      latitude: item.latitude as number,
      longitude: item.longitude as number
    }));
  const ideaStops = ideaRows
    .filter((idea) => hasCoordinates(idea as unknown as Record<string, unknown>))
    .map((idea) => ({
      id: `idea:${idea.client_id}`,
      title: idea.title,
      latitude: idea.latitude as number,
      longitude: idea.longitude as number
    }));

  const stops = [baseStop, ...scheduledStops, ...ideaStops].slice(0, 20);
  if (stops.length < 2) {
    return {
      status: "needs_place_data",
      warnings: ["Resolve at least one idea or activity place before planning a route."],
      missing
    };
  }

  return {
    status: "ok",
    stops,
    scheduledStopIds: scheduledStops.map((stop) => stop.id),
    ideaStopIds: ideaStops.map((stop) => stop.id),
    warnings,
    missing
  };
}

function buildRecommendation({
  stops,
  scheduledStopIds,
  ideaStopIds,
  matrixLookup,
  returnToBase,
  warnings
}: {
  stops: RouteStop[];
  scheduledStopIds: string[];
  ideaStopIds: string[];
  matrixLookup: Map<string, { minutes: number; meters: number }>;
  returnToBase: boolean;
  warnings: string[];
}) {
  const stopById = new Map(stops.map((stop) => [stop.id, stop]));
  const routeOrder = [stops[0].id, ...scheduledStopIds];
  const recommendations = [];
  let currentId = routeOrder[routeOrder.length - 1];
  const remainingIdeaIds = new Set(ideaStopIds);

  while (remainingIdeaIds.size) {
    const next = [...remainingIdeaIds]
      .map((stopId) => ({ stopId, travel: getTravel(matrixLookup, stops, currentId, stopId) }))
      .filter((candidate) => Number.isFinite(candidate.travel.minutes))
      .sort((a, b) => a.travel.minutes - b.travel.minutes)[0];

    if (!next) {
      warnings.push("Some ideas could not be connected by the selected travel mode.");
      break;
    }

    remainingIdeaIds.delete(next.stopId);
    routeOrder.push(next.stopId);
    currentId = next.stopId;
    recommendations.push({
      stopId: next.stopId,
      ideaClientId: next.stopId.replace(/^idea:/, ""),
      title: stopById.get(next.stopId)?.title ?? "Idea",
      fit: classifyFit(next.travel.minutes),
      addedTravelMinutes: Math.round(next.travel.minutes),
      distanceMeters: next.travel.meters
    });
  }

  if (returnToBase && routeOrder.length > 1) {
    routeOrder.push(stops[0].id);
  }

  const routeStops = routeOrder.map((stopId) => stopById.get(stopId)).filter(Boolean) as RouteStop[];
  const totalTravelMinutes = routeOrder.slice(1).reduce((total, stopId, index) => {
    const previousStopId = routeOrder[index];
    const travel = getTravel(matrixLookup, stops, previousStopId, stopId);
    return Number.isFinite(travel.minutes) ? total + travel.minutes : total;
  }, 0);

  return {
    routeOrder,
    stops: routeStops,
    recommendations,
    totalTravelMinutes: Math.round(totalTravelMinutes),
    googleMapsUrl: buildGoogleDirectionsUrl(routeStops),
    warnings
  };
}

function buildMatrixLookup(entries: MatrixEntry[]) {
  const lookup = new Map<string, { minutes: number; meters: number }>();
  entries.forEach((entry) => {
    if (entry.originIndex == null || entry.destinationIndex == null || !entry.duration) {
      return;
    }
    if (entry.status && entry.status.code && entry.status.code !== 0) {
      return;
    }
    lookup.set(`${entry.originIndex}:${entry.destinationIndex}`, {
      minutes: parseDurationSeconds(entry.duration) / 60,
      meters: entry.distanceMeters ?? 0
    });
  });
  return lookup;
}

function getTravel(matrixLookup: Map<string, { minutes: number; meters: number }>, stops: RouteStop[], originStopId: string, destinationStopId: string) {
  const originIndex = stops.findIndex((stop) => stop.id === originStopId);
  const destinationIndex = stops.findIndex((stop) => stop.id === destinationStopId);
  return matrixLookup.get(`${originIndex}:${destinationIndex}`) ?? { minutes: Number.POSITIVE_INFINITY, meters: 0 };
}

function classifyFit(minutes: number) {
  if (minutes <= 30) {
    return "good";
  }
  if (minutes <= 60) {
    return "possible";
  }
  return "tight";
}

function parseDurationSeconds(duration: string) {
  const match = duration.match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Number(match[1]) : 0;
}

function hasCoordinates(row: Record<string, unknown>, prefix = "") {
  return typeof row[`${prefix}latitude`] === "number" && typeof row[`${prefix}longitude`] === "number";
}

function throwIfError(error: unknown, message: string) {
  if (error) {
    const detail = typeof error === "object" && error && "message" in error ? String((error as { message?: string }).message) : "";
    throw new Error(detail || message);
  }
}
