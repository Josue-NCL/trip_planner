import test from "node:test";
import assert from "node:assert/strict";
import { formatMoney, parseMoneyValue, splitAmountEvenly } from "./money.js";

test("parses JPY and USD cost strings into integer minor units", () => {
  assert.deepEqual(parseMoneyValue("¥6,400"), { amountMinor: 6400, currency: "JPY" });
  assert.deepEqual(parseMoneyValue("6400 JPY"), { amountMinor: 6400, currency: "JPY" });
  assert.deepEqual(parseMoneyValue("$40"), { amountMinor: 4000, currency: "USD" });
  assert.deepEqual(parseMoneyValue("USD 40.25"), { amountMinor: 4025, currency: "USD" });
});

test("does not parse vague cost values", () => {
  assert.equal(parseMoneyValue("$$"), null);
  assert.equal(parseMoneyValue("TBD"), null);
  assert.equal(parseMoneyValue("Free"), null);
  assert.equal(parseMoneyValue(""), null);
});

test("formats supported currencies", () => {
  assert.equal(formatMoney(6400, "JPY"), "¥6,400");
  assert.equal(formatMoney(4025, "USD"), "$40.25");
});

test("splits integer amounts evenly and assigns remainders stably", () => {
  assert.deepEqual(splitAmountEvenly(10001, ["a", "b", "c"]), [
    { travelerClientId: "a", shareAmountMinor: 3334 },
    { travelerClientId: "b", shareAmountMinor: 3334 },
    { travelerClientId: "c", shareAmountMinor: 3333 }
  ]);
});
