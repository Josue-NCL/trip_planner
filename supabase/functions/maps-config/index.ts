import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorResponse("Use POST for this function.", 405, "method_not_allowed");
  }

  try {
    const supabase = createUserSupabaseClient(request);
    const { data: userResult, error: userError } = await supabase.auth.getUser();
    if (userError || !userResult.user) {
      return errorResponse("Sign in before loading map settings.", 401, "not_authenticated");
    }

    const apiKey = Deno.env.get("GOOGLE_MAPS_BROWSER_KEY") || "";
    if (!apiKey) {
      return errorResponse("GOOGLE_MAPS_BROWSER_KEY is not configured in Supabase secrets.", 500, "missing_google_key");
    }

    return jsonResponse({
      status: "ok",
      apiKey,
      mapId: Deno.env.get("GOOGLE_MAPS_MAP_ID") || "DEMO_MAP_ID"
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not load map settings.", 500, "maps_config_failed");
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
