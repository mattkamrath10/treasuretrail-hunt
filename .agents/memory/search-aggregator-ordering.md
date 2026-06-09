---
name: Search aggregator ordering + external-provider seam
description: How the local-first search aggregator orders sections and where external marketplaces slot in.
---

# Search aggregator (src/lib/search/searchService.ts)

Section order is **local-first**: TreasureTrail "Near You" → "More TreasureTrail
Results" → nearby Events → external marketplace section(s) → Google fallback
(UI-only outbound links). External providers (eBay, Etsy, …) are NOT a
last-resort waterfall — they are appended as their own sections **below** the
local results and **above** Google, and they run **concurrently** with the
TreasureTrail query (Promise.all) so they never slow the local path.

External results split by location: items with coords + an origin →
distance-ordered "Other Marketplaces Near You"; everything else → "Available to
Ship". No origin → one combined "From Other Marketplaces" block.

**Why:** the product is local-first; external discovery supplements local supply
rather than replacing it, and Google is always the final escape hatch.

**How to apply:** add a marketplace by implementing `SearchProvider`
(isEnabled() flag + search() that never throws) and registering it in
`EXTERNAL_PROVIDERS`. Providers stay disabled (return []) until
`VITE_<NAME>_SEARCH_ENABLED=true` + a server proxy holds the API key. `safeSearch`
guarantees soft-fail (disabled or throwing provider → []).

## Cross-phase gotcha — demand capture vs external results
Phase 5 demand capture in `src/pages/SearchResults.tsx` fires when
`outcome.items.length === 0`. Because external sections now contribute to
`outcome.items`, once eBay/Etsy are enabled a search with NO TreasureTrail
matches but WITH external matches will stop recording unmet demand. If that's
undesirable when external goes live, gate demand capture on TreasureTrail-only
emptiness (e.g. expose a TT result count on the outcome), not total emptiness.
