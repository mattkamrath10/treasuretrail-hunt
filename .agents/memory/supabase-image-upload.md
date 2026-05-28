---
name: Supabase image upload pipeline
description: How user-uploaded images flow from file picker to <img src>.
---

## Pipeline
1. User picks file → `fileToDataUrl` → `uploadCompressedImage(dataUrl, {userId, folder})`
2. `compressWithThumbnail` canvas-decodes once, emits two blobs: full (1200px @ q=0.7) and thumb (400px @ q=0.65)
3. Both blobs uploaded in parallel to bucket `avatars` (default) at:
   - `${userId}/${folder}/${timestamp}.jpg`
   - `${userId}/${folder}/${timestamp}.thumb.jpg`
4. Returns `{url, thumbUrl}`; caller stores BOTH on the row (e.g. `cover_image_url`, `cover_thumb_url`)

## Bucket access
- Bucket `avatars` is **public read**, authenticated write
- RLS: `name LIKE (auth.uid()::text || '/%')` — first path segment MUST equal `auth.uid()`
- If userId type-mismatches auth.uid() (rare), upload silently 403s and the row stores `null`

## Failure modes worth knowing
- HEIC canvas decode can fail on iOS Safari → catch falls back to raw fetch and uses same blob for both full + thumb (thumb is full-size but at least exists)
- Thumb upload failure is **non-fatal** — only console.warn. Render side must tolerate thumb 404.
- `crossOrigin = 'anonymous'` on the decode-side `Image()` is required for canvas export but irrelevant to render.

## Render contract
- Always pass the **raw** `cover_thumb_url` to `<img src>` if non-null. Don't run `toThumbUrl` on it.
- Use `toThumbUrl(cover_image_url)` only as a derivation when `cover_thumb_url` is null (legacy rows).
- `<ImageWithFade fallback={...}>` must be a colored gradient + icon, never flat gray.
