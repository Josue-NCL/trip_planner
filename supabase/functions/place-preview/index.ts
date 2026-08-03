import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";

type PlacePreviewRequest = {
  placeId?: string;
  maxWidthPx?: number;
};

type GooglePlacePhoto = {
  name?: string;
  authorAttributions?: GooglePhotoAttribution[];
};

type GooglePhotoAttribution = {
  displayName?: string;
  uri?: string;
  photoUri?: string;
};

type GooglePlacePreview = {
  formattedAddress?: string;
  photos?: GooglePlacePhoto[];
};

const PLACE_PREVIEW_FIELD_MASK = "formattedAddress,photos";
const GOOGLE_FETCH_TIMEOUT_MS = 8000;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorResponse("Use POST for this function.", 405, "method_not_allowed");
  }

  try {
    const payload = await request.json() as PlacePreviewRequest;
    const placeId = normalizePlaceId(payload.placeId);
    if (!placeId) {
      return errorResponse("placeId is required.", 400, "invalid_request");
    }

    const apiKey = getGoogleServerKey();
    if (!apiKey) {
      return errorResponse("GOOGLE_PLACES_SERVER_KEY or GOOGLE_MAPS_SERVER_KEY is not configured in Supabase secrets.", 500, "missing_google_key");
    }

    const supabase = createUserSupabaseClient(request);
    const { data: userResult, error: userError } = await supabase.auth.getUser();
    if (userError || !userResult.user) {
      return errorResponse("Sign in before loading place previews.", 401, "not_authenticated");
    }

    const preview = await loadGooglePlacePreview(apiKey, placeId, clampPhotoWidth(payload.maxWidthPx));

    return jsonResponse({
      status: "ok",
      ...preview
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not load this place preview.", 500, "place_preview_failed");
  }
});

async function loadGooglePlacePreview(apiKey: string, placeId: string, maxWidthPx: number) {
  const place = await fetchPlacePreview(apiKey, placeId);
  const photo = place.photos?.find((candidate) => candidate.name);
  const authorAttributions = normalizeAuthorAttributions(photo?.authorAttributions);
  const photoUri = photo?.name ? await fetchPhotoUri(apiKey, photo.name, maxWidthPx) : "";

  return {
    photoUri,
    address: place.formattedAddress ?? "",
    authorAttributions
  };
}

async function fetchPlacePreview(apiKey: string, placeId: string) {
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
  const response = await fetchWithTimeout(url.href, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACE_PREVIEW_FIELD_MASK
    }
  }, GOOGLE_FETCH_TIMEOUT_MS, "Google Places preview timed out.");

  if (!response.ok) {
    throw new Error(await googleErrorMessage(response, "Google Places could not load this preview."));
  }

  return await response.json() as GooglePlacePreview;
}

async function fetchPhotoUri(apiKey: string, photoName: string, maxWidthPx: number) {
  const normalizedPhotoName = photoName.replace(/^\/+/, "");
  if (!normalizedPhotoName) {
    return "";
  }

  const url = new URL(`https://places.googleapis.com/v1/${normalizedPhotoName}/media`);
  url.searchParams.set("maxWidthPx", String(maxWidthPx));
  url.searchParams.set("skipHttpRedirect", "true");

  const response = await fetchWithTimeout(url.href, {
    headers: {
      "X-Goog-Api-Key": apiKey
    }
  }, GOOGLE_FETCH_TIMEOUT_MS, "Google Place photo timed out.");

  if (!response.ok) {
    return "";
  }

  const payload = await response.json() as { photoUri?: string };
  return payload.photoUri ?? "";
}

function normalizeAuthorAttributions(authorAttributions?: GooglePhotoAttribution[]) {
  return (authorAttributions ?? [])
    .map((attribution) => ({
      displayName: attribution.displayName ?? "",
      uri: attribution.uri ?? "",
      photoUri: attribution.photoUri ?? ""
    }))
    .filter((attribution) => attribution.displayName || attribution.uri || attribution.photoUri);
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

function clampPhotoWidth(value?: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 520;
  }
  return Math.max(160, Math.min(720, Math.round(number)));
}

function normalizePlaceId(placeId?: string) {
  const normalized = placeId?.trim() ?? "";
  return normalized.startsWith("places/") ? normalized.slice("places/".length) : normalized;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, timeoutMessage: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(timeoutMessage), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function googleErrorMessage(response: Response, fallback: string) {
  try {
    const payload = await response.json();
    const message = payload?.error?.message;
    if (message) {
      return message;
    }
  } catch {
    // Fall through to status text.
  }
  return `${fallback} (${response.status} ${response.statusText})`;
}
