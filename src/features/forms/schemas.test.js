import assert from "node:assert/strict";
import test from "node:test";

import { FORM_SCHEMAS } from "./schemas.js";

test("guided trip creation requires the minimum trip shell", () => {
  const result = FORM_SCHEMAS.firstTrip.safeParse({
    name: "",
    city: "",
    startDate: "",
    endDate: ""
  });

  assert.equal(result.success, false);
  assert.deepEqual(
    result.error.issues.map((issue) => issue.path[0]).sort(),
    ["city", "endDate", "name", "startDate"]
  );
});

test("guided trip creation rejects an end date before the start date", () => {
  const result = FORM_SCHEMAS.firstTrip.safeParse({
    name: "Lisbon weekend",
    city: "Lisbon",
    startDate: "2026-09-12",
    endDate: "2026-09-10"
  });

  assert.equal(result.success, false);
  assert.equal(result.error.issues[0].path[0], "endDate");
});

test("guided trip creation accepts a complete trip without traveler input", () => {
  const result = FORM_SCHEMAS.firstTrip.safeParse({
    name: "Lisbon weekend",
    city: "Lisbon",
    startDate: "2026-09-10",
    endDate: "2026-09-12"
  });

  assert.equal(result.success, true);
  assert.equal("travelerName" in result.data, false);
});
