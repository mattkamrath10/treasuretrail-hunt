---
name: Saved Finds dual store
description: Where "saved finds" actually persist and how to render them on the profile
---

Saves in this app live in TWO stores, not one:
- **community-post "finds"** → `localStorage` key `tt_saved_posts` (array of post ids), written by FindDetail / Home / Community save buttons. NOT in any DB table.
- **marketplace / external / community listings** → DB `saved_listings` (user_id, listing_id, listing_kind) via `saveListing()`, RLS own-rows.

**Why:** the Profile "Saved Finds" section once only ever rendered a hardcoded "No saved finds yet" placeholder — the real saves existed but were never read, so users with saved finds saw an empty list.

**How to apply:** to list saved items, use `fetchSavedFinds(userId)` in `src/lib/savedListings.ts` — it merges both stores, hydrates each kind from its source table (`community_posts`/`marketplace_listings`/`external_listings`), and de-dupes by `kind:id`. Any new "show my saves" surface must read BOTH stores, never just `saved_listings`. localStorage saved-post ids are global per-browser (not user-scoped) — a known app-wide quirk shared by all save buttons.
