---
name: Local Events location search (geocoding + radius filter)
description: "How the Events page turns a ZIP / City,State into a 100-mile radius filter, and the provider choices."
---

The Local Events page search box is a LOCATION filter, not a text search.

**Rule:** empty input shows all events; a valid ZIP or "City, State" keeps only
events within `LOCAL_RADIUS_MILES` (100 mi); invalid/unknown input shows an error
banner; a valid location with no matches shows exactly
"No local events found within 100 miles."

**How it works:** `src/lib/geocode.ts` exposes `geocodeLocation(input, signal)`
(ZIP -> api.zippopotam.us, else -> nominatim.openstreetmap.org), `haversineMiles`,
and `LOCAL_RADIUS_MILES`. The page debounces 600ms, geocodes into a `center`
point + `geoStatus`, and the feed filter drops events past 100mi AND events with
null lat/lng (online shows have no coords, so they vanish under a location search).

**Why these providers:** both are free, need no API key, send permissive CORS,
and are called with ABSOLUTE URLs so they work unchanged in the Capacitor webview
(only relative `/api` calls need apiUrl()). The `events` table already HAS lat/lng
columns (confirmed live; no DB migration needed).

**The trap (and the fix):** for a long time `SellerEventForm` saved address/city/
region but NEVER populated lat/lng, so EVERY local event had null coords and was
silently hidden from radius search ("No local events nearby" even when searching
the host's own ZIP). Fix: the form now calls `geocodeEventLocation()` (specific→
coarse: "addr, city, region" → "city, region" → city → region → address) on save
and writes payload.lat/lng (online events nulled; geocode is best-effort — warns
AFTER a successful save, preserves existing coords on edit if it misses). A
one-time data backfill lived at `scripts/backfill-event-coords.mjs` (service-role
PATCH, geocodes rows where lat OR lng is null). **Rule:** any new path that writes
a local event MUST geocode it, or it disappears from location search.
