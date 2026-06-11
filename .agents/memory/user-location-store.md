---
name: User location store (client-side)
description: Where the personalized user location lives and why it's not in the DB
---

User's personalized location (for "Events Near You" on Discover, Event Map default
center, future nearby alerts) is stored CLIENT-SIDE ONLY in `localStorage` key
`tt_user_location` via `src/lib/userLocation.ts`. Shape: `{lat,lng,zip,source:'gps'|'zip',label,savedAt}`.
Consume it reactively with the `useSavedLocation()` hook (a `useSyncExternalStore`
backed by a module cache + listener set — getSnapshot returns the stable cache ref).

**Why:** the `profiles` table has no coordinate columns and the agent cannot run
Supabase DDL; the existing Local Events / Event Map surfaces already treat location
as client state. Matches the project's localStorage-first convention (saved finds,
onboarding flag, etc.). NO migration was added for this.

**How to apply:** any future location-driven feature (nearby push, saved search
areas, default geocode center) should read/write through `userLocation.ts`, NOT add
a DB column, unless the task explicitly asks the user to apply a migration. Geocoding
reuses `geocodeLocation`/`haversineMiles` from `src/lib/geocode.ts` (keyless
zippopotam + nominatim, absolute URLs so they work in the Capacitor webview).
