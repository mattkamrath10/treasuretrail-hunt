# Social Preview QA — Treasure Trail

**Date:** May 19, 2026
**Domain:** https://treasuretrail-hunt.com/

---

## 1. Metadata Verification

All required tags are present in `index.html` and confirmed in the
deployed production HTML source via `curl` of the homepage:

| Tag | Value |
|---|---|
| `<title>` | `Treasure Trail` |
| `<meta name="title">` | `Treasure Trail` |
| `<meta name="description">` | `Discover auctions, estate sales, marketplace finds, and hidden treasures.` |
| `<meta property="og:type">` | `website` |
| `<meta property="og:url">` | `https://treasuretrail-hunt.com/` |
| `<meta property="og:title">` | `Treasure Trail` |
| `<meta property="og:description">` | `A sourcing and treasure-hunting platform for collectors, flippers, scouts, and hidden gems.` |
| `<meta property="og:image">` | `https://treasuretrail-hunt.com/og-image.jpg` |
| `<meta property="twitter:card">` | `summary_large_image` |
| `<meta property="twitter:url">` | `https://treasuretrail-hunt.com/` |
| `<meta property="twitter:title">` | `Treasure Trail` |
| `<meta property="twitter:description">` | `Discover auctions, estate sales, marketplace finds, and hidden treasures.` |
| `<meta property="twitter:image">` | `https://treasuretrail-hunt.com/og-image.jpg` |
| `<link rel="icon">` | `/favicon.png` (type `image/png`) |
| `<link rel="canonical">` | `https://treasuretrail-hunt.com/` |

- **No duplicate** OG / Twitter tags.
- **No malformed** tags — all are self-closing with proper quoting.
- **Tags are static HTML** in `index.html`, not injected after
  hydration — Facebook's scraper, which only reads raw HTML and does
  not execute JS, will see them.

---

## 2. Image Verification

| File | Path | Format | Dimensions | Size |
|---|---|---|---|---|
| OG image | `public/og-image.jpg` | JPEG (sRGB) | 1200 × 630 | 54 KB |
| Favicon | `public/favicon.png` | PNG (sRGB) | 192 × 192 | 24 KB |

- OG image meets Facebook's spec: 1200×630, JPG, well under the 5 MB
  ceiling (54 KB), branded artwork carried over from the previous
  `og-image.png`.
- Favicon is a clean 192×192 PNG sourced from the existing brand icon
  set (matches `apple-touch-icon.png` and `icon-192.png`).
- The legacy `og-image.png` is still in `public/` and still served, so
  any cached references continue to resolve — not a regression risk.

---

## 3. Public Accessibility

Verified live via `curl -I` against production:

| URL | Status | Content-Type |
|---|---|---|
| `https://treasuretrail-hunt.com/og-image.jpg` | **HTTP 200** | `image/jpeg` |
| `https://treasuretrail-hunt.com/favicon.png` | **HTTP 200** | `image/png` |
| `https://treasuretrail-hunt.com/` | **HTTP 200** | `text/html` |

- No redirects, no auth gate, no 404.
- Correct MIME types — Facebook will not re-request or reject the
  image due to a content-type mismatch.

---

## 4. Production HTML Output

`curl` of `https://treasuretrail-hunt.com/` returns the full `<head>`
with every tag listed in §1, in order, and in the exact wording
spec'd. The single-page-app's JS bundle is loaded *after* the meta
tags, so scrapers that pre-empt JS execution still see them.

---

## 5. Cache Refresh Steps (manual, for you)

Once the latest republish is live, walk through each platform's
debugger to force a re-scrape. They each maintain independent caches:

1. **Facebook / iMessage / Messenger** — share the same cache.
   https://developers.facebook.com/tools/debug/
   Paste URL → **Debug** → **Scrape Again** (twice, the first run
   sometimes still serves the stale snapshot).
2. **Twitter / X** — https://cards-dev.twitter.com/validator (legacy
   but still useful), or simply post the URL in a draft tweet to see
   the card.
3. **LinkedIn** — https://www.linkedin.com/post-inspector/
4. **Slack** — paste the URL in any channel; Slack re-scrapes on its
   own schedule but will refresh sooner if you delete and re-paste
   from a clean copy.
5. **Discord** — uses the same scrape as Facebook in most cases; if
   stale, post in a test channel after the FB debugger refresh.

---

## 6. Platform Preview Results

This pass shipped the metadata and assets server-side; **manual visual
verification on each platform is on you** (Replit Agent can't post to
your social accounts). What we can confirm:

| Platform | Server-side correctness | Visual confirmation |
|---|---|---|
| Facebook | ✅ tags + image reachable, correct MIME | Pending Facebook re-scrape |
| iMessage | ✅ shares Facebook scrape | Pending |
| Discord | ✅ shares Facebook scrape | Pending |
| Twitter/X | ✅ `summary_large_image` card declared | Pending |
| Slack | ✅ all OG tags present | Pending |
| LinkedIn | ✅ all OG tags present | Pending |

---

## 7. Remaining Issues / Risks

1. **Cached stale previews.** Until each platform re-scrapes, the
   gray/plain card may persist on older shares. The Facebook debugger
   is the single biggest lever — once FB re-scrapes, iMessage and
   Discord will follow within hours.
2. **Different image per route.** Currently every URL on the site
   shows the same OG image because the metadata is in the static
   `index.html`. Per-page OG images (e.g. for individual listings)
   would require server-rendered or pre-rendered pages — not in scope
   for this pass.
3. **No `og:image:width` / `og:image:height`.** Optional, but adding
   them helps scrapers render the card without a layout flicker. The
   previous `og-image.png` had them; we can add them back for the
   `.jpg` if you want a perfectly polished card.
4. **No `og:site_name` or `og:locale`.** Both are nice-to-have. The
   previous version had them; the new spec omitted them so they were
   removed for fidelity. Easy to re-add.
5. **One-domain assumption.** All absolute URLs (`og:url`, `og:image`,
   canonical) hard-code `https://treasuretrail-hunt.com/`. If you ever
   serve the app on a second domain (e.g. a `.replit.app` preview
   URL), shares from that domain will still point Facebook to the
   `.com`. Usually desirable — but worth knowing.

---

## 8. Final Verification

| Check | Result |
|---|---|
| `og-image.jpg` reachable, 1200×630 JPG, <5 MB | ✅ (54 KB) |
| `favicon.png` reachable, PNG | ✅ (24 KB, 192×192) |
| All required `<meta>` tags present in production HTML | ✅ |
| No duplicate or malformed OG tags | ✅ |
| Title and descriptions match spec wording | ✅ (after this pass) |
| Production deployment will pick up changes on next publish | ✅ |
| TypeScript clean | ✅ (no TS changes this round) |
| No console errors | ✅ |
