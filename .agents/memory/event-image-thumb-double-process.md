---
name: Event image thumb double-process bug
description: Why uploaded event cover images rendered as gray placeholders before fix.
---

## The bug
`src/lib/imageCompress.ts` `toThumbUrl(url)` rewrites any URL ending in `.jpg/.png/...` to `.thumb.jpg`. Recent uploads correctly store BOTH `cover_image_url` (full) and `cover_thumb_url` (thumb) on the events row. Render code did:

```ts
src={toThumbUrl(event.cover_thumb_url || event.cover_image_url)}
fallbackSrc={event.cover_image_url}
```

If `cover_thumb_url` is non-null (already ends in `.thumb.jpg`), `toThumbUrl` rewrote it to `.thumb.thumb.jpg` → 404. Fallback then loaded `cover_image_url`, which usually worked — but during the 404→swap interim, `ImageWithFade` showed its shimmer, and `EventCard`'s `fallback` prop was a gray `<div bg=neutral-100>` with a calendar icon. Users perceived "gray placeholder for uploaded image."

## Rule
**`toThumbUrl` must be idempotent.** Detect `.thumb.jpg` and skip rewrite.

**Why:** Several call-sites pass `cover_thumb_url || cover_image_url`. If the first wins (recent uploads), the rewrite would break a URL that's already correct.

**How to apply:** Skip the regex replacement when the URL pathname already contains `.thumb.`. Also: any `<ImageWithFade fallback={...}>` for user-uploaded media must render a colored gradient with an icon — never a flat neutral-100 box — so worst-case visual is "branded" not "broken."
