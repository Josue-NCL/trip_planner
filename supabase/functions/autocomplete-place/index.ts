import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { autocompleteGooglePlaces } from "../_shared/googleMaps.ts";

const DEFAULT_PLACE_AUTOCOMPLETE_CONFIG = {
  regionCodes: ["jp"],
  languageCode: "en"
};

type AutocompletePlaceRequest = {
  query?: string;
  sessionToken?: string;
  regionCodes?: string[];
  languageCode?: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorResponse("Use POST for this function.", 405, "method_not_allowed");
  }

  try {
    const payload = await request.json() as AutocompletePlaceRequest;
    const query = payload.query?.trim() ?? "";
    if (query.length < 2) {
      return jsonResponse({ status: "ok", suggestions: [] });
    }

    const apiKey = Deno.env.get("GOOGLE_MAPS_SERVER_KEY");
    if (!apiKey) {
      return errorResponse("GOOGLE_MAPS_SERVER_KEY is not configured in Supabase secrets.", 500, "missing_google_key");
    }

    const supabase = createUserSupabaseClient(request);
    const { data: userResult, error: userError } = await supabase.auth.getUser();
    if (userError || !userResult.user) {
      return errorResponse("Sign in before searching places.", 401, "not_authenticated");
    }

    const regionCodes = payload.regionCodes === undefined
      ? DEFAULT_PLACE_AUTOCOMPLETE_CONFIG.regionCodes
      : sanitizeRegionCodes(payload.regionCodes);
    const languageCode = payload.languageCode?.trim() || DEFAULT_PLACE_AUTOCOMPLETE_CONFIG.languageCode;
    const suggestions = await autocompleteGooglePlaces({
      apiKey,
      query,
      sessionToken: payload.sessionToken,
      regionCodes,
      languageCode
    });

    return jsonResponse({
      status: "ok",
      suggestions,
      config: {
        regionCodes,
        languageCode
      }
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not load place suggestions.", 500, "autocomplete_failed");
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

function sanitizeRegionCodes(regionCodes?: string[]) {
  const normalized = (regionCodes ?? [])
    .map((code) => String(code).trim().toLowerCase())
    .filter((code) => /^[a-z]{2}$/.test(code))
    .slice(0, 15);

  return normalized;
}
