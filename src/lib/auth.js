import { requireSupabase, supabase } from "./supabaseClient.js";

export async function getCurrentSession() {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

  return data.session;
}

export function onAuthSessionChange(callback) {
  if (!supabase) {
    return () => {};
  }

  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function sendMagicLink(email) {
  const client = requireSupabase();
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo
    }
  });

  if (error) {
    throw error;
  }
}

export async function signOut() {
  const client = requireSupabase();
  const { error } = await client.auth.signOut();
  if (error) {
    throw error;
  }
}

export async function ensureUserProfile(session) {
  if (!session?.user) {
    return;
  }

  const client = requireSupabase();
  const email = session.user.email ?? "";
  const displayName = session.user.user_metadata?.display_name ?? email.split("@")[0] ?? "Traveler";
  const { error } = await client.from("profiles").upsert({
    id: session.user.id,
    email,
    display_name: displayName
  });

  if (error) {
    throw error;
  }
}
