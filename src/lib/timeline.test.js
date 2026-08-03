import assert from "node:assert/strict";
import test from "node:test";
import {
  MIN_TIMELINE_DURATION_MINUTES,
  TIMELINE_DAY_MINUTES,
  TIMELINE_END_MINUTES,
  TIMELINE_START_MINUTES,
  buildTimeGridSlots,
  getClampedTimelineDuration,
  getLatestTimelineStart,
  getStartTimeOptions,
  getTimelineSmartStartMinutes,
  isWithinTimelineRange,
  minutesToTimeInput,
  snapTimelineMinutes,
  suggestNextTimelineStart,
  timeRangesOverlap
} from "./timeline.js";

test("builds 30-minute rows from 1 AM up to midnight", () => {
  const slots = buildTimeGridSlots();
  assert.equal(slots.length, 46);
  assert.equal(slots[0].minutes, TIMELINE_START_MINUTES);
  assert.equal(slots.at(-1).minutes, 23 * 60 + 30);
  assert.ok(slots.every((slot) => slot.minutes < TIMELINE_END_MINUTES));
});

test("finds the earliest non-stay activity and keeps one hour of context", () => {
  const days = [
    {
      schedule: [
        { itemKind: "stay", start: "03:00", checkInTime: "15:00" },
        { category: "Food", start: "08:00" }
      ]
    },
    { schedule: [{ category: "Culture", start: "07:00" }] }
  ];

  assert.equal(getTimelineSmartStartMinutes(days), 6 * 60);
});

test("clamps the smart start and leaves empty or hotel-only timelines at the top", () => {
  assert.equal(getTimelineSmartStartMinutes([{ schedule: [{ category: "Food", start: "01:15" }] }]), TIMELINE_START_MINUTES);
  assert.equal(getTimelineSmartStartMinutes([{ schedule: [{ category: "Hotel", start: "05:00" }] }]), null);
  assert.equal(getTimelineSmartStartMinutes([{ schedule: [] }]), null);
});

test("offers quarter-hour starts through 11:45 PM", () => {
  const options = getStartTimeOptions();
  assert.equal(options[0], "01:00");
  assert.equal(options.at(-1), "23:45");
  assert.equal(options.length, 92);
});

test("clamps late activities to the remaining time before midnight", () => {
  assert.equal(getClampedTimelineDuration("23:45", 60, 60), MIN_TIMELINE_DURATION_MINUTES);
  assert.equal(getClampedTimelineDuration("23:30", 60, 60), 30);
  assert.equal(getLatestTimelineStart(15), 23 * 60 + 45);
  assert.equal(getLatestTimelineStart(60), 23 * 60);
});

test("accepts boundary activities and rejects cross-midnight activities", () => {
  assert.equal(isWithinTimelineRange("01:00", 15), true);
  assert.equal(isWithinTimelineRange("23:45", 15), true);
  assert.equal(isWithinTimelineRange("23:45", 30), false);
  assert.equal(isWithinTimelineRange("00:45", 15), false);
});

test("snaps interactions to quarter-hours and detects overlap", () => {
  assert.equal(snapTimelineMinutes(68), 75);
  assert.equal(snapTimelineMinutes(74, "floor"), 60);
  assert.equal(timeRangesOverlap(60, 30, 75, 30), true);
  assert.equal(timeRangesOverlap(60, 15, 75, 30), false);
});

test("uses a 23-hour planning window and formats midnight safely", () => {
  assert.equal(TIMELINE_DAY_MINUTES, 23 * 60);
  assert.equal(minutesToTimeInput(TIMELINE_END_MINUTES), "00:00");
});

test("suggests the next quarter-hour without crossing midnight", () => {
  assert.equal(suggestNextTimelineStart([], 60), "10:00");
  assert.equal(suggestNextTimelineStart([{ start: "20:07", duration: 40 }], 60), "21:00");
  assert.equal(suggestNextTimelineStart([{ start: "23:30", duration: 30 }], 60), "23:00");
  assert.equal(suggestNextTimelineStart([{ start: "23:30", duration: 30 }], 15), "23:45");
});
