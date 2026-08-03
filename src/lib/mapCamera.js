export const MAP_CAMERA_STORAGE_VERSION = 1;

export function mapFitPadding(isPhoneView = false) {
  return isPhoneView
    ? { top: 72, right: 48, bottom: 124, left: 48 }
    : 72;
}

export function mapCameraStorageKey(tripId) {
  return `trip-map-camera:v${MAP_CAMERA_STORAGE_VERSION}:${tripId}`;
}

export function readStoredMapCamera(storageKey, storage = globalThis.window?.localStorage) {
  if (!storageKey || !storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(storageKey) || "null");
    if (!parsed || parsed.version !== MAP_CAMERA_STORAGE_VERSION) return null;
    const values = [parsed.latitude, parsed.longitude, parsed.zoom, parsed.heading ?? 0, parsed.tilt ?? 0];
    return values.every(Number.isFinite) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredMapCamera(storageKey, camera, storage = globalThis.window?.localStorage) {
  if (!storageKey || !storage) return;
  try {
    storage.setItem(storageKey, JSON.stringify({ version: MAP_CAMERA_STORAGE_VERSION, ...camera }));
  } catch {
    // Camera persistence is optional when storage is unavailable.
  }
}

export function dominantMapCluster(items = [], radiusKm = 50) {
  return buildMapClusters(items, radiusKm).reduce((largest, cluster) => (
    cluster.length > largest.length ? cluster : largest
  ), []);
}

export function selectedDayMapCandidates(items = [], selectedDay) {
  if (!selectedDay?.id) return [];
  return items.filter((item) => (
    item.source === "scheduled"
    && (item.dayIds ?? [item.dayId]).includes(selectedDay.id)
  ));
}

export function selectInitialMapCluster(items = [], selectedDay, radiusKm = 50) {
  const candidates = selectedDayMapCandidates(items, selectedDay);
  const clusters = buildMapClusters(candidates, radiusKm);
  if (clusters.length < 2) return clusters[0] ?? [];

  const basePosition = mapPlacePosition(selectedDay?.basePlace);
  if (basePosition) {
    return clusters.reduce((nearest, cluster) => (
      mapDistanceKm(basePosition, mapItemsCenter(cluster)) < mapDistanceKm(basePosition, mapItemsCenter(nearest))
        ? cluster
        : nearest
    ), clusters[0]);
  }

  const normalizedCity = normalizeMapCity(selectedDay?.city);
  if (normalizedCity) {
    const cityClusters = clusters
      .map((cluster) => ({
        cluster,
        cityMatches: cluster.filter((item) => normalizeMapCity(item.city) === normalizedCity).length
      }))
      .filter(({ cityMatches }) => cityMatches > 0);
    if (cityClusters.length) {
      return cityClusters.reduce((best, candidate) => (
        candidate.cityMatches > best.cityMatches
        || (candidate.cityMatches === best.cityMatches && candidate.cluster.length > best.cluster.length)
          ? candidate
          : best
      )).cluster;
    }
  }

  return dominantMapCluster(candidates, radiusKm);
}

export function resolveInitialMapCamera(savedCamera, initialItems = [], fallbackCenter) {
  if (savedCamera) {
    return {
      center: { lat: savedCamera.latitude, lng: savedCamera.longitude },
      zoom: savedCamera.zoom,
      heading: savedCamera.heading ?? 0,
      tilt: savedCamera.tilt ?? 0,
      source: "saved"
    };
  }
  if (initialItems.length) {
    return {
      center: mapItemsCenter(initialItems),
      zoom: initialItems.length === 1 ? 14 : fallbackCenter.zoom ?? 10,
      heading: 0,
      tilt: 0,
      source: "selected-day"
    };
  }
  return {
    center: { lat: fallbackCenter.lat, lng: fallbackCenter.lng },
    zoom: fallbackCenter.zoom ?? 10,
    heading: 0,
    tilt: 0,
    source: "fallback"
  };
}

export function outsideViewportResultCount(items = [], containsPosition) {
  if (!items.length || typeof containsPosition !== "function") return 0;
  return items.some((item) => containsPosition(item.position)) ? 0 : items.length;
}

function buildMapClusters(items = [], radiusKm = 50) {
  if (items.length < 2) return items.length ? [items] : [];
  const clusters = [];
  items.forEach((item) => {
    const cluster = clusters.find((candidate) => candidate.some((member) => mapDistanceKm(member.position, item.position) <= radiusKm));
    if (cluster) cluster.push(item);
    else clusters.push([item]);
  });
  return clusters;
}

export function mapDistanceKm(a, b) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function mapItemsCenter(items = []) {
  if (!items.length) return null;
  return {
    lat: items.reduce((sum, item) => sum + item.position.lat, 0) / items.length,
    lng: items.reduce((sum, item) => sum + item.position.lng, 0) / items.length
  };
}

function mapPlacePosition(place) {
  const lat = Number(place?.latitude);
  const lng = Number(place?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function normalizeMapCity(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}
