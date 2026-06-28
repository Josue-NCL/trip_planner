import { requireSupabase } from "./supabaseClient.js";

export async function resolvePlace(payload) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("resolve-place", {
    body: payload
  });

  if (error) {
    throw new Error(error.message || "Could not resolve this place.");
  }
  if (data?.error) {
    throw new Error(data.error.message || "Could not resolve this place.");
  }

  return data;
}

export async function routeDay(payload) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("route-day", {
    body: payload
  });

  if (error) {
    throw new Error(error.message || "Could not build this route.");
  }
  if (data?.error) {
    throw new Error(data.error.message || "Could not build this route.");
  }

  return data;
}
