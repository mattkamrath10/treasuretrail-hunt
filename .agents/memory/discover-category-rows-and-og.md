---
name: Discover category rows + per-event OG injection
description: How Discover themed sub-rows are built and how shared /event links unfurl one rich preview card.
---

## Discover themed category rows (Phase 1D)
`buildCategoryRows(slides, filter)` in `src/lib/discoverFeatured.ts` builds themed
horizontal strips (Auctions, Estate Sales, Hot Wheels, Antique Stores, …) below the
Featured slideshow; the flat grid stays.

**Rule:** every row matcher MUST be `kind`-guarded (`s.kind === 'event'|'find'|'business'`)
BEFORE checking `fallbackCategory`/keywords.
**Why:** event *items* surface as `kind:'find'` slides but carry the parent event's
`fallbackCategory` (e.g. `'auction'`), and find/business free-text overlaps event
keywords — without the kind guard a find leaks into the "Auctions" event row.
**How to apply:** when adding a new themed row, copy the `s.kind === X && …` shape;
finds are keyword-driven (`searchText`), events/businesses are `fallbackCategory`-driven.
Empty rows are dropped by the caller, so the taxonomy degrades gracefully — never
hard-code a row that assumes data exists.

`FeaturedSlide.online` (set per builder = `event_kind === 'online'`) powers the
"Live Shows" row; only events set it true.

## Per-event Open Graph injection (Phase 3 sharing)
Crawlers (iMessage/WhatsApp/Slack/FB) don't run our SPA JS, so a shared
`/event/:id` link only sees static `index.html` OG tags. Server route
`app.get('/event/:id')` in `server/index.ts` (registered BEFORE the SPA fallback,
inside the `fs.existsSync(distDir)` block) fetches the published event via the anon
Supabase client and string-replaces the OG/Twitter/`<title>`/canonical tags in
`dist/index.html`, served no-cache.

**Rules:**
- Only acts in production (needs `dist/`); dev has no dist so it's inert.
- Guard the id with a UUID-ish regex and `return next()` otherwise, and on any
  error/missing/unpublished event fall through to default OG — never 500.
- All injected values go through `htmlEscape` (anti meta-injection).
- Anon query is constrained to `status='published'` + id equality (RLS-safe).
- EventDetail `onShare` passes `imageUrl: null` so `shareWithImage` shares URL-only;
  passing an image File produced TWO iMessage previews (attached photo + unfurled
  URL card). With null it unfurls ONE card powered by the server OG tags.

**To extend to finds/businesses/listings:** add sibling `app.get('/find/:id')` etc.
with the same fetch→inject→graceful-fallback shape. server/ is NOT typechecked at
build (tsconfig includes `src` only) — it runs via tsx, so verify by booting.

**Profile shares (`/u/:username`):** added a sibling `app.get('/u/:username')` OG
route (same fetch→inject→graceful-fallback shape) so shared profile links unfurl
the user's own @username + avatar + bio instead of the generic card. For business
accounts it prefers business_name/business_logo_url/business_bio. GOTCHA: the
`profiles` table has NO location columns — selecting location_city/location_state
(or any nonexistent column) fails the WHOLE anon select → null → silent default OG.
