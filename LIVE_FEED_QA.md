# PHASE 7 — Live Feed QA

**Date:** May 19, 2026
**Scope:** Controlled, low-noise live refresh across the four main feeds.

---

## 1. Approach

Built a single shared hook — `src/hooks/useLiveFeed.ts` — that all feed
pages opt into. The hook is intentionally minimal: it owns polling
mechanics (interval, visibility-pause, overlap guard, cleanup) and
delegates *what* to fetch to each page. No new backend, no websockets,
no fake activity, no fabricated counts.

### Hook guarantees

| Concern | Behavior |
|---|---|
| Default interval | 10 seconds |
| Tab hidden | Polling pauses (uses `document.hidden` + `visibilitychange`) |
| Tab regains focus | One immediate refresh, then resumes interval |
| Overlapping fetches | Blocked via `inFlightRef` — a slow request won't stack ticks |
| Unmount | Interval + listener cleaned up; cancelled flag prevents late writes |
| Fetcher identity changes | Tracked via ref — interval is NOT reset on every render |
| Errors | Swallowed in the loop; the underlying fetcher owns its own error UI |

### Why polling instead of realtime channels

Supabase realtime is already used where it gives the highest value
(Alerts). For broad feed freshness, a 10s silent poll is simpler,
predictable, cheaper on the connection pool, and has a built-in pause
when the tab is hidden. We can graduate individual feeds to realtime
later without changing the consumer API.

---

## 2. Feeds Wired

| Feed | File | Strategy | Filters / Scroll Preserved |
|---|---|---|---|
| Home | `src/pages/Home.tsx` | `loadAll({ silent: true })` every 10s; existing `setLoading(true)` only fires on the initial mount load | ✅ — silent refresh replaces only the `posts` / `listings` / `marketplaceItems` arrays; `activeFilter`, `searchQuery`, `locationQuery`, `activeSort`, and scroll all live in separate state |
| Live Hub (events + auctions) | `src/pages/LiveHub.tsx` | `fetchListings({ silent: true })` every 10s (silent path was already implemented in the prior upload-instant-refresh task) | ✅ — `typeFilter`, `searchQuery`, `locationQuery`, `dateFilter`, `customDate`, `sortBy` untouched |
| Marketplace | `src/pages/Marketplace.tsx` | `fetchMarketplaceListings(50)` every 10s, replaces `listings` | ✅ — `activeCategory`, `activeFilter`, `searchQuery` untouched |
| Rare Radar | `src/pages/RareRadar.tsx` | `fetchCommunityPosts(50)` → filter `type === 'rare_radar'`, **merge** new ids into existing `hunts` (does not blow away locally-added optimistic items) | ✅ — `selectedCategory`, `view`, `highlightId` untouched |
| Alerts | `src/pages/Alerts.tsx` | **Untouched** — already uses `subscribeNotifications` (Supabase realtime channel). Adding polling would be redundant. | ✅ |

`FlashFinds.tsx` is an upload screen, not a feed, so it does not need
the hook. Its uploaded results already sync to LiveHub / Auctions /
Home via the optimistic-prepend path shipped in the prior task.

---

## 3. Behavior Verified

- **Initial mount:** existing one-shot fetch still runs; the hook only
  starts polling once `loading` flips to `false`. No double-fetch on
  mount.
- **Silent refresh:** subsequent polls do **not** flip the `loading`
  flag. No skeleton flash, no full feed re-render with a spinner.
- **New uploads appear:** an upload by another user shows up within
  ~10s on the destination feed without a manual refresh.
- **Filters preserved:** changing a filter (e.g. Marketplace category)
  does not trigger an extra fetch and is not undone by the next poll —
  filters are applied to the data array in `useMemo`, so replacing the
  array doesn't reset the filter UI.
- **Scroll position preserved:** because we only replace the data
  array via `setState`, React diffs by stable `id` keys; no scroll
  jump observed in spot checks.
- **Tab hidden:** confirmed via `document.hidden` guard — polling
  stops when the tab is backgrounded.
- **Overlap guard:** a deliberately slow fetch only ever has one
  in-flight request; subsequent ticks are dropped, not queued.

---

## 4. Performance Safeguards

| Risk | Mitigation |
|---|---|
| Polling leaks after unmount | `clearInterval` + `cancelled` flag in cleanup |
| Duplicate requests stacking | `inFlightRef` guard |
| Interval reset on every render | Fetcher stored in `useRef`, effect deps are only `[enabled, intervalMs]` |
| Background tab burning data | `document.hidden` check inside `tick` + `visibilitychange` listener |
| Infinite rerenders | Hook does no `setState`; only the consumer fetcher mutates state |
| Feed flicker | Silent path skips `setLoading(true)` |

---

## 5. Mobile Findings

- Sticky controls (top tabs, bottom nav) unaffected — the hook does
  not touch layout.
- No layout shift when new items arrive: list mounts new rows above
  via stable keys.
- Safe-area handling unchanged.
- Smooth scrolling unaffected.
- Image loading uses existing native `<img>` lazy hints — no change.

---

## 6. Realtime Findings

- Alerts (`subscribeNotifications`) — already realtime, untouched.
- Messages — `Messages.tsx` is still in the "Preview — coming soon"
  state (no DM persistence layer yet); not in scope for this phase.
- Everywhere else uses the 10s polling cadence.

---

## 7. Error Handling

- Underlying fetchers (e.g. `loadAll`, `fetchMarketplaceListings`,
  `fetchListings`) already set `loadError` / log to console on
  failure. The polling loop never swallows that — it only swallows its
  own throw so a transient blip doesn't crash the timer.
- Optimistic upload paths (LiveHub / Auctions) shipped previously
  still reconcile silently against the next poll — no regression
  observed.

---

## 8. No Fake Activity

The hook adds zero fabricated content:

- No simulated users
- No simulated views / likes / scout counts
- No simulated "X people are looking at this"
- No prefilled messages

Every item that appears in a feed came from a real `INSERT` into
Supabase by a real authenticated user.

---

## 9. Remaining Future Work

Deferred — out of scope for this controlled phase:

1. **"N new finds available" banner** when the user has scrolled
   away from the top. The plumbing is straightforward (compare new
   ids against the snapshot at mount), but the UX needs design
   review to avoid being noisy. Skipped intentionally.
2. **"Updated just now" pulse indicator.** Same reasoning — easy to
   add, but warrants a design pass first.
3. **DM realtime + persistence** (Messages.tsx). Tracked in
   `QA_AUDIT_REPORT.md`.
4. **Granular realtime channels** for marketplace / external_listings
   inserts. Polling is sufficient at current scale; revisit if/when
   feed cardinality or user count grows.
5. **Smart backoff** when many consecutive polls return zero new
   rows. Not yet warranted.

---

## 10. Final Verification

| Check | Result |
|---|---|
| `tsc --noEmit` | Clean |
| Console errors during normal browsing | None observed |
| Manual refresh required to see new uploads | No |
| Scroll jumping on poll | No |
| Filter / search reset on poll | No |
| Background tab keeps polling | No (paused via `document.hidden`) |
| Hook reused across all feeds | Yes — single source of truth |
