import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { buildGoogleDirectionsUrl, computeRouteMatrix, type RouteStop } from "../_shared/googleMaps.ts";

type RoutePreviewRequest = {
  stops?: RouteStop[];
  travelMode?: "TRANSIT" | "WALK" | "DRIVE";
  countryName?: string;
};

type MatrixEntry = {
  originIndex?: number;
  destinationIndex?: number;
  duration?: string;
  distanceMeters?: number;
  status?: { code?: number; message?: string };
};

type RoutePreviewLeg = {
  originStopId: string;
  destinationStopId: string;
  originTitle: string;
  destinationTitle: string;
  durationMinutes: number | null;
  distanceMeters: number;
  googleMapsUrl: string;
  modes?: string[];
  summary?: string;
  fareYen?: number | null;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorResponse("Use POST for this function.", 405, "method_not_allowed");
  }

  try {
    const payload = await request.json() as RoutePreviewRequest;
    const validationError = validatePayload(payload);
    if (validationError) {
      return errorResponse(validationError, 400, "invalid_request");
    }

    const apiKey = getGoogleServerKey();
    if (!apiKey) {
      return errorResponse("GOOGLE_PLACES_SERVER_KEY or GOOGLE_MAPS_SERVER_KEY is not configured in Supabase secrets.", 500, "missing_google_key");
    }

    const supabase = createUserSupabaseClient(request);
    const { data: userResult, error: userError } = await supabase.auth.getUser();
    if (userError || !userResult.user) {
      return errorResponse("Sign in before previewing a route.", 401, "not_authenticated");
    }

    const stops = normalizeStops(payload.stops ?? []);
    const requestedTravelMode = payload.travelMode ?? "WALK";
    const primaryPreview = await buildPrimaryRoutePreview(apiKey, stops, requestedTravelMode, payload.countryName);
    const shouldFallbackToWalk = requestedTravelMode === "TRANSIT" && primaryPreview.legs.some((leg) => leg.durationMinutes == null);
    const preview = shouldFallbackToWalk
      ? await buildRoutePreview(apiKey, stops, "WALK", [transitFallbackMessage(payload.countryName)])
      : primaryPreview;

    return jsonResponse({
      status: "ok",
      requestedTravelMode,
      travelMode: preview.travelMode,
      provider: preview.provider,
      stops,
      totalTravelMinutes: preview.totalTravelMinutes,
      legs: preview.legs,
      googleMapsUrl: buildGoogleDirectionsUrl(stops),
      warnings: preview.warnings
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not preview this route.", 500, "route_preview_failed");
  }
});

function validatePayload(payload: RoutePreviewRequest) {
  const stops = payload.stops ?? [];
  if (!Array.isArray(stops) || stops.length < 2) {
    return "Choose at least two mapped places to preview a route.";
  }
  if (stops.length > 12) {
    return "Route preview supports up to 12 selected places.";
  }
  if (payload.travelMode && !["TRANSIT", "WALK", "DRIVE"].includes(payload.travelMode)) {
    return "travelMode must be TRANSIT, WALK, or DRIVE.";
  }
  const invalidStop = stops.find((stop) => !Number.isFinite(Number(stop.latitude)) || !Number.isFinite(Number(stop.longitude)));
  if (invalidStop) {
    return "Every selected place needs resolved coordinates.";
  }
  return "";
}

function normalizeStops(stops: RouteStop[]): RouteStop[] {
  return stops.map((stop, index) => ({
    id: String(stop.id || `stop-${index + 1}`),
    title: String(stop.title || `Stop ${index + 1}`),
    latitude: Number(stop.latitude),
    longitude: Number(stop.longitude),
    startTime: stop.startTime ? String(stop.startTime).slice(0, 5) : undefined,
    durationMinutes: Number.isFinite(Number(stop.durationMinutes)) ? Number(stop.durationMinutes) : undefined
  }));
}

async function buildRoutePreview(apiKey: string, stops: RouteStop[], travelMode: "TRANSIT" | "WALK" | "DRIVE", warnings: string[]) {
  const matrix = await computeRouteMatrix(apiKey, stops, travelMode) as MatrixEntry[];
  const matrixLookup = buildMatrixLookup(matrix);
  let missingLegs = 0;

  const legs = stops.slice(1).map((destination, index) => {
    const origin = stops[index];
    const travel = matrixLookup.get(`${index}:${index + 1}`);
    if (!travel || !Number.isFinite(travel.minutes)) {
      missingLegs += 1;
    }
    return {
      originStopId: origin.id,
      destinationStopId: destination.id,
      originTitle: origin.title,
      destinationTitle: destination.title,
      durationMinutes: travel && Number.isFinite(travel.minutes) ? Math.round(travel.minutes) : null,
      distanceMeters: travel?.meters ?? 0,
      googleMapsUrl: buildGoogleDirectionsUrl([origin, destination]),
      modes: [routeModeToLegMode(travelMode)]
    };
  });

  const completeLegs = missingLegs === 0;
  const totalTravelMinutes = completeLegs
    ? legs.reduce((total, leg) => total + Number(leg.durationMinutes ?? 0), 0)
    : null;
  const nextWarnings = [...warnings];
  if (missingLegs) {
    nextWarnings.push(`Google Routes did not return travel time for ${missingLegs} route leg${missingLegs === 1 ? "" : "s"}.`);
  }

  return {
    travelMode,
    provider: "Google",
    legs,
    totalTravelMinutes,
    warnings: nextWarnings
  };
}

async function buildPrimaryRoutePreview(apiKey: string, stops: RouteStop[], travelMode: "TRANSIT" | "WALK" | "DRIVE", countryName?: string) {
  if (travelMode === "TRANSIT" && hasNavitimeRapidApiSecrets()) {
    try {
      return await buildNavitimeTransitPreview(stops);
    } catch (error) {
      return await buildRoutePreview(apiKey, stops, "WALK", [
        `NAVITIME transit preview failed, so walking times were used instead. ${error instanceof Error ? error.message : ""}`.trim()
      ]);
    }
  }

  try {
    return await buildRoutePreview(apiKey, stops, travelMode, []);
  } catch (error) {
    if (travelMode !== "TRANSIT") {
      throw error;
    }
    return await buildRoutePreview(apiKey, stops, "WALK", [transitFallbackMessage(countryName)]);
  }
}

async function buildNavitimeTransitPreview(stops: RouteStop[]) {
  const legs: RoutePreviewLeg[] = [];
  for (let index = 0; index < stops.length - 1; index += 1) {
    const origin = stops[index];
    const destination = stops[index + 1];
    const navitimeLeg = await fetchNavitimeTransitLeg(origin, destination);
    legs.push({
      originStopId: origin.id,
      destinationStopId: destination.id,
      originTitle: origin.title,
      destinationTitle: destination.title,
      durationMinutes: navitimeLeg.durationMinutes,
      distanceMeters: navitimeLeg.distanceMeters,
      googleMapsUrl: buildGoogleDirectionsUrl([origin, destination]),
      modes: navitimeLeg.modes,
      summary: navitimeLeg.summary,
      fareYen: navitimeLeg.fareYen
    });
  }

  const totalTravelMinutes = legs.every((leg) => Number.isFinite(leg.durationMinutes))
    ? legs.reduce((total, leg) => total + Number(leg.durationMinutes ?? 0), 0)
    : null;

  return {
    travelMode: "TRANSIT" as const,
    provider: "NAVITIME",
    legs,
    totalTravelMinutes,
    warnings: ["Planning estimate. Check live train times before you go."]
  };
}

async function fetchNavitimeTransitLeg(origin: RouteStop, destination: RouteStop) {
  const host = Deno.env.get("NAVITIME_RAPIDAPI_HOST")?.trim();
  const key = Deno.env.get("NAVITIME_RAPIDAPI_KEY")?.trim();
  if (!host || !key) {
    throw new Error("NAVITIME_RAPIDAPI_HOST or NAVITIME_RAPIDAPI_KEY is not configured.");
  }

  const url = new URL(`https://${host}/route_transit`);
  url.searchParams.set("start", `${origin.latitude},${origin.longitude}`);
  url.searchParams.set("goal", `${destination.latitude},${destination.longitude}`);
  url.searchParams.set("start_time", navitimeStartTime());
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-rapidapi-key": key,
      "x-rapidapi-host": host
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NAVITIME returned ${response.status}${errorText ? `: ${truncateMessage(errorText)}` : ""}`);
  }

  const payload = await response.json();
  return normalizeNavitimeLeg(payload);
}

function normalizeNavitimeLeg(payload: unknown) {
  const route = asArray(asRecord(payload).items)[0];
  const routeRecord = asRecord(route);
  const summary = asRecord(routeRecord.summary);
  const move = asRecord(summary.move);
  const sections = asArray(routeRecord.sections);
  const transportNames: string[] = [];
  const modeSet = new Set<string>();
  sections.forEach((section) => {
    const record = asRecord(section);
    const transport = asRecord(record.transport);
    const transportName = String(transport.name ?? "").trim();
    if (transportName) {
      transportNames.push(transportName);
    }
    const mode = navitimeSectionMode(record, transport);
    if (mode) {
      modeSet.add(mode);
    }
  });
  const durationMinutes = Number(move.time);
  const distanceMeters = Number(move.distance) || 0;
  const fareYen = navitimeFareYen(asRecord(move.fare));
  const modes = modeSet.size ? [...modeSet] : ["transit"];

  if (!Number.isFinite(durationMinutes)) {
    throw new Error("NAVITIME did not return a route time.");
  }

  return {
    durationMinutes: Math.round(durationMinutes),
    distanceMeters,
    fareYen,
    modes,
    summary: transportNames.length ? transportNames.slice(0, 2).join(" + ") : "Transit"
  };
}

function routeModeToLegMode(travelMode: string) {
  const normalized = travelMode.toLowerCase();
  if (normalized === "walk") {
    return "walk";
  }
  if (normalized === "drive") {
    return "car";
  }
  return "transit";
}

function navitimeSectionMode(section: Record<string, unknown>, transport: Record<string, unknown>) {
  const tokens = [
    section.type,
    section.name,
    section.move,
    transport.type,
    transport.name,
    transport.category,
    transport.vehicle
  ].map((value) => String(value ?? "").toLowerCase()).join(" ");

  if (tokens.includes("walk") || tokens.includes("徒歩")) {
    return "walk";
  }
  if (tokens.includes("bus") || tokens.includes("バス")) {
    return "bus";
  }
  if (tokens.includes("taxi") || tokens.includes("car") || tokens.includes("drive") || tokens.includes("車")) {
    return "car";
  }
  if (tokens.includes("train") || tokens.includes("rail") || tokens.includes("subway") || tokens.includes("metro") || tokens.includes("電車") || tokens.includes("地下鉄") || tokens.includes("線")) {
    return "train";
  }
  return "";
}

function navitimeFareYen(fare: Record<string, unknown>) {
  const values = Object.values(fare).map(Number).filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.min(...values) : null;
}

function navitimeStartTime() {
  const date = new Date();
  const japanTime = new Date(date.getTime() + (9 * 60 + date.getTimezoneOffset()) * 60 * 1000);
  japanTime.setHours(Math.max(9, japanTime.getHours()), 0, 0, 0);
  const year = japanTime.getFullYear();
  const month = String(japanTime.getMonth() + 1).padStart(2, "0");
  const day = String(japanTime.getDate()).padStart(2, "0");
  const hours = String(japanTime.getHours()).padStart(2, "0");
  const minutes = String(japanTime.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:00`;
}

function hasNavitimeRapidApiSecrets() {
  return Boolean(Deno.env.get("NAVITIME_RAPIDAPI_HOST")?.trim() && Deno.env.get("NAVITIME_RAPIDAPI_KEY")?.trim());
}

function truncateMessage(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 220);
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
      meters: Number(entry.distanceMeters) || 0
    });
  });
  return lookup;
}

function parseDurationSeconds(duration: string) {
  const match = duration.match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Number(match[1]) : Number.NaN;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function getGoogleServerKey() {
  return Deno.env.get("GOOGLE_PLACES_SERVER_KEY") || Deno.env.get("GOOGLE_MAPS_SERVER_KEY");
}

function transitFallbackMessage(countryName = "Japan") {
  return countryName.trim().toLowerCase() === "japan"
    ? "Google Maps Platform does not reliably expose Japan transit directions through this API, so walking times were used for this preview."
    : "Transit travel times were unavailable through this API, so walking times were used for this preview.";
}
