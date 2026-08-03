import {
  MIN_TIMELINE_DURATION_MINUTES,
  TIMELINE_END_MINUTES,
  TIMELINE_GRID_STEP_MINUTES,
  TIMELINE_INTERACTION_STEP_MINUTES,
  TIMELINE_START_MINUTES,
  isWithinTimelineRange,
  minutesToTimeInput,
  parseTimeToMinutes,
  timeRangesOverlap
} from "./timeline.js";

const TRANSIT_CATEGORY = "Transit";
const HOTEL_CATEGORY = "Hotel";
const STAY_KIND = "stay";
const BOOKED_STATUS = "Booked";
const SKIPPED_STATUS = "Skipped";

export function buildDayCheck(day, days = []) {
  const displayStops = buildDisplayStops(day);
  const analysisStops = displayStops.filter((stop) => !isTransitItem(stop.item) && !isStayItem(stop.item));
  const hasTransfer = displayStops.some((stop) => isTransitItem(stop.item));
  const routeStops = buildAnalysisRouteStops(day, analysisStops, hasTransfer);
  const status = getDayCheckStatus(analysisStops, routeStops, { hasTransfer });
  const suggestion = buildDayCheckSuggestion(day, days, analysisStops, status, { hasTransfer });
  const currentRouteTitles = displayStops.map((stop) => stop.title);
  const betterRouteTitles = suggestion?.canApply
    ? displayStops.filter((stop) => stop.item.id !== suggestion.itemId).map((stop) => stop.title)
    : currentRouteTitles;
  const coachCopy = getDayCheckCoachCopy(status, suggestion, analysisStops, { hasTransfer });

  return {
    ...status,
    resultKind: suggestion?.canApply ? "actionable" : status.resultKind,
    suggestion,
    stops: displayStops,
    currentRouteTitles,
    betterRouteTitles,
    movedStopLabel: suggestion?.canApply ? `Move ${suggestion.itemTitle} to ${suggestion.targetDayLabel}` : "",
    movedStopTitle: suggestion?.canApply ? suggestion.itemTitle : "",
    sourceDayBadge: formatDayCheckBadgeLabel(day),
    targetDayBadge: suggestion?.targetDayBadge ?? "",
    coachTitle: coachCopy.title,
    coachSummary: coachCopy.summary,
    currentStatusCopy: hasTransfer ? "Destination activities need a simpler route" : "Too much backtracking",
    betterStatusCopy: hasTransfer ? "Planned transfer stays; destination route is simpler" : "Smoother route, less backtracking"
  };
}

export function isDayCheckItemMovable(item) {
  return Boolean(item)
    && item.status !== SKIPPED_STATUS
    && item.status !== BOOKED_STATUS
    && !isTransitItem(item)
    && !isStayItem(item);
}

function buildDisplayStops(day) {
  return sortSchedule(day?.schedule ?? [])
    .filter((item) => item.status !== SKIPPED_STATUS && hasPlaceCoordinates(item.place))
    .map((item) => ({
      id: item.id,
      title: item.title || item.place?.name || "Untitled stop",
      city: item.city || day.city,
      item,
      latitude: Number(item.place.latitude),
      longitude: Number(item.place.longitude)
    }));
}

function buildAnalysisRouteStops(day, analysisStops, hasTransfer) {
  if (hasTransfer) {
    return analysisStops;
  }

  const baseStop = hasPlaceCoordinates(day?.basePlace)
    ? {
        id: `${day.id}:base`,
        title: day.basePlace.name || day.basePlace.formattedAddress || "Hotel",
        city: day.city,
        latitude: Number(day.basePlace.latitude),
        longitude: Number(day.basePlace.longitude)
      }
    : null;

  if (baseStop && analysisStops.length) {
    return [baseStop, ...analysisStops, { ...baseStop, id: `${baseStop.id}:return` }];
  }

  return analysisStops;
}

function getDayCheckStatus(analysisStops, routeStops, { hasTransfer }) {
  if (analysisStops.length === 0) {
    return {
      resultKind: "insufficient",
      statusTone: "neutral",
      statusLabel: hasTransfer ? "Transfer planned" : "Not enough mapped places",
      summary: hasTransfer
        ? "Planned transfer detected. Add mapped destination activities when you want to check their local route."
        : "Add resolved places to this day when you want a travel check.",
      why: hasTransfer ? "The transfer is protected and is not treated as backtracking." : "There are no mapped activities to compare yet."
    };
  }

  if (analysisStops.length === 1) {
    return {
      resultKind: "insufficient",
      statusTone: "neutral",
      statusLabel: hasTransfer ? "Transfer planned" : "Only one mapped stop",
      summary: hasTransfer
        ? "Planned transfer detected. There is only one mapped destination activity, so there is no local route to compare yet."
        : "There is only one mapped activity, so there is no route comparison to make yet.",
      why: hasTransfer ? "The transfer is protected and the destination has one mapped activity." : "There is only one activity to route from your base."
    };
  }

  const legDistances = [];
  for (let index = 0; index < routeStops.length - 1; index += 1) {
    legDistances.push(distanceKm(routeStops[index], routeStops[index + 1]));
  }

  const totalKm = legDistances.reduce((sum, distance) => sum + distance, 0);
  const maxLegKm = legDistances.reduce((max, distance) => Math.max(max, distance), 0);
  const stopCount = analysisStops.length;
  const distanceSummary = `The mapped destination activities create about ${formatDistanceKm(totalKm)} of straight-line movement, with the longest jump around ${formatDistanceKm(maxLegKm)}.`;

  if (totalKm >= 30 || maxLegKm >= 10 || stopCount >= 5) {
    return {
      resultKind: "review",
      statusTone: "heavy",
      statusLabel: "Too spread out",
      summary: hasTransfer
        ? "The planned transfer stays on this day, but the destination activities may feel travel-heavy."
        : "This day may feel travel-heavy. Consider moving one stop before committing.",
      why: distanceSummary
    };
  }

  if (totalKm >= 20 || maxLegKm >= 7 || stopCount >= 4) {
    return {
      resultKind: "review",
      statusTone: "spread",
      statusLabel: "Spread out",
      summary: hasTransfer
        ? "The planned transfer stays on this day, but the destination activities should be reviewed."
        : "This day is possible, but it crosses enough distance that you should review the order.",
      why: distanceSummary
    };
  }

  if (totalKm >= 10 || maxLegKm >= 4 || stopCount >= 3) {
    return {
      resultKind: "manageable",
      statusTone: "some",
      statusLabel: "Some travel",
      summary: hasTransfer
        ? "The planned transfer stays on this day, and the destination activities should still be manageable."
        : "This day has a few moves, but it should still be manageable.",
      why: distanceSummary
    };
  }

  return {
    resultKind: "manageable",
    statusTone: "good",
    statusLabel: hasTransfer ? "Destination route looks good" : "Looks good",
    summary: hasTransfer
      ? "Planned transfer detected; destination activities were checked separately and look manageable."
      : "This day looks manageable.",
    why: distanceSummary
  };
}

function getDayCheckCoachCopy(status, suggestion, analysisStops, { hasTransfer }) {
  if (suggestion?.canApply) {
    return {
      title: hasTransfer ? "Simplify the route after your transfer" : "Move one stop to make this day easier",
      summary: hasTransfer
        ? "Your planned transfer stays in place. Moving one destination activity will reduce local backtracking."
        : "This day has too much backtracking. Moving one stop will make the route easier to follow."
    };
  }

  if (["spread", "heavy"].includes(status.statusTone)) {
    return {
      title: hasTransfer ? "Review the route after your transfer" : "This day has some travel",
      summary: hasTransfer
        ? "The transfer is protected. Review the destination order because there is not one safe stop to move."
        : "There is not one obvious stop to move. Review the order before locking the day."
    };
  }

  if (status.statusTone === "some") {
    return {
      title: hasTransfer ? "Your transfer day looks manageable" : "This day has a few moves",
      summary: hasTransfer
        ? "The transfer stays in place. Keep an eye on arrival time and the order of destination activities."
        : "It should still be manageable. Keep an eye on the order and pacing."
    };
  }

  if (analysisStops.length === 0) {
    return {
      title: hasTransfer ? "Your planned transfer stays on this day" : "Add mapped places to check the day",
      summary: hasTransfer
        ? "Add mapped destination activities to check the route after arrival."
        : "Once activities have Google Maps places, the planner can flag hard travel days."
    };
  }

  if (hasTransfer && analysisStops.length === 1) {
    return {
      title: "Your planned transfer stays on this day",
      summary: "There is only one mapped destination activity, so no route change is suggested."
    };
  }

  if (analysisStops.length === 1) {
    return {
      title: "Only one mapped stop",
      summary: "Add another mapped activity when you want the planner to compare the route."
    };
  }

  return {
    title: hasTransfer ? "Your transfer day looks organized" : "This day looks easy to follow",
    summary: hasTransfer
      ? "The transfer stays in place, and the destination activities form a manageable local route."
      : "No obvious travel problem stands out."
  };
}

function buildDayCheckSuggestion(day, days, stops, status, { hasTransfer }) {
  if (!["spread", "heavy"].includes(status.statusTone) || stops.length < 3) {
    return null;
  }

  const outlier = findOutlierStop(stops);
  if (!outlier || outlier.averageDistanceKm < 8.5) {
    return {
      canApply: false,
      copy: hasTransfer
        ? "The destination activities have some distance, but there is not one obvious stop to move. Keep the planned transfer and review the activity order."
        : "This day has some distance, but there is not one obvious stop to move. Review the order before finalizing the day."
    };
  }

  if (!isDayCheckItemMovable(outlier.stop.item)) {
    return {
      canApply: false,
      copy: `${outlier.stop.title} is the main geographic outlier, but it is fixed on this day. Review timing and order instead of moving another stop.`
    };
  }

  const targetDay = findCompatibleTargetDay(days, day, outlier.stop);
  const keepTitles = stops.filter((stop) => stop.id !== outlier.stop.id).map((stop) => stop.title);
  const targetDayLabel = targetDay ? formatDayCheckDayLabel(targetDay) : "";
  const placeDirection = describeRelativeArea(outlier.stop, keepTitles.length ? stops.find((stop) => stop.id !== outlier.stop.id) : null);

  if (!targetDay) {
    return {
      canApply: false,
      copy: `Consider moving ${outlier.stop.title} to a lighter ${outlier.stop.city || day.city || "nearby"} day. It appears ${placeDirection} from the rest of this plan, and there is not a clear existing day with enough open time.`
    };
  }

  const keepCopy = keepTitles.length
    ? `Keep ${formatTitleList(keepTitles)} together on ${formatDayCheckDayLabel(day)}.`
    : `Keep the rest of ${formatDayCheckDayLabel(day)} unchanged.`;

  return {
    canApply: true,
    sourceDayId: day.id,
    targetDayId: targetDay.id,
    itemId: outlier.stop.item.id,
    itemTitle: outlier.stop.title,
    keepTitles,
    targetDayLabel,
    targetDayBadge: formatDayCheckBadgeLabel(targetDay),
    copy: `Move ${outlier.stop.title} to ${targetDayLabel}. ${keepCopy}`,
    reviewCopy: `This will move ${outlier.stop.title} into the first open slot on ${targetDayLabel}. No other stops change.`
  };
}

function findOutlierStop(stops) {
  let candidate = null;

  for (const stop of stops) {
    const others = stops.filter((other) => other.id !== stop.id);
    if (!others.length) {
      continue;
    }
    const averageDistanceKm = others.reduce((sum, other) => sum + distanceKm(stop, other), 0) / others.length;
    if (!candidate || averageDistanceKm > candidate.averageDistanceKm) {
      candidate = { stop, averageDistanceKm };
    }
  }

  return candidate;
}

function findCompatibleTargetDay(days, sourceDay, stop) {
  const stopRegionTokens = getRegionTokens([stop.city, stop.item?.place?.formattedAddress, stop.item?.place?.name].join(" "));
  const sourceRegionTokens = getRegionTokens([sourceDay.city, sourceDay.basePlace?.formattedAddress, sourceDay.basePlace?.name].join(" "));
  const acceptableTokens = new Set([...stopRegionTokens, ...sourceRegionTokens]);
  const duration = Math.max(MIN_TIMELINE_DURATION_MINUTES, Number(stop.item?.duration) || MIN_TIMELINE_DURATION_MINUTES);

  const candidates = (days ?? [])
    .filter((candidateDay) => candidateDay.id !== sourceDay.id)
    .map((candidateDay) => {
      const dayTokens = getRegionTokens([candidateDay.city, candidateDay.basePlace?.formattedAddress, candidateDay.basePlace?.name].join(" "));
      const isCompatible = !acceptableTokens.size || dayTokens.some((token) => acceptableTokens.has(token));
      const start = findAvailableScheduleStart(candidateDay.schedule ?? [], duration);
      return { day: candidateDay, isCompatible, start, plannedMinutes: getPlannedMinutes(candidateDay) };
    })
    .filter((candidate) => candidate.isCompatible && candidate.start)
    .sort((first, second) => first.plannedMinutes - second.plannedMinutes || (first.day.dayNumber ?? 0) - (second.day.dayNumber ?? 0));

  return candidates[0]?.day ?? null;
}

function findAvailableScheduleStart(schedule, durationMinutes) {
  const duration = Math.max(MIN_TIMELINE_DURATION_MINUTES, Number(durationMinutes) || MIN_TIMELINE_DURATION_MINUTES);
  for (let minutes = TIMELINE_START_MINUTES; minutes <= TIMELINE_END_MINUTES - duration; minutes += TIMELINE_INTERACTION_STEP_MINUTES) {
    const start = minutesToTimeInput(minutes);
    if (isScheduleSlotAvailable(schedule, start, duration)) {
      return start;
    }
  }
  return "";
}

function isScheduleSlotAvailable(schedule, targetStart, durationMinutes) {
  const start = parseTimeToMinutes(targetStart);
  const duration = Math.max(MIN_TIMELINE_DURATION_MINUTES, Number(durationMinutes) || MIN_TIMELINE_DURATION_MINUTES);
  if (start === null || !isWithinTimelineRange(targetStart, duration)) {
    return false;
  }

  return (schedule ?? []).every((item) => {
    if (isStayItem(item)) {
      return true;
    }
    const itemStart = parseTimeToMinutes(item.start);
    if (itemStart === null) {
      return true;
    }
    const itemDuration = Number(item.duration) || TIMELINE_GRID_STEP_MINUTES;
    return !timeRangesOverlap(start, duration, itemStart, itemDuration);
  });
}

function getPlannedMinutes(day) {
  return (day?.schedule ?? [])
    .filter((item) => item.status !== SKIPPED_STATUS && !isStayItem(item))
    .reduce((total, item) => total + Number(item.duration || 0), 0);
}

function isTransitItem(item) {
  return item?.category === TRANSIT_CATEGORY;
}

function isStayItem(item) {
  return item?.itemKind === STAY_KIND
    || item?.category === HOTEL_CATEGORY
    || Boolean(item?.stayStartDayId || item?.stayEndDayId || item?.checkInTime || item?.checkOutTime);
}

function hasPlaceCoordinates(place) {
  return Number.isFinite(Number(place?.latitude)) && Number.isFinite(Number(place?.longitude));
}

function sortSchedule(schedule) {
  return [...(schedule ?? [])].sort((first, second) => (first.start ?? "").localeCompare(second.start ?? ""));
}

function distanceKm(first, second) {
  const earthRadiusKm = 6371;
  const lat1 = toRadians(Number(first.latitude));
  const lat2 = toRadians(Number(second.latitude));
  const deltaLat = toRadians(Number(second.latitude) - Number(first.latitude));
  const deltaLon = toRadians(Number(second.longitude) - Number(first.longitude));
  const a = (Math.sin(deltaLat / 2) ** 2) + (Math.cos(lat1) * Math.cos(lat2) * (Math.sin(deltaLon / 2) ** 2));
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function formatDistanceKm(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 km";
  }
  return value >= 10 ? `${Math.round(value)} km` : `${value.toFixed(1)} km`;
}

function formatTitleList(titles) {
  if (titles.length <= 2) {
    return titles.join(" and ");
  }
  return `${titles.slice(0, -1).join(", ")}, and ${titles[titles.length - 1]}`;
}

function formatDayCheckDayLabel(day) {
  return `${day.label || `Day ${day.dayNumber}`}${day.city ? ` (${day.city})` : ""}`;
}

function formatDayCheckBadgeLabel(day) {
  if (!day) {
    return "";
  }
  return Number.isFinite(Number(day.dayNumber)) ? `Day ${day.dayNumber}` : day.label || "Day";
}

function getRegionTokens(value) {
  const text = String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  const regions = [
    "mexico city", "ciudad de mexico", "cdmx", "condesa", "roma norte", "roma sur", "polanco", "coyoacan", "chapultepec", "centro historico",
    "tokyo", "kyoto", "osaka", "nara", "hakone", "yokohama", "kobe", "hiroshima", "nagoya", "sapporo", "fukuoka", "kamakura", "uji", "himeji", "kanazawa", "nikko", "arashiyama"
  ];
  return regions.filter((region) => text.includes(region));
}

function describeRelativeArea(stop, comparisonStop) {
  if (!comparisonStop) {
    return "away from the rest of the day";
  }
  const latDelta = Number(stop.latitude) - Number(comparisonStop.latitude);
  const lonDelta = Number(stop.longitude) - Number(comparisonStop.longitude);
  const vertical = Math.abs(latDelta) > 0.025 ? (latDelta > 0 ? "north" : "south") : "";
  const horizontal = Math.abs(lonDelta) > 0.025 ? (lonDelta > 0 ? "east" : "west") : "";
  return [vertical, horizontal].filter(Boolean).join("/") || "away from the rest of the day";
}
