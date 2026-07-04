import { requireSupabase } from "./supabaseClient.js";

export async function createPasswordUser({ tripId, email, password, role = "editor", displayName = "" }) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("admin-user", {
    body: {
      tripId,
      email,
      password,
      role,
      displayName
    }
  });

  if (error) {
    throw new Error(error.message || "Could not create this user.");
  }
  if (data?.error) {
    throw new Error(data.error.message || "Could not create this user.");
  }

  return data;
}
