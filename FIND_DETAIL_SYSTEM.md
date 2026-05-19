# Find Detail System

## Why this exists

Before this work the Home feed was visually rich but **interactively dead**.
Tapping a Flash Find card opened a small in-feed modal that showed the
caption, a badge, and the uploader name. Users could not:

- inspect the full listing
- contact the uploader / seller
- request a scout
- save or share the find
- view the marketplace source
- visit the uploader's profile

The modal was also not a real URL — refreshing the page closed it and
shared links always landed on the raw feed.

The new system makes every feed card a real interactive object with a
dedicated, shareable detail page.

## Routing structure

| Route               | Component                  | Purpose                                          |
| ------------------- | -------------------------- | ------------------------------------------------ |
| `/`                 | `Home`                     | Feed of finds, listings, and marketplace items. |
| `/find/:id`         | `FindDetail` (new)         | Full detail page for any `community_posts` row. |
| `/profile/:username`| `PublicProfile` (aliased)  | Canonical link surfaced from cards & detail.    |
| `/u/:username`      | `PublicProfile`            | Legacy alias kept for inbound links.            |

`/find/:id` and `/profile/:username` are registered inside `AppShell`'s
lazy `<Routes>` (`src/components/AppShell.tsx`), so they share the
shell, bottom nav, and Suspense fallback with every other route.

### Deep linking & refresh

- `/find/abc123` fetches `community_posts` by id on mount via
  `supabase.from('community_posts').select('*, profiles(...)').eq('id', id).maybeSingle()`.
- Page refresh works because the id is in the URL — not in component
  state.
- Shared URLs render the same page in any tab / browser.
- The "Share" button writes `${origin}/find/${post.id}` to the system
  share sheet or the clipboard.

## Card interaction flow

```
Home feed
  ├─ image area  →  navigate('/find/:id')
  ├─ title       →  navigate('/find/:id')
  ├─ avatar + @username button  →  navigate('/profile/:username')
  └─ action row (Like / Comment / Save / Share / Open / Delete)
        ↑ each button has its own minimum 44×44 tap target
```

- The hero image is a `role="button"` div with `tabIndex={0}` and an
  Enter/Space `onKeyDown` so keyboard users get the same affordance.
- The uploader header is its own `<button>` and `stopPropagation`s so it
  never collides with the image navigation if we later wrap the whole
  article in a click handler.
- Action buttons all live inside the card's footer and stop propagation
  implicitly because they're separate `<button>`s.

### Cursor + press feedback

- Image area: `cursor: pointer` on desktop.
- Card hover lift is already handled by the existing `boxShadow` on
  `styles.card`.
- Mobile press animation is provided by the browser's default tap
  highlight on the `<button>` and `role="button"` elements (no
  custom JS needed; honors `prefers-reduced-motion`).

## FindDetail page contents

In display order:

1. **Sticky top bar** — back arrow, "Find Details" title, share button.
   Honors `env(safe-area-inset-top)`.
2. **Hero image** — `4/3` aspect ratio with `min-height: 240px`, falls
   back to a large `Bookmark` icon when `image_url` is null or fails.
   Tapping the image opens a full-screen `cursor: zoom-out` lightbox.
3. **Title** — `post.caption` (or "Untitled Find" as a defensive fallback).
4. **Uploader row** — avatar + `@username` + treasure rank +
   verified-scout note; entire row is a single button that routes to
   `/profile/:username`.
5. **Meta chips** — category, condition, estimated value, rarity score
   (only rendered when present).
6. **Location & posted-at** — pinned with `MapPin` and `Calendar` icons.
7. **About this find** — `post.description` (if the column / value is
   present; the existing schema doesn't always populate it, so the
   section is conditional).
8. **Tags** — `#tag` chips when `post.tags` is non-empty.
9. **Action grid** (auto-fit, 160px min column):
   - View Original Listing — disabled, "Coming Soon" hint (no
     external URL column on `community_posts` yet).
   - Contact Seller / Uploader — disabled, "Coming Soon" (DM system
     pending).
   - Scout This Item — enabled when `scout_needed=true`; otherwise
     disabled with "Not requested". Routes to `/rare-radar`.
   - Save Listing — toggles `tt_saved_posts` in localStorage, matching
     the existing Home save behavior so the two stay in sync.
   - Share — Web Share API → clipboard fallback → toast confirmation.
   - Report — disabled, "Coming Soon".
10. **Delete bar** — owner sees red Trash; admins viewing someone
    else's content see amber Shield. Uses the same
    `canDeletePost` / `deletePost` helpers as the Home feed, so RLS
    semantics are identical. After successful delete the page navigates
    back to `/`.
11. **Safe-area spacer** — `calc(env(safe-area-inset-bottom) + 24px)` so
    the last action button is never under the iOS home indicator.

## Loading / error / empty states

| State          | Rendering                                                   |
| -------------- | ----------------------------------------------------------- |
| Loading        | Centered spinner + "Loading find…" label                    |
| Network error  | "Couldn't load this find" + error message + back button     |
| Not found      | "This listing no longer exists." + back button              |
| Missing image  | `ImageFallback` with large `Bookmark` icon inside a full-height container; lazy-loaded via `ImageWithFade`. |

These states are exhaustive — there is no path where the page renders
a blank screen.

## Future marketplace actions (deferred)

These are intentionally rendered as disabled buttons with "Coming Soon"
hints rather than hidden — the request explicitly forbids dead clicks
but also asks for honest disabled states.

- **View Original Listing** needs an `external_url` column on
  `community_posts` (analogous to `external_listings.external_url`).
  When that lands, swap the disabled button for `openExternalUrl(...)`
  and remove the hint.
- **Contact Seller** needs a 1-to-1 messaging surface. The existing
  `/messages` page only handles existing threads; opening a new thread
  by `user_id` is the missing piece.
- **Report** needs a moderation queue table + admin review surface.

Adding the live functionality is a 3–10 line change per button once the
backing system exists.

## Profile-link architecture

- The canonical link for any uploader / seller / commenter is
  `/profile/:username`.
- It is registered inside `AppShell`, so it shares the shell chrome.
- The pre-existing `/u/:username` route at the App level is kept as an
  alias so any inbound link from older shares / notifications still
  works.
- `PublicProfile` already handles its own loading and not-found states
  and supports follow / unfollow, so the new link slots in without
  changes to that page.

## Mobile findings

- The new top bar's `paddingTop: calc(env(safe-area-inset-top) + 12px)`
  keeps it clear of the notch on iPhone X-class devices.
- The hero image's `aspect-ratio: 4/3` + `min-height: 240px` mirrors the
  feed card so transitions feel continuous.
- Tap targets:
  - Top-bar icons: 44×44.
  - Uploader header button: `min-height: 56` to fit the avatar.
  - Action grid buttons: `min-height: 56`.
  - Delete button: `min-height: 48`.
- The image-zoom overlay uses `cursor: zoom-out` and dismisses on tap
  anywhere on the backdrop — natural on touch and mouse.
- The page is `overflow: hidden` at the root with a single inner
  scroll container (`scroll`), so iOS momentum scrolling works
  natively and the top bar never scrolls away.
- Buttons stack into 1–3 columns via
  `grid-template-columns: repeat(auto-fit, minmax(160px, 1fr))` — no
  manual breakpoints required.

## Files touched

- `src/pages/FindDetail.tsx` — **new** detail page.
- `src/components/AppShell.tsx` — lazy registered `/find/:id` and
  `/profile/:username`.
- `src/pages/Home.tsx` — image and title now `navigate('/find/:id')`;
  uploader header `navigate('/profile/:username')`; removed the
  defunct in-feed `PostDetailModal` and its `detailPost` state.
- `FIND_DETAIL_SYSTEM.md` — this document.

## Verification

- TypeScript: `npx tsc --noEmit` clean.
- Workflow `Start application`: HMR applied without errors.
- Manual paths exercised:
  - Tap card image → `/find/:id` opens with full content.
  - Tap title → same route.
  - Tap uploader header → `/profile/:username` opens.
  - Refresh on `/find/:id` → renders correctly.
  - Refresh on `/find/<nonexistent>` → shows "This listing no longer exists."
  - Save / Share / Scout actions fire toasts and / or navigate.
  - Owner delete → confirms, deletes, redirects to `/`.
  - Image zoom opens and closes.
