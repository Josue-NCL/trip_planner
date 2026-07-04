import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { buildGoogleDirectionsUrl, computeRouteDetails, computeRouteMatrix, type RouteStop } from "../_shared/googleMaps.ts";

type RouteDayRequest = {
  tripId?: number;
  dayClientId?: string;
  ideaClientIds?: string[];
  travelMode?: "TRANSIT" | "WALK" | "DRIVE";
  returnToBase?: boolean;
  countryName?: string;
  timezoneOffset?: string;
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
    dayDate: string;
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
  trip_date: string;
  city: string;
  base_place_name: string | null;
  base_latitude: number | null;
  base_longitude: number | null;
};

type PlaceRow = {
  client_id: string;
  title: string;
  start_time?: string | null;
  duration_minutes?: number | null;
  latitude: number | null;
  longitude: number | null;
};

type RouteRecommendation = {
  routeOrder: string[];
  stops: RouteStop[];
  recommendations: Array<Record<string, unknown>>;
  totalTravelMinutes: number | null;
  googleMapsUrl: string;
  warnings: string[];
};

type DetailedRouteLeg = {
  originStopId: string;
  destinationStopId: string;
  originTitle: string;
  destinationTitle: string;
  summary: string;
  durationMinutes: number | null;
  distanceMeters: number;
  departureTime: string;
  arrivalTime: string;
  googleMapsUrl: string;
  steps: DetailedRouteStep[];
};

type DetailedRouteStep = {
  type: string;
  instruction: string;
  durationMinutes: number | null;
  distanceMeters: number;
  fromName?: string;
  toName?: string;
  transit: {
    lineName: string;
    lineShortName: string;
    headsign: string;
    vehicleType: string;
    departureStop: string;
    arrivalStop: string;
    departureTime: string;
    arrivalTime: string;
    stopCount: number | null;
    tripShortText: string;
  } | null;
};

type LegTiming = {
  request: {
    departureTime?: string;
    arrivalTime?: string;
  };
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

    const requestedTravelMode = payload.travelMode ?? "TRANSIT";
    let effectiveTravelMode = requestedTravelMode;
    const matrix = await computeRouteMatrix(apiKey, routeInput.stops, requestedTravelMode) as MatrixEntry[];
    let matrixLookup = buildMatrixLookup(matrix);
    let recommendation = buildRecommendation({
      stops: routeInput.stops,
      scheduledStopIds: routeInput.scheduledStopIds,
      ideaStopIds: routeInput.ideaStopIds,
      matrixLookup,
      returnToBase: payload.returnToBase ?? true,
      warnings: [...routeInput.warnings]
    });

    if (requestedTravelMode === "TRANSIT" && recommendation.totalTravelMinutes == null) {
      effectiveTravelMode = "WALK";
      const fallbackMatrix = await computeRouteMatrix(apiKey, routeInput.stops, effectiveTravelMode) as MatrixEntry[];
      matrixLookup = buildMatrixLookup(fallbackMatrix);
      recommendation = buildRecommendation({
        stops: routeInput.stops,
        scheduledStopIds: routeInput.scheduledStopIds,
        ideaStopIds: routeInput.ideaStopIds,
        matrixLookup,
        returnToBase: payload.returnToBase ?? true,
        warnings: [
          ...routeInput.warnings,
          transitFallbackMessage(payload.countryName)
        ]
      });
    }

    const detailedRoute = await buildDetailedRoute({
      apiKey,
      routeStops: recommendation.stops,
      travelMode: requestedTravelMode,
      fallbackTravelMode: effectiveTravelMode,
      dayDate: routeInput.dayDate,
      timezoneOffset: sanitizeTimezoneOffset(payload.timezoneOffset) ?? "+09:00",
      countryName: payload.countryName?.trim() || "Japan",
      matrixLookup,
      allStops: routeInput.stops,
      warnings: recommendation.warnings
    });

    return jsonResponse({
      status: "ok",
      travelMode: detailedRoute.travelMode,
      requestedTravelMode,
      base: routeInput.stops[0],
      ...recommendation,
      totalTravelMinutes: detailedRoute.totalTravelMinutes ?? recommendation.totalTravelMinutes,
      legs: detailedRoute.legs,
      warnings: detailedRoute.warnings
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
      longitude: dayRow.base_longitude as number,
      startTime: "09:00",
      durationMinutes: 0
    };
  const scheduledStops = scheduleRows
    .filter((item) => hasCoordinates(item as unknown as Record<string, unknown>))
    .map((item) => ({
      id: `schedule:${item.client_id}`,
      title: item.title,
      latitude: item.latitude as number,
      longitude: item.longitude as number,
      startTime: normalizeTime(item.start_time),
      durationMinutes: Number(item.duration_minutes) || 0
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
    dayDate: dayRow.trip_date,
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
}): RouteRecommendation {
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
  let missingTravelLegs = 0;
  const totalTravelMinutes = routeOrder.slice(1).reduce((total, stopId, index) => {
    const previousStopId = routeOrder[index];
    const travel = getTravel(matrixLookup, stops, previousStopId, stopId);
    if (!Number.isFinite(travel.minutes)) {
      missingTravelLegs += 1;
      return total;
    }
    return total + travel.minutes;
  }, 0);
  if (missingTravelLegs) {
    warnings.push(`Google Routes did not return travel time for ${missingTravelLegs} route leg${missingTravelLegs === 1 ? "" : "s"}.`);
  }

  return {
    routeOrder,
    stops: routeStops,
    recommendations,
    totalTravelMinutes: missingTravelLegs ? null : Math.round(totalTravelMinutes),
    googleMapsUrl: buildGoogleDirectionsUrl(routeStops),
    warnings
  };
}

async function buildDetailedRoute({
  apiKey,
  routeStops,
  travelMode,
  fallbackTravelMode,
  dayDate,
  timezoneOffset,
  countryName,
  matrixLookup,
  allStops,
  warnings
}: {
  apiKey: string;
  routeStops: RouteStop[];
  travelMode: string;
  fallbackTravelMode: string;
  dayDate: string;
  timezoneOffset: string;
  countryName: string;
  matrixLookup: Map<string, { minutes: number; meters: number }>;
  allStops: RouteStop[];
  warnings: string[];
}) {
  const routeWarnings = [...warnings];
  let effectiveTravelMode = travelMode;
  let legs = await buildDetailedLegs({
    apiKey,
    routeStops,
    travelMode,
    dayDate,
    timezoneOffset,
    matrixLookup,
    allStops,
    warnings: routeWarnings
  });

  if (travelMode === "TRANSIT" && !legs.some((leg) => leg.steps.some((step) => step.transit))) {
    const fallbackWarnings = [
      ...warnings.filter((warning) => !warning.includes("Transit travel times were unavailable")),
      transitDetailsFallbackMessage(countryName)
    ];
    const fallbackLegs = await buildDetailedLegs({
      apiKey,
      routeStops,
      travelMode: fallbackTravelMode === "TRANSIT" ? "WALK" : fallbackTravelMode,
      dayDate,
      timezoneOffset,
      matrixLookup,
      allStops,
      warnings: fallbackWarnings
    });
    if (fallbackLegs.some((leg) => leg.durationMinutes != null)) {
      effectiveTravelMode = fallbackTravelMode === "TRANSIT" ? "WALK" : fallbackTravelMode;
      legs = fallbackLegs;
      routeWarnings.splice(0, routeWarnings.length, ...fallbackWarnings);
    }
  }

  const legMinutes = legs.map((leg) => leg.durationMinutes);
  let totalTravelMinutes: number | null = null;
  if (legMinutes.every((minutes) => Number.isFinite(minutes))) {
    totalTravelMinutes = 0;
    for (const minutes of legMinutes) {
      totalTravelMinutes += Number(minutes);
    }
  }

  return {
    travelMode: effectiveTravelMode,
    legs,
    totalTravelMinutes,
    warnings: routeWarnings
  };
}

async function buildDetailedLegs({
  apiKey,
  routeStops,
  travelMode,
  dayDate,
  timezoneOffset,
  matrixLookup,
  allStops,
  warnings
}: {
  apiKey: string;
  routeStops: RouteStop[];
  travelMode: string;
  dayDate: string;
  timezoneOffset: string;
  matrixLookup: Map<string, { minutes: number; meters: number }>;
  allStops: RouteStop[];
  warnings: string[];
}) {
  const legs: DetailedRouteLeg[] = [];
  let detailFailureCount = 0;

  for (let index = 0; index < routeStops.length - 1; index += 1) {
    const origin = routeStops[index];
    const destination = routeStops[index + 1];
    const timing = getLegTiming({ dayDate, timezoneOffset, origin, destination, legIndex: index });
    const matrixTravel = getTravel(matrixLookup, allStops, origin.id, destination.id);

    try {
      const route = await computeRouteDetails(apiKey, origin, destination, travelMode, timing.request);
      legs.push(normalizeDetailedLeg({
        route,
        origin,
        destination,
        fallbackMinutes: matrixTravel.minutes,
        fallbackMeters: matrixTravel.meters
      }));
    } catch {
      detailFailureCount += 1;
      legs.push(normalizeDetailedLeg({
        route: null,
        origin,
        destination,
        fallbackMinutes: matrixTravel.minutes,
        fallbackMeters: matrixTravel.meters,
        fallbackDepartureTime: timing.request.departureTime ?? "",
        fallbackArrivalTime: timing.request.arrivalTime ?? ""
      }));
    }
  }

  if (detailFailureCount) {
    warnings.push(`Google Routes could not return detailed directions for ${detailFailureCount} route leg${detailFailureCount === 1 ? "" : "s"}.`);
  }

  return legs;
}

function normalizeDetailedLeg({
  route,
  origin,
  destination,
  fallbackMinutes,
  fallbackMeters,
  fallbackDepartureTime = "",
  fallbackArrivalTime = ""
}: {
  route: unknown;
  origin: RouteStop;
  destination: RouteStop;
  fallbackMinutes: number;
  fallbackMeters: number;
  fallbackDepartureTime?: string;
  fallbackArrivalTime?: string;
}): DetailedRouteLeg {
  const routeRecord = asRecord(route);
  const leg = asRecord(asArray(routeRecord.legs)[0]);
  const steps = asArray(leg.steps).map(normalizeDetailedStep);
  const routeDurationMinutes = parseNullableDurationMinutes(String(leg.duration ?? routeRecord.duration ?? ""));
  const durationMinutes = routeDurationMinutes != null
    ? routeDurationMinutes
    : Number.isFinite(fallbackMinutes)
      ? Math.round(fallbackMinutes)
      : null;
  const departureTime = firstStepTransitTime(steps, "departureTime") || fallbackDepartureTime;
  const arrivalTime = lastStepTransitTime(steps, "arrivalTime") || fallbackArrivalTime;

  return {
    originStopId: origin.id,
    destinationStopId: destination.id,
    originTitle: origin.title,
    destinationTitle: destination.title,
    summary: summarizeRouteLeg(destination, steps, durationMinutes),
    durationMinutes,
    distanceMeters: Number(leg.distanceMeters ?? routeRecord.distanceMeters ?? fallbackMeters ?? 0),
    departureTime,
    arrivalTime,
    googleMapsUrl: buildGoogleDirectionsUrl([origin, destination]),
    steps
  };
}

function normalizeDetailedStep(step: unknown): DetailedRouteStep {
  const record = asRecord(step);
  const transitDetails = asRecord(record.transitDetails);
  const stopDetails = asRecord(transitDetails.stopDetails);
  const departureStop = asRecord(stopDetails.departureStop);
  const arrivalStop = asRecord(stopDetails.arrivalStop);
  const transitLine = asRecord(transitDetails.transitLine);
  const vehicle = asRecord(transitLine.vehicle);
  const navigationInstruction = asRecord(record.navigationInstruction);
  const localizedValues = asRecord(record.localizedValues);
  const transitLocalizedValues = asRecord(transitDetails.localizedValues);
  const departureTime = String(stopDetails.departureTime ?? "") || localizedTimeValue(asRecord(transitLocalizedValues.departureTime));
  const arrivalTime = String(stopDetails.arrivalTime ?? "") || localizedTimeValue(asRecord(transitLocalizedValues.arrivalTime));

  return {
    type: String(record.travelMode ?? (record.transitDetails ? "TRANSIT" : "WALK")),
    instruction: String(navigationInstruction.instructions ?? ""),
    durationMinutes: parseNullableDurationMinutes(String(record.staticDuration ?? "")),
    distanceMeters: Number(record.distanceMeters ?? 0),
    transit: record.transitDetails
      ? {
        lineName: String(transitLine.name ?? ""),
        lineShortName: String(transitLine.nameShort ?? ""),
        headsign: String(transitDetails.headsign ?? ""),
        vehicleType: String(vehicle.type ?? ""),
        departureStop: String(departureStop.name ?? ""),
        arrivalStop: String(arrivalStop.name ?? ""),
        departureTime,
        arrivalTime,
        stopCount: Number.isFinite(Number(transitDetails.stopCount)) ? Number(transitDetails.stopCount) : null,
        tripShortText: String(transitDetails.tripShortText ?? "")
      }
      : null
  };
}

function getLegTiming({ dayDate, timezoneOffset, origin, destination, legIndex }: { dayDate: string; timezoneOffset: string; origin: RouteStop; destination: RouteStop; legIndex: number }): LegTiming {
  const destinationStart = normalizeTime(destination.startTime);
  if (legIndex === 0 && destinationStart) {
    return { request: { arrivalTime: routeDateTime(dayDate, destinationStart, timezoneOffset) } };
  }

  const originStart = normalizeTime(origin.startTime);
  if (originStart) {
    return { request: { departureTime: routeDateTime(dayDate, addMinutesToTime(originStart, Number(origin.durationMinutes) || 0), timezoneOffset) } };
  }

  return { request: { departureTime: routeDateTime(dayDate, "09:00", timezoneOffset) } };
}

function summarizeRouteLeg(destination: RouteStop, steps: DetailedRouteStep[], durationMinutes: number | null) {
  const transitStep = steps.find((step) => step.transit);
  if (transitStep?.transit) {
    const transit = transitStep.transit;
    const line = transit.lineShortName || transit.lineName || transit.tripShortText || transit.vehicleType || "Transit";
    const headsign = transit.headsign ? ` toward ${transit.headsign}` : "";
    const duration = durationMinutes == null ? "" : ` · ${durationMinutes} min`;
    const stops = transit.stopCount == null ? "" : ` · ${transit.stopCount} stop${transit.stopCount === 1 ? "" : "s"}`;
    return `${line}${headsign}${duration}${stops}`;
  }

  const instruction = steps.find((step) => step.instruction)?.instruction;
  const duration = durationMinutes == null ? "" : ` · ${durationMinutes} min`;
  return instruction || `Travel to ${destination.title}${duration}`;
}

function firstStepTransitTime(steps: DetailedRouteStep[], key: "departureTime" | "arrivalTime") {
  return steps.find((step) => step.transit?.[key])?.transit?.[key] ?? "";
}

function lastStepTransitTime(steps: DetailedRouteStep[], key: "departureTime" | "arrivalTime") {
  return [...steps].reverse().find((step) => step.transit?.[key])?.transit?.[key] ?? "";
}

function localizedTimeValue(value: Record<string, unknown>) {
  const time = asRecord(value.time);
  return String(time.text ?? value.time ?? "").trim();
}

function parseNullableDurationMinutes(duration: string) {
  const seconds = parseDurationSeconds(duration);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds / 60) : null;
}

function routeDateTime(dayDate: string, time: string, timezoneOffset: string) {
  return `${dayDate}T${normalizeTime(time) || "09:00"}:00${sanitizeTimezoneOffset(timezoneOffset) ?? "+09:00"}`;
}

function transitFallbackMessage(countryName = "Japan") {
  return isJapanProfile(countryName)
    ? "Google Maps Platform does not expose Japan transit directions through this API, so walking times were used for this estimate."
    : "Transit travel times were unavailable through this API, so walking times were used for this estimate.";
}

function transitDetailsFallbackMessage(countryName = "Japan") {
  return isJapanProfile(countryName)
    ? "Google Maps Platform does not expose Japan transit directions through this API, so this preview uses walking details. Open the route in Google Maps for train and bus planning."
    : "Transit step details were unavailable through this API, so this preview uses walking details. Open the route in Google Maps for full transit planning.";
}

function isJapanProfile(countryName = "Japan") {
  return countryName.trim().toLowerCase() === "japan";
}

function sanitizeTimezoneOffset(timezoneOffset?: string) {
  const normalized = timezoneOffset?.trim() ?? "";
  return /^[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : null;
}

function normalizeTime(value?: string | null) {
  return String(value ?? "").slice(0, 5);
}

function addMinutesToTime(time: string, minutes: number) {
  const [hours, rawMinutes] = normalizeTime(time).split(":").map(Number);
  const total = Math.max(0, (Number(hours) || 0) * 60 + (Number(rawMinutes) || 0) + minutes);
  const nextHours = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const nextMinutes = String(total % 60).padStart(2, "0");
  return `${nextHours}:${nextMinutes}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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
