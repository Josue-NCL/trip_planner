import test from "node:test";
import assert from "node:assert/strict";
import { commitNewTripDay, createNewTripDayDraft, removeTripDayToIdeas } from "./tripSettings.js";

test("new day is a cancellable draft until committed and sorts by date", () => {
  const trip = { days: [{ id: "day-1", date: "2026-09-25", city: "Tokyo", schedule: [] }] };
  const draft = createNewTripDayDraft(trip.days, { createId: () => "day-2", today: "2026-01-01" });
  assert.equal(draft.dayNumber, 2);
  assert.equal(draft.date, "2026-09-26");
  assert.equal(draft.city, "Tokyo");
  assert.equal(trip.days.length, 1);

  const committed = commitNewTripDay(trip, { ...draft, date: "2026-09-24" });
  assert.deepEqual(committed.days.map((day) => day.id), ["day-2", "day-1"]);
});

test("last remaining day cannot be removed", () => {
  const trip = { days: [{ id: "only", date: "2026-09-25", schedule: [] }], ideas: [] };
  const result = removeTripDayToIdeas(trip, "only");
  assert.equal(result.removed, false);
  assert.equal(result.trip, trip);
});

test("removing a populated day moves activities to ideas and returns expense mappings", () => {
  const place = { id: "place-1", latitude: 35.68, longitude: 139.76 };
  const trip = {
    travelers: ["Josue", "Alex"],
    ideas: [{ id: "existing" }],
    days: [
      {
        id: "day-1",
        dayNumber: 1,
        date: "2026-09-25",
        city: "Tokyo",
        schedule: [{
          id: "sched-1", title: "Museum", category: "Culture", city: "Tokyo", duration: 90, status: "Booked",
          notes: "Tickets ready", cost: "JPY 2000", link: "https://example.com", mapLink: "https://maps.example.com", place, start: "10:00"
        }]
      },
      { id: "day-2", dayNumber: 2, date: "2026-09-26", city: "Kyoto", schedule: [] }
    ]
  };
  const result = removeTripDayToIdeas(trip, "day-1", { createIdeaId: () => "idea-moved" });
  assert.equal(result.removed, true);
  assert.equal(result.movedCount, 1);
  assert.equal(result.nextDayId, "day-2");
  assert.deepEqual(result.expenseSourceMappings, [{ scheduleItemId: "sched-1", ideaId: "idea-moved" }]);
  assert.deepEqual(result.trip.days.map((day) => day.id), ["day-2"]);
  assert.deepEqual(result.trip.ideas[0], {
    id: "idea-moved",
    title: "Museum",
    category: "Culture",
    city: "Tokyo",
    duration: 90,
    status: "Booked",
    notes: "Tickets ready\n\nPreviously scheduled: Day 1 - Sep 25, 10:00 AM.",
    cost: "JPY 2000",
    link: "https://example.com",
    mapLink: "https://maps.example.com",
    place,
    imageKey: "",
    reactions: { Josue: "", Alex: "" }
  });
  assert.equal(result.trip.ideas[1].id, "existing");
});

test("removing a day moves an owned stay and clamps another stay boundary", () => {
  const trip = {
    travelers: [],
    ideas: [],
    days: [
      { id: "day-1", dayNumber: 1, date: "2026-09-25", schedule: [{ id: "stay-a", itemKind: "stay", category: "Hotel", title: "First hotel", stayStartDayId: "day-1", stayEndDayId: "day-2" }] },
      { id: "day-2", dayNumber: 2, date: "2026-09-26", schedule: [] },
      { id: "day-3", dayNumber: 3, date: "2026-09-27", schedule: [{ id: "stay-b", itemKind: "stay", category: "Hotel", title: "Later hotel", stayStartDayId: "day-2", stayEndDayId: "day-3" }] }
    ]
  };
  const result = removeTripDayToIdeas(trip, "day-2", { createIdeaId: () => "unused" });
  assert.equal(result.movedCount, 0);
  assert.deepEqual(result.trip.days[0].schedule[0].stayEndDayId, "day-1");
  assert.deepEqual(result.trip.days[1].schedule[0].stayStartDayId, "day-3");

  const ownedStayResult = removeTripDayToIdeas(trip, "day-1", { createIdeaId: () => "idea-stay" });
  assert.equal(ownedStayResult.movedCount, 1);
  assert.equal(ownedStayResult.trip.ideas[0].id, "idea-stay");
  assert.match(ownedStayResult.trip.ideas[0].notes, /check-in 3:00 PM, check-out 11:00 AM/);
});
