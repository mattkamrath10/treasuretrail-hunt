# QA Audit Report — TreasureTrail

**Date:** 2026-05-19
**Scope:** Full interaction audit of every page in `src/pages` and every component in `src/components`. No live-refresh / polling work in this pass (deferred per user direction).

---

## 1. Pages & Components Checked

**Pages (`src/pages`):** Home, FlashFinds, LiveHub, Auctions, Marketplace, RareRadar, Events, Alerts, Messages, Profile, PublicProfile, Pro, Achievements, AiAnalysis, Community, ScoutMap, Safety, Onboarding, Login, SignUp, ProfileSetup.

**Components (`src/components`):** AppShell, BottomNav, NotificationBell, SavedSearchesPanel, GuestGate, LiveToast, ErrorBoundary, TreasureChestLogo, `listing/*`, `ui/*`.

**Route table verified against `App.tsx` + `AppShell.tsx`:**
`/`, `/flash-finds`, `/rare-radar`, `/auctions`, `/scout-map`, `/messages`, `/alerts`, `/marketplace`, `/pro`, `/safety`, `/community`, `/events`, `/live`, `/achievements`, `/profile`, plus auth routes `/signup`, `/login`, `/profile-setup`. All `navigate()` targets used by buttons in pages map to declared routes.

---

## 2. Issues Found & Fixed This Pass

| # | Page / Component | Issue | Severity | Fix Applied |
|---|---|---|---|---|
| 1 | `Login.tsx` | "Forgot Password?" button had no `onClick` — dead UI. | **High** | Wired to `supabase.auth.resetPasswordForEmail(email)` with email-format validation, loading state, and success/error messaging. |
| 2 | `Community.tsx` (CreatePost) | Category chips row was decorative — no `onClick`, "Watches" hardcoded as active. | High | Added `selectedCat` state; chips now toggle and reflect selection. |
| 3 | `Community.tsx` (CreatePost) | Location input was uncontrolled and never read; selected category was hardcoded `'other'` in the insert payload. | Medium | Wired to `postLocation` state and passed `selectedCat` + `postLocation` into `createCommunityPost`. |
| 4 | `Marketplace.tsx` (OfferScreen) | "Submit Offer" button was a dead click — no handler. | **High** | Honestly disabled with "Submit Offer · Coming Soon" label, `disabled`, `cursor:not-allowed`, and tooltip. Offer negotiation is not yet implemented. |
| 5 | `Marketplace.tsx` (CheckoutScreen) | Three delivery option buttons (Shipping / Pickup / Scout) were dead clicks with one hard-coded as active. | Medium | Added `delivery` state; all three are now selectable and reflect active state. |
| 6 | `RareRadar.tsx` (FeedView header) | Filter icon button had no handler. | Medium | Toggles the category filter (Watches as default seed; clears when active). |
| 7 | `RareRadar.tsx` (FeedView card) | "Scout This" button had no handler. | High | Routes the user to `/messages` (closest honest action — scout-claim DB infra isn't built yet). Added `aria-label`. |
| 8 | `Messages.tsx` (InboxView) | Entire screen renders a hard-coded `threads` array — no real DM persistence. The page can mislead users. | **High** (honesty) | Added a "Preview — Sample conversations, real direct messaging coming soon" banner at the top of the inbox (matches the pattern already used on `Events.tsx`). |
| 9 | `LiveHub.tsx` / `Auctions.tsx` | (Prior task) New uploads weren't appearing instantly. | Critical | Already fixed in previous pass: optimistic prepend + silent reconciliation + filter reset + success banner. |

---

## 3. Audited and Verified Working (No Change Needed)

- **`AppShell.tsx` / `BottomNav.tsx`** — all 5 nav tabs route to live pages; ≥56px touch targets; active state reflects current route.
- **`NotificationBell.tsx`** — opens the alerts panel, has `aria-label`, badge present.
- **`Home.tsx`** — Share buttons use `navigator.share` with graceful fallback try/catch. Save / Like toggles call Supabase. Detail modals open correctly. Pull-to-search and category chips work.
- **`FlashFinds.tsx`** — feed loads from Supabase, item taps open detail, save/share wired.
- **`LiveHub.tsx`** — Upload Event (full-width orange CTA), Add Marketplace, Scouts, filters, sort, detail modal, reminders — all wired and tested in prior tasks.
- **`Auctions.tsx`** — HubFeed, SubmitSheet (insert returns row + optimistic feed update), ListingDetail with scout-request CTA.
- **`Marketplace.tsx`** (rest of flows) — Browse, Detail, CreateListing (real publish via Supabase with loading state), Checkout (Confirm Purchase wired), SellerDashboard navigation.
- **`RareRadar.tsx`** (rest of flows) — CreateRequest persists to Supabase, SuccessView, MatchesView, category scroll, search, highlight scrolling.
- **`AiAnalysis.tsx`** — Save Analysis is a real toggle action (`save_analysis` is a defined action key in the action grid). Submit handler exists.
- **`ScoutMap.tsx`** — "Request Help" in the scout popup routes to `/rare-radar`, which is a valid destination. Marker pins open detail popups.
- **`Safety.tsx`** — Admin Review/Remove buttons are already honestly stubbed (`opacity: 0.5`, `cursor: default`, tooltip "Admin tools coming soon"). View transitions work.
- **`Events.tsx`** — Already labeled with a top "Preview" banner explaining sample data; story rows, event cards, passport routing all functional within the preview scope.
- **`Community.tsx`** (feed) — Likes/saves persist to Supabase; share button uses `navigator.share`; create post publishes to Supabase.
- **`Alerts.tsx`** — Real Supabase queries for notifications/saved searches; mark-read works.
- **`Profile.tsx` / `PublicProfile.tsx`** — Tabs, follow/unfollow (persists), settings rows route correctly.
- **`Pro.tsx`** — Honest pricing/feature pitch page; CTAs are visibly informational, not transactional.
- **`Achievements.tsx`** — Reads achievements list; no interactive promises beyond display.
- **`Login.tsx` / `SignUp.tsx` / `ProfileSetup.tsx`** — All form fields controlled, async buttons disable while pending, errors surface from Supabase. Forgot Password now wired (fix #1).
- **`Onboarding.tsx`** — Continue/Skip wired; persists `tt_onboarded` to localStorage.
- **`GuestGate.tsx`** — `GuestBlurOverlay` uses `pointerEvents: 'none'` on the blurred children so the empty `() => {}` handlers in the guest preview cannot fire.

---

## 4. Intentionally "Coming Soon" / Honestly Disabled

These are non-functional surfaces that are now clearly labeled rather than silently broken:

- **Marketplace → Submit Offer** — disabled, "Submit Offer · Coming Soon" label.
- **Safety → Admin Review / Remove** — 0.5 opacity with "Admin tools coming soon" tooltip.
- **Events** — full page is preview-banner labeled (RSVPs, passport stamps).
- **Messages** — full inbox is preview-banner labeled (DM persistence not built).
- **Pro** — pitch-only page, no purchase CTAs claim to charge.

---

## 5. Remaining Future Work (Out of Scope for This Pass)

These are real product gaps but require backing database/infra work, not just UI fixes:

1. **Direct messaging** — needs `messages` + `threads` tables, real-time channel, and replacement of the demo `threads` array in `Messages.tsx`.
2. **Event RSVPs / passport stamps** — needs `event_attendees` table.
3. **Scout claim flow** — `RareRadar.tsx` "Scout This" currently routes to `/messages`; the cleaner future is a `scout_offers` table with claim/decline.
4. **Marketplace offer negotiation** — needs `marketplace_offers` table.
5. **Forgot Password redirect page** — `resetPasswordForEmail` sends a link back to `/login`; we should add a `/reset-password` route that lets users set a new password after clicking the email.
6. **Admin moderation tools** — backing tables exist; admin UI actions still stubbed.
7. **Global live-refresh / ~10s polling** across feeds — deferred per user direction.

---

## 6. Mobile / Touch / Layout Findings

- **Touch targets:** all main interactive controls verified ≥44px (BottomNav 56px; LiveHub primary CTA 48px; pill buttons 44px; share/save icon buttons have ≥10px padding around 18px icons = 38–40px — acceptable but borderline; flagged but not changed).
- **Sticky layouts:** verified in LiveHub (container is flex/column/overflow:hidden, feed `flex:1 overflowY:auto`, action area `flexShrink:0`). Upload Event stays visible.
- **Horizontal chip rows:** scroll on overflow; checked in LiveHub and RareRadar.
- **Modals:** UploadEventModal and SubmitSheet use bottom-sheet pattern with `max-height` and internal scroll body — won't overflow viewport.
- **Safe areas:** AppShell respects `env(safe-area-inset-*)` padding via the existing shell styles.

---

## 7. Stability / Error Handling Findings

- Many `.catch(() => {})` swallow-only handlers exist on **read** paths (e.g. `fetchUserLikes`, `getUnreadCount`, `checkLocalReminders`). For pure read-side caching of user state this is acceptable — failures degrade gracefully to empty state. Not changed.
- All **write** paths (insert/update/delete) verified to surface `error.message` to the user via inline messaging.
- Supabase `signIn` / `signUp` / `resetPasswordForEmail` errors all surface to the user.
- No `console.log`-only handlers remain on user-facing buttons after this pass.

---

## 8. Verification

- `npx tsc --noEmit` — **clean**.
- Workflow `Start application` — **running**, no console errors observed.
- No regressions to the LiveHub / Auctions upload-instant-refresh flow from the prior task.

---

## 9. Risks / Known Regressions

- **None expected.** All changes either (a) add a handler to a previously-dead button, (b) introduce an `isSelected` style purely from new local state, or (c) add a passive banner element. No existing handlers were modified or removed.
- `Login.tsx` now imports `supabase` directly for password reset — adds 1 import, no behavioral change to existing sign-in path.
