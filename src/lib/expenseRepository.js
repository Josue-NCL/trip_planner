import { requireSupabase, supabase } from "./supabaseClient.js";
import { mapExpenseRowsToUi, mapExpenseToRows } from "./expenseMappers.js";

export async function listTripExpenses(tripId) {
  const client = requireSupabase();
  const travelersResult = await client
    .from("trip_travelers")
    .select("id, client_id, name")
    .eq("trip_id", tripId)
    .order("sort_order");
  throwIfError(travelersResult.error);

  const expensesResult = await client
    .from("trip_expenses")
    .select("*")
    .eq("trip_id", tripId)
    .order("expense_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  throwIfError(expensesResult.error);

  const expenseIds = (expensesResult.data ?? []).map((expense) => expense.id);
  const participantsResult = expenseIds.length
    ? await client.from("trip_expense_participants").select("*").in("expense_id", expenseIds)
    : { data: [], error: null };
  throwIfError(participantsResult.error);

  return mapExpenseRowsToUi({
    expenses: expensesResult.data,
    participants: participantsResult.data,
    travelers: travelersResult.data
  });
}

export async function saveTripExpense(tripId, expense) {
  const client = requireSupabase();
  const travelerIdByClientId = await getTravelerIdByClientId(tripId);
  const rows = mapExpenseToRows(tripId, expense, travelerIdByClientId);

  if (!rows.expense.paid_by_traveler_id) {
    throw new Error("Choose who paid for this expense.");
  }
  if (!rows.participants.length) {
    throw new Error("Choose at least one traveler to split this expense.");
  }

  const { data: savedExpense, error: expenseError } = await client
    .from("trip_expenses")
    .upsert(rows.expense, { onConflict: "trip_id,client_id" })
    .select("*")
    .single();
  throwIfError(expenseError);

  throwIfError((await client.from("trip_expense_participants").delete().eq("expense_id", savedExpense.id)).error);
  const participantRows = rows.participants.map((participant) => ({
    expense_id: savedExpense.id,
    ...participant
  }));
  throwIfError((await client.from("trip_expense_participants").insert(participantRows)).error);

  return listTripExpenses(tripId);
}

export async function deleteTripExpense(tripId, expenseClientId) {
  const client = requireSupabase();
  const { error } = await client
    .from("trip_expenses")
    .delete()
    .eq("trip_id", tripId)
    .eq("client_id", expenseClientId);
  throwIfError(error);
  return listTripExpenses(tripId);
}

export async function clearTripExpenses(tripId) {
  const client = requireSupabase();
  const { error } = await client
    .from("trip_expenses")
    .delete()
    .eq("trip_id", tripId);
  throwIfError(error);
}

export function subscribeToExpenseChanges(tripId, onChange) {
  if (!supabase || !tripId) {
    return () => {};
  }

  const channel = supabase
    .channel(`trip-expenses-${tripId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "trip_expenses", filter: `trip_id=eq.${tripId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "trip_expense_participants" }, onChange);

  channel.subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

async function getTravelerIdByClientId(tripId) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("trip_travelers")
    .select("id, client_id")
    .eq("trip_id", tripId);
  throwIfError(error);

  return new Map((data ?? []).map((traveler) => [traveler.client_id, traveler.id]));
}

function throwIfError(error) {
  if (error) {
    throw error;
  }
}
