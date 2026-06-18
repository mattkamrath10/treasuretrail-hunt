---
name: Discover boost-first ranking contract
description: How Discover/Featured ranks content and why boost outranks content kind
---

# Discover ranking contract

`src/lib/discoverFeatured.ts` ranks all Featured/Discover slides by priority
bucket, then distance (when a location is set), then recency. Buckets:

- 0 — actively boosted **paid**
- 1 — actively boosted **pro**
- 2 — Pro holder / verified / featured seller (no active boost)
- 3 — everything else

Use `boostBucket(row)` (reads `isBoosted` + `boost_type`) for any new boostable
slide builder: `priority: boostBucket(row) ?? (pro ? P_FEATURED : P_NORMAL)`.

**Why:** boost used to be keyed by content KIND (boosted events at top, boosted
flash finds buried under Pro businesses), so a Pro who boosted a flash find saw
no real lift. Boost now floats above kind so paid/Pro promotion is always
meaningfully more visible, within AND across the category chips.

**How to apply:**
- A boosted flash find outranks a non-boosted event. Don't reintroduce
  kind-keyed priority constants (P_BOOSTED_EVENT, P_PRO_BUSINESS, etc.).
- Location is still a HARD filter: items beyond `radiusMi` are dropped before
  ranking even if boosted (items with null lat/lng are kept). If the user ever
  asks "I boosted but don't see it," check the saved-location radius first.

## Event collectibles in Discover
Collectibles uploaded inside an event live in `event_featured_items` and used to
be trapped on the event detail page. `fetchFeaturedItemsForEvents(eventIds)`
(events.ts) + `eventItemToSlide()` surface them as `kind:'find'` slides that
inherit the parent event's location/boost/Pro and link to `/event/:id`. Items
whose parent event isn't in the published set are skipped. IDs namespaced
`eventitem:${id}`.
