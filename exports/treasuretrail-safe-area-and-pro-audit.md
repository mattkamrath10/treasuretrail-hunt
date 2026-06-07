# TreasureTrail — Safe-Area Fix & Pro Benefits Audit

_Date: June 7, 2026_

This report covers two pieces of work: (1) fixing the iPhone "notch / Dynamic
Island" overlap on screen headers across the whole app, and (2) confirming that
every advertised Pro benefit actually works and never charges an existing Pro
member a second time.

---

## Part 1 — iOS Safe-Area Headers (all screens)

**The problem:** On iPhones with a notch or Dynamic Island, the top of each
screen could sit *underneath* the status bar, making header buttons hard to tap.

**The fix:** Every topmost header now reserves space for the safe area
(`paddingTop: calc(env(safe-area-inset-top, 0px) + base)`), so controls always
clear the status bar / notch / Dynamic Island in portrait.

**Screens fixed in this pass:**

- **Main tabs:** Marketplace, Community, Auctions (main view + step view)
- **Feature screens:** Seller Dashboard, Seller Analytics, Events, Alerts,
  Flash Finds (+ step view), Rare Radar (+ step view), AI Analysis (step view),
  Review Mode
- **Legal / account:** Privacy Policy, Terms of Service, Community Guidelines,
  Admin Moderation, Blocked Users
- **Auth / onboarding:** Sign Up, Login (dark top banner), Onboarding
  (top-right "Skip" button)

**Deliberately left unchanged (correctly):** pop-up / bottom-sheet / panel
headers, inline section labels, and headers nested inside a container that
already has the inset — adding padding to these would create a double gap.

> ⚠️ **Important:** These insets only show real spacing on an actual iPhone.
> The desktop preview reports zero, so please do a quick portrait check on a
> notch / Dynamic Island device before the next App Store build.

---

## Part 2 — Pro Benefits Audit (all working, no double-charge)

Every benefit advertised on the Pro page was verified to function and to **not**
trigger a separate purchase for someone who is already Pro.

| Advertised benefit | Status | How it works |
|---|---|---|
| Priority placement in Discover | ✅ Working | Pro content ranks above normal listings (a paid boost still outranks Pro) |
| Reach analytics | ✅ Working | Pro members see the data directly; non-Pro see an upsell |
| Unlimited event & live-stream boosts | ✅ Working | Pro members boost for **free** ("Included with Pro") — never sent to the paid sheet; non-Pro pay the $3 one-off |
| Pro badge on profile | ✅ Working | Shown for Pro members |
| (bonus) Unlimited active events | ✅ Working | Free accounts are capped; Pro is unlimited |

**No double-charging:** A user who is already Pro and taps the Pro button gets an
"already Pro" message instead of a purchase. Boosts and analytics never send a
Pro member through the paid flow.

**Payments are live:** Real Apple In-App Purchase via RevenueCat is enabled, and
paid status is always verified on the server (the app never grants Pro for free).

**One note for later:** There is a stale, misleading *code comment* on the Pro
page that says "payments disabled until Stripe." The actual code does real
purchases — only the comment is out of date. It was left unchanged because
editing it was outside the verify-only scope; you may want it cleaned up later.

---

## Verification

- Strict production build passes.
- Independent code review returned **PASS** for both parts.
- App runtime logs are clean (no errors).
