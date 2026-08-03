export type ResolvedPlace = {
  id: string;
  name: string;
  formattedAddress: string;
  latitude: number | null;
  longitude: number | null;
  googleMapsUri: string;
  resolvedAt: string;
};

export type PlaceSuggestion = {
  placeId: string;
  name: string;
  formattedAddress: string;
  latitude: number | null;
  longitude: number | null;
  googleMapsUri: string;
  interestIds?: string[];
};

export type RouteStop = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  startTime?: string;
  durationMinutes?: number;
};

type ResolvePlaceInput = {
  apiKey: string;
  placeId?: string;
  sessionToken?: string;
  displayNameHint?: string;
  regionCode?: string;
  countryName?: string;
  languageCode?: string;
  mapLink?: string;
  query?: string;
  title?: string;
  city?: string;
};

type GooglePlace = {
  id?: string;
  displayName?: {
    text?: string;
  };
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  googleMapsUri?: string;
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

type MapsLinkSearchContext = {
  query: string;
  locationBias?: Coordinates & {
    radiusMeters: number;
  };
};

const PLACE_FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri";
const PLACE_DETAILS_FIELD_MASK = "id,displayName,formattedAddress,location,googleMapsUri";
const AUTOCOMPLETE_DETAILS_FIELD_MASK = "id,formattedAddress,location";
const GOOGLE_FETCH_TIMEOUT_MS = 8000;
const MAPS_LINK_EXPAND_TIMEOUT_MS = 5000;
const MAPS_LINK_LOCATION_BIAS_RADIUS_METERS = 3000;
const ROUTE_MATRIX_FIELD_MASK = "originIndex,destinationIndex,status,condition,duration,distanceMeters";
const ROUTE_DETAILS_FIELD_MASK = [
  "routes.duration",
  "routes.distanceMeters",
  "routes.legs.duration",
  "routes.legs.distanceMeters",
  "routes.legs.steps.distanceMeters",
  "routes.legs.steps.staticDuration",
  "routes.legs.steps.navigationInstruction",
  "routes.legs.steps.localizedValues",
  "routes.legs.steps.transitDetails",
  "routes.legs.steps.travelMode"
].join(",");

export async function resolveGooglePlace(input: ResolvePlaceInput): Promise<ResolvedPlace> {
  if (input.placeId?.trim()) {
    const place = await fetchPlaceDetails(input.apiKey, input.placeId.trim(), {
      sessionToken: input.sessionToken,
      fieldMask: AUTOCOMPLETE_DETAILS_FIELD_MASK
    });
    if (place) {
      return normalizePlace(place, {
        displayNameHint: input.displayNameHint,
        googleMapsUri: buildGoogleMapsPlaceUrl(input.placeId.trim(), input.displayNameHint)
      });
    }
  }

  const expandedLink = await expandMapsLink(input.mapLink);
  const candidateUrl = parseUrl(expandedLink ?? input.mapLink);
  const extractedPlaceId = candidateUrl ? extractPlaceId(candidateUrl) : "";
  const mapsLinkContext = candidateUrl ? getMapsLinkSearchContext(candidateUrl) : null;

  if (extractedPlaceId) {
    const place = await fetchPlaceDetails(input.apiKey, extractedPlaceId);
    if (place) {
      return normalizePlace(place);
    }
  }

  const textQuery = buildTextQuery({ ...input, expandedLink, mapsLinkContext });
  if (!textQuery) {
    throw new Error("Add a Google Maps link, place name, or city before resolving this place.");
  }

  const places = await textSearchPlaces(input.apiKey, textQuery, {
    ...input,
    locationBias: mapsLinkContext?.locationBias
  });
  const bestPlace = places[0];
  if (!bestPlace) {
    throw new Error("Google Maps could not find a matching place.");
  }

  return normalizePlace(bestPlace);
}

export async function autocompleteGooglePlaces(input: { apiKey: string; query: string; sessionToken?: string; regionCodes?: string[]; languageCode?: string }) {
  const regionCodes = input.regionCodes ?? ["jp"];
  const requestBody: Record<string, unknown> = {
    input: input.query,
    languageCode: input.languageCode ?? "en",
    sessionToken: input.sessionToken || undefined
  };
  if (regionCodes.length) {
    requestBody.includedRegionCodes = regionCodes;
  }

  const response = await fetchWithTimeout("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": input.apiKey,
      "X-Goog-FieldMask": [
        "suggestions.placePrediction.place",
        "suggestions.placePrediction.placeId",
        "suggestions.placePrediction.text.text",
        "suggestions.placePrediction.structuredFormat.mainText.text",
        "suggestions.placePrediction.structuredFormat.secondaryText.text"
      ].join(",")
    },
    body: JSON.stringify(requestBody)
  }, GOOGLE_FETCH_TIMEOUT_MS, "Google Places autocomplete timed out.");

  if (!response.ok) {
    throw new Error(await googleErrorMessage(response, "Google Places could not load suggestions."));
  }

  const payload = await response.json() as {
    suggestions?: Array<{
      placePrediction?: {
        place?: string;
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    }>;
  };

  return (payload.suggestions ?? [])
    .map((suggestion) => suggestion.placePrediction)
    .filter((prediction): prediction is NonNullable<typeof prediction> => Boolean(prediction?.placeId))
    .map((prediction) => ({
      place: prediction.place ?? "",
      placeId: prediction.placeId ?? "",
      text: prediction.text?.text ?? prediction.structuredFormat?.mainText?.text ?? "",
      mainText: prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? "",
      secondaryText: prediction.structuredFormat?.secondaryText?.text ?? ""
    }));
}

export async function searchGooglePlaceSuggestions(input: {
  apiKey: string;
  query: string;
  destination: string;
  regionCode?: string;
  languageCode?: string;
  limit?: number;
}): Promise<PlaceSuggestion[]> {
  const query = input.query.trim();
  const destination = input.destination.trim();
  const textQuery = query.toLowerCase().includes(destination.toLowerCase())
    ? query
    : `${query}, ${destination}`;
  const places = await textSearchPlaces(input.apiKey, textQuery, {
    regionCode: input.regionCode,
    languageCode: input.languageCode
  });
  const limit = Math.max(1, Math.min(8, Math.round(Number(input.limit) || 8)));

  return places
    .filter((place) => place.id && place.displayName?.text)
    .slice(0, limit)
    .map((place) => ({
      placeId: place.id ?? "",
      name: place.displayName?.text ?? "",
      formattedAddress: place.formattedAddress ?? "",
      latitude: finiteNumberOrNull(place.location?.latitude),
      longitude: finiteNumberOrNull(place.location?.longitude),
      googleMapsUri: place.googleMapsUri ?? buildGoogleMapsPlaceUrl(place.id ?? "", place.displayName?.text)
    }));
}

export async function computeRouteMatrix(apiKey: string, stops: RouteStop[], travelMode: string) {
  const response = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": ROUTE_MATRIX_FIELD_MASK
    },
    body: JSON.stringify({
      origins: stops.map((stop) => routeWaypoint(stop)),
      destinations: stops.map((stop) => routeWaypoint(stop)),
      travelMode,
      routingPreference: travelMode === "DRIVE" ? "TRAFFIC_AWARE" : undefined
    })
  });

  if (!response.ok) {
    throw new Error(await googleErrorMessage(response, "Google Routes could not calculate travel times."));
  }

  return await response.json();
}

export async function computeRouteDetails(
  apiKey: string,
  origin: RouteStop,
  destination: RouteStop,
  travelMode: string,
  options: { departureTime?: string; arrivalTime?: string } = {}
) {
  const body: Record<string, unknown> = {
    origin: routeLocation(origin),
    destination: routeLocation(destination),
    travelMode,
    languageCode: "en",
    units: "METRIC",
    computeAlternativeRoutes: false
  };

  if (options.arrivalTime) {
    body.arrivalTime = options.arrivalTime;
  } else if (options.departureTime) {
    body.departureTime = options.departureTime;
  }

  if (travelMode === "DRIVE") {
    body.routingPreference = "TRAFFIC_AWARE";
  }

  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": ROUTE_DETAILS_FIELD_MASK
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(await googleErrorMessage(response, "Google Routes could not calculate detailed directions."));
  }

  const payload = await response.json() as { routes?: unknown[] };
  return payload.routes?.[0] ?? null;
}

export function buildGoogleDirectionsUrl(stops: RouteStop[]) {
  const url = new URL("https://www.google.com/maps/dir/");
  stops.forEach((stop) => {
    url.pathname += `${encodeURIComponent(`${stop.latitude},${stop.longitude}`)}/`;
  });
  return url.href;
}

function routeWaypoint(stop: RouteStop) {
  return {
    waypoint: routeLocation(stop)
  };
}

function routeLocation(stop: RouteStop) {
  return {
    location: {
      latLng: {
        latitude: stop.latitude,
        longitude: stop.longitude
      }
    }
  };
}

async function fetchPlaceDetails(apiKey: string, placeId: string, options: { sessionToken?: string; fieldMask?: string } = {}) {
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
  if (options.sessionToken) {
    url.searchParams.set("sessionToken", options.sessionToken);
  }

  const response = await fetchWithTimeout(url.href, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": options.fieldMask ?? PLACE_DETAILS_FIELD_MASK
    }
  }, GOOGLE_FETCH_TIMEOUT_MS, "Google Place details timed out.");

  if (!response.ok) {
    return null;
  }

  return await response.json() as GooglePlace;
}

async function textSearchPlaces(apiKey: string, textQuery: string, options: { regionCode?: string; languageCode?: string; locationBias?: MapsLinkSearchContext["locationBias"] } = {}) {
  const regionCode = options.regionCode === undefined ? "JP" : sanitizeRegionCode(options.regionCode) ?? undefined;
  const requestBody: Record<string, unknown> = {
    textQuery,
    languageCode: options.languageCode?.trim() || "en"
  };
  if (regionCode) {
    requestBody.regionCode = regionCode;
  }
  if (options.locationBias) {
    requestBody.locationBias = {
      circle: {
        center: {
          latitude: options.locationBias.latitude,
          longitude: options.locationBias.longitude
        },
        radius: options.locationBias.radiusMeters
      }
    };
  }

  const response = await fetchWithTimeout("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACE_FIELD_MASK
    },
    body: JSON.stringify(requestBody)
  }, GOOGLE_FETCH_TIMEOUT_MS, "Google Places text search timed out.");

  if (!response.ok) {
    throw new Error(await googleErrorMessage(response, "Google Places could not resolve this place."));
  }

  const payload = await response.json() as { places?: GooglePlace[] };
  return payload.places ?? [];
}

async function googleErrorMessage(response: Response, fallback: string) {
  try {
    const payload = await response.json();
    return payload?.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = GOOGLE_FETCH_TIMEOUT_MS, timeoutMessage = "Google Maps request timed out.") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function expandMapsLink(link?: string) {
  const url = parseUrl(link);
  if (!url || !isShortMapsHost(url.hostname)) {
    return normalizeGoogleMapsLink(link);
  }

  try {
    const response = await fetchWithTimeout(url.href, { method: "GET", redirect: "follow" }, MAPS_LINK_EXPAND_TIMEOUT_MS, "Google Maps short link expansion timed out.");
    return response.url || url.href;
  } catch {
    return url.href;
  }
}

function buildTextQuery(input: ResolvePlaceInput & { expandedLink?: string; mapsLinkContext?: MapsLinkSearchContext | null }) {
  const explicitQuery = input.query?.trim();
  if (explicitQuery) {
    return explicitQuery;
  }

  if (input.mapsLinkContext?.query) {
    return input.mapsLinkContext.query;
  }

  const expandedUrl = parseUrl(input.expandedLink);
  const urlQuery = expandedUrl ? extractQueryFromUrl(expandedUrl) : "";
  if (urlQuery) {
    return appendCity(urlQuery, input.city, input.countryName);
  }

  const urlCoordinates = expandedUrl ? extractCoordinatesFromUrl(expandedUrl) : null;
  if (urlCoordinates) {
    return `${urlCoordinates.latitude},${urlCoordinates.longitude}`;
  }

  const title = input.title?.trim();
  if (title) {
    return appendCity(title, input.city, input.countryName);
  }

  return input.city?.trim() ?? "";
}

function appendCity(query: string, city?: string, countryName?: string) {
  const trimmedCity = city?.trim();
  const trimmedCountry = countryName === undefined ? "Japan" : countryName.trim();
  const lowerQuery = query.toLowerCase();
  if (!trimmedCity || lowerQuery.includes(trimmedCity.toLowerCase())) {
    return query;
  }
  if (!trimmedCountry) {
    return `${query}, ${trimmedCity}`;
  }
  if (lowerQuery.includes(trimmedCountry.toLowerCase())) {
    return `${query}, ${trimmedCity}`;
  }
  return `${query}, ${trimmedCity}, ${trimmedCountry}`;
}

function extractPlaceId(url: URL) {
  return (
    url.searchParams.get("query_place_id") ||
    url.searchParams.get("destination_place_id") ||
    url.searchParams.get("origin_place_id") ||
    url.searchParams.get("place_id") ||
    ""
  );
}

function extractQueryFromUrl(url: URL) {
  const queryParam = url.searchParams.get("query") || url.searchParams.get("q") || url.searchParams.get("destination");
  if (queryParam) {
    return queryParam;
  }

  const placePathMatch = url.pathname.match(/\/maps\/place\/([^/@]+)/);
  if (placePathMatch?.[1]) {
    return decodeURIComponent(placePathMatch[1].replace(/\+/g, " "));
  }

  return "";
}

function getMapsLinkSearchContext(url: URL): MapsLinkSearchContext | null {
  if (!isGoogleMapsUrl(url)) {
    return null;
  }

  const coordinates = extractCoordinatesFromUrl(url);
  const query = extractQueryFromUrl(url) || (coordinates ? `${coordinates.latitude},${coordinates.longitude}` : "");
  if (!query) {
    return null;
  }

  return {
    query,
    locationBias: coordinates
      ? {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          radiusMeters: MAPS_LINK_LOCATION_BIAS_RADIUS_METERS
        }
      : undefined
  };
}

function extractCoordinatesFromUrl(url: URL): Coordinates | null {
  const coordinateMatch = url.href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
    || url.href.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),/);
  if (!coordinateMatch) {
    return null;
  }

  const latitude = Number(coordinateMatch[1]);
  const longitude = Number(coordinateMatch[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return { latitude, longitude };
}

function normalizePlace(place: GooglePlace, options: { displayNameHint?: string; googleMapsUri?: string } = {}): ResolvedPlace {
  return {
    id: place.id ?? "",
    name: place.displayName?.text ?? options.displayNameHint?.trim() ?? "",
    formattedAddress: place.formattedAddress ?? "",
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    googleMapsUri: place.googleMapsUri ?? options.googleMapsUri ?? "",
    resolvedAt: new Date().toISOString()
  };
}

function finiteNumberOrNull(value?: number) {
  return Number.isFinite(value) ? Number(value) : null;
}

function buildGoogleMapsPlaceUrl(placeId: string, queryHint = "") {
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", queryHint.trim() || placeId);
  url.searchParams.set("query_place_id", placeId);
  return url.href;
}

function parseUrl(link?: string) {
  const trimmed = normalizeGoogleMapsLink(link);
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

function sanitizeRegionCode(regionCode?: string) {
  const normalized = regionCode?.trim().toUpperCase() ?? "";
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

export function normalizeGoogleMapsLink(link?: string) {
  const trimmed = link?.trim() ?? "";
  if (!trimmed) {
    return "";
  }

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/\s/.test(trimmed)) {
    return trimmed;
  }

  try {
    const candidateUrl = new URL(`https://${trimmed}`);
    return isGoogleMapsUrl(candidateUrl) ? candidateUrl.href : trimmed;
  } catch {
    return trimmed;
  }
}

function isGoogleMapsUrl(url: URL) {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  return host === "maps.app.goo.gl" || host === "goo.gl" || host.startsWith("maps.google.") || (host.startsWith("google.") && url.pathname.startsWith("/maps"));
}

function isShortMapsHost(hostname: string) {
  const host = hostname.replace(/^www\./, "");
  return host === "maps.app.goo.gl" || host === "goo.gl";
}
