---
name: Mobile architecture rules
description: Pointer to ARCHITECTURE.md — the canonical doc covering scroll containers, mobile detail pages, deep links, safe areas, image containment, and external links / share. Read it before fixing recurring mobile bugs.
---

The repo root has `ARCHITECTURE.md` covering 6 rules:
1. Scroll containers (one per route; `<PageScroll>` or `<MobileDetailPage>`)
2. Mobile detail pages (never route directly to a raw image)
3. Deep links (cold-load SPA fallback via `public/_redirects`; canonical URLs as `${origin}/<route>/<id>`)
4. Safe areas (sticky headers add `paddingTop: calc(env(safe-area-inset-top) + base)`)
5. Image containment (global `max-width:100%`, platform-branded fallback blocks, never empty gray voids — also covers `imgFailed` state pattern for broken-URL recovery)
6. External links / share (`shareWithImage()` helper, `isValidHttpUrl()` guard, platform-default fallback URLs)

**Why:** Same-class mobile Safari bugs (scroll freeze, image overflow, dynamic-island clipping, broken share unfurls, dead external links) keep recurring because the patterns weren't centralized. The doc + helpers are the contract.

**How to apply:** Before fixing a mobile bug that resembles one of those categories, check the doc's "Quick lookup" table at the bottom. Fix the helper (`shareWithImage`, MobileDetailPage, PageScroll, isValidHttpUrl) — not the call site — when the bug is in the shared behavior.
