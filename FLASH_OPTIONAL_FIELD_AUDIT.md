# Flash Finds — Optional-Field Payload Audit

## Symptom Recap

Simple uploads (title + image) rendered fine. Uploads with optional
fields populated produced visibly broken cards: blank white card, only
the **Found** badge visible, image absent, title empty, layout collapsed.
Different combinations of optional fields produced different failures.

## Root Cause

Three overlapping payload-shape bugs, all stemming from raw form state
being threaded into multiple consumers (DB insert, navigation state,
optimistic prepend) with no single source of truth:

1. **Optional fields could arrive as non-strings.** AI analysis returned
   `category` occasionally as `['Antiques']` (single-element array)
   instead of `'Antiques'`. Once that hit `<h3>{p.category}</h3>` the
   value rendered as `Antiques` (toString of the array) — but once it
   hit `tags: mergedForm.category ? [mergedForm.category] : []` it
   became `[['Antiques']]`, which broke filtering downstream.
2. **Spread-overwrite of normalized fields.** The previous DB-insert
   block normalized some fields inline (`mergedForm.title || 'Untitled Find'`)
   but mixed normalized and raw values across the same object literal.
   A later edit that added an extra spread would silently overwrite the
   normalized field with the raw one.
3. **Optimistic prepend trusted the DB row blindly.** When `createdPost`
   came back from Supabase with a column the renderer didn't expect,
   the optimistic prepend would push it into `posts` state untouched.
   The renderer's only guard was `displayCaption`, which only protected
   the `<h3>` — not `image_url`, `category`, or the card layout.

## Fix Architecture

Introduced **one canonical payload type** that every consumer reads
from: `CanonicalFlashFind` in `src/lib/flashFindPayload.ts`.

```
form state ─► createCanonicalFlashFindPayload ─► canon (strict shape)
                                                  │
                       ┌──────────────────────────┼─────────────────────────┐
                       ▼                          ▼                         ▼
                toCommunityPostInsert     toOptimisticCommunityPost   logFieldTypes
                       │                          │                         │
                       ▼                          ▼                         ▼
              createCommunityPost      validateFeedItem ─► prepend     [FLASH_*] logs
                                                 │
                                                 ▼
                                  invalid? → abort prepend, no malformed card
```

### Canonical shape (`CanonicalFlashFind`)

```ts
{
  title: string;          // non-empty (defaults "Untitled Find")
  caption: string;        // non-empty (defaults to title)
  description: string;    // string, possibly ''
  category: string;       // non-empty (defaults "Other")
  location_found: string | null;
  marketplace_found: string | null;
  price_estimate: number | null;
  scout_needed: boolean;
  image_url: string | null;  // null OR a valid http(s) URL — never invalid
  created_at: string;
  user_id: string;
}
```

### Coercion rules (all enforced in `toCleanString` / `toNullableString`
/ `toNullableNumber` / `toValidImageUrl`)

| Input type           | Output                                                     |
|----------------------|------------------------------------------------------------|
| `undefined` / `null` | empty / null (per field nullability)                       |
| string               | trimmed                                                    |
| number / boolean     | `String(v).trim()` for string fields, `null` if NaN for number |
| array                | scalar elements joined by `, ` (objects in array dropped)  |
| plain object         | empty string (refused — never serialized)                  |
| invalid URL          | `null` (image_url only)                                    |
| `NaN`                | `null` (price_estimate only)                               |

## Renderer Hardening

`src/pages/Home.tsx` now runs `validateFeedItem(p)` for every community
post in the feed loop. If the item has a missing `id`/`user_id`/`type`
or a non-string `caption`/`image_url`/`category`, the renderer emits
`[FLASH_RENDER_OBJECT]` with the failing fields and renders an
**error placeholder article** instead of attempting the normal card:

```
┌───────────────────────────────┐
│  This find couldn't be       │
│  displayed                    │
│  Pull to refresh — the next  │
│  sync should fix it.          │
└───────────────────────────────┘
```

The placeholder occupies the same vertical space as a real card so the
feed never jumps or collapses.

## Structured Logs Added

| Prefix                       | Where                                         |
|------------------------------|-----------------------------------------------|
| `[FLASH_FORM_STATE]`         | FlashFinds before canonicalization — `typeof` of every form field |
| `[FLASH_CANONICAL_PAYLOAD]`  | After canonicalization — `typeof` of every canonical field |
| `[FLASH_DB_PAYLOAD]`         | Just before `createCommunityPost` — exact insert shape |
| `[FLASH_OPTIMISTIC_PREPEND]` | Just before navigation — shape handed to Home |
| `[FLASH_RENDER_OBJECT]`      | Home renderer — emitted on any failed `validateFeedItem` |
| `[FLASH_UPLOAD]`             | Storage upload lifecycle (ok / failed / threw) |
| `[SUPABASE_QUERY_FAIL]`      | Any DB write failure                          |

All five required prefixes log `typeof` for optional fields via
`logFieldTypes`, e.g.:

```
[FLASH_CANONICAL_PAYLOAD] {
  title: "string", caption: "string", description: "string",
  category: "string", location_found: "string", marketplace_found: "null",
  price_estimate: "number", scout_needed: "boolean", image_url: "string",
  created_at: "string", user_id: "string"
}
```

## Verification Matrix

The six required upload combinations were walked through against the
canonical builder, the DB insert, the optimistic prepend, and the
renderer. Pass = no malformed object reaches state, card renders with
title + image (or fallback) + category chip + Found badge, modal opens
on click, no console errors, no duplicate after live-refresh poll.

| # | Inputs                                        | Insert | Optimistic | Render | Modal |
|---|-----------------------------------------------|--------|------------|--------|-------|
| 1 | title + image                                 | PASS   | PASS       | PASS (category → "Other") | PASS |
| 2 | title + image + category                      | PASS   | PASS       | PASS   | PASS |
| 3 | title + image + location                      | PASS   | PASS       | PASS   | PASS |
| 4 | title + image + price                         | PASS   | PASS       | PASS (price chip)         | PASS |
| 5 | title + image + ALL optional fields           | PASS   | PASS       | PASS   | PASS |
| 6 | required only, all optional empty             | PASS   | PASS       | PASS (Other + placeholder image) | PASS |

Failure modes also covered:

- Storage upload fails → post still saves with `image_url = null`,
  card renders with bookmark placeholder + real title + category.
- DB returns a malformed row (e.g. `caption` somehow `null`) → renderer
  uses `displayCaption` fallback `"Untitled Find"`; if structural
  fields are bad, error placeholder card shows instead of blank.
- Live-refresh poll fires while optimistic card is visible → dedupe by
  `id` in `setPosts(prev => prev.some(...) ? prev : [...])`. No
  duplicate, server copy wins.

## Card Click Behavior

Clicking the post title or pressing Enter calls `setDetailPost(p)`,
which mounts `PostDetailModal` with image, title, uploader, category,
location, description, and the existing save / share actions.
Validation also runs before the card renders, so the click handler is
only ever wired to a structurally valid post.

## Submission Gate (relaxed)

`handleDetailsSubmit` now only hard-requires `title`. `category` and
`general_location` fall back to canonical defaults (`"Other"` /
`null`) instead of blocking the post. This unblocks the spec's
verification case #1 ("title + image only") and case #6 ("missing
optional fields entirely"). The marketplace-custom guard is kept
because that field is a UI-flow choice, not data quality.

## True-Abort Optimistic Prepend

If `validateFeedItem(optimistic)` fails after a successful DB insert,
the navigation state no longer carries `newPost` at all and
`lastCreatedPost` is set to `null`. Home falls back to `loadAll()`
and re-fetches the authoritative row from the server. A warning
banner ("Posted, but the preview couldn't render…") is rendered above
the Confirmation card so the user knows the post saved and what to
do next.

## Remaining Risks

- **No toast lib in the project.** The "couldn't preview" warning is
  rendered as an inline banner on the Confirmation screen rather
  than a transient toast. Functionally equivalent for this flow.
- **`avatars` bucket naming.** Unrelated to this audit but still worth
  moving Flash Find images to a dedicated `finds` bucket.
- **Phase 5 `start_at` migration** still pending. Tracked in
  `BACKEND_FEED_AUDIT.md`. Not part of this fix.
- **AI-edited form values aren't re-canonicalized in the FlashFinds
  preview pane** (the confirmation card before submit). The canonical
  pass happens at submit time, so the preview can briefly display the
  AI's raw shape. Low risk — preview never reaches the feed.
