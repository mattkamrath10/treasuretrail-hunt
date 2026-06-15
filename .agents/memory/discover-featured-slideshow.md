---
name: Discover Featured slideshow
description: How the Discover page hero + ranking is structured after the Featured Near You rework.
---

# Discover "Featured Near You"

The Discover top is no longer the old per-category carousels. It is a single
rotating `FeaturedSlideshow` (src/components/discover/FeaturedSlideshow.tsx) fed
by a unified ranked list built in `src/lib/discoverFeatured.ts`
(`buildFeaturedSlides` -> `FeaturedSlide[]`).

Key durable facts:
- **Ranking order is a product decision** (not arbitrary): boosted events ->
  pro businesses -> boosted wanted -> other featured -> normal, then
  nearest-first when a location is set, then newest. Change deliberately.
- **Discover is LIGHT** (built light from the start per task #32/#33). An earlier
  note said "stays dark" — that was WRONG and code review rejected it. All `s`/
  styles use `--tt-*` tokens; only text/badges sitting OVER slide images stay
  white. Don't reintroduce hardcoded dark backgrounds.
- **businesses table is migration-gated**: `fetchPublishedBusinesses` can 404
  with PGRST205 where the table isn't applied. Discover loads via
  `Promise.allSettled` so a businesses failure must never blank the page.
- **Localization covers all four kinds.** Events + businesses + wanted carry
  real coords (WantedItemRow gained optional `lat`/`lng`, migration-gated via
  `select('*')`). Finds (community_posts) have NO coord columns, so they are
  geocoded at READ time via `geocodeCached` (in-memory + `tt_geo_cache_v1`
  localStorage cache, caches hits + not_found, never transient errors). Only
  items whose location truly can't be resolved bypass the radius filter.
- **Last-selected chip is persisted** in localStorage `tt_discover_filter`
  (validated against FILTER_KEYS, default 'all').
- Location input accepts GPS, ZIP, or "City, State" via
  `userLocation.saveTextLocation` (geocodeLocation).
