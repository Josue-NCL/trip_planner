import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Execute the actual App handlers with deferred network responses. This covers
// the shared refs and queue wiring without connecting to a real Supabase trip.
const source = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
const handlers = source.slice(source.indexOf("  function hasUnsavedTripChanges("), source.indexOf("  function showToast("));
const placements = source.slice(source.indexOf("  function moveScheduleItem("), source.indexOf("  function openNewScheduleModal("));
const tick = () => new Promise((resolve) => setImmediate(resolve));
const ref = (current) => ({ current });

function setup() {
  const calls = [], notices = [], statuses = [], downloads = [];
  const trip = { updatedAt: "v1", days: [
    { id: "a", city: "Tokyo", schedule: [{ id: "activity", start: "09:00", duration: 60, updatedAt: "old-item-version" }] },
    { id: "b", city: "Kyoto", schedule: [] }
  ] };
  const context = vm.createContext({
    selectedTripId: 1, trip, dateRangeLabel: "Japan", TIME_GRID_STEP_MINUTES: 30, MIN_SCHEDULE_DURATION_MINUTES: 15,
    saveGenerationRef: ref(1), saveInFlightRef: ref(false), conflictReloadInFlightRef: ref(false),
    pendingSaveSnapshotRef: ref(null), pendingAutoSaveSnapshotRef: ref(null), tripUpdatedAtRef: ref("v1"),
    latestTripRef: ref(trip), localRealtimeSuppressionUntilRef: ref(0), saveTimerRef: ref(null), skipNextSaveRef: ref(false),
    window: { clearTimeout() {} }, suppressLocalRealtimeEcho() {}, refreshTripSummaries() {},
    setSyncStatus: (status) => statuses.push(status), showToast: (notice) => notices.push(notice),
    toast: { message: (message, options) => notices.push({ message, ...options }), error: (message, options) => notices.push({ message, ...options }) },
    downloadTripExport: (draft) => downloads.push(draft),
    setExpenses() {}, setExpensesStatus() {}, isScheduleSlotAvailable: () => true,
    replaceTripPayload: (id, snapshot, version) => new Promise((resolve, reject) => calls.push({ id, snapshot, version, resolve, reject })),
    loadRemoteTrip: async () => ({ updatedAt: "remote", days: [] }), listTripExpenses: async () => [],
  });
  context.setTrip = (snapshot) => { context.trip = snapshot; context.latestTripRef.current = snapshot; };
  vm.runInContext(handlers + placements, context);
  return { context, calls, notices, statuses, downloads };
}

test("edit then rapid moves are serialized and use each acknowledged trip revision", async () => {
  const { context: c, calls } = setup();
  c.queueTripSave({ edit: "title", updatedAt: "v1" });
  c.queueTripSave({ edit: "first move", updatedAt: "v1" });
  c.queueTripSave({ edit: "latest move", updatedAt: "v1" });
  assert.equal(calls.length, 1);
  calls[0].resolve("v2");
  await tick();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].version, "v2");
  assert.equal(calls[1].snapshot.edit, "latest move");
  calls[1].resolve("v3");
  await tick();
  assert.equal(c.tripUpdatedAtRef.current, "v3");
  assert.equal(c.saveInFlightRef.current, false);
});

test("cross-day moves and resizing only update state for the shared autosave", () => {
  const { context: c, calls } = setup();
  c.moveScheduleItem("a", "activity", "b", "11:00");
  assert.equal(c.trip.days[0].schedule.length, 0);
  assert.equal(c.trip.days[1].schedule[0].start, "11:00");
  c.resizeScheduleItem("b", "activity", "11:30", 90);
  assert.equal(c.trip.days[1].schedule[0].duration, 90);
  assert.equal(c.trip.days[1].schedule[0].start, "11:30");
  assert.equal(c.skipNextSaveRef.current, false);
  assert.equal(calls.length, 0);
});

test("an acknowledged save does not report saved while another edit is debouncing", async () => {
  const { context: c, calls, statuses } = setup();
  c.queueTripSave(c.trip);
  c.pendingAutoSaveSnapshotRef.current = { edit: "newer" };
  calls[0].resolve("v2");
  await tick();
  assert.equal(statuses.at(-1), "saving");
});

test("genuine conflict stops pending writes and preserves the latest draft for download", async () => {
  const { context: c, calls, notices, downloads } = setup();
  c.queueTripSave(c.trip);
  c.queueTripSave({ edit: "queued" });
  c.latestTripRef.current = { edit: "latest unsaved edit" };
  c.pendingAutoSaveSnapshotRef.current = c.latestTripRef.current;
  calls[0].reject({ code: "40001", message: "This trip changed elsewhere" });
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(c.tripUpdatedAtRef.current, "remote");
  assert.equal(c.pendingSaveSnapshotRef.current, null);
  assert.equal(c.pendingAutoSaveSnapshotRef.current, null);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].duration, Infinity);
  notices[0].action.onClick();
  assert.equal(downloads[0].edit, "latest unsaved edit");
});

test("edits during conflict recovery are retained in the downloadable draft", async () => {
  const { context: c, calls, notices, downloads } = setup();
  let resolveReload;
  c.loadRemoteTrip = () => new Promise((resolve) => { resolveReload = resolve; });
  const recovery = c.reloadTripAfterConflict();
  c.latestTripRef.current = { edit: "typed during reload" };
  c.queueTripSave(c.latestTripRef.current);
  await c.reloadTripAfterConflict(); // no duplicate reload or notification
  assert.equal(calls.length, 0);
  resolveReload({ updatedAt: "remote", days: [] });
  await recovery;
  assert.equal(notices.length, 1);
  notices[0].action.onClick();
  assert.equal(downloads[0].edit, "typed during reload");
});

for (const outcome of ["resolve", "reject"]) {
  test(`late save ${outcome} cannot change the next trip's revision or queue`, async () => {
    const { context: c, calls, notices } = setup();
    c.queueTripSave(c.trip);
    c.saveGenerationRef.current += 1;
    c.tripUpdatedAtRef.current = "other-trip";
    c.pendingSaveSnapshotRef.current = { edit: "other-trip pending" };
    calls[0][outcome](outcome === "resolve" ? "obsolete" : { code: "40001" });
    await tick();
    assert.equal(c.tripUpdatedAtRef.current, "other-trip");
    assert.equal(c.pendingSaveSnapshotRef.current.edit, "other-trip pending");
    assert.equal(calls.length, 1);
    assert.equal(notices.length, 0);
  });
}

test("failed conflict reload leaves the local draft available", async () => {
  const { context: c, notices, downloads } = setup();
  c.loadRemoteTrip = async () => { throw new Error("Offline"); };
  const original = c.trip;
  await c.reloadTripAfterConflict();
  assert.equal(c.trip, original);
  notices[0].action.onClick();
  assert.equal(downloads[0].days, original.days);
  assert.equal(c.conflictReloadInFlightRef.current, false);
});

function installRealtime(c) {
  const start = source.lastIndexOf("  useEffect(() => {", source.indexOf("    const handleRemoteChange = () => {"));
  const end = source.indexOf("  async function refreshTripSummaries", start);
  let cleanup, onChange, timer;
  Object.assign(c, {
    sessionUserId: "user", tripLoaded: true, realtimeTimerRef: ref(null),
    isLocalRealtimeEcho: () => false, refreshCollaboration() {},
    useEffect: (effect) => { cleanup = effect(); },
    subscribeToTripChanges: (_id, callback) => { onChange = callback; return () => {}; },
    subscribeToExpenseChanges: () => () => {},
    window: { clearTimeout: () => { timer = null; }, setTimeout: (callback) => { timer = callback; return 1; } }
  });
  vm.runInContext(source.slice(start, end), c);
  return { change: () => onChange(), runTimer: () => timer?.(), cleanup: () => cleanup() };
}

test("a background refresh arriving after a local edit cannot overwrite it", async () => {
  const { context: c } = setup();
  let resolveReload;
  c.loadRemoteTrip = () => new Promise((resolve) => { resolveReload = resolve; });
  const realtime = installRealtime(c);
  realtime.change();
  realtime.runTimer();
  c.moveScheduleItem("a", "activity", "b", "12:00");
  resolveReload({ updatedAt: "remote", days: [] });
  await tick();
  assert.equal(c.trip.days[1].schedule[0].start, "12:00");
});

test("background refresh does not start while an edit is waiting to autosave", () => {
  const { context: c } = setup();
  let reads = 0;
  c.loadRemoteTrip = async () => { reads++; return {}; };
  const realtime = installRealtime(c);
  c.pendingAutoSaveSnapshotRef.current = c.trip;
  realtime.change();
  realtime.runTimer();
  assert.equal(reads, 0);
});

test("an old trip's background refresh cannot replace the selected trip", async () => {
  const { context: c } = setup();
  let resolveReload;
  c.loadRemoteTrip = () => new Promise((resolve) => { resolveReload = resolve; });
  const realtime = installRealtime(c);
  realtime.change();
  realtime.runTimer();
  realtime.cleanup();
  const original = c.trip;
  resolveReload({ updatedAt: "old-trip", days: [] });
  await tick();
  assert.equal(c.trip, original);
});

test("a drag is persisted by the normal debounced autosave", async () => {
  const { context: c, calls } = setup();
  let timer;
  Object.assign(c, {
    sessionUserId: "user", tripLoaded: true, useEffect: (effect) => effect(),
    window: { clearTimeout() {}, setTimeout: (callback) => { timer = callback; return 1; } }
  });
  c.moveScheduleItem("a", "activity", "b", "13:00");
  const start = source.lastIndexOf("  useEffect(() => {", source.indexOf("    pendingAutoSaveSnapshotRef.current = snapshot;"));
  const end = source.indexOf("  useEffect(() => {", start + 5);
  vm.runInContext(source.slice(start, end), c);
  assert.equal(calls.length, 0);
  timer();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].snapshot.days[1].schedule[0].start, "13:00");
  calls[0].resolve("v2");
  await tick();
  assert.equal(c.tripUpdatedAtRef.current, "v2");
});
