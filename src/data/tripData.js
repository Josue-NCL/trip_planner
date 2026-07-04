export const TRIP_VERSION = 1;

export const CATEGORIES = ["Food", "Coffee/Bar", "Culture", "Transit", "Hotel", "Shopping", "Open Time"];
export const STATUSES = ["Proposed", "Maybe", "Booked", "Skipped"];
export const TRAVELERS = ["Me"];
const DEFAULT_TRIP_DAYS = 1;

const tripDates = [
  "2026-09-25",
  "2026-09-26",
  "2026-09-27",
  "2026-09-28",
  "2026-09-29",
  "2026-09-30",
  "2026-10-01",
  "2026-10-02",
  "2026-10-03",
  "2026-10-04",
  "2026-10-05"
];

export function makeTripDays() {
  return tripDates.map((date, index) => ({
    id: date,
    date,
    dayNumber: index + 1,
    city: index < 3 ? "Tokyo" : index < 8 ? "Kyoto / Osaka" : "Tokyo",
    notes: "",
    schedule: []
  }));
}

export function makeInitialTrip() {
  return {
    version: TRIP_VERSION,
    name: "Japan 2026",
    dateRangeLabel: "Sep 25 - Oct 5",
    travelers: TRAVELERS,
    days: makeTripDays(),
    ideas: [],
    updatedAt: new Date().toISOString()
  };
}

export function buildCustomTrip({
  name = "Untitled trip",
  startDate,
  endDate,
  city = "",
  travelers = TRAVELERS
} = {}) {
  const normalizedCity = String(city ?? "").trim();
  const normalizedStartDate = normalizeDateInput(startDate) || getTodayDate();
  const normalizedEndDate = normalizeDateInput(endDate) || normalizedStartDate;
  const orderedStartDate = compareDateInputs(normalizedStartDate, normalizedEndDate) <= 0 ? normalizedStartDate : normalizedEndDate;
  const orderedEndDate = compareDateInputs(normalizedStartDate, normalizedEndDate) <= 0 ? normalizedEndDate : normalizedStartDate;
  const days = buildTripDaysFromRange({
    startDate: orderedStartDate,
    endDate: orderedEndDate,
    city: normalizedCity
  });

  return {
    version: TRIP_VERSION,
    name: String(name ?? "").trim() || "Untitled trip",
    dateRangeLabel: "",
    travelers: normalizeTravelers(travelers),
    days,
    ideas: [],
    updatedAt: new Date().toISOString()
  };
}

export function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function buildTripDaysFromRange({ startDate, endDate, city }) {
  const days = [];
  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate);
  const maxDays = Math.max(DEFAULT_TRIP_DAYS, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);

  for (let index = 0; index < maxDays; index += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const dateValue = date.toISOString().slice(0, 10);
    days.push({
      id: `day-${dateValue}-${index + 1}`,
      date: dateValue,
      dayNumber: index + 1,
      city,
      notes: "",
      schedule: []
    });
  }

  return days;
}

function normalizeTravelers(travelers) {
  const names = (travelers ?? [])
    .map((name) => String(name ?? "").trim())
    .filter(Boolean);
  return names.length ? names : TRAVELERS;
}

function normalizeDateInput(dateValue) {
  const value = String(dateValue ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseDateInput(value).getTime()) ? value : "";
}

function compareDateInputs(first, second) {
  return parseDateInput(first).getTime() - parseDateInput(second).getTime();
}

function parseDateInput(dateValue) {
  return new Date(`${dateValue}T12:00:00.000Z`);
}
