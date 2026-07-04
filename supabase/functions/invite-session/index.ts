import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";

type InviteSessionRequest = {
  inviteToken?: string;
};

type InvitationRow = {
  id: number;
  trip_id: number;
  email: string;
  status: string;
  expires_at: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorResponse("Use POST for this function.", 405, "method_not_allowed");
  }

  try {
    const payload = await request.json() as InviteSessionRequest;
    const inviteToken = payload.inviteToken?.trim() ?? "";
    if (inviteToken.length < 24) {
      return errorResponse("Invalid invite link.", 400, "invalid_invite");
    }

    const admin = createServiceSupabaseClient();
    const tokenHash = await sha256Hex(inviteToken);
    const { data: invite, error: inviteError } = await admin
      .from("trip_invitations")
      .select("id, trip_id, email, status, expires_at")
      .eq("token_hash", tokenHash)
      .single<InvitationRow>();

    if (inviteError || !invite) {
      return errorResponse("Invite was not found.", 404, "invite_not_found");
    }

    if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
      return errorResponse("Invite has expired.", 410, "invite_expired");
    }

    await upsertInvitePasswordUser(admin, invite.email, inviteToken);

    return jsonResponse({
      status: "ready",
      email: invite.email,
      tripId: invite.trip_id,
      inviteStatus: invite.status
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not open this invite.", 500, "invite_session_failed");
  }
});

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

async function upsertInvitePasswordUser(admin: ReturnType<typeof createClient>, email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await findUserByEmail(admin, normalizedEmail);

  if (existingUser?.id) {
    const { error } = await admin.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayNameFromEmail(normalizedEmail)
      }
    });
    throwIfError(error, "Could not prepare this invite account.");
    return;
  }

  const { error } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: displayNameFromEmail(normalizedEmail)
    }
  });
  throwIfError(error, "Could not create this invite account.");
}

async function findUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });
  throwIfError(error, "Could not check this invite account.");

  return data.users.find((user) => user.email?.trim().toLowerCase() === email) ?? null;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
