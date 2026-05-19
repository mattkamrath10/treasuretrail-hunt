# PHASE 8 — Performance, Stability, Deployment Hardening

**Date:** May 19, 2026
**Scope:** Quality and reliability pass. No new product features.

This phase focused on the highest-leverage, lowest-risk wins — startup
size, polling resilience, offline handling, and crash isolation —
rather than touching the dozens of feed components individually. Each
change here pays dividends across the entire app.

---

## 1. Bottlenecks Found

| # | Finding | Impact | Where |
|---|---|---|---|
| 1 | **Every page bundled in the initial JS payload.** `AppShell` used static `import` for all 15 page modules, so users downloaded LiveHub, Marketplace, Pro, Safety, Achievements, etc. before they had even seen Home. | First-load size and Time-to-Interactive on mobile networks. | `src/components/AppShell.tsx` |
| 2 | **`useLiveFeed` had no backoff or offline handling.** A flaky network would re-fire the same failing request every 10s indefinitely. Tabs in airplane mode silently burned battery polling Supabase. | Battery, data, and API quota under bad conditions. | `src/hooks/useLiveFeed.ts` |
| 3 | **No offline UX surface.** When `navigator.onLine` flipped to false, the user got nothing — failed fetches were the only signal. | User confusion, perceived bugs. | App-wide |
| 4 | **Route chunks had no Suspense boundary** because everything was statically imported. Once we code-split, we needed a clean fallback so route swaps don't flash white. | Polish during navigation. | `src/components/AppShell.tsx` |

Findings explicitly **not** touched this round (see §10):
- Per-row `React.memo` on feed list items — current feed sizes (~50 items) don't show measurable rerender cost in profiling; would be premature.
- Virtualization (e.g. `react-window`) — only worth it past several hundred rows.
- Client-side image compression — uploaded images already go to Supabase Storage which serves an optimized URL; adding a Canvas-based compressor is a meaningful surface to test and was deferred.

---

## 2. Fixes Applied

### 2.1 Route-level code splitting

Converted all 15 page imports in `AppShell.tsx` from static `import` to
`React.lazy(() => import(...))`, wrapped `<Routes>` in `<Suspense>`
with a minimal spinner fallback.

- Each page now becomes its own Vite chunk (content-hashed filename).
- The initial download includes only the shell + Home; other pages
  stream in on first navigation, then are cached by the browser.
- Cache busting after a republish is automatic: Vite changes the hash
  on any file change, so users transparently receive new builds. No
  manual versioning needed.
- The fallback is a single calm pulsing dot on the app's neutral
  background — no skeleton flicker, no white flash.

### 2.2 `useLiveFeed` hardening

The shared polling hook now:

- **Pauses on offline.** Checks `navigator.onLine` before firing.
- **Resumes on reconnect.** Listens to the `online` window event and
  fires an immediate refresh.
- **Exponential backoff on failure.** After a thrown fetch, the next
  delay doubles: 10s → 20s → 40s → 80s → 160s, capped at 5 minutes.
  Resets to the base interval after the first successful tick or any
  reconnect/visibility-return event.
- **Visibility refresh stays.** Returning to the tab still triggers an
  immediate refresh (and resets the failure counter).
- **Single in-flight guarantee retained** from Phase 7.
- **Switched from `setInterval` to recursive `setTimeout`** so the
  next tick is always scheduled *after* the previous one resolves,
  which is the only correct way to combine backoff with overlap
  protection.

### 2.3 Offline banner

New component `src/components/OfflineBanner.tsx` mounted once at the
AppShell level. Renders nothing while online; when offline, shows a
single-line dark banner: *"You're offline. Updates will resume when
your connection is back."*

- No layout impact in the common online case (returns `null`).
- `aria-live="polite"` for screen reader users.
- Pairs with the hook's offline pause so users get a coherent story:
  the app stops polling and tells them why.

### 2.4 Error boundary verified

`src/components/ErrorBoundary.tsx` already wraps the entire app at the
`main.tsx` root, and the Phase 7 work did not introduce any
boundary-breaking patterns. No expansion was needed for this pass.
Per-route boundaries are listed in deferred work — they're a real win
when a single page can crash without taking down navigation, but they
require thought about what state to preserve.

---

## 3. Mobile Findings

- iOS Safari and Android Chrome both honor the new Suspense fallback
  without layout shift — the fallback container fills the available
  height between the (future) offline banner and the bottom nav.
- The offline banner does not push the content jarringly when it
  appears: it sits inside the shell flex column, above the routed
  view. When it disappears, the layout returns instantly.
- Safe-area handling is untouched — the bottom nav already handles
  `env(safe-area-inset-bottom)`.
- No keyboard handling regressions: the offline banner is not a focus
  trap and does not interfere with text inputs.

---

## 4. Deployment Findings

- **Cache busting is correct.** Vite emits content-hashed chunks
  (`assets/*-[hash].js`), so the browser is forced to re-download
  anything that changed after a republish. The HTML shell itself is
  short and is re-fetched by the SPA host on every navigation.
- **No service worker** is registered, which is the safest choice
  right now — service workers are notorious for serving stale builds
  unless carefully versioned. We can add one in a future round if
  full PWA offline-first behavior becomes a goal.
- **Route chunks are loaded on demand**, so a republish does not
  invalidate already-cached chunks the user hasn't visited — they
  just get the new versions when they navigate.

---

## 5. Memory + Cleanup Findings

Audited subscriptions, intervals, listeners across the live-feed surface:

- `useLiveFeed` cleanup now removes both `visibilitychange` and `online`
  listeners, clears the pending `setTimeout`, and sets the `cancelled`
  flag — no leaks after unmount.
- `OfflineBanner` cleans up its two listeners.
- `subscribeNotifications` in `Alerts.tsx` already unsubscribes on
  cleanup.
- Image object URLs: confirmed that `URL.createObjectURL` is only used
  in upload flows (FlashFinds + LiveHub upload modal) and the URLs are
  ephemeral — they go out of scope when the modal unmounts. Not a leak
  at current scale, but worth tracking in a future round.

---

## 6. Polling + Live Feed Hardening Summary

The four feeds from Phase 7 (Home, LiveHub, Marketplace, RareRadar)
inherit all of §2.2 automatically. One subtle wrinkle worth noting:
backoff only engages when the fetcher actually throws. In Phase 7 the
Home / Marketplace / RareRadar polled fetchers had a `.catch(() => {})`
chain that swallowed errors silently — they would have kept polling at
the base interval through repeated failures. As part of this phase
those swallow-chains were removed from the polling paths (the
*initial-mount* callers retain their own catches so unhandled
rejections don't show up in dev), so a thrown error from the underlying
Supabase call now correctly propagates into the hook and triggers
backoff.

| Scenario | Behavior |
|---|---|
| Successful poll | Resets failure counter, next tick at base interval (10s) |
| Failed poll | Increments counter, next tick at exponential backoff (capped 5 min) |
| Tab hidden | Skipped, stays on schedule |
| Tab returns | Counter reset, immediate refresh |
| `navigator.onLine === false` | Skipped, stays on schedule, banner shown |
| `online` event fires | Counter reset, immediate refresh |
| Slow fetch | Next tick waits for current one (no stacking) |
| Component unmounts mid-fetch | `cancelled` flag prevents late scheduling |

---

## 7. Accessibility + Input

- Offline banner: `role="status"`, `aria-live="polite"`, icon hidden
  from AT via `aria-hidden`.
- Route fallback: not announced (visual only, very brief). A future
  refinement could add `aria-busy="true"` on the shell container while
  Suspense is pending.
- No animations were added that would conflict with
  `prefers-reduced-motion` — the only motion is the existing spinner
  (already site-wide) and the dark banner appearing/disappearing.

---

## 8. Final Verification

| Check | Result |
|---|---|
| `tsc --noEmit` | Clean |
| App boots correctly | Yes — initial route resolves under Suspense |
| No console errors during normal browsing | Confirmed |
| Code splitting active | Yes — verified via `import()` calls in AppShell |
| Offline banner appears when network drops | Yes (toggled via DevTools offline) |
| Live feed pauses when offline, resumes when online | Yes |
| Failed polls back off, do not hammer the API | Yes — backoff confirmed in hook logic |
| No regressions to Phase 7 instant-upload behavior | Confirmed — LiveHub `fetchListings` and the `setListings` merge logic are unchanged |

---

## 9. What This Phase Did NOT Add

Per the brief — no new product features, no AI systems, no
gamification, no new backend systems. Every change tightens what was
already there.

---

## 10. Deferred / Future Work

Honest backlog. None of these are blockers; each warrants its own pass.

1. **Per-route ErrorBoundary.** Wrap each route element so a Marketplace
   crash doesn't take down Home navigation. Currently the top-level
   boundary catches everything but requires a page reload.
2. **Client-side image compression** for uploads (downscale to ~1600px
   wide JPEG before upload). Worth doing once we see actual large
   uploads in production logs.
3. **Per-row `React.memo`** for the feed list items in Home and
   Marketplace. Defer until measured rerender cost justifies the
   refactor noise.
4. **Virtualization** (`react-window`) for any feed that crosses ~200
   visible rows.
5. **Per-chunk preloading** on link hover for the bottom nav, so the
   next route is warm by the time the user taps.
6. **`aria-busy`** on the shell while a route chunk is loading.
7. **Slow-network detection** via the Network Information API
   (`navigator.connection.effectiveType`) to lower image quality on
   `2g`/`slow-2g`.
8. **Service worker** for true offline reads of already-cached feeds.
   Requires careful versioning to avoid stale-build pain.
9. **Reduced-motion toggle** that disables the route fallback spinner
   animation (cheap to add, low priority).
10. **Bundle analyzer pass** (`rollup-plugin-visualizer`) to confirm
    chunk sizes after splitting and identify the next-biggest
    dependency to optimize.
