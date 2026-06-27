const configuredTripUrl = import.meta.env.VITE_PUBLIC_TRIP_URL;

export function buildCurrentTripUrl() {
  const url = getTripBaseUrl();
  const currentUrl = new URL(window.location.href);
  url.search = currentUrl.search;
  url.hash = currentUrl.hash;
  return url.toString();
}

export function buildTripInviteUrl(inviteToken) {
  const url = getTripBaseUrl();
  url.searchParams.set("invite", inviteToken);
  return url.toString();
}

function getTripBaseUrl() {
  const fallbackUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const url = new URL(configuredTripUrl || fallbackUrl, window.location.href);
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }
  return url;
}
