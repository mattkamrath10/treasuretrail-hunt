---
name: iOS monetization-hide flag (now OFF) + payments live
description: monetizationHidden() and iosPaymentsBlocked() both return false now — Pro/boost/IAP are LIVE everywhere; how the kill-switches still work if re-enabled.
---

As of the production Apple-IAP launch, BOTH master switches in `src/lib/platform.ts`
return `false`:
- `monetizationHidden()` → `false` — every Pro/boost/upgrade/analytics surface is VISIBLE on all platforms.
- `iosPaymentsBlocked()` → `false` — prices and purchase CTAs are shown on iOS; real purchases run through RevenueCat → StoreKit.

So the earlier "hidden on every platform for Apple 3.1.1" state is OVER. Do not
assume Pro/boost UI is suppressed — it is live. `PAYMENTS_ENABLED = true` in
`src/lib/payments.ts`, and `startProUpgrade()` performs a real `purchasePro()`
(NOT a "coming soon" stub — a comment block in `src/pages/Pro.tsx` still says
payments are disabled until Stripe; that comment is STALE/misleading, the code
does live Apple IAP).

**The two switches are still wired, just turned off — to re-enable a hide:**
- `monetizationHidden()` is the BROAD switch (hides ALL monetization UI). Components
  self-gate: ProBadge/BoostedBadge/UpgradeProCard early-return `null`; routes (Pro,
  SellerAnalytics) redirect via `<Navigate>` in AppShell; inline CTAs gate with
  `!monetizationHidden()`. Boost visuals are killed at ONE chokepoint —
  `isBoosted()` in `src/lib/boost.ts` returns `false` when hidden, and every
  boost-derived UI (glow, BoostedBadge, "Xh left" pills, priority score,
  `rankDiscoverFeed`) reads through it. NEVER derive boost state from raw `boost_*`
  columns at a call site.
- `iosPaymentsBlocked()` is the NARROW Apple-3.1.1 switch (hides prices/buy buttons
  only, page stays informational). Pro.tsx reads it as `blockPurchases`.

**Why:** the project intentionally ships self-serve RevenueCat Apple IAP. If a
stale review/validation expects "monetization hidden" or "Stripe revenue lockdown,"
that criterion no longer applies.

`isIOS()` = `Capacitor.getPlatform() === 'ios'`, reliable in native builds.
