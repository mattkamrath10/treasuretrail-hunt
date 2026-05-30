/**
 * Location helpers for the Local Events page.
 *
 * The search box accepts either a 5-digit US ZIP code or a free-form
 * "City, State" string, geocodes it to a coordinate, and the feed then keeps
 * only events whose great-circle distance from that point is within the radius.
 *
 * Geocoding providers (both free, no API key, browser-CORS friendly):
 *   - ZIP        → api.zippopotam.us (exact, fast, US ZIP database)
 *   - City/State → nominatim.openstreetmap.org (free-form US place search)
 *
 * These are called directly from the client with absolute URLs, so they work
 * unchanged in the Capacitor webview (only relative `/api` calls need apiUrl()).
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Search radius for the Local Events page, in miles. */
export const LOCAL_RADIUS_MILES = 100;

const EARTH_RADIUS_MILES = 3958.8;

/** Great-circle (haversine) distance between two points, in miles. */
export function haversineMiles(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type GeocodeResult =
  | { ok: true; point: GeoPoint }
  | { ok: false; reason: 'not_found' | 'error' };

const ZIP_RE = /^\d{5}$/;

/**
 * Geocode a ZIP code or "City, State" string to a coordinate.
 * Returns `{ ok: false, reason: 'not_found' }` for a well-formed but unknown
 * location, and `'error'` for a network/provider failure. AbortError is
 * re-thrown so callers can cancel stale lookups.
 */
export async function geocodeLocation(
  input: string,
  signal?: AbortSignal,
): Promise<GeocodeResult> {
  const q = input.trim();
  if (!q) return { ok: false, reason: 'not_found' };

  try {
    if (ZIP_RE.test(q)) {
      const res = await fetch(`https://api.zippopotam.us/us/${q}`, { signal });
      if (res.status === 404) return { ok: false, reason: 'not_found' };
      if (!res.ok) return { ok: false, reason: 'error' };
      const data = await res.json();
      const place = data?.places?.[0];
      const lat = Number(place?.latitude);
      const lng = Number(place?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { ok: true, point: { lat, lng } };
      }
      return { ok: false, reason: 'not_found' };
    }

    const url =
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' +
      encodeURIComponent(q);
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return { ok: false, reason: 'error' };
    const data = await res.json();
    const hit = Array.isArray(data) ? data[0] : null;
    const lat = Number(hit?.lat);
    const lng = Number(hit?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { ok: true, point: { lat, lng } };
    }
    return { ok: false, reason: 'not_found' };
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    return { ok: false, reason: 'error' };
  }
}
