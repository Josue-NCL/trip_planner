import { requireSupabase } from "./supabaseClient.js";

export async function autocompletePlace(payload) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("autocomplete-place", {
    body: payload
  });

  if (error) {
    throw new Error(error.message || "Could not load place suggestions.");
  }
  if (data?.error) {
    throw new Error(data.error.message || "Could not load place suggestions.");
  }

  return data;
}

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
