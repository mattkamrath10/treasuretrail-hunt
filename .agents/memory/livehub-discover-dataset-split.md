---
name: Live Events vs Discover use different datasets
description: why a hosted event can appear in Discover but be missing from the Live Events (/live) page
---

There are TWO separate event datasets, and surfaces must be kept in sync:
- **`events` table** — hosted/first-class events (estate_sale, yard_sale, auction, flea_market, pop_up, collectibles_show; `event_kind` local|online). Powers **Discover** (`fetchPublishedEvents`) and the whole **boost** system (BoostPickerModal → `fetchMyEvents`; EventDetail boost CTA). This is where boosting writes.
- **`external_listings` table** — user-added links to off-platform sales/shows. Historically the ONLY source for the **Live Events** page (`LiveHub` / `/live`).

**Trap:** boosting a hosted event marks an `events` row, which shows in Discover — but `/live` only read `external_listings`, so the boosted event was invisible there. Discover's "Live Now → See All" routes to `/live`, so users expect parity.

**Fix pattern:** `LiveHub.fetchListings` merges both sources — `external_listings` + `fetchPublishedEvents()` mapped through `eventToListing()` into the shared `ExternalListing` shape (`listing_type` ← event `category` so the type tabs match; `start_at` ← `starts_at`; raw `cover_thumb_url` for the image). A `source:'event'|'external'` discriminator routes hosted-event card clicks to in-app `/event/:id` while external listings keep the bottom-sheet modal. external_listings fetch failure throws (preserves useLiveFeed backoff); events fetch failure only warns (feed stays visible).

**Why:** any new public surface that lists events must decide whether it needs `events`, `external_listings`, or both — defaulting to one silently drops the other.
