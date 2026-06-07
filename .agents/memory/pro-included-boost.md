---
name: Pro included boost path
description: Pro members must boost for free via /api/boost/pro, not the paid IAP sheet
---

Pro advertises "Unlimited event & live-stream boosts", so a Pro member boosting
their own content must NEVER be routed through the paid Apple IAP purchase sheet.

**The trap:** every boost button shares one handler. If the handler always calls
`startBoostPurchase()` (RevenueCat/Apple IAP), a Pro user gets charged even while
the button literally says "Included with Pro". The label being Pro-aware is not
enough — the *action* must branch on Pro too.

**The rule:** boost handlers branch `isProUser(profile) ? startProBoost : startBoostPurchase`.
`startProBoost` POSTs to `/api/boost/pro` (no store), which re-reads the tier from
the DB server-side (`membership_tier==='pro' || pro_member===true`) — never trusts
the client's Pro claim — gates ownership via `verifyBoostOwnership`, then
`applyBoost({boostType:'pro'})` (priority 80 vs paid 100).

**How to apply:** any NEW boost CTA (currently EventDetail/WantedDetail OwnerBoostRow,
LiveHub BoostPickerModal) must wire BOTH the Pro-aware label and the Pro-aware
action, or it reintroduces the double-charge. The two boost server paths:
`/api/iap/boost/confirm` (paid, RevenueCat-verified) and `/api/boost/pro` (free,
Pro-verified) must keep identical ownership/auth posture.
