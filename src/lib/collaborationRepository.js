import { requireSupabase } from "./supabaseClient.js";
import { buildTripInviteUrl } from "./url.js";

const INVITE_TOKEN_BYTES = 32;
const INVITE_ROLES = new Set(["editor", "viewer"]);

export async function listTripCollaboration(tripId) {
  const client = requireSupabase();
  const [membersResult, travelersResult, invitationsResult] = await Promise.all([
    client
      .from("trip_members")
      .select("profile_id, role, created_at, profiles(id, display_name, email)")
      .eq("trip_id", tripId)
      .order("created_at"),
    client
      .from("trip_travelers")
      .select("id, client_id, name, profile_id, sort_order, profiles(id, display_name, email)")
      .eq("trip_id", tripId)
      .order("sort_order"),
    client
      .from("trip_invitations")
      .select("id, email, role, traveler_id, status, accepted_by, accepted_at, expires_at, created_at")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false })
  ]);

  throwIfError(membersResult.error);
  throwIfError(travelersResult.error);
  throwIfError(invitationsResult.error);

  return {
    members: (membersResult.data ?? []).map((member) => {
      const profile = normalizeJoinedProfile(member.profiles);
      return {
        profileId: member.profile_id,
        role: member.role,
        createdAt: member.created_at,
        displayName: profile?.display_name ?? profile?.email ?? "Traveler",
        email: profile?.email ?? ""
      };
    }),
    travelers: (travelersResult.data ?? []).map((traveler) => {
      const profile = normalizeJoinedProfile(traveler.profiles);
      return {
        id: traveler.id,
        clientId: traveler.client_id,
        name: traveler.name,
        profileId: traveler.profile_id,
        sortOrder: traveler.sort_order,
        displayName: profile?.display_name ?? traveler.name,
        email: profile?.email ?? ""
      };
    }),
    invitations: (invitationsResult.data ?? []).map((invite) => ({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      travelerId: invite.traveler_id,
      status: invite.status,
      acceptedBy: invite.accepted_by,
      acceptedAt: invite.accepted_at,
      expiresAt: invite.expires_at,
      createdAt: invite.created_at
    }))
  };
}

export async function createTripInvite({ tripId, email, role = "editor", invitedBy }) {
  const client = requireSupabase();
  const inviteToken = createInviteToken();
  const tokenHash = await sha256Hex(inviteToken);
  const normalizedEmail = normalizeEmail(email);
  const normalizedRole = normalizeInviteRole(role);

  throwIfError(
    (await client
      .from("trip_invitations")
      .update({ status: "revoked" })
      .eq("trip_id", tripId)
      .eq("email", normalizedEmail)
      .eq("status", "pending")).error
  );

  const { data, error } = await client
    .from("trip_invitations")
    .insert({
      trip_id: tripId,
      email: normalizedEmail,
      role: normalizedRole,
      token_hash: tokenHash,
      invited_by: invitedBy,
      status: "pending"
    })
    .select("id")
    .single();

  throwIfError(error);

  return {
    id: data.id,
    inviteUrl: buildInviteUrl(inviteToken)
  };
}

export async function revokeTripInvite(inviteId) {
  const client = requireSupabase();
  const { error } = await client
    .from("trip_invitations")
    .update({ status: "revoked" })
    .eq("id", inviteId);
  throwIfError(error);
}

export async function acceptTripInvite(inviteToken) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("accept_trip_invite", {
    invite_token: inviteToken
  });
  throwIfError(error);

  return data?.[0]?.trip_id ?? null;
}

export async function prepareInviteSession(inviteToken) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("invite-session", {
    body: { inviteToken }
  });
  throwIfError(error);

  if (data?.error) {
    throw new Error(data.error.message ?? "Could not open this invite.");
  }
  if (!data?.email) {
    throw new Error("Invite did not return an account email.");
  }

  return data;
}

export async function acceptPendingTripInvite() {
  const client = requireSupabase();
  const { data, error } = await client.rpc("accept_pending_trip_invite");
  throwIfError(error);

  return data?.[0]?.trip_id ?? null;
}

export async function claimTripTraveler(travelerId) {
  const client = requireSupabase();
  const { error } = await client.rpc("claim_trip_traveler", {
    target_traveler_id: travelerId
  });
  throwIfError(error);
}

export async function createOwnTripTraveler({ tripId, name }) {
  const client = requireSupabase();
  const {
    data: { user },
    error: userError
  } = await client.auth.getUser();
  throwIfError(userError);

  if (!user?.id) {
    throw new Error("Sign in before creating a traveler.");
  }

  const nextName = String(name ?? "").trim() || getNameFromEmail(user.email);
  const { data: travelers, error: travelersError } = await client
    .from("trip_travelers")
    .select("id, name, profile_id, sort_order, client_id")
    .eq("trip_id", tripId)
    .order("sort_order");
  throwIfError(travelersError);

  const existingTraveler = (travelers ?? []).find((traveler) => traveler.profile_id === user.id);
  if (existingTraveler) {
    return existingTraveler;
  }

  const travelerName = getAvailableTravelerName(nextName, travelers ?? []);
  const sortOrder = (travelers ?? []).reduce((max, traveler) => Math.max(max, Number(traveler.sort_order) || 0), -1) + 1;
  const { data, error } = await client
    .from("trip_travelers")
    .insert({
      trip_id: tripId,
      client_id: createTravelerClientId(travelerName),
      name: travelerName,
      profile_id: user.id,
      sort_order: sortOrder
    })
    .select("id, name, profile_id, sort_order, client_id")
    .single();
  throwIfError(error);

  return data;
}

export async function updateTripTravelerName(travelerId, name) {
  const client = requireSupabase();
  const nextName = String(name ?? "").trim();
  if (!nextName) {
    throw new Error("Traveler name is required.");
  }

  const { error } = await client
    .from("trip_travelers")
    .update({ name: nextName })
    .eq("id", travelerId);
  throwIfError(error);
}

function createInviteToken() {
  const bytes = new Uint8Array(INVITE_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function buildInviteUrl(inviteToken) {
  return buildTripInviteUrl(inviteToken);
}

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function normalizeInviteRole(role) {
  const value = String(role ?? "editor").trim().toLowerCase();
  if (!INVITE_ROLES.has(value)) {
    throw new Error("Choose a valid access level.");
  }
  return value;
}

function getAvailableTravelerName(name, travelers) {
  const baseName = String(name ?? "").trim() || "Traveler";
  const usedNames = new Set(travelers.map((traveler) => String(traveler.name ?? "").trim().toLowerCase()));
  if (!usedNames.has(baseName.toLowerCase())) {
    return baseName;
  }

  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${baseName} ${suffix}`;
    if (!usedNames.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return `${baseName} ${Date.now()}`;
}

function createTravelerClientId(name) {
  const slug = String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `traveler-${slug || "guest"}-${Date.now().toString(36)}`;
}

function getNameFromEmail(email) {
  return String(email ?? "").split("@")[0] || "Traveler";
}

function normalizeJoinedProfile(profile) {
  if (Array.isArray(profile)) {
    return profile[0] ?? null;
  }
  return profile ?? null;
}

function throwIfError(error) {
  if (error) {
    throw error;
  }
}
