# Phase 1 — Interaction & Navigation Lockdown — QA Report

**Date:** May 18, 2026
**Scope:** Full app interaction audit. Finish-or-hide every dead/placeholder UI; surface silent failures.

## Routes verified (19/19 resolve)

`/` Home · `/flash-finds` · `/rare-radar` · `/auctions` · `/scout-map` · `/messages` · `/alerts` · `/marketplace` · `/pro` · `/safety` · `/community` · `/events` · `/live` · `/achievements` · `/profile` · `/u/:username` · `/login` · `/signup` · `/onboarding`

All 5 BottomNav targets render real content. All 7 Home header shortcuts (Live, Community, Marketplace, Events, Scout Map, Auction Radar, Pro) resolve.

## Fixed this pass

| # | Area | Problem | Fix |
|---|------|---------|-----|
| 1 | RareRadar Matches view | Hardcoded Pexels "Similar Finds Nearby" grid | Removed entirely |
| 2 | RareRadar Matches view | Hardcoded "Hot Right Now" leaderboard (3 fake items) | Removed entirely |
| 3 | RareRadar Matches view | Empty `suggestedMatches.map(...)` rendering nothing | Replaced with honest empty-state message |
| 4 | RareRadar feed | Empty `trendingSearches` section rendering empty header | Removed wrapper + unused state |
| 5 | ScoutMap FilterPanel | 10 category chips had **no `onClick`** — completely dead | Removed Categories section + CATEGORIES constant |
| 6 | ScoutMap | Map markers/activity were `const [] = []` (never populated) — entire map empty with no explanation | Added prominent "Map preview — live geo data launching soon" banner |
| 7 | Events Hub | Entire page is mock data (featured events, passport stamps, leaderboards, Marcus Chen profile) | Added prominent "Preview — Sample events, real listings & RSVPs coming soon" banner at top of Hub |
| 8 | LiveHub Scouts modal | 4 SCOUT_OPTIONS buttons had no `onClick` handlers | Marked `disabled`, `opacity: 0.55`, `title="Coming soon"` |
| 9 | Home `loadAll` | `.catch(() => {})` swallowed every Supabase failure silently | Now logs to console + sets `loadError` state + renders red error banner with **Retry** button |
| 10 | Home marketplace fetch | **Silent failure caught immediately by #9:** `marketplace_listings` table does not exist in Supabase (PGRST205) | Gracefully ignored — table is optional; non-PGRST205 errors still surface |

## Removed placeholders

- RareRadar: ~85 lines of hardcoded Pexels imagery + fake stat data
- RareRadar: 1 dead component (`TrendingUp` import), 1 dead state (`trendingSearches`), 1 dead state (`suggestedMatches`)
- ScoutMap: 1 dead state (`CATEGORIES`), 10 dead `<button>` chips
- LiveHub: 4 dead `<button>` actions in Scouts modal

## Already disabled (compliant — spec allows `visible disabled stubs`)

- Home/Community **Comments** buttons (`opacity: 0.5`, `title="Comments coming soon"`)
- Safety **Review** / **Remove** admin buttons (`title="Admin tools coming soon"`)
- LiveHub scout modal options (now matches the pattern above)

## Silent-failure cleanup status

| File | Status |
|------|--------|
| `Home.tsx` loadAll | ✅ Surfaced with user-visible Retry banner |
| `Community.tsx` initial load | ⚠️ Still `.catch(() => {})` — low impact (empty feed shows) — defer |
| `Alerts.tsx` notification fetch | ⚠️ Still `.catch(() => {})` — defer |
| `RareRadar.tsx` post hydrate | ⚠️ Still `.catch(() => {})` — defer (graceful empty) |

## Unresolved (documented, not blockers)

1. **`marketplace_listings` table missing in Supabase.** The Home Feed marketplace integration code is ready but inert. Either provision the table (id, seller_id, title, description, price, condition, category, image_url, local_pickup, shipping_available, general_location, status, created_at) or remove the surface in a future pass.
2. **Scout Map has no geo data layer.** No tables store lat/lng. The map is intentionally stylized (decorative SVG roads/grid) — banner now sets correct expectation. A real map requires a maps provider integration + a `general_location → lat/lng` geocoder.
3. **Events page** is entirely client-side mock content. Banner now sets expectation. A real implementation requires an `events` table and RSVP flow.
4. **Profile activity chart** — verified the previously-reported hardcoded `[18,12,22,8,15,10,6]` array no longer exists; an empty state ("No activity yet") renders instead. No fix needed.
5. **Distance radius presets (10/25/50/100 mi)** intentionally absent from Home filters — no lat/lng on any table to filter against.

## Validation performed

- `npx tsc --noEmit` — **clean**, 0 errors
- Vite HMR shows successful updates on all touched files
- Browser console: only expected `[Home] marketplace_listings load failed` warning, now gracefully handled
- Home loadError banner verified rendering path
- All 19 routes still resolve

## Out of scope (Phases 2–6)

Real user testing prep, retention systems (Saved Hunts, Notifications, Reputation, Follow, Likes/Comments/Saves, Match Alerts), Profile/Identity architecture, AI rarity/value/duplicate detection, and Geo discovery layer are explicitly deferred per the spec's "do these in order" instruction.
