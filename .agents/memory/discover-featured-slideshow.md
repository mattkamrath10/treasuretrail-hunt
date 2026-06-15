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
- **Discover stays DARK** even though the rest of the app went light. Don't
  "fix" it to light without an explicit request.
- **businesses table is migration-gated**: `fetchPublishedBusinesses` can 404
  with PGRST205 where the table isn't applied. Discover loads via
  `Promise.allSettled` so a businesses failure must never blank the page.
- **Wanted + finds have no usable coords on their Row types**, so they bypass
  the radius filter (always shown). Events + businesses are distance-filtered.
- Location input accepts GPS, ZIP, or "City, State" via
  `userLocation.saveTextLocation` (geocodeLocation).
