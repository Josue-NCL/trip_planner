import test from "node:test";
import assert from "node:assert/strict";
import { buildDayCheck, isDayCheckItemMovable } from "./dayRouteCheck.js";

function place(name, latitude, longitude, formattedAddress = "") {
  return { id: name.toLowerCase().replace(/\s+/g, "-"), name, formattedAddress, latitude, longitude };
}

function item({ id, title, category = "Culture", city = "Kyoto", status = "Proposed", start = "10:00", latitude, longitude, itemKind = "activity" }) {
  return {
    id,
    title,
    category,
    city,
    status,
    start,
    duration: 60,
    itemKind,
    place: latitude == null || longitude == null ? null : place(title, latitude, longitude, `${city}, Japan`)
  };
}

function day({ id = "day-1", dayNumber = 1, city = "Kyoto", schedule = [], basePlace = null } = {}) {
  return { id, dayNumber, city, schedule, basePlace };
}

test("keeps an Osaka to Kyoto transfer while checking clustered Kyoto activities separately", () => {
  const sourceDay = day({
    city: "Kyoto",
    basePlace: place("Osaka hotel", 34.6937, 135.5023, "Osaka, Japan"),
    schedule: [
      item({ id: "train", title: "Train Osaka to Kyoto", category: "Transit", city: "Osaka / Kyoto", start: "08:00", latitude: 34.9858, longitude: 135.7588 }),
      item({ id: "kiyomizu", title: "Kiyomizu-dera", start: "10:00", latitude: 34.9949, longitude: 135.785 }),
      item({ id: "gion", title: "Walk Gion", start: "12:00", latitude: 35.0037, longitude: 135.7788 })
    ]
  });

  const result = buildDayCheck(sourceDay, [sourceDay]);

  assert.deepEqual(result.currentRouteTitles, ["Train Osaka to Kyoto", "Kiyomizu-dera", "Walk Gion"]);
  assert.equal(result.suggestion, null);
  assert.equal(result.statusLabel, "Destination route looks good");
  assert.match(result.coachSummary, /transfer stays in place/i);
  assert.doesNotMatch(result.coachSummary, /move.*train/i);
});

test("suggests only a distant optional destination activity after a transfer", () => {
  const sourceDay = day({
    city: "Kyoto",
    schedule: [
      item({ id: "train", title: "Train Osaka to Kyoto", category: "Transit", city: "Osaka / Kyoto", start: "08:00", latitude: 34.9858, longitude: 135.7588 }),
      item({ id: "kiyomizu", title: "Kiyomizu-dera", start: "10:00", latitude: 34.9949, longitude: 135.785 }),
      item({ id: "gion", title: "Walk Gion", start: "12:00", latitude: 35.0037, longitude: 135.7788 }),
      item({ id: "nara", title: "Nara Park", city: "Nara", start: "15:00", latitude: 34.6851, longitude: 135.843 })
    ]
  });
  const targetDay = day({ id: "day-2", dayNumber: 2, city: "Nara", schedule: [] });

  const result = buildDayCheck(sourceDay, [sourceDay, targetDay]);

  assert.equal(result.suggestion?.canApply, true);
  assert.equal(result.suggestion?.itemId, "nara");
  assert.equal(result.suggestion?.targetDayId, "day-2");
  assert.ok(result.betterRouteTitles.includes("Train Osaka to Kyoto"));
});

test("gives advice only when the geographic outlier is booked", () => {
  const sourceDay = day({
    schedule: [
      item({ id: "near-1", title: "Temple one", latitude: 35.0037, longitude: 135.7788 }),
      item({ id: "near-2", title: "Temple two", start: "12:00", latitude: 34.9949, longitude: 135.785 }),
      item({ id: "fixed", title: "Booked excursion", city: "Nara", status: "Booked", start: "15:00", latitude: 34.6851, longitude: 135.843 })
    ]
  });
  const targetDay = day({ id: "day-2", dayNumber: 2, city: "Nara" });

  const result = buildDayCheck(sourceDay, [sourceDay, targetDay]);

  assert.equal(result.suggestion?.canApply, false);
  assert.match(result.suggestion?.copy ?? "", /fixed on this day/i);
  assert.doesNotMatch(result.suggestion?.copy ?? "", /move Temple/i);
});

test("classifies transfers, stays, hotels, booked, and skipped entries as protected", () => {
  assert.equal(isDayCheckItemMovable(item({ id: "transit", title: "Train", category: "Transit", latitude: 1, longitude: 1 })), false);
  assert.equal(isDayCheckItemMovable(item({ id: "stay", title: "Ryokan", itemKind: "stay", latitude: 1, longitude: 1 })), false);
  assert.equal(isDayCheckItemMovable(item({ id: "hotel", title: "Hotel", category: "Hotel", latitude: 1, longitude: 1 })), false);
  assert.equal(isDayCheckItemMovable(item({ id: "booked", title: "Tickets", status: "Booked", latitude: 1, longitude: 1 })), false);
  assert.equal(isDayCheckItemMovable(item({ id: "skipped", title: "Skip", status: "Skipped", latitude: 1, longitude: 1 })), false);
  assert.equal(isDayCheckItemMovable(item({ id: "visit", title: "Temple", latitude: 1, longitude: 1 })), true);
});

test("keeps protected mapped entries visible while excluding skipped and unmapped entries", () => {
  const sourceDay = day({
    schedule: [
      item({ id: "train", title: "Train", category: "Transit", start: "08:00", latitude: 35, longitude: 135 }),
      item({ id: "stay", title: "Hotel", category: "Hotel", itemKind: "stay", start: "09:00", latitude: 35.01, longitude: 135.01 }),
      item({ id: "unmapped", title: "Unmapped temple", start: "10:00" }),
      item({ id: "skipped", title: "Skipped temple", status: "Skipped", start: "11:00", latitude: 35.02, longitude: 135.02 })
    ]
  });

  const result = buildDayCheck(sourceDay, [sourceDay]);

  assert.deepEqual(result.currentRouteTitles, ["Train", "Hotel"]);
});

test("preserves base round-trip scoring on days without transit", () => {
  const sourceDay = day({
    city: "Kyoto",
    basePlace: place("Osaka hotel", 34.6937, 135.5023, "Osaka, Japan"),
    schedule: [
      item({ id: "kiyomizu", title: "Kiyomizu-dera", latitude: 34.9949, longitude: 135.785 }),
      item({ id: "gion", title: "Walk Gion", start: "12:00", latitude: 35.0037, longitude: 135.7788 })
    ]
  });

  const result = buildDayCheck(sourceDay, [sourceDay]);

  assert.equal(result.statusTone, "heavy");
  assert.match(result.summary, /travel-heavy/i);
});

test("does not suggest a route change with fewer than two destination activities", () => {
  const sourceDay = day({
    schedule: [
      item({ id: "train", title: "Train Osaka to Kyoto", category: "Transit", start: "08:00", latitude: 34.9858, longitude: 135.7588 }),
      item({ id: "temple", title: "Kiyomizu-dera", start: "10:00", latitude: 34.9949, longitude: 135.785 })
    ]
  });

  const result = buildDayCheck(sourceDay, [sourceDay]);

  assert.equal(result.suggestion, null);
  assert.equal(result.resultKind, "insufficient");
  assert.equal(result.statusTone, "neutral");
  assert.equal(result.statusLabel, "Transfer planned");
  assert.match(result.coachSummary, /only one mapped destination activity/i);
});

test("uses a neutral insufficient state when a day has no mapped activities", () => {
  const sourceDay = day({
    schedule: [item({ id: "unmapped", title: "Choose a temple later" })]
  });

  const result = buildDayCheck(sourceDay, [sourceDay]);

  assert.equal(result.resultKind, "insufficient");
  assert.equal(result.statusTone, "neutral");
  assert.equal(result.statusLabel, "Not enough mapped places");
  assert.doesNotMatch(result.statusLabel, /looks good/i);
});

test("uses a neutral insufficient state when a normal day has only one mapped activity", () => {
  const sourceDay = day({
    schedule: [item({ id: "temple", title: "Kiyomizu-dera", latitude: 34.9949, longitude: 135.785 })]
  });

  const result = buildDayCheck(sourceDay, [sourceDay]);

  assert.equal(result.resultKind, "insufficient");
  assert.equal(result.statusTone, "neutral");
  assert.equal(result.statusLabel, "Only one mapped stop");
  assert.match(result.coachSummary, /add another mapped activity/i);
});
