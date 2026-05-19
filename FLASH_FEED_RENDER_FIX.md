# Flash Finds Render Fix — May 19, 2026

## Root Cause

After the schema fixes (`BACKEND_FEED_AUDIT.md`), uploads began reaching
the backend and the Home feed began rendering posts. However, some posts
appeared as nearly-empty cards: just the orange **Found** badge plus an
empty card body. Investigation found three additive causes:

1. **Empty caption renders as empty H3.** `Home.tsx`'s post card uses
   `<h3>{p.caption}</h3>` with no fallback. If `caption` is empty
   (whitespace-only notes/title, or a row inserted by any future code
   path that skipped the normalizer), the title block collapses to zero
   text — leaving styled padding but no visible content.
2. **Silent image-upload failures.** `FlashFinds.tsx` wrapped the storage
   upload in `try { ... } catch {}` with the comment "best-effort." If
   the `avatars` bucket is missing, RLS rejects the user, or the blob
   fetch throws, `imageUrl` stayed `undefined`, the post row was inserted
   with `image_url = null`, and the card fell back to the bookmark
   placeholder — looking "broken" even though it was working as coded.
3. **No input normalization in `createCommunityPost` /
   `createFlashFind`.** Whitespace strings, undefined-vs-null
   inconsistencies, and missing categories all reached the DB unchanged.
   The feed renderer assumed values would be either populated or
   absent — never empty strings.

## Files Changed

- `src/lib/database.ts`
  - `createCommunityPost`: trims caption/category/image_url; defaults
    caption to `"Untitled Find"`; logs `[FLASH_UPLOAD]` payload summary
    and outcome; surfaces errors via `[SUPABASE_QUERY_FAIL]`.
  - `createFlashFind`: same normalization; surfaces errors.
- `src/pages/FlashFinds.tsx`
  - Storage upload no longer swallows errors. Failures are logged with
    the `[FLASH_UPLOAD]` prefix including bucket, path, and statusCode.
    The post still proceeds without an image (intentional) but you can
    now diagnose why an image is missing from the console.
- `src/pages/Home.tsx`
  - Post card derives `displayCaption = p.caption.trim() || "Untitled Find"`
    once and uses it for both the `<h3>` title and `<img alt>`. Cards
    can no longer render with a blank title block.

## Normalization Strategy

Every insert helper now applies the same three rules at the
DB-write boundary:

| Field        | Rule                                                       |
|--------------|------------------------------------------------------------|
| caption/title | trim → if empty → `"Untitled Find"`                       |
| category      | trim → if empty → `undefined` (omit from row)             |
| image_url     | trim → if empty → `undefined` (renderer shows placeholder)|

Renderers apply the same fallback (`"Untitled Find"`) again as a
belt-and-braces guard so legacy rows already in the DB also display
correctly.

## Debug Log Prefixes (current)

| Prefix                    | Where logged                                  |
|---------------------------|-----------------------------------------------|
| `[FLASH_UPLOAD]`          | FlashFinds upload + createCommunityPost lifecycle |
| `[POST_NORMALIZE]`        | Inline comments mark normalization points     |
| `[FEED_RENDER]`           | Inline comments mark defensive renderer guards |
| `[SUPABASE_QUERY_FAIL]`   | Any DB insert/select failure                  |
| `[HOME_FEED_FETCH]`       | Home `loadAll` soft-skipped optional sources  |

## Optimistic Prepend (shipped)

FlashFinds now stores the full `createdPost` (not just its id) and passes
it through `navigate('/', { state: { highlightPostId, newPost } })`.
Home's nav-state effect splices `newPost` to the front of the `posts`
array immediately on mount, de-duped by `id`. The subsequent `loadAll()`
(triggered by `highlightPostId`) overwrites with the server's
authoritative copy. The user sees their upload the instant Home renders —
zero network RTT — and there are no duplicate cards.

Log line emitted when the optimistic path engages:
`[FEED_RENDER] optimistic prepend id=<uuid>`

## Pre-Insert Validation

`FlashFinds.handleDetailsSubmit` now hard-blocks submission when:

- `title` is empty after trim → "Add a title for your find…"
- `category` is empty after trim → "Pick a category so your find shows up…"

These join the existing marketplace + general-location checks. The DB
layer's `"Untitled Find"` / category defaults are kept as defense-in-depth
for any future code path that bypasses the form (e.g. import scripts).

## QA Matrix

| Scenario | Expected | Result |
|----------|----------|--------|
| Submit with empty title | UI error, no insert | PASS — blocked at handleDetailsSubmit |
| Submit with empty category | UI error, no insert | PASS — blocked at handleDetailsSubmit |
| Submit valid Flash Find → "View Home Feed" | Card appears instantly with title+image+badges, no duplicate after poll | PASS — optimistic prepend + id dedupe |
| Storage upload fails (RLS / bucket missing) | Post still saves; `[FLASH_UPLOAD] storage upload failed` in console; card shows bookmark placeholder + real title | PASS — error surfaced, post not blocked |
| Legacy DB row with NULL caption | Card renders `Untitled Find` title + bookmark placeholder | PASS — renderer fallback |
| Legacy DB row with NULL category | Card renders `Other` category chip | PASS — renderer fallback |
| Home live-refresh poll fires while optimistic post is visible | No duplicate card, server copy replaces stub | PASS — dedupe by `id` in setPosts |
| `npx tsc --noEmit` | exit 0 | PASS |

## Remaining Risks
- **Bucket name.** Find photos upload to the `avatars` bucket. This
  works but is semantically wrong; a dedicated `finds` bucket would be
  cleaner and would let RLS scope per-feature.
- **Storage RLS surfaces a console error only.** If the `avatars`
  upload fails, the user sees the post posted without an image and no
  in-UI explanation. The diagnostic log is enough to triage, but a
  toast-style "Photo couldn't upload — posting without image" would be
  a nicer UX. Out of scope for this fix.
- **Phase 5 `start_at` migration still pending.** Unrelated to the
  render fix, but: until `SUPABASE_PASTE_THIS.sql` is applied, NEW
  LiveHub / Auctions event uploads will fail at insert time because
  the payload includes `start_at`. Community / Flash Find uploads are
  not affected.

## Verification

- TypeScript: clean (`npx tsc --noEmit`, exit 0).
- Console after the fix: no `[SUPABASE_QUERY_FAIL]` spam; new
  `[FLASH_UPLOAD]` entries when uploading.
- Home renderer: `displayCaption` ensures `"Untitled Find"` shows even
  for any malformed row.
