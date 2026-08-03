import { requireSupabase } from "./supabaseClient.js";

const MAPS_CONFIG_CACHE_KEY = "japan-2026-maps-config:v1";
const ROUTE_PREVIEW_CACHE_PREFIX = "japan-2026-route-preview:v1:";
const MAPS_CONFIG_TTL_MS = 24 * 60 * 60 * 1000;
const ROUTE_PREVIEW_TTL_MS = 6 * 60 * 60 * 1000;
const AUTOCOMPLETE_TTL_MS = 2 * 60 * 1000;
const PLACE_PREVIEW_TTL_MS = 30 * 60 * 1000;
const PLACE_DISCOVERY_TTL_MS = 10 * 60 * 1000;
const autocompleteMemoryCache = new Map();
const autocompleteInflightRequests = new Map();
const routePreviewMemoryCache = new Map();
const routePreviewInflightRequests = new Map();
const placePreviewMemoryCache = new Map();
const placePreviewInflightRequests = new Map();
const placeDiscoveryMemoryCache = new Map();
const placeDiscoveryInflightRequests = new Map();
let mapsConfigMemoryCache = null;
let mapsConfigInflightRequest = null;

export async function autocompletePlace(payload) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("autocomplete-place", {
    body: payload
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, "Could not load place suggestions."));
  }
  if (data?.error) {
    throw new Error(data.error.message || "Could not load place suggestions.");
  }

  return data;
}

export async function autocompletePlaceCached(payload) {
  const signature = stableJsonStringify({
    query: String(payload?.query ?? "").trim(),
    sessionToken: payload?.sessionToken ?? "",
    regionCodes: payload?.regionCodes ?? [],
    languageCode: payload?.languageCode ?? ""
  });
  const cached = readMemoryCache(autocompleteMemoryCache, signature);
  if (cached) {
    return cached;
  }
  if (autocompleteInflightRequests.has(signature)) {
    return autocompleteInflightRequests.get(signature);
  }

  const request = autocompletePlace(payload)
    .then((data) => {
      writeMemoryCache(autocompleteMemoryCache, signature, data, AUTOCOMPLETE_TTL_MS);
      return data;
    })
    .finally(() => {
      autocompleteInflightRequests.delete(signature);
    });
  autocompleteInflightRequests.set(signature, request);
  return request;
}

export async function searchPlaceSuggestions(payload) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("search-place-suggestions", {
    body: payload
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, "Could not find trip ideas."));
  }
  if (data?.error) {
    throw new Error(data.error.message || "Could not find trip ideas.");
  }

  return data;
}

export async function searchPlaceSuggestionsCached(payload) {
  const signature = stableJsonStringify({
    query: String(payload?.query ?? "").trim(),
    intents: (payload?.intents ?? []).map((intent) => ({
      interestId: String(intent?.interestId ?? "").trim(),
      query: String(intent?.query ?? "").trim()
    })),
    refinement: String(payload?.refinement ?? "").trim(),
    destination: String(payload?.destination ?? "").trim(),
    regionCodes: payload?.regionCodes ?? [],
    languageCode: payload?.languageCode ?? "",
    limit: payload?.limit ?? 8
  });
  const cached = readMemoryCache(placeDiscoveryMemoryCache, signature);
  if (cached) {
    return cached;
  }
  if (placeDiscoveryInflightRequests.has(signature)) {
    return placeDiscoveryInflightRequests.get(signature);
  }

  const request = searchPlaceSuggestions(payload)
    .then((data) => {
      writeMemoryCache(placeDiscoveryMemoryCache, signature, data, PLACE_DISCOVERY_TTL_MS);
      return data;
    })
    .finally(() => {
      placeDiscoveryInflightRequests.delete(signature);
    });
  placeDiscoveryInflightRequests.set(signature, request);
  return request;
}

export async function resolvePlace(payload) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("resolve-place", {
    body: payload
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, "Could not resolve this place."));
  }
  if (data?.error) {
    throw new Error(data.error.message || "Could not resolve this place.");
  }

  return data;
}

export async function loadPlacePreview(payload) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("place-preview", {
    body: payload
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, "Could not load this place preview."));
  }
  if (data?.error) {
    throw new Error(data.error.message || "Could not load this place preview.");
  }

  return data;
}

export async function loadPlacePreviewCached(payload) {
  const placeId = String(payload?.placeId ?? "").trim();
  if (!placeId) {
    return { status: "ok", photoUri: "", address: "", authorAttributions: [] };
  }

  const maxWidthPx = clampPhotoWidth(payload?.maxWidthPx);
  const signature = `${placeId}:${maxWidthPx}`;
  const cached = readMemoryCache(placePreviewMemoryCache, signature);
  if (cached) {
    return cached;
  }

  if (placePreviewInflightRequests.has(signature)) {
    return placePreviewInflightRequests.get(signature);
  }

  const request = loadPlacePreview({ placeId, maxWidthPx })
    .then((data) => {
      writeMemoryCache(placePreviewMemoryCache, signature, data, PLACE_PREVIEW_TTL_MS);
      return data;
    })
    .finally(() => {
      placePreviewInflightRequests.delete(signature);
    });
  placePreviewInflightRequests.set(signature, request);
  return request;
}

export async function loadMapsConfig() {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("maps-config", {
    body: {}
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, "Could not load map settings."));
  }
  if (data?.error) {
    throw new Error(data.error.message || "Could not load map settings.");
  }

  return data;
}

export async function loadMapsConfigCached() {
  const memoryEntry = readSingleMemoryCache(mapsConfigMemoryCache);
  if (memoryEntry) {
    return memoryEntry;
  }

  const localEntry = readLocalCacheEntry(MAPS_CONFIG_CACHE_KEY);
  if (localEntry) {
    mapsConfigMemoryCache = localEntry;
    return localEntry.data;
  }

  if (mapsConfigInflightRequest) {
    return mapsConfigInflightRequest;
  }

  mapsConfigInflightRequest = loadMapsConfig()
    .then((data) => {
      const entry = createCacheEntry(data, MAPS_CONFIG_TTL_MS);
      mapsConfigMemoryCache = entry;
      writeLocalCacheEntry(MAPS_CONFIG_CACHE_KEY, entry);
      return data;
    })
    .finally(() => {
      mapsConfigInflightRequest = null;
    });
  return mapsConfigInflightRequest;
}

export async function previewRoute(payload) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("route-preview", {
    body: payload
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, "Could not preview this route."));
  }
  if (data?.error) {
    throw new Error(data.error.message || "Could not preview this route.");
  }

  return data;
}

export async function previewRouteCached(payload) {
  const signature = getRoutePreviewSignature(payload);
  const cacheKey = `${ROUTE_PREVIEW_CACHE_PREFIX}${hashString(signature)}`;
  const memoryEntry = readMemoryCacheEntry(routePreviewMemoryCache, signature);
  if (memoryEntry) {
    return memoryEntry.data;
  }

  const localEntry = readLocalCacheEntry(cacheKey);
  if (localEntry?.signature === signature) {
    routePreviewMemoryCache.set(signature, localEntry);
    return localEntry.data;
  }

  if (routePreviewInflightRequests.has(signature)) {
    return routePreviewInflightRequests.get(signature);
  }

  const request = previewRoute(payload)
    .then((data) => {
      const entry = createCacheEntry(data, ROUTE_PREVIEW_TTL_MS, { signature });
      routePreviewMemoryCache.set(signature, entry);
      writeLocalCacheEntry(cacheKey, entry);
      return data;
    })
    .finally(() => {
      routePreviewInflightRequests.delete(signature);
    });
  routePreviewInflightRequests.set(signature, request);
  return request;
}

async function getFunctionErrorMessage(error, fallback) {
  const context = error?.context;
  if (context && typeof context.json === "function") {
    try {
      const payload = await context.json();
      const message = payload?.error?.message || payload?.message;
      if (message) {
        return message;
      }
    } catch {
      // Fall through to the Supabase client message below.
    }
  }

  return error?.message || fallback;
}

function getRoutePreviewSignature(payload) {
  return stableJsonStringify({
    travelMode: payload?.travelMode ?? "",
    countryName: payload?.countryName ?? "",
    stops: (payload?.stops ?? []).map((stop) => ({
      id: stop?.id ?? "",
      latitude: roundCoordinate(stop?.latitude),
      longitude: roundCoordinate(stop?.longitude)
    }))
  });
}

function roundCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(6)) : null;
}

function clampPhotoWidth(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 520;
  }
  return Math.max(160, Math.min(720, Math.round(number)));
}

function createCacheEntry(data, ttlMs, extra = {}) {
  return {
    ...extra,
    expiresAt: Date.now() + ttlMs,
    data
  };
}

function readSingleMemoryCache(entry) {
  if (!entry || !isFreshCacheEntry(entry)) {
    return null;
  }
  return entry.data;
}

function readMemoryCache(cache, key) {
  const entry = readMemoryCacheEntry(cache, key);
  return entry?.data ?? null;
}

function readMemoryCacheEntry(cache, key) {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }
  if (!isFreshCacheEntry(entry)) {
    cache.delete(key);
    return null;
  }
  return entry;
}

function writeMemoryCache(cache, key, data, ttlMs) {
  cache.set(key, createCacheEntry(data, ttlMs));
}

function readLocalCacheEntry(key) {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    if (!rawValue) {
      return null;
    }
    const entry = JSON.parse(rawValue);
    if (!isFreshCacheEntry(entry)) {
      window.localStorage.removeItem(key);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function writeLocalCacheEntry(key, entry) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Cache writes are best-effort and should never block map usage.
  }
}

function isFreshCacheEntry(entry) {
  return Boolean(entry && Number(entry.expiresAt) > Date.now() && "data" in entry);
}

function stableJsonStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJsonStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashString(value) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}
