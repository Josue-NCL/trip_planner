import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { type PlaceSuggestion, searchGooglePlaceSuggestions } from "../_shared/googleMaps.ts";

type SearchPlaceSuggestionsRequest = {
  query?: string;
  intents?: Array<{ interestId?: string; query?: string }>;
  refinement?: string;
  destination?: string;
  regionCodes?: string[];
  languageCode?: string;
  limit?: number;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return errorResponse("Use POST for this function.", 405, "method_not_allowed");
  }

  try {
    const payload = await request.json() as SearchPlaceSuggestionsRequest;
    const destination = payload.destination?.trim() ?? "";
    const intents = normalizeIntents(payload);
    if (!intents.length) {
      return errorResponse("Tell us what kind of place you want to find.", 400, "invalid_query");
    }
    if (destination.length < 2) {
      return errorResponse("Add a destination before finding ideas.", 400, "invalid_destination");
    }

    const apiKey = getGoogleServerKey();
    if (!apiKey) {
      return errorResponse("GOOGLE_PLACES_SERVER_KEY or GOOGLE_MAPS_SERVER_KEY is not configured in Supabase secrets.", 500, "missing_google_key");
    }

    const supabase = createUserSupabaseClient(request);
    const { data: userResult, error: userError } = await supabase.auth.getUser();
    if (userError || !userResult.user) {
      return errorResponse("Sign in before finding trip ideas.", 401, "not_authenticated");
    }

    const refinement = payload.refinement?.trim().slice(0, 120) ?? "";
    const searches = await Promise.allSettled(
      intents.map(async (intent) => ({
        interestId: intent.interestId,
        suggestions: await searchGooglePlaceSuggestions({
          apiKey,
          query: refinement ? `${intent.query}, ${refinement}` : intent.query,
          destination,
          regionCode: firstRegionCode(payload.regionCodes),
          languageCode: payload.languageCode?.trim() || "en",
          limit: payload.limit
        })
      }))
    );
    const successfulSearches = searches
      .filter((result): result is PromiseFulfilledResult<{ interestId: string; suggestions: PlaceSuggestion[] }> => result.status === "fulfilled")
      .map((result) => result.value);
    if (!successfulSearches.length) {
      const failedSearch = searches.find((result): result is PromiseRejectedResult => result.status === "rejected");
      throw failedSearch?.reason instanceof Error ? failedSearch.reason : new Error("Google Places could not find ideas right now.");
    }
    const suggestions = mergeSuggestions(successfulSearches, payload.limit);

    return jsonResponse({ status: "ok", suggestions });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not find trip ideas.", 500, "place_discovery_failed");
  }
});

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

function firstRegionCode(regionCodes?: string[]) {
  const regionCode = (regionCodes ?? [])
    .map((value) => String(value).trim().toUpperCase())
    .find((value) => /^[A-Z]{2}$/.test(value));
  return regionCode ?? "";
}

function normalizeIntents(payload: SearchPlaceSuggestionsRequest) {
  const seenInterestIds = new Set<string>();
  const intents = (Array.isArray(payload.intents) ? payload.intents : [])
    .map((intent) => ({
      interestId: String(intent?.interestId ?? "").trim().toLowerCase(),
      query: String(intent?.query ?? "").trim()
    }))
    .filter((intent) => intent.interestId && intent.query.length >= 2 && !seenInterestIds.has(intent.interestId))
    .filter((intent) => {
      seenInterestIds.add(intent.interestId);
      return true;
    })
    .slice(0, 3);

  if (intents.length) {
    return intents;
  }

  const query = payload.query?.trim() ?? "";
  return query.length >= 2 ? [{ interestId: "custom", query }] : [];
}

function mergeSuggestions(searches: Array<{ interestId: string; suggestions: PlaceSuggestion[] }>, requestedLimit?: number) {
  const limit = Math.max(1, Math.min(8, Math.round(Number(requestedLimit) || 8)));
  const queues = searches.map((search) => ({ ...search, index: 0 }));
  const byPlaceId = new Map<string, PlaceSuggestion>();
  const merged: PlaceSuggestion[] = [];
  let hasRemaining = true;

  while (merged.length < limit && hasRemaining) {
    hasRemaining = false;
    for (const queue of queues) {
      const suggestion = queue.suggestions[queue.index++];
      if (!suggestion) {
        continue;
      }
      hasRemaining = true;
      const existing = byPlaceId.get(suggestion.placeId);
      if (existing) {
        existing.interestIds = [...new Set([...(existing.interestIds ?? []), queue.interestId])];
        continue;
      }
      const next = { ...suggestion, interestIds: queue.interestId === "custom" ? [] : [queue.interestId] };
      byPlaceId.set(next.placeId, next);
      merged.push(next);
      if (merged.length >= limit) {
        break;
      }
    }
  }

  return merged;
}
