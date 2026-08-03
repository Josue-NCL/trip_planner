import assert from "node:assert/strict";
import test from "node:test";
import { convertMoneyMinor, normalizeBudgetExchangeRates, normalizeExchangeRate } from "./budgetCurrency.js";

const RATES = [
  { fromCurrency: "USD", toCurrency: "JPY", rate: 160 },
  { fromCurrency: "USD", toCurrency: "MXN", rate: 18 }
];

test("converts MXN through USD into JPY and USD", () => {
  assert.equal(convertMoneyMinor(18000, "MXN", "USD", RATES), 1000);
  assert.equal(convertMoneyMinor(18000, "MXN", "JPY", RATES), 1600);
});

test("converts JPY and USD into MXN", () => {
  assert.equal(convertMoneyMinor(1600, "JPY", "MXN", RATES), 18000);
  assert.equal(convertMoneyMinor(1000, "USD", "MXN", RATES), 18000);
});

test("preserves native currency amounts and valid rate fallbacks", () => {
  assert.equal(convertMoneyMinor(12345, "MXN", "MXN", RATES), 12345);
  assert.equal(normalizeExchangeRate("", 18), 18);
  assert.equal(normalizeExchangeRate("20.5", 18), 20.5);
});

test("migrates legacy saved rates and resolves configured inverse pairs", () => {
  const migratedRates = normalizeBudgetExchangeRates({ jpyPerUsd: 160, mxnPerUsd: 18 });
  assert.deepEqual(migratedRates.map(({ fromCurrency, toCurrency, rate }) => ({ fromCurrency, toCurrency, rate })), [
    { fromCurrency: "USD", toCurrency: "JPY", rate: 160 },
    { fromCurrency: "USD", toCurrency: "MXN", rate: 18 }
  ]);
  assert.equal(convertMoneyMinor(1600, "JPY", "USD", migratedRates), 1000);
});

test("returns null when no saved pair can convert the currencies", () => {
  assert.equal(convertMoneyMinor(18000, "MXN", "USD", []), null);
});
