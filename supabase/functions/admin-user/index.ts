import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";

type AdminUserRequest = {
  tripId?: number;
  email?: string;
  password?: string;
  role?: "editor" | "viewer";
  displayName?: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorResponse("Use POST for this function.", 405, "method_not_allowed");
  }

  try {
    const payload = await request.json() as AdminUserRequest;
    const tripId = Number(payload.tripId);
    const email = normalizeEmail(payload.email);
    const password = String(payload.password ?? "");
    const role = payload.role === "viewer" ? "viewer" : "editor";
    const displayName = String(payload.displayName ?? "").trim() || displayNameFromEmail(email);

    if (!Number.isFinite(tripId) || tripId <= 0) {
      return errorResponse("Trip is required.", 400, "invalid_trip");
    }
    if (!email) {
      return errorResponse("A valid email is required.", 400, "invalid_email");
    }
    if (password.length < 6) {
      return errorResponse("Password must be at least 6 characters.", 400, "weak_password");
    }

    const userClient = createUserSupabaseClient(request);
    const { data: userResult, error: userError } = await userClient.auth.getUser();
    if (userError || !userResult.user) {
      return errorResponse("Sign in as the trip owner first.", 401, "not_authenticated");
    }

    const admin = createServiceSupabaseClient();
    await assertTripOwner(admin, tripId, userResult.user.id);
    const userId = await upsertPasswordUser(admin, email, password, displayName);

    const { error: profileError } = await admin.from("profiles").upsert({
      id: userId,
      email,
      display_name: displayName
    });
    throwIfError(profileError, "Could not update this profile.");

    const { error: memberError } = await admin.from("trip_members").upsert({
      trip_id: tripId,
      profile_id: userId,
      role
    }, { onConflict: "trip_id,profile_id" });
    throwIfError(memberError, "Could not add this user to the trip.");

    return jsonResponse({
      status: "ready",
      userId,
      email,
      displayName,
      role,
      tripId
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not create this user.", 500, "admin_user_failed");
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

function createServiceSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase function environment is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function assertTripOwner(admin: ReturnType<typeof createClient>, tripId: number, profileId: string) {
  const { data, error } = await admin
    .from("trip_members")
    .select("role")
    .eq("trip_id", tripId)
    .eq("profile_id", profileId)
    .maybeSingle<{ role: string }>();
  throwIfError(error, "Could not verify trip access.");

  if (data?.role !== "owner") {
    throw new Error("Only the trip owner can create password users.");
  }
}

async function upsertPasswordUser(admin: ReturnType<typeof createClient>, email: string, password: string, displayName: string) {
  const existingUser = await findUserByEmail(admin, email);

  if (existingUser?.id) {
    const { error } = await admin.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName
      }
    });
    throwIfError(error, "Could not update this user.");
    return existingUser.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: displayName
    }
  });
  throwIfError(error, "Could not create this user.");

  if (!data.user?.id) {
    throw new Error("Supabase did not return a user id.");
  }

  return data.user.id;
}

async function findUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });
  throwIfError(error, "Could not check existing users.");

  return data.users.find((user) => user.email?.trim().toLowerCase() === email) ?? null;
}

function normalizeEmail(email: unknown) {
  const normalized = String(email ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : "";
}

function displayNameFromEmail(email: string) {
  return email.split("@")[0] || "Traveler";
}

function throwIfError(error: unknown, fallbackMessage: string) {
  if (!error) {
    return;
  }

  const message = typeof error === "object" && error && "message" in error
    ? String((error as { message?: string }).message)
    : fallbackMessage;
  throw new Error(message || fallbackMessage);
}
