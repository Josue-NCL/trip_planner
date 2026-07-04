import { formatMoney, parseMoneyValue, splitAmountEvenly } from "./money.js";
import { travelerClientId } from "./tripMappers.js";

export const EXPENSE_SOURCE_TYPES = {
  MANUAL: "manual",
  SCHEDULE_ITEM: "schedule_item",
  IDEA: "idea"
};

export function buildTravelerOptions(tripTravelers = [], collaborationTravelers = []) {
  const collaborationByName = new Map(
    collaborationTravelers.map((traveler) => [traveler.name, traveler])
  );

  const names = tripTravelers.length ? tripTravelers : collaborationTravelers.map((traveler) => traveler.name);
  return names
    .map((name, index) => {
      const collaborationTraveler = collaborationByName.get(name);
      return {
        clientId: collaborationTraveler?.clientId ?? travelerClientId(name),
        name,
        sortOrder: collaborationTraveler?.sortOrder ?? index
      };
    })
    .sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
}

export function deriveExpenseSuggestions(trip, trackedExpenses = []) {
  const trackedSourceKeys = new Set(
    trackedExpenses
      .filter((expense) => expense.sourceType !== EXPENSE_SOURCE_TYPES.MANUAL && expense.sourceClientId)
      .map((expense) => getExpenseSourceKey(expense.sourceType, expense.sourceClientId))
  );
  const suggestions = [];

  (trip.days ?? []).forEach((day) => {
    (day.schedule ?? []).forEach((item) => {
      addSuggestion(suggestions, trackedSourceKeys, {
        sourceType: EXPENSE_SOURCE_TYPES.SCHEDULE_ITEM,
        sourceClientId: item.id,
        title: item.title,
        rawCost: item.cost,
        category: item.category,
        city: item.city || day.city,
        date: day.date,
        sourceLabel: `Day ${day.dayNumber}`
      });
    });
  });

  (trip.ideas ?? []).forEach((idea) => {
    addSuggestion(suggestions, trackedSourceKeys, {
      sourceType: EXPENSE_SOURCE_TYPES.IDEA,
      sourceClientId: idea.id,
      title: idea.title,
      rawCost: idea.cost,
      category: idea.category,
      city: idea.city,
      date: "",
      sourceLabel: "Idea"
    });
  });

  return suggestions;
}

export function createExpenseDraft({ source = null, travelers = [], currentTravelerClientId = "" } = {}) {
  const parsedCost = source?.parsedCost ?? null;
  const participantTravelerClientIds = travelers.map((traveler) => traveler.clientId);
  const paidByTravelerClientId = currentTravelerClientId || participantTravelerClientIds[0] || "";

  return {
    id: source ? `expense-${source.sourceType}-${source.sourceClientId}-${Date.now()}` : `expense-${Date.now()}`,
    clientId: source ? `expense-${source.sourceType}-${source.sourceClientId}` : `expense-${Date.now()}`,
    sourceType: source?.sourceType ?? EXPENSE_SOURCE_TYPES.MANUAL,
    sourceClientId: source?.sourceClientId ?? "",
    title: source?.title ?? "",
    amountMinor: parsedCost?.amountMinor ?? 0,
    currency: parsedCost?.currency ?? "JPY",
    paidByTravelerClientId,
    participantTravelerClientIds,
    participantShares: splitAmountEvenly(parsedCost?.amountMinor ?? 0, participantTravelerClientIds),
    splitType: "equal",
    expenseDate: source?.date ?? "",
    notes: ""
  };
}

export function prepareExpenseForSave(expense, travelerOptions = []) {
  const sortedParticipantClientIds = sortTravelerClientIds(
    expense.participantTravelerClientIds,
    travelerOptions
  );

  return {
    ...expense,
    participantTravelerClientIds: sortedParticipantClientIds,
    participantShares: splitAmountEvenly(expense.amountMinor, sortedParticipantClientIds)
  };
}

export function calculateExpenseSummary(expenses = [], travelerOptions = []) {
  const travelersByClientId = new Map(travelerOptions.map((traveler) => [traveler.clientId, traveler]));
  const currencySummaries = new Map();

  expenses.forEach((expense) => {
    const summary = getCurrencySummary(currencySummaries, expense.currency, travelerOptions);
    summary.total += expense.amountMinor;
    summary.paidByTraveler[expense.paidByTravelerClientId] = (summary.paidByTraveler[expense.paidByTravelerClientId] ?? 0) + expense.amountMinor;

    const shares = expense.participantShares?.length
      ? expense.participantShares
      : splitAmountEvenly(expense.amountMinor, expense.participantTravelerClientIds);

    shares.forEach((share) => {
      summary.owedByTraveler[share.travelerClientId] = (summary.owedByTraveler[share.travelerClientId] ?? 0) + share.shareAmountMinor;
    });
  });

  const currencies = Array.from(currencySummaries.values()).map((summary) => {
    const balancesByTraveler = {};
    travelerOptions.forEach((traveler) => {
      balancesByTraveler[traveler.clientId] = (summary.paidByTraveler[traveler.clientId] ?? 0) - (summary.owedByTraveler[traveler.clientId] ?? 0);
    });

    return {
      ...summary,
      balancesByTraveler,
      settlements: calculateSettlements(balancesByTraveler, summary.currency, travelersByClientId)
    };
  });

  return {
    currencies,
    primaryCurrency: currencies.find((summary) => summary.currency === "JPY") ?? currencies[0] ?? getCurrencySummary(new Map(), "JPY", travelerOptions)
  };
}

export function getExpenseSourceKey(sourceType, sourceClientId) {
  return `${sourceType}:${sourceClientId}`;
}

function addSuggestion(suggestions, trackedSourceKeys, source) {
  const rawCost = String(source.rawCost ?? "").trim();
  if (!rawCost || trackedSourceKeys.has(getExpenseSourceKey(source.sourceType, source.sourceClientId))) {
    return;
  }

  suggestions.push({
    ...source,
    rawCost,
    parsedCost: parseMoneyValue(rawCost, "JPY")
  });
}

function getCurrencySummary(currencySummaries, currency, travelerOptions) {
  const normalizedCurrency = currency || "JPY";
  if (!currencySummaries.has(normalizedCurrency)) {
    currencySummaries.set(normalizedCurrency, {
      currency: normalizedCurrency,
      total: 0,
      paidByTraveler: Object.fromEntries(travelerOptions.map((traveler) => [traveler.clientId, 0])),
      owedByTraveler: Object.fromEntries(travelerOptions.map((traveler) => [traveler.clientId, 0])),
      balancesByTraveler: {},
      settlements: []
    });
  }
  return currencySummaries.get(normalizedCurrency);
}

function calculateSettlements(balancesByTraveler, currency, travelersByClientId) {
  const creditors = [];
  const debtors = [];

  Object.entries(balancesByTraveler).forEach(([travelerClientId, amount]) => {
    if (amount > 0) {
      creditors.push({ travelerClientId, amount });
    } else if (amount < 0) {
      debtors.push({ travelerClientId, amount: Math.abs(amount) });
    }
  });

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const settlements = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amountMinor = Math.min(debtor.amount, creditor.amount);

    if (amountMinor > 0) {
      settlements.push({
        fromTravelerClientId: debtor.travelerClientId,
        toTravelerClientId: creditor.travelerClientId,
        fromName: travelersByClientId.get(debtor.travelerClientId)?.name ?? "Traveler",
        toName: travelersByClientId.get(creditor.travelerClientId)?.name ?? "Traveler",
        amountMinor,
        currency,
        label: `${travelersByClientId.get(debtor.travelerClientId)?.name ?? "Traveler"} pays ${travelersByClientId.get(creditor.travelerClientId)?.name ?? "Traveler"} ${formatMoney(amountMinor, currency)}`
      });
    }

    debtor.amount -= amountMinor;
    creditor.amount -= amountMinor;

    if (debtor.amount === 0) {
      debtorIndex += 1;
    }
    if (creditor.amount === 0) {
      creditorIndex += 1;
    }
  }

  return settlements;
}

function sortTravelerClientIds(clientIds = [], travelerOptions = []) {
  const orderByClientId = new Map(travelerOptions.map((traveler, index) => [traveler.clientId, index]));
  return [...new Set(clientIds.filter(Boolean))]
    .sort((a, b) => (orderByClientId.get(a) ?? 999) - (orderByClientId.get(b) ?? 999));
}
