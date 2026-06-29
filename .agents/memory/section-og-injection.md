---
name: Section & homepage OG injection
description: How per-page social share previews (title/image) are wired on the prod Express server
---

# Per-page Open Graph (link share) previews

Crawlers don't run our JS, so social previews come only from the static `<meta>`
tags the Express server returns. Per-page customization is server-side in
`server/index.ts` (inside the `if (fs.existsSync(distDir))` block).

- **Individual pages** (`/event/:id`, `/blog/:slug`) read the row and rewrite all
  OG/Twitter tags via `injectEventMeta`.
- **Section landing pages** (`/blog`, `/events`, `/flash-finds`, `/map`,
  `/marketplace`, `/auctions`, `/live`, `/community`, `/pro`) use the
  `STATIC_PAGE_META` map + a single `app.get(Object.keys(...))` handler placed
  **after** `express.static` (works because no real file exists at those paths,
  so static calls `next()`). Trailing slash is normalized before the map lookup.

**Why the homepage is special:** `/` IS served by `express.static` (it serves
`dist/index.html` for the root), so a `/` handler registered *after* static
never runs. The `/` OG handler MUST be registered **before** `express.static`.
It swaps only `og:image`/`twitter:image` (keeps the default brand title) and
also injects the `GOOGLE_SITE_VERIFICATION` meta when that secret is set.

**Image assets:** section/home share images are 1200x630 JPEGs in the public
`avatars` bucket at `og/<name>.jpg` (e.g. `og/discover.jpg`). URL built as
`${SUPABASE_URL}/storage/v1/object/public/avatars/og/<name>.jpg`. These are
content/data, but the wiring is code — changes need a **web republish**, not a
native (Codemagic/App Store) rebuild.
