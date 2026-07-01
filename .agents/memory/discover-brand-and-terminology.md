---
name: Discover brand & "In Search Of" terminology
description: Naming conventions — display brand name and the Wanted→In Search Of UI label; what to rename vs leave.
---

# Display brand name

The user-facing brand/wordmark is **"TreasureTrail Marketplace"** (not bare "TreasureTrail").

**Where it applies:** the wordmark/logo text (`TreasureChestLogo` span, App loading screen, Login/Onboarding/SignUp headers, Discover header), and the primary client brand metadata: `index.html` `<title>`/`og:title`/`twitter:title`/`og:site_name`/`og:image:alt`/`application-name`/`apple-mobile-web-app-title`, and `public/manifest.json` `name`. `short_name` stays "TreasureTrail" (home-screen label kept short).

**Deliberately NOT renamed** (leave as bare "TreasureTrail"):
- Sub-brands: "TreasureTrail Pro", "TreasureTrail Buyer Protection", "TreasureTrail Guardian", "TreasureTrail Community Guidelines".
- Legal docs (ToS, Privacy) entity references.
- Running prose everywhere ("TreasureTrail is the local marketplace…", "on TreasureTrail") — appending "Marketplace" reads redundant.
- Server-side SEO section titles/descriptions and JSON-LD Organization/publisher names in `server/index.ts` (`STATIC_PAGE_META`, `ORGANIZATION_SCHEMA`).
- Identifiers: appId `com.treasuretrailhunt`, domain `treasuretrail-hunt.com`, search provider `source: 'treasuretrail'`, code comments/vars.

**Why:** the brand doesn't substitute cleanly into prose and sub-brands, so a blanket global replace produces awkward/incorrect text. Homepage crawler path stays consistent because server `/` serves the same `index.html`.

# "In Search Of" = display label for the Wanted feature

Rename **"Wanted" → "In Search Of" in USER-FACING DISPLAY STRINGS ONLY** (JSX text, labels, placeholders, aria-labels, alt text, toasts, badges).

**Never touch** the underlying identifiers: route `/wanted` (and `/sell/wanted`), DB tables/columns (`wanted_*`, status), `WANTED_CATEGORY_LABEL` keys, `kind: 'wanted'`, and component/var/fn names (`WantedCard`, `WantedWizard`, `WantedRedirect`, `wantedCount`, etc.).

**Exception kept as-is:** the "Most Wanted" sort chip on Home (`most_wanted`) — that's a popularity phrase, not the feature; "Most In Search Of" is nonsensical.

**How to apply:** when adding any new Wanted-feature UI, label it "In Search Of"; grep must cover aria-label/alt/placeholder/title, not just JSX text (those get missed).
