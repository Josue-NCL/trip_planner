import test from "node:test";
import assert from "node:assert/strict";
import { calculateExpenseSummary, deriveExpenseSuggestions } from "./expenses.js";

const travelers = [
  { clientId: "traveler-me", name: "Me", sortOrder: 0 },
  { clientId: "traveler-wife", name: "Wife", sortOrder: 1 },
  { clientId: "traveler-friend", name: "Friend", sortOrder: 2 }
];

test("derives untracked suggestions from schedule items and ideas with costs", () => {
  const trip = {
    days: [
      {
        date: "2026-09-28",
        dayNumber: 1,
        city: "Tokyo",
        schedule: [
          { id: "sched-1", title: "TeamLab", cost: "¥6,400", category: "Culture" },
          { id: "sched-2", title: "Walk", cost: "", category: "Open Time" }
        ]
      }
    ],
    ideas: [{ id: "idea-1", title: "Ramen", cost: "$40", category: "Food" }]
  };

  const suggestions = deriveExpenseSuggestions(trip, [{ sourceType: "idea", sourceClientId: "idea-1" }]);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].sourceClientId, "sched-1");
  assert.deepEqual(suggestions[0].parsedCost, { amountMinor: 6400, currency: "JPY" });
});

test("calculates balances and a two-person settlement", () => {
  const summary = calculateExpenseSummary([
    {
      amountMinor: 10000,
      currency: "JPY",
      paidByTravelerClientId: "traveler-me",
      participantTravelerClientIds: ["traveler-me", "traveler-wife"],
      participantShares: [
        { travelerClientId: "traveler-me", shareAmountMinor: 5000 },
        { travelerClientId: "traveler-wife", shareAmountMinor: 5000 }
      ]
    },
    {
      amountMinor: 2000,
      currency: "JPY",
      paidByTravelerClientId: "traveler-wife",
      participantTravelerClientIds: ["traveler-me", "traveler-wife"],
      participantShares: [
        { travelerClientId: "traveler-me", shareAmountMinor: 1000 },
        { travelerClientId: "traveler-wife", shareAmountMinor: 1000 }
      ]
    }
  ], travelers.slice(0, 2));

  assert.equal(summary.primaryCurrency.balancesByTraveler["traveler-me"], 4000);
  assert.equal(summary.primaryCurrency.balancesByTraveler["traveler-wife"], -4000);
  assert.equal(summary.primaryCurrency.settlements[0].label, "Wife pays Me ¥4,000");
});

test("calculates a three-person optimized settlement", () => {
  const summary = calculateExpenseSummary([
    {
      amountMinor: 9000,
      currency: "JPY",
      paidByTravelerClientId: "traveler-me",
      participantTravelerClientIds: travelers.map((traveler) => traveler.clientId),
      participantShares: [
        { travelerClientId: "traveler-me", shareAmountMinor: 3000 },
        { travelerClientId: "traveler-wife", shareAmountMinor: 3000 },
        { travelerClientId: "traveler-friend", shareAmountMinor: 3000 }
      ]
    }
  ], travelers);

  assert.deepEqual(summary.primaryCurrency.settlements.map((settlement) => settlement.label), [
    "Wife pays Me ¥3,000",
    "Friend pays Me ¥3,000"
  ]);
});
