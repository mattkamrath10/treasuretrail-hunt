# TreasureTrail — Mobile Architecture Rules

Single source of truth for the patterns that keep recurring as bugs.
If you're adding a page, modal, header, image, or external link, this is
the contract. If you're fixing a bug that looks like one of these
categories, fix it here AND in the centralized helper — never one-off.

---

## 1. Scroll containers

**Rule:** Exactly one vertical scroll container per route. Use
`<PageScroll>` (top-level tabs) or `<MobileDetailPage>` (detail routes).
Never put `overflowY: 'auto'` on a child of either.

**Why:** Nested scrollers on iOS Safari produce frozen pages, momentum
loss, and rubber-banding into the BottomNav. Two scrollers also break
URL-bar hide-on-scroll, so the user loses ~60px of viewport.

**How to apply:**
- Top-level tab routes (Discover, Wanted, Sell, Profile, Home,
  LiveHub, etc.): wrap the page body in `<PageScroll>`.
- Detail routes: pick the container per §2 (FindDetail, ListingDetail,
  PublicProfile use `<MobileDetailPage>`; EventDetail and WantedDetail
  use `<PageScroll>` with their own sticky header). Either way, one
  scroll container only.
- Modals/sheets get their own internal `overflowY: 'auto'` because
  they're position:fixed and outside the page scroll context — that's
  fine.
- Do **not** put `touch-action: pan-y` on `html`, `body`, or the page
  scroller. It kills horizontal carousels (find galleries, image
  strips). The global CSS keeps `touch-action: manipulation` instead.

---

## 2. Mobile detail pages

**Rule:** Every route that opens a single item (find, listing, event,
wanted, profile) renders inside a managed scroll container — either
`<MobileDetailPage>` or `<PageScroll>`. Never render a raw `<img>` as
the route — that triggers Safari's full-screen image viewer with no
in-app chrome.

**Why:** Sharing a deep link to a raw image (e.g. `/uploads/x.jpg`)
opens the OS image viewer with no back button, no navigation, no
context. Users report this as "the app broke."

**How to apply:**
- `/find/:id`, `/listing/:id`, `/u/:handle` use `<MobileDetailPage>`
  (which adds the back-chrome and a single managed scroll container).
- `/event/:id` and `/wanted/:id` use `<PageScroll>` with their own
  in-page sticky header. Either pattern is acceptable; the
  non-negotiable is *one* scroll container and not a raw image route.
- Never link to a raw image URL from a card or share. Always link to
  the detail route.
- Hero images inside a detail page must use `<ImageWithFade>` with
  `objectFit: 'cover'` and a constrained `maxHeight` (typically
  `60vw` capped at `420px`). See FindDetail/ListingDetail.

---

## 3. Deep links (cold load)

**Rule:** Every route under `/*` must hydrate from a cold Safari load.
The static host serves `index.html` for any non-asset path; React Router
handles the rest.

**Why:** Sharing a link via iMessage/Gmail/Notes will be opened by the
recipient with no prior session. If the host returns 404 (or worse,
serves the URL as a `.txt` download), the link is broken.

**How to apply:**
- `public/_redirects` must contain `/*  /index.html  200` (Netlify
  syntax; also recognized by Replit Static deploys). Do not remove.
- Always build canonical URLs as `${window.location.origin}/<route>/<id>`.
  Do not pass `window.location.href` to share helpers — it can include
  hash state or tab params that break unfurl.
- Per-listing OG preview images would require SSR, which we don't have.
  Instead, use `shareWithImage()` (see §6) so iMessage embeds the actual
  photo as an attachment.
- Keep the global OG tags in `index.html` accurate so unfurled links
  always show *something*, even when the share path is text-only.

---

## 4. Safe areas

**Rule:** Every sticky page header adds
`paddingTop: calc(env(safe-area-inset-top, 0px) + <base-top-padding>)`.
BottomNav adds `paddingBottom: env(safe-area-inset-bottom, 0px)`.

**Why:** The status bar is `black-translucent` (PWA install) and the
dynamic island sits above the layout origin on modern iPhones. Without
the inset, the back button and page title slide under the status bar.
Same problem in reverse for BottomNav and the home indicator.

**How to apply:**
- Sticky header rule: keep the visual padding you want (e.g. `12px 16px`)
  and **add** the inset on top of it, never replace it.
- Pages currently following the rule: Discover, Wanted, Sell, Profile,
  EventDetail, LiveHub, Home, FindDetail, ListingDetail, Messages.
  (Home's header uses `minHeight: var(--header-height)` instead of a
  fixed `height` so the inset can grow the chrome rather than clip it.)
- New pages: copy the pattern. Don't introduce a `<PageHeader>`
  component yet — too much migration churn for little gain. Just keep
  the inset arithmetic consistent.
- AppShell already keeps the BottomNav inset; don't duplicate it
  inside individual pages.

---

## 5. Image containment

**Rule:** Every `<img>` is constrained by `max-width: 100%` and a
predictable `objectFit`. No raw image URL ever escapes the layout
container.

**Why:** Large-camera uploads (4032×3024) without containment cause
horizontal scroll, viewport zoom, and "the page is broken sideways"
reports. Same for avatar fallbacks when a CDN serves an unexpected size.

**How to apply:**
- Global CSS in `src/index.css` enforces `img { max-width: 100%; height: auto; }`
  and `html, body, #root { overflow-x: hidden; }`. Do not relax these.
- Card thumbnails: use `toThumbUrl(rawUrl)` to serve the `.thumb.jpg`
  variant. Pass the original as `fallbackSrc` for `<ImageWithFade>`.
- **Never call `toThumbUrl()` on an already-thumb URL** — see memory
  note `event-image-thumb-double-process.md`. The function is not
  idempotent.
- For "may or may not have an image" cards (LiveHub external listings,
  WantedDetail), render a platform/category-branded fallback block. Never
  render an empty gray void where an image would have been.
- Use `loading="lazy"` on all card images; let the browser defer
  off-screen work.

---

## 6. External links & share

**Rule:** Outbound links use `<a target="_blank" rel="noopener noreferrer">`.
Share actions use the shared `shareWithImage()` helper. Never call
`navigator.share()` directly from a page.

**Why:**
- `rel="noopener"` prevents the destination from regaining a window
  reference and tampering with the originating tab.
- `shareWithImage()` centralizes the iOS quirks: file-then-text vs.
  files-only, AbortError handling, clipboard fallback, transient
  activation rules. Bypassing it has caused duplicate bugs in three
  pages already.
- A bare `<a href={whatever}>` to a user-supplied URL can render
  `about:blank`, `javascript:`, or a 404 — gate it through
  `isValidHttpUrl()` (LiveHub) and provide a sensible platform-default
  fallback.

**How to apply:**
- `shareWithImage({ url, title, text?, imageUrl? })` returns a tagged
  result (`shared | copied | cancelled | unsupported | error`). Handle
  every case; do not assume `shared` always succeeds.
- Build the `url` as `${window.location.origin}/<route>/<id>` (see §3).
- Pass the listing's primary image as `imageUrl` so iMessage embeds it
  inline. For profile shares, pass the avatar.
- For outbound platform links (Whatnot, Poshmark, eBay), validate with
  `isValidHttpUrl()` first. If invalid or missing, fall back to the
  platform's browse page; if no fallback exists, render a disabled
  "Link unavailable" affordance — do **not** render a broken `<a>`.

---

## Quick lookup — which rule covers your bug?

| Symptom                                            | Rule |
|----------------------------------------------------|------|
| Page won't scroll / freezes on iOS                 | §1   |
| Horizontal carousel doesn't pan                    | §1   |
| Tapping a card opens raw image viewer              | §2   |
| Cold-loaded share link shows white page or .txt    | §3   |
| Back button hidden under dynamic island            | §4   |
| BottomNav cut off by home indicator                | §4   |
| Image overflows sideways / huge zoom               | §5   |
| `.thumb.thumb.jpg` 404s                            | §5   |
| Card shows empty gray hero when no image           | §5   |
| iMessage share doesn't embed the photo             | §6   |
| "Visit listing" opens about:blank                  | §6   |
