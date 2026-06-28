export type ResolvedPlace = {
  id: string;
  name: string;
  formattedAddress: string;
  latitude: number | null;
  longitude: number | null;
  googleMapsUri: string;
  resolvedAt: string;
};

export type RouteStop = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
};

type ResolvePlaceInput = {
  apiKey: string;
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

const PLACE_FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri";
const PLACE_DETAILS_FIELD_MASK = "id,displayName,formattedAddress,location,googleMapsUri";
const ROUTE_MATRIX_FIELD_MASK = "originIndex,destinationIndex,status,condition,duration,distanceMeters";

export async function resolveGooglePlace(input: ResolvePlaceInput): Promise<ResolvedPlace> {
  const expandedLink = await expandMapsLink(input.mapLink);
  const candidateUrl = parseUrl(expandedLink ?? input.mapLink);
  const extractedPlaceId = candidateUrl ? extractPlaceId(candidateUrl) : "";

  if (extractedPlaceId) {
    const place = await fetchPlaceDetails(input.apiKey, extractedPlaceId);
    if (place) {
      return normalizePlace(place);
    }
  }

  const textQuery = buildTextQuery({ ...input, expandedLink });
  if (!textQuery) {
    throw new Error("Add a Google Maps link, place name, or city before resolving this place.");
  }

  const places = await textSearchPlaces(input.apiKey, textQuery);
  const bestPlace = places[0];
  if (!bestPlace) {
    throw new Error("Google Maps could not find a matching place.");
  }

  return normalizePlace(bestPlace);
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

export function buildGoogleDirectionsUrl(stops: RouteStop[]) {
  const url = new URL("https://www.google.com/maps/dir/");
  stops.forEach((stop) => {
    url.pathname += `${encodeURIComponent(`${stop.latitude},${stop.longitude}`)}/`;
  });
  return url.href;
}

function routeWaypoint(stop: RouteStop) {
  return {
    waypoint: {
      location: {
        latLng: {
          latitude: stop.latitude,
          longitude: stop.longitude
        }
      }
    }
  };
}

async function fetchPlaceDetails(apiKey: string, placeId: string) {
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACE_DETAILS_FIELD_MASK
    }
  });

  if (!response.ok) {
    return null;
  }

  return await response.json() as GooglePlace;
}

async function textSearchPlaces(apiKey: string, textQuery: string) {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACE_FIELD_MASK
    },
    body: JSON.stringify({
      textQuery,
      regionCode: "JP",
      languageCode: "en"
    })
  });

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

async function expandMapsLink(link?: string) {
  const url = parseUrl(link);
  if (!url || !isShortMapsHost(url.hostname)) {
    return link?.trim() || "";
  }

  try {
    const response = await fetch(url.href, { method: "GET", redirect: "follow" });
    return response.url || url.href;
  } catch {
    return url.href;
  }
}

function buildTextQuery(input: ResolvePlaceInput & { expandedLink?: string }) {
  const explicitQuery = input.query?.trim();
  if (explicitQuery) {
    return explicitQuery;
  }

  const expandedUrl = parseUrl(input.expandedLink);
  const urlQuery = expandedUrl ? extractQueryFromUrl(expandedUrl) : "";
  if (urlQuery) {
    return appendCity(urlQuery, input.city);
  }

  const title = input.title?.trim();
  if (title) {
    return appendCity(title, input.city);
  }

  return input.city?.trim() ?? "";
}

function appendCity(query: string, city?: string) {
  const trimmedCity = city?.trim();
  if (!trimmedCity || query.toLowerCase().includes(trimmedCity.toLowerCase())) {
    return query;
  }
  return `${query}, ${trimmedCity}, Japan`;
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

  const coordinatesMatch = url.href.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),/) || url.href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (coordinatesMatch) {
    return `${coordinatesMatch[1]},${coordinatesMatch[2]}`;
  }

  return "";
}

function normalizePlace(place: GooglePlace): ResolvedPlace {
  return {
    id: place.id ?? "",
    name: place.displayName?.text ?? "",
    formattedAddress: place.formattedAddress ?? "",
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    googleMapsUri: place.googleMapsUri ?? "",
    resolvedAt: new Date().toISOString()
  };
}

function parseUrl(link?: string) {
  const trimmed = link?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

function isShortMapsHost(hostname: string) {
  const host = hostname.replace(/^www\./, "");
  return host === "maps.app.goo.gl" || host === "goo.gl";
}
