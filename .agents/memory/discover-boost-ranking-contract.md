---
name: Discover boost-first ranking contract
description: How Discover/Featured ranks content and why boost outranks content kind
---

# Discover ranking contract

`src/lib/discoverFeatured.ts` ranks all Featured/Discover slides by priority
bucket, then distance (when a location is set), then recency. Buckets (lower =
higher):

- 0 — actively boosted **paid**
- 1 — actively boosted **pro**
- 2 — **featured collectible** (non-boosted `event_featured_items`)
- 3 — Pro holder / verified / featured seller or event (no active boost)
- 4 — everything else

Use `boostBucket(row)` (reads `isBoosted` + `boost_type`) for any new boostable
slide builder: `priority: boostBucket(row) ?? (pro ? P_FEATURED : P_NORMAL)`.
Non-boosted collectibles intentionally outrank Pro/featured sellers so the
actual treasures lead — keep that tier above P_FEATURED if you renumber.

**Why:** boost used to be keyed by content KIND (boosted events at top, boosted
flash finds buried under Pro businesses), so a Pro who boosted a flash find saw
no real lift. Boost now floats above kind so paid/Pro promotion is always
meaningfully more visible, within AND across the category chips.

**How to apply:**
- A boosted flash find outranks a non-boosted event. Don't reintroduce
  kind-keyed priority constants (P_BOOSTED_EVENT, P_PRO_BUSINESS, etc.).
- Location is still a HARD filter for the **grid**: items beyond `radiusMi` are
  dropped before ranking even if boosted (null lat/lng kept). If the user asks
  "I boosted but don't see it," check the saved-location radius first.
- **Exception — hero only:** `buildRemoteBoostedSlides()` returns boosted items
  *outside* the radius, and `composeSlideshow()` reserves a few hero slots
  (default 3 of 8) for them so paid/Pro promotion is seen out-of-area. The grid
  stays strictly local; remote-boost lift lives ONLY in the slideshow.
- `composeSlideshow()` also caps slides per event (`perGroupMax`), rotates which
  collectibles of an over-capacity event show (time-window `rotation` seed,
  computed once per mount in Discover.tsx), and spaces same-event slides so none
  are adjacent. Majority of the hero stays local.

## Event collectibles in Discover
Collectibles uploaded inside an event live in `event_featured_items` and used to
be trapped on the event detail page. `fetchFeaturedItemsForEvents(eventIds)`
(events.ts) + `eventItemToSlide()` surface them as `kind:'find'` slides that
inherit the parent event's location/boost/Pro and link to `/event/:id`. Items
whose parent event isn't in the published set are skipped. IDs namespaced
`eventitem:${id}`.
