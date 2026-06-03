---
name: iOS monetization-hide flag
description: How the temporary Apple 3.1.1 monetization-hide toggle works and how to keep it airtight.
---

`src/lib/platform.ts` exports `monetizationHidden()` (currently returns `isIOS()`).
It is a TEMPORARY App Store review switch that hides EVERY monetization surface on
the iOS build — broader than `iosPaymentsBlocked()` (which only hides prices/buy buttons).

**Why:** Apple rejected under Guideline 3.1.1 (IAP). The iOS build must show no
Pro/Premium/membership/boost/upgrade/pricing/subscription/reach-analytics UI at all,
but web and Android must keep monetization. Nothing is deleted — all reversible.

**How to apply when adding/auditing monetization UI:**
- Reusable badge/card components (ProBadge, BoostedBadge, UpgradeProCard) must
  early-return `null` when `monetizationHidden()` — self-gate, never rely only on
  call sites, so future call sites can't leak a Pro signal on iOS.
- Whole pages/screens (Pro, SellerAnalytics) are removed by redirecting their
  routes in AppShell with `<Navigate>` when `monetizationHidden()` — this covers
  nav, menus AND deep links in one place.
- Inline CTAs/labels/copy gate with `!monetizationHidden()` (or switch the string
  on the flag, e.g. SellerEventForm free-tier cap message).
- To RESTORE monetization on iOS later: change `monetizationHidden()` to return
  `false`. That single edit re-enables everything.
- Decorative-only treatments with no text/price (e.g. `BOOSTED_CARD_GLOW` gold
  border) were intentionally left — no purchase wording, acceptable for 3.1.1.
- `isIOS()` = `Capacitor.getPlatform() === 'ios'`, reliable in native builds, so
  the gate is trustworthy on TestFlight/App Store.
