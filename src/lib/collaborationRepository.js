import { requireSupabase } from "./supabaseClient.js";

const INVITE_TOKEN_BYTES = 32;

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

export async function createTripInvite({ tripId, email, travelerId, invitedBy }) {
  const client = requireSupabase();
  const inviteToken = createInviteToken();
  const tokenHash = await sha256Hex(inviteToken);
  const normalizedEmail = normalizeEmail(email);

  const { data, error } = await client
    .from("trip_invitations")
    .insert({
      trip_id: tripId,
      email: normalizedEmail,
      role: "editor",
      traveler_id: travelerId,
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

export async function claimTripTraveler(travelerId) {
  const client = requireSupabase();
  const { error } = await client.rpc("claim_trip_traveler", {
    target_traveler_id: travelerId
  });
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
  const url = new URL(window.location.href);
  url.searchParams.delete("preview");
  url.searchParams.set("invite", inviteToken);
  return url.toString();
}

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
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
