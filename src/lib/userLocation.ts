/**
 * Persisted user location preference.
 *
 * A single saved location (coordinates + optional ZIP) the app uses to
 * personalize Discover ("Events Near You"), default the Event Map center, and
 * (in future) drive nearby-event notifications and saved search areas.
 *
 * Storage is client-side localStorage to match the rest of the app — the
 * `profiles` table has no coordinate columns and the existing Local Events /
 * Event Map surfaces already treat location as client state. This module is
 * the single source of truth; components subscribe via `useSavedLocation()`.
 */

import { useSyncExternalStore } from 'react';
import { geocodeLocation } from './geocode';

export type LocationSource = 'gps' | 'zip';

export interface SavedLocation {
  lat: number;
  lng: number;
  /** Present when the location came from a ZIP entry. */
  zip: string | null;
  source: LocationSource;
  /** Human label for UI (e.g. the ZIP, or "Current location"). */
  label: string | null;
  savedAt: string;
}

const STORAGE_KEY = 'tt_user_location';
const ZIP_RE = /^\d{5}$/;

// `undefined` = not yet read from storage; `null` = read, nothing saved.
let cache: SavedLocation | null | undefined;
const listeners = new Set<() => void>();

function readFromStorage(): SavedLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && typeof p === 'object' && Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
      return {
        lat: Number(p.lat),
        lng: Number(p.lng),
        zip: typeof p.zip === 'string' ? p.zip : null,
        source: p.source === 'gps' ? 'gps' : 'zip',
        label: typeof p.label === 'string' ? p.label : null,
        savedAt: typeof p.savedAt === 'string' ? p.savedAt : new Date().toISOString(),
      };
    }
  } catch {
    /* corrupt value — treat as no saved location */
  }
  return null;
}

/** Current saved location (cached). Returns null when nothing is saved. */
export function getSavedLocation(): SavedLocation | null {
  if (cache === undefined) cache = readFromStorage();
  return cache;
}

function emit() {
  for (const l of listeners) l();
}

export function setSavedLocation(
  loc: Omit<SavedLocation, 'savedAt'> & { savedAt?: string },
): SavedLocation {
  const full: SavedLocation = { ...loc, savedAt: loc.savedAt ?? new Date().toISOString() };
  cache = full;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(full)); } catch { /* ignore quota */ }
  emit();
  return full;
}

export function clearSavedLocation(): void {
  cache = null;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** React binding — re-renders the component whenever the saved location changes. */
export function useSavedLocation(): SavedLocation | null {
  return useSyncExternalStore(subscribe, getSavedLocation, () => null);
}

export type SaveZipResult =
  | { ok: true; location: SavedLocation }
  | { ok: false; reason: 'invalid' | 'not_found' | 'error' };

/** Validate + geocode a 5-digit ZIP, persisting it on success. */
export async function saveZipLocation(zip: string, signal?: AbortSignal): Promise<SaveZipResult> {
  const z = zip.trim();
  if (!ZIP_RE.test(z)) return { ok: false, reason: 'invalid' };
  const r = await geocodeLocation(z, signal);
  if (!r.ok) return { ok: false, reason: r.reason };
  const location = setSavedLocation({
    lat: r.point.lat, lng: r.point.lng, zip: z, source: 'zip', label: z,
  });
  return { ok: true, location };
}

export type SaveTextResult =
  | { ok: true; location: SavedLocation }
  | { ok: false; reason: 'invalid' | 'not_found' | 'error' };

/**
 * Save a location from free text — either a 5-digit ZIP or a "City, State"
 * string. Geocoded via geocodeLocation (ZIP -> zippopotam, text -> nominatim),
 * so Discover's location filter accepts all three input styles (GPS, ZIP,
 * City/State).
 */
export async function saveTextLocation(input: string, signal?: AbortSignal): Promise<SaveTextResult> {
  const q = input.trim();
  if (!q) return { ok: false, reason: 'invalid' };
  const r = await geocodeLocation(q, signal);
  if (!r.ok) return { ok: false, reason: r.reason };
  const isZip = ZIP_RE.test(q);
  const location = setSavedLocation({
    lat: r.point.lat,
    lng: r.point.lng,
    zip: isZip ? q : null,
    source: 'zip',
    label: q,
  });
  return { ok: true, location };
}

export type GpsResult =
  | { ok: true; location: SavedLocation }
  | { ok: false; reason: 'unsupported' | 'denied' };

/** Request device GPS and persist the coordinates on success. */
export function requestGpsLocation(): Promise<GpsResult> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ ok: false, reason: 'unsupported' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const location = setSavedLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          zip: null,
          source: 'gps',
          label: 'Current location',
        });
        resolve({ ok: true, location });
      },
      () => resolve({ ok: false, reason: 'denied' }),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  });
}
