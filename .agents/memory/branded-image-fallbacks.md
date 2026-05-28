---
name: Branded image-fallback rule
description: Every optional image surface must route through ImageWithFade with a branded MediaFallback/AvatarFallback — never a gray placeholder div.
---

Every optional image (any `<img src=...>` whose src can be null, missing, or fail to load) must render through `<ImageWithFade src fallback={...}/>` with a `<MediaFallback kind=... seed=... label/>` or `<AvatarFallback name seed/>` as the fallback. Raw `<img>` with `backgroundColor: var(--color-neutral-100)` placeholder branches are a regression.

**Why:** The product brief explicitly forbids gray voids / browser-broken-image UX for optional images — every empty slot must read as branded chrome (gradient + icon + typographic label, platform-aware where applicable). One missed surface (UserFindsGrid, LiveHub card+modal, FlashFinds mini/success, AiAnalysis hero, RareRadar preview/success, etc.) is enough to fail the architect review.

**How to apply:**
- New code: never write `<img src={x}>` for an optional source. Use `<ImageWithFade src={x} fallback={<MediaFallback .../>}/>`.
- Pass `seed={row.id || title}` so adjacent cards get distinct gradient hues.
- Pass `kind` (`find`/`listing`/`event`/`live`/`auction`/`wanted`/`yard_sale`/`estate_sale`) and, when known, `platform` (whatnot/hibid/poshmark/ebay/auctionzip) so the fallback inherits the brand identity.
- For circular avatar slots use `<AvatarFallback name seed/>` instead of the kind palette.
- Intentional exceptions exist (e.g. FlashFinds camera capture-preview keeps bespoke HEIC-error UX that disables the "Use Photo" CTA on render failure) — these must have a clearly user-facing recovery path, not a silent gray box.
- The `MediaFallback` palette uses a dynamic seed-driven hue plus a brand anchor color — never re-introduce a static `from` field; render reads `palette.to` and computes `from` per seed.
- Audit pattern when sweeping a repo: `rg "<img " src/pages src/components` — every hit on a user-content surface must either go through ImageWithFade or be flagged as a documented exception.
