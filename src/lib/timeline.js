export const TIMELINE_START_MINUTES = 60;
export const TIMELINE_END_MINUTES = 24 * 60;
export const TIMELINE_GRID_STEP_MINUTES = 30;
export const TIMELINE_INTERACTION_STEP_MINUTES = 15;
export const MIN_TIMELINE_DURATION_MINUTES = 15;
export const TIMELINE_DAY_MINUTES = TIMELINE_END_MINUTES - TIMELINE_START_MINUTES;

function isTimelineStay(item) {
  return item?.itemKind === "stay"
    || item?.category === "Hotel"
    || Boolean(item?.stayStartDayId || item?.stayEndDayId || item?.checkInTime || item?.checkOutTime);
}

export function getTimelineSmartStartMinutes(days = [], contextMinutes = 60) {
  let earliestActivityStart = null;

  for (const day of days) {
    for (const item of day?.schedule ?? []) {
      if (isTimelineStay(item)) continue;

      const start = parseTimeToMinutes(item?.start);
      if (start === null || start < TIMELINE_START_MINUTES || start >= TIMELINE_END_MINUTES) continue;

      if (earliestActivityStart === null || start < earliestActivityStart) {
        earliestActivityStart = start;
      }
    }
  }

  if (earliestActivityStart === null) {
    return null;
  }

  return Math.max(TIMELINE_START_MINUTES, earliestActivityStart - Math.max(0, Number(contextMinutes) || 0));
}

export function buildTimeGridSlots() {
  const slots = [];
  for (let minutes = TIMELINE_START_MINUTES; minutes < TIMELINE_END_MINUTES; minutes += TIMELINE_GRID_STEP_MINUTES) {
    slots.push({ minutes });
  }
  return slots;
}

export function getStartTimeOptions(selectedValue = "") {
  const options = [];
  for (let minutes = TIMELINE_START_MINUTES; minutes <= TIMELINE_END_MINUTES - MIN_TIMELINE_DURATION_MINUTES; minutes += TIMELINE_INTERACTION_STEP_MINUTES) {
    options.push(minutesToTimeInput(minutes));
  }
  if (selectedValue && !options.includes(selectedValue)) {
    return [...options, selectedValue].sort((first, second) => (parseTimeToMinutes(first) ?? 0) - (parseTimeToMinutes(second) ?? 0));
  }
  return options;
}

export function getClampedTimelineDuration(startTime, durationMinutes, fallbackDuration = MIN_TIMELINE_DURATION_MINUTES) {
  const startMinutes = clampMinutes(
    parseTimeToMinutes(startTime) ?? TIMELINE_START_MINUTES,
    TIMELINE_START_MINUTES,
    TIMELINE_END_MINUTES - MIN_TIMELINE_DURATION_MINUTES
  );
  const requestedDuration = Math.max(MIN_TIMELINE_DURATION_MINUTES, Number(durationMinutes) || fallbackDuration);
  return clampMinutes(requestedDuration, MIN_TIMELINE_DURATION_MINUTES, TIMELINE_END_MINUTES - startMinutes);
}

export function getLatestTimelineStart(durationMinutes = MIN_TIMELINE_DURATION_MINUTES) {
  const duration = Math.max(MIN_TIMELINE_DURATION_MINUTES, Number(durationMinutes) || MIN_TIMELINE_DURATION_MINUTES);
  return Math.max(TIMELINE_START_MINUTES, TIMELINE_END_MINUTES - duration);
}

export function snapTimelineMinutes(minutes, mode = "round") {
  const snap = mode === "floor" ? Math.floor : Math.round;
  return snap(minutes / TIMELINE_INTERACTION_STEP_MINUTES) * TIMELINE_INTERACTION_STEP_MINUTES;
}

export function isWithinTimelineRange(startTime, durationMinutes) {
  const start = parseTimeToMinutes(startTime);
  const duration = Math.max(MIN_TIMELINE_DURATION_MINUTES, Number(durationMinutes) || MIN_TIMELINE_DURATION_MINUTES);
  return start !== null && start >= TIMELINE_START_MINUTES && start + duration <= TIMELINE_END_MINUTES;
}

export function timeRangesOverlap(firstStart, firstDuration, secondStart, secondDuration) {
  const firstEnd = firstStart + firstDuration;
  const secondEnd = secondStart + secondDuration;
  return firstStart < secondEnd && secondStart < firstEnd;
}

export function suggestNextTimelineStart(schedule = [], durationMinutes = 60, fallbackStart = "10:00") {
  if (!schedule.length) {
    return fallbackStart;
  }
  const latestEnd = schedule.reduce((max, item) => {
    const start = parseTimeToMinutes(item?.start);
    if (start === null) {
      return max;
    }
    const duration = Math.max(MIN_TIMELINE_DURATION_MINUTES, Number(item?.duration) || 60);
    return Math.max(max, start + duration);
  }, parseTimeToMinutes(fallbackStart) ?? TIMELINE_START_MINUTES);
  const rounded = Math.ceil(latestEnd / TIMELINE_INTERACTION_STEP_MINUTES) * TIMELINE_INTERACTION_STEP_MINUTES;
  return minutesToTimeInput(clampMinutes(rounded, TIMELINE_START_MINUTES, getLatestTimelineStart(durationMinutes)));
}

export function minutesToTimeInput(totalMinutes) {
  const normalizedMinutes = ((Math.round(Number(totalMinutes) || 0) % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = String(Math.floor(normalizedMinutes / 60)).padStart(2, "0");
  const minutes = String(normalizedMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function parseTimeToMinutes(time) {
  if (!time) {
    return null;
  }
  const match = String(time).match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

export function clampMinutes(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
