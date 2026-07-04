export function mapExpenseRowsToUi({ expenses = [], participants = [], travelers = [] }) {
  const travelerClientIdById = new Map(travelers.map((traveler) => [String(traveler.id), traveler.client_id]));
  const participantsByExpenseId = new Map();

  participants.forEach((participant) => {
    const expenseParticipants = participantsByExpenseId.get(String(participant.expense_id)) ?? [];
    const travelerClientId = travelerClientIdById.get(String(participant.traveler_id));
    if (travelerClientId) {
      expenseParticipants.push({
        travelerClientId,
        shareAmountMinor: participant.share_amount_minor
      });
    }
    participantsByExpenseId.set(String(participant.expense_id), expenseParticipants);
  });

  return expenses.map((expense) => ({
    id: expense.client_id,
    tripId: expense.trip_id,
    clientId: expense.client_id,
    sourceType: expense.source_type,
    sourceClientId: expense.source_client_id ?? "",
    title: expense.title,
    amountMinor: expense.amount_minor,
    currency: expense.currency,
    paidByTravelerClientId: travelerClientIdById.get(String(expense.paid_by_traveler_id)) ?? "",
    participantTravelerClientIds: (participantsByExpenseId.get(String(expense.id)) ?? []).map((participant) => participant.travelerClientId),
    participantShares: participantsByExpenseId.get(String(expense.id)) ?? [],
    splitType: expense.split_type,
    expenseDate: expense.expense_date ?? "",
    notes: expense.notes ?? "",
    createdAt: expense.created_at,
    updatedAt: expense.updated_at
  }));
}

export function mapExpenseToRows(tripId, expense, travelerIdByClientId) {
  const paidByTravelerId = travelerIdByClientId.get(expense.paidByTravelerClientId);
  const participantRows = (expense.participantShares ?? []).map((participant) => ({
    traveler_id: travelerIdByClientId.get(participant.travelerClientId),
    share_amount_minor: participant.shareAmountMinor
  })).filter((participant) => participant.traveler_id);

  return {
    expense: {
      trip_id: tripId,
      client_id: expense.clientId || expense.id,
      source_type: expense.sourceType || "manual",
      source_client_id: expense.sourceClientId || null,
      title: expense.title?.trim() || "Untitled expense",
      amount_minor: Number(expense.amountMinor) || 0,
      currency: expense.currency || "JPY",
      paid_by_traveler_id: paidByTravelerId,
      split_type: "equal",
      expense_date: expense.expenseDate || null,
      notes: expense.notes?.trim() ?? ""
    },
    participants: participantRows
  };
}
