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

/**
 * Cached variant of geocodeLocation for read-time, high-volume callers (e.g.
 * distance-filtering many community finds on Discover). Resolved points AND
 * "not found" results are memoized in-memory + localStorage keyed by the
 * lowercased query, so a given location is only ever looked up once per
 * device. Transient network errors are NOT cached, so they retry later.
 *
 * Returns the coordinate, or null when the text can't be resolved.
 */
const GEO_CACHE_KEY = 'tt_geo_cache_v1';
type GeoCacheVal = GeoPoint | null;
let geoMem: Record<string, GeoCacheVal> | null = null;

function loadGeoCache(): Record<string, GeoCacheVal> {
  if (geoMem) return geoMem;
  try {
    geoMem = JSON.parse(localStorage.getItem(GEO_CACHE_KEY) ?? '{}') as Record<string, GeoCacheVal>;
  } catch {
    geoMem = {};
  }
  return geoMem;
}

function saveGeoCache(): void {
  try { localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(geoMem ?? {})); } catch { /* ignore quota */ }
}

// Nominatim's usage policy asks for at most ~1 request/sec. Pace only the
// actual network calls (cache hits skip this entirely) so a page geocoding
// many finds stays a good API citizen.
let lastFetchAt = 0;
const MIN_FETCH_GAP_MS = 1100;
async function paceFetch(): Promise<void> {
  const wait = lastFetchAt + MIN_FETCH_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFetchAt = Date.now();
}

export async function geocodeCached(text: string): Promise<GeoPoint | null> {
  const key = text.trim().toLowerCase();
  if (!key) return null;
  const cache = loadGeoCache();
  if (key in cache) return cache[key];
  await paceFetch();
  const r = await geocodeLocation(text);
  if (r.ok) { cache[key] = r.point; saveGeoCache(); return r.point; }
  // Cache definitive misses; let transient 'error' results retry next time.
  if (r.reason === 'not_found') { cache[key] = null; saveGeoCache(); }
  return null;
}

/**
 * Geocode a local event's stored address parts to a coordinate so the event
 * can be matched by the Local Events location search (which filters on
 * lat/lng within a radius). We try the most specific string first and fall
 * back to coarser ones, so a precise street address that the provider can't
 * resolve still lands on the right city.
 *
 * Returns `null` when nothing resolves; callers should treat that as
 * "couldn't pin this location" and leave coordinates unset rather than
 * failing the save.
 */
export async function geocodeEventLocation(
  parts: { address?: string | null; city?: string | null; region?: string | null },
  signal?: AbortSignal,
): Promise<GeoPoint | null> {
  const address = (parts.address ?? '').trim();
  const city = (parts.city ?? '').trim();
  const region = (parts.region ?? '').trim();

  const candidates: string[] = [];
  if (address && (city || region)) candidates.push([address, city, region].filter(Boolean).join(', '));
  if (city && region) candidates.push(`${city}, ${region}`);
  if (city) candidates.push(city);
  if (region) candidates.push(region);
  if (address) candidates.push(address);

  const seen = new Set<string>();
  for (const q of candidates) {
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const r = await geocodeLocation(q, signal);
    if (r.ok) return r.point;
  }
  return null;
}
