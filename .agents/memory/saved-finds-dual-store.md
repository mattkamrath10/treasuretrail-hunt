---
name: Saved Finds dual store
description: Where "saved finds" actually persist and how to render them on the profile
---

Saves in this app are written to TWO stores, and reads must merge both:
- **community-post "finds"** → written to BOTH `localStorage` key `tt_saved_posts` (array of post ids, guest/back-compat) AND DB `saved_listings` with `listing_kind='community_post'` when a user is logged in. The save handlers in FindDetail / Home / Community do both writes.
- **marketplace / external / community listings** → DB `saved_listings` (user_id, listing_id, listing_kind) via `saveListing()`, RLS own-rows.

**Why:** community-post saves used to be localStorage-ONLY, which is per-browser AND per-origin — saves made in the iOS webview / dev preview / web domain never appeared when viewing the profile from a different origin, so users saw an empty "Saved Finds" list despite saving. Mirroring to `saved_listings` ties saves to the account so they appear everywhere. (Separately, the Profile section once only rendered a hardcoded placeholder and never read saves at all.)

**How to apply:**
- To LIST saves use `fetchSavedFinds(userId)` in `src/lib/savedListings.ts` — it merges localStorage + `saved_listings`, hydrates each kind from its source table (`community_posts`/`marketplace_listings`/`external_listings`), de-dupes by `kind:id`. Any "show my saves" surface must read BOTH stores.
- To WRITE a community-post save, do the toggle decision INSIDE the `setSavedIds` functional updater (compute `willSave` from `prev`, not render-time state) and fire `saveListing`/`unsaveListing(user.id, id, 'community_post')` from there — this is race-safe under rapid double-taps; the upsert(ignoreDuplicates)/delete are idempotent so React strict-mode double-invoke is harmless. FindDetail reads/writes localStorage synchronously so it's already race-safe.
- localStorage saved-post ids are global per-browser (not user-scoped) — a known quirk; the DB rows ARE user-scoped via RLS.
- The Profile "Saved" stat count MUST be derived from `fetchSavedFinds(user.id).length`, NOT from a `saved_listings` count query. `saved_listings` has NO `id` column (composite PK user_id,listing_id,listing_kind), so `.select('id',{count})` returns null→0; and a raw server-count + localStorage-length sum double-counts a post saved in both stores. fetchSavedFinds is the only de-duped source of truth, so the stat matches the rendered cards.
