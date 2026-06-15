---
name: Businesses on the Treasure Map
description: How the Business entity layers onto the map and where its surfaces live, for anyone extending business features.
---

# Businesses on the Treasure Map

The Business entity mirrors the events entity end-to-end (table, RLS, data layer, detail/form pages, search, map).

- **File-name trap:** the map page is still `src/pages/EventsMap.tsx` but renders the title **"Treasure Map"** and now holds BOTH an events marker-cluster layer and a businesses marker-cluster layer (two separate `L.markerClusterGroup` refs, driven imperatively). Don't assume "EventsMap = events only."
- **Pin/cluster distinction:** events = teardrop pin + amber clusters; businesses = storefront-glyph pin + teal clusters. Selecting one layer's pin clears the other's selection (only one overlay card at a time).
- **Exactly 8 business categories** live in `BUSINESS_CATEGORY_META` / `BUSINESS_CATEGORIES` in `src/lib/businesses.ts` (snake_case). The map's per-category filter chips and the search provider both source from that constant — add a category there and everything follows.
- **verified/featured are DB-gated, not UI-gated:** the `prevent_business_field_escalation` BEFORE INSERT/UPDATE trigger forces them false for role `authenticated`; service-role bypasses. They render in UI but users can't self-set. See `escalation-guard-privileged-columns.md`.

**Why:** Phase 2 (featured items) and Phase 3 (AI import) plans (`.local/tasks/businesses-map-phase2.md`, `phase3.md`) build directly on these surfaces; knowing the events-mirror shape and the two-layer map avoids re-deriving it.

**How to apply:** when adding any business surface, find the events equivalent first and copy its pattern; when touching the map, remember both layers + their independent toggles/filters and the geocode-on-save coordinate-preservation guard in `BusinessForm` (keeps an existing pin if a re-geocode transiently fails on an unchanged address).
