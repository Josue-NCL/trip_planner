import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { buildGoogleDirectionsUrl, computeRouteDetails, type RouteStop } from "../_shared/googleMaps.ts";

type CompanionRouteRequest = {
  tripId?: number;
  activityClientId?: string;
  origin?: { latitude?: number; longitude?: number; title?: string };
  arrivalAt?: string;
  preferredMode?: "TRANSIT" | "WALK" | "DRIVE";
};

type ActivityRow = {
  client_id: string;
  title: string;
  latitude: number | null;
  longitude: number | null;
  trip_days?: { trip_id?: number } | Array<{ trip_id?: number }>;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return errorResponse("Use POST for this function.", 405, "method_not_allowed");

  try {
    const payload = await request.json() as CompanionRouteRequest;
    const validationError = validate(payload);
    if (validationError) return errorResponse(validationError, 400, "invalid_request");

    const supabase = createUserSupabaseClient(request);
    const { data: userResult, error: userError } = await supabase.auth.getUser();
    if (userError || !userResult.user) return errorResponse("Sign in before checking a companion route.", 401, "not_authenticated");

    const activity = await loadActivity(supabase, payload.tripId!, payload.activityClientId!);
    if (!activity) return errorResponse("The selected activity could not be found in this trip.", 404, "activity_not_found");
    if (activity.latitude == null || activity.longitude == null) return errorResponse("Resolve this activity's location before calculating a route.", 409, "activity_needs_place");

    const origin: RouteStop = {
      id: "origin",
      title: payload.origin!.title?.trim() || "Current location",
      latitude: Number(payload.origin!.latitude),
      longitude: Number(payload.origin!.longitude)
    };
    const destination: RouteStop = {
      id: activity.client_id,
      title: activity.title,
      latitude: Number(activity.latitude),
      longitude: Number(activity.longitude)
    };
    const externalDirectionsUrl = buildGoogleDirectionsUrl([origin, destination]);
    const mode = payload.preferredMode ?? "TRANSIT";

    if (mode === "TRANSIT" && hasNavitimeSecrets()) {
      try {
        const navitime = await fetchNavitimeTransit(origin, destination, payload.arrivalAt);
        return jsonResponse({
          provider: "NAVITIME",
          confidence: navitime.isTimetable ? "providerSchedule" : "providerEstimate",
          durationMinutes: navitime.durationMinutes,
          departureAt: navitime.departureAt,
          arrivalAt: navitime.arrivalAt,
          transferCount: navitime.transferCount,
          walkingMeters: navitime.walkingMeters,
          fareYen: navitime.fareYen,
          legs: navitime.legs,
          summary: navitime.summary,
          externalDirectionsUrl,
          fetchedAt: new Date().toISOString()
        });
      } catch (error) {
        // Continue to Google/external fallback. NAVITIME availability must not
        // make the Today card unusable.
      }
    }

    const apiKey = getGoogleServerKey();
    if (!apiKey) {
      return jsonResponse(externalOnlyResponse(externalDirectionsUrl));
    }

    try {
      const route = await computeRouteDetails(apiKey, origin, destination, mode, {
        arrivalTime: payload.arrivalAt
      });
      if (!route) return jsonResponse(externalOnlyResponse(externalDirectionsUrl));
      const summary = normalizeGoogleRoute(route as Record<string, unknown>);
      return jsonResponse({
        provider: "Google",
        confidence: summary.hasScheduledTransit ? "providerSchedule" : "providerEstimate",
        durationMinutes: summary.durationMinutes,
        departureAt: summary.departureAt,
        arrivalAt: summary.arrivalAt,
        transferCount: summary.transferCount,
        walkingMeters: summary.walkingMeters,
        legs: summary.legs,
        summary: summary.hasScheduledTransit ? "Scheduled transit" : "Approx. travel time",
        externalDirectionsUrl,
        fetchedAt: new Date().toISOString()
      });
    } catch (_) {
      return jsonResponse(externalOnlyResponse(externalDirectionsUrl));
    }
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not calculate the companion route.", 500, "companion_route_failed");
  }
});

function validate(payload: CompanionRouteRequest) {
  if (!Number.isInteger(payload.tripId) || Number(payload.tripId) <= 0) return "tripId must be a positive integer.";
  if (!payload.activityClientId?.trim()) return "activityClientId is required.";
  if (!Number.isFinite(Number(payload.origin?.latitude)) || !Number.isFinite(Number(payload.origin?.longitude))) return "origin latitude and longitude are required.";
  if (payload.preferredMode && !["TRANSIT", "WALK", "DRIVE"].includes(payload.preferredMode)) return "preferredMode must be TRANSIT, WALK, or DRIVE.";
  if (payload.arrivalAt && Number.isNaN(Date.parse(payload.arrivalAt))) return "arrivalAt must be an ISO timestamp.";
  return "";
}

function createUserSupabaseClient(request: Request) {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  return createClient(url, key, {
    global: { headers: { Authorization: request.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function loadActivity(supabase: ReturnType<typeof createClient>, tripId: number, clientId: string): Promise<ActivityRow | null> {
  const { data, error } = await supabase
    .from("schedule_items")
    .select("client_id,title,latitude,longitude,trip_days!inner(trip_id)")
    .eq("client_id", clientId)
    .eq("trip_days.trip_id", tripId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ActivityRow;
}

function getGoogleServerKey() {
  return Deno.env.get("GOOGLE_PLACES_SERVER_KEY") || Deno.env.get("GOOGLE_MAPS_SERVER_KEY");
}

function hasNavitimeSecrets() {
  return Boolean(Deno.env.get("NAVITIME_RAPIDAPI_HOST")?.trim() && Deno.env.get("NAVITIME_RAPIDAPI_KEY")?.trim());
}

async function fetchNavitimeTransit(origin: RouteStop, destination: RouteStop, arrivalAt?: string) {
  const host = Deno.env.get("NAVITIME_RAPIDAPI_HOST")!.trim();
  const key = Deno.env.get("NAVITIME_RAPIDAPI_KEY")!.trim();
  const url = new URL(`https://${host}/route_transit`);
  url.searchParams.set("start", `${origin.latitude},${origin.longitude}`);
  url.searchParams.set("goal", `${destination.latitude},${destination.longitude}`);
  url.searchParams.set("limit", "1");
  if (arrivalAt) url.searchParams.set("goal_time", formatNavitimeTime(arrivalAt));
  else url.searchParams.set("start_time", formatNavitimeTime(new Date().toISOString()));

  const response = await fetch(url, { headers: { "x-rapidapi-key": key, "x-rapidapi-host": host } });
  if (!response.ok) throw new Error(`NAVITIME returned ${response.status}.`);
  const payload = await response.json() as Record<string, unknown>;
  const item = asArray(payload.items)[0] as Record<string, unknown> | undefined;
  const summary = asRecord(item?.summary);
  const move = asRecord(summary.move);
  const sections = asArray(item?.sections).map(asRecord);
  const durationMinutes = Number(move.time);
  if (!Number.isFinite(durationMinutes)) throw new Error("NAVITIME did not return a route duration.");
  const routeSections = sections.filter((section) => Object.keys(asRecord(section.transport)).length > 0);
  const isTimetable = routeSections.some((section) => section.is_timetable === true || section.isTimetable === true);
  const routeNames = routeSections.map((section) => String(asRecord(section.transport).name ?? "").trim()).filter(Boolean);
  const fare = asRecord(move.fare);
  const totalFare = Number(fare.unit_0 ?? fare.total ?? 0);
  return {
    durationMinutes: Math.round(durationMinutes),
    departureAt: stringOrNull(summary.start_time ?? summary.startTime),
    arrivalAt: stringOrNull(summary.goal_time ?? summary.goalTime),
    transferCount: Math.max(0, routeSections.length - 1),
    walkingMeters: Number(move.distance) || 0,
    fareYen: Number.isFinite(totalFare) && totalFare > 0 ? Math.round(totalFare) : null,
    legs: routeSections.map((section) => ({ mode: String(asRecord(section.transport).type ?? "TRANSIT"), summary: String(asRecord(section.transport).name ?? "Transit") })),
    summary: routeNames.length ? routeNames.slice(0, 2).join(" + ") : "Transit",
    isTimetable
  };
}

function normalizeGoogleRoute(route: Record<string, unknown>) {
  const legs = asArray(route.legs).map(asRecord);
  const steps = legs.flatMap((leg) => asArray(leg.steps).map(asRecord));
  const transitSteps = steps.filter((step) => Object.keys(asRecord(step.transitDetails)).length > 0);
  const firstTransit = asRecord(transitSteps[0]?.transitDetails);
  const lastTransit = asRecord(transitSteps[transitSteps.length - 1]?.transitDetails);
  const departureStop = asRecord(firstTransit.stopDetails);
  const arrivalStop = asRecord(lastTransit.stopDetails);
  const transitDetails = transitSteps.map((step) => asRecord(step.transitDetails));
  return {
    durationMinutes: parseGoogleDuration(route.duration),
    departureAt: stringOrNull(departureStop.departureTime),
    arrivalAt: stringOrNull(arrivalStop.arrivalTime),
    transferCount: Math.max(0, transitSteps.length - 1),
    walkingMeters: steps.filter((step) => String(step.travelMode) === "WALK").reduce((total, step) => total + (Number(step.distanceMeters) || 0), 0),
    hasScheduledTransit: transitSteps.length > 0,
    legs: transitDetails.map((detail) => {
      const line = asRecord(detail.transitLine);
      return { mode: "TRANSIT", summary: String(line.name ?? line.nameShort ?? "Transit") };
    })
  };
}

function externalOnlyResponse(externalDirectionsUrl: string) {
  return {
    provider: "external",
    confidence: "externalOnly",
    durationMinutes: null,
    departureAt: null,
    arrivalAt: null,
    transferCount: null,
    walkingMeters: null,
    legs: [],
    summary: "Check transit in Google Maps",
    externalDirectionsUrl,
    fetchedAt: new Date().toISOString()
  };
}

function parseGoogleDuration(value: unknown) {
  const match = String(value ?? "").match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Math.ceil(Number(match[1]) / 60) : null;
}

function formatNavitimeTime(value: string) {
  const date = new Date(value);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function stringOrNull(value: unknown) { const result = String(value ?? "").trim(); return result || null; }
