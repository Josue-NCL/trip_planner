import test from "node:test";
import assert from "node:assert/strict";
import {
  dominantMapCluster,
  mapCameraStorageKey,
  mapFitPadding,
  mapItemsCenter,
  outsideViewportResultCount,
  readStoredMapCamera,
  resolveInitialMapCamera,
  selectedDayMapCandidates,
  selectInitialMapCluster,
  writeStoredMapCamera
} from "./mapCamera.js";

test("dominant cluster excludes distant transit outliers", () => {
  const tokyo = [
    { id: "tokyo", position: { lat: 35.6812, lng: 139.7671 } },
    { id: "shibuya", position: { lat: 35.6595, lng: 139.7005 } }
  ];
  const dallas = { id: "dallas", position: { lat: 32.8998, lng: -97.0403 } };
  assert.deepEqual(dominantMapCluster([dallas, ...tokyo]).map((item) => item.id), ["tokyo", "shibuya"]);
});

test("camera center uses only the selected cluster", () => {
  const center = mapItemsCenter([
    { position: { lat: 35.6, lng: 139.7 } },
    { position: { lat: 35.8, lng: 139.9 } }
  ]);
  assert.deepEqual(center, { lat: 35.7, lng: 139.8 });
});

test("camera preferences persist by trip and reject invalid payloads", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  const key = mapCameraStorageKey(42);
  const camera = { latitude: 35.6, longitude: 139.7, zoom: 12, heading: 8, tilt: 20 };
  writeStoredMapCamera(key, camera, storage);
  assert.deepEqual(readStoredMapCamera(key, storage), { version: 1, ...camera });
  values.set(key, JSON.stringify({ version: 1, latitude: "bad" }));
  assert.equal(readStoredMapCamera(key, storage), null);
});

test("phone camera fits results above the fixed website navigation", () => {
  assert.equal(mapFitPadding(false), 72);
  assert.deepEqual(mapFitPadding(true), { top: 72, right: 48, bottom: 124, left: 48 });
});

test("selected day candidates include multi-day stays and exclude ideas", () => {
  const items = [
    { id: "stay", source: "scheduled", dayId: "day-1", dayIds: ["day-1", "day-2"], position: { lat: 35.68, lng: 139.76 } },
    { id: "activity", source: "scheduled", dayId: "day-2", dayIds: ["day-2"], position: { lat: 35.67, lng: 139.75 } },
    { id: "idea", source: "idea", dayId: "", dayIds: [], position: { lat: 35.66, lng: 139.74 } }
  ];
  assert.deepEqual(selectedDayMapCandidates(items, { id: "day-2" }).map((item) => item.id), ["stay", "activity"]);
});

test("selected day cluster prefers the day base over a larger distant cluster", () => {
  const items = [
    { id: "base-near", source: "scheduled", dayId: "day-1", city: "Tokyo", position: { lat: 35.68, lng: 139.76 } },
    { id: "osaka-1", source: "scheduled", dayId: "day-1", city: "Osaka", position: { lat: 34.69, lng: 135.50 } },
    { id: "osaka-2", source: "scheduled", dayId: "day-1", city: "Osaka", position: { lat: 34.70, lng: 135.51 } }
  ];
  const selectedDay = { id: "day-1", city: "Tokyo", basePlace: { latitude: 35.681, longitude: 139.767 } };
  assert.deepEqual(selectInitialMapCluster(items, selectedDay).map((item) => item.id), ["base-near"]);
});

test("selected day cluster prefers city affinity without a mapped base", () => {
  const items = [
    { id: "tokyo", source: "scheduled", dayId: "day-1", city: "Tokyo", position: { lat: 35.68, lng: 139.76 } },
    { id: "osaka-1", source: "scheduled", dayId: "day-1", city: "Osaka", position: { lat: 34.69, lng: 135.50 } },
    { id: "osaka-2", source: "scheduled", dayId: "day-1", city: "Osaka", position: { lat: 34.70, lng: 135.51 } }
  ];
  assert.deepEqual(selectInitialMapCluster(items, { id: "day-1", city: "Tokyo" }).map((item) => item.id), ["tokyo"]);
});

test("initial camera uses saved state before selected-day and regional fallback", () => {
  const fallback = { lat: 35.6764, lng: 139.65, zoom: 6 };
  const saved = { latitude: 34.7, longitude: 135.5, zoom: 12, heading: 15, tilt: 30 };
  assert.deepEqual(resolveInitialMapCamera(saved, [{ position: { lat: 35.68, lng: 139.76 } }], fallback), {
    center: { lat: 34.7, lng: 135.5 }, zoom: 12, heading: 15, tilt: 30, source: "saved"
  });
  assert.deepEqual(resolveInitialMapCamera(null, [{ position: { lat: 35.68, lng: 139.76 } }], fallback), {
    center: { lat: 35.68, lng: 139.76 }, zoom: 14, heading: 0, tilt: 0, source: "selected-day"
  });
  assert.deepEqual(resolveInitialMapCamera(null, [], fallback), {
    center: { lat: 35.6764, lng: 139.65 }, zoom: 6, heading: 0, tilt: 0, source: "fallback"
  });
});

test("outside result count requires matches with none inside the viewport", () => {
  const items = [
    { id: "inside", position: { lat: 35.68, lng: 139.76 } },
    { id: "outside", position: { lat: 34.69, lng: 135.50 } }
  ];
  assert.equal(outsideViewportResultCount([], () => false), 0);
  assert.equal(outsideViewportResultCount(items, (position) => position.lat > 35), 0);
  assert.equal(outsideViewportResultCount(items, () => false), 2);
});
