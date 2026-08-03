import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { normalizeGoogleMapsLink, resolveGooglePlace, type ResolvedPlace } from "../_shared/googleMaps.ts";

type ResolvePlaceRequest = {
  tripId?: number;
  targetType?: "idea" | "schedule_item" | "trip_day_base";
  targetClientId?: string;
  placeId?: string;
  sessionToken?: string;
  displayNameHint?: string;
  regionCode?: string;
  countryName?: string;
  languageCode?: string;
  mapLink?: string;
  query?: string;
  title?: string;
  city?: string;
  /** Resolve and return place data without changing a persisted record. */
  persist?: boolean;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorResponse("Use POST for this function.", 405, "method_not_allowed");
  }

  try {
    const payload = await request.json() as ResolvePlaceRequest;
    const shouldPersist = payload.persist !== false;
    const validationError = validatePayload(payload, shouldPersist);
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
      return errorResponse("Sign in before resolving places.", 401, "not_authenticated");
    }

    const normalizedMapLink = normalizeGoogleMapsLink(payload.mapLink);
    const normalizedPayload = { ...payload, mapLink: normalizedMapLink };
    const place = await resolveGooglePlace({
      apiKey,
      placeId: payload.placeId,
      sessionToken: payload.sessionToken,
      displayNameHint: payload.displayNameHint,
      regionCode: payload.regionCode === undefined ? "JP" : sanitizeRegionCode(payload.regionCode) ?? undefined,
      countryName: payload.countryName === undefined ? "Japan" : payload.countryName.trim(),
      languageCode: payload.languageCode?.trim() || "en",
      mapLink: normalizedMapLink,
      query: payload.query,
      title: payload.title,
      city: payload.city
    });

    if (shouldPersist) {
      await persistPlace(supabase, normalizedPayload as Required<Pick<ResolvePlaceRequest, "tripId" | "targetType" | "targetClientId">> & ResolvePlaceRequest, place);
    }

    return jsonResponse({
      status: "ok",
      ...(shouldPersist
        ? {
            targetType: payload.targetType,
            targetClientId: payload.targetClientId
          }
        : {}),
      place
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not resolve this place.", 500, "resolve_failed");
  }
});

function validatePayload(payload: ResolvePlaceRequest, shouldPersist: boolean) {
  if (shouldPersist && (!payload.tripId || !Number.isFinite(Number(payload.tripId)))) {
    return "tripId is required.";
  }
  if (shouldPersist && (!payload.targetType || !["idea", "schedule_item", "trip_day_base"].includes(payload.targetType))) {
    return "targetType must be idea, schedule_item, or trip_day_base.";
  }
  if (shouldPersist && !payload.targetClientId?.trim()) {
    return "targetClientId is required.";
  }
  if (!payload.placeId?.trim() && !payload.mapLink?.trim() && !payload.query?.trim() && !payload.title?.trim() && !payload.city?.trim()) {
    return "Add a map link, place name, or city before resolving.";
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

function getGoogleServerKey() {
  return Deno.env.get("GOOGLE_PLACES_SERVER_KEY") || Deno.env.get("GOOGLE_MAPS_SERVER_KEY");
}

function sanitizeRegionCode(regionCode?: string) {
  const normalized = regionCode?.trim().toUpperCase() ?? "";
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

async function persistPlace(supabase: ReturnType<typeof createClient<any>>, payload: Required<Pick<ResolvePlaceRequest, "tripId" | "targetType" | "targetClientId">> & ResolvePlaceRequest, place: ResolvedPlace) {
  if (payload.targetType === "idea") {
    const { error } = await supabase
      .from("ideas")
      .update(placeColumns(place))
      .eq("trip_id", payload.tripId)
      .eq("client_id", payload.targetClientId);
    throwIfError(error, "Could not update this idea with the resolved place.");
    return;
  }

  if (payload.targetType === "trip_day_base") {
    const { error } = await supabase
      .from("trip_days")
      .update({
        ...basePlaceColumns(place),
        base_map_link: payload.mapLink?.trim() ?? ""
      })
      .eq("trip_id", payload.tripId)
      .eq("client_id", payload.targetClientId);
    throwIfError(error, "Could not update this day base with the resolved place.");
    return;
  }

  const { data: days, error: dayError } = await supabase
    .from("trip_days")
    .select("id")
    .eq("trip_id", payload.tripId);
  throwIfError(dayError, "Could not load trip days for this schedule item.");

  const dayIds = ((days ?? []) as Array<{ id: number }>).map((day) => day.id);
  if (!dayIds.length) {
    throw new Error("No days were found for this trip.");
  }

  const { error } = await supabase
    .from("schedule_items")
    .update(placeColumns(place))
    .in("trip_day_id", dayIds)
    .eq("client_id", payload.targetClientId);
  throwIfError(error, "Could not update this activity with the resolved place.");
}

function placeColumns(place: ResolvedPlace) {
  return {
    place_id: place.id || null,
    place_name: place.name || null,
    formatted_address: place.formattedAddress || null,
    latitude: place.latitude,
    longitude: place.longitude,
    google_maps_uri: place.googleMapsUri || null,
    place_resolved_at: place.resolvedAt
  };
}

function basePlaceColumns(place: ResolvedPlace) {
  return {
    base_place_id: place.id || null,
    base_place_name: place.name || null,
    base_formatted_address: place.formattedAddress || null,
    base_latitude: place.latitude,
    base_longitude: place.longitude,
    base_google_maps_uri: place.googleMapsUri || null,
    base_place_resolved_at: place.resolvedAt
  };
}

function throwIfError(error: unknown, message: string) {
  if (error) {
    const detail = typeof error === "object" && error && "message" in error ? String((error as { message?: string }).message) : "";
    throw new Error(detail || message);
  }
}
