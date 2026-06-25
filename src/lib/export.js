export function serializeTripExport(trip) {
  return JSON.stringify(trip, null, 2);
}

export function downloadTripExport(trip) {
  const blob = new Blob([serializeTripExport(trip)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "japan-2026-trip.json";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
