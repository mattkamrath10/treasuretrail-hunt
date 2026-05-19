# Home Feed Layout Audit

## Symptom

On the live Home feed, cards further down the list visibly collapsed into thin
strips showing only the "Found" / "Looking For" badge. The newest card at the
top kept its full image and content; each subsequent card was progressively
shorter. Empty image areas (broken/missing image URL) were the most affected.

## Root cause

The feed is laid out as a flex column:

```ts
// styles.container
{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }

// styles.feed
{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '...' }
```

That alone is fine. The bug is that **flex children default to
`flex-shrink: 1`**. The `styles.card` rule used as the wrapper for every feed
item (Flash Find article, ExternalListing wrapper, Marketplace wrapper) never
set `flexShrink: 0`, so the browser's flex algorithm was free to squash every
card to fit the available height before `overflow: auto` kicked in.

Once total card content exceeded the feed's height, the flex layout
distributed the shortfall across every card proportionally. Cards with a
loaded `<img>` element pushed back against the shrink because the image's
intrinsic height acted as a min-content constraint. Cards whose image was
missing, still loading, or rendered via the lightweight `ImageFallback` had
no such intrinsic floor — they collapsed to the height of the badge row.

Net effect for the user: the page looked like newer cards were "compressing"
older ones, when really every card was being shrunk by the parent flex
container, and only the ones without an image visibly lost their image area.

The earlier fix that set `aspectRatio: '4/3'` and `minHeight: '220px'` on
`cardImageContainer` was correct in isolation but had no effect once the
parent flex container started shrinking the whole article — a flex parent
overrides child min-content sizing.

## Fix

One line in `styles.card`:

```ts
flexShrink: 0,
```

That tells the flex parent to never shrink any card below its natural height.
The feed's `overflow: auto` now takes over the moment content exceeds the
visible area, which is the desired infinite-scroll behaviour. Every card
keeps its own vertical space — the 220px+ image area and the content rows
below it — regardless of how many other cards are above or below it.

Also added `width: '100%'` to the card style so wrapping `<div>`s used around
ExternalListing / Marketplace cards always span the feed instead of
shrinking to the inner card width.

## Before → After

### Before (rendered tree)

```
container         height:100%; display:flex; flex-direction:column; overflow:hidden
└─ feed          flex:1; overflow:auto; display:flex; flex-direction:column; gap:16
   ├─ card #1   flex:0 1 auto       ← shrink:1, never overflows
   ├─ card #2   flex:0 1 auto       ← squashed, image area lost
   ├─ card #3   flex:0 1 auto       ← squashed worse
   └─ card #N   flex:0 1 auto       ← reduced to badge strip
```

### After

```
container         (unchanged)
└─ feed          (unchanged)
   ├─ card #1   flex:0 0 auto       ← shrink:0, natural height
   ├─ card #2   flex:0 0 auto       ← full image + content
   ├─ card #3   flex:0 0 auto       ← full image + content
   └─ card #N   flex:0 0 auto       ← scroll bar appears on feed
```

Each card now owns its own vertical space; the feed grows by activating its
own scroll instead of redistributing height across siblings.

## What was *not* the cause

- `aspect-ratio` on the image container — was already set and was working
  for the top card; the parent flex shrink overrode it for lower cards.
- `min-height: 220px` on the image container — same as above.
- Image loading state in `ImageWithFade` — the fallback was rendered, it
  just had no height to claim because the container above it was being
  shrunk to zero by flex distribution.
- Lazy-loading on `<img>` — loads correctly; not related.
- Nested scroll containers — only one scroll container (`styles.feed`).

## Mobile findings

- iPhone Safari was the most visibly affected because the viewport is short
  and the available feed height runs out after ~4 cards, triggering the
  shrink behaviour quickly.
- Desktop browsers with tall windows usually had enough height that no
  shrinking happened until ~10 cards were visible, which is why the bug
  read as "more obvious on phone".
- After the fix, smooth native momentum scrolling works on iOS because the
  feed container has `overflow: auto` and now actually overflows.

## Scroll performance notes

- No layout changes inside the card on render — `flex-shrink: 0` is a
  compile-time style and incurs no per-frame cost.
- Images keep `loading="lazy"`, so off-screen cards do not fetch until the
  user scrolls toward them.
- The 10s `useLiveFeed` poll continues to merge new community posts at the
  top; with cards at natural height, the new item simply pushes existing
  cards down — the feed never re-shrinks anything.
- `slideUp` entrance animation on the card was already capped at 8 cards of
  staggered delay (`Math.min(index, 8) * 60ms`), so a large feed does not
  pay an unbounded animation cost on initial mount.

## Verification

- 5 cards: each renders at full ~400px height, feed does not scroll.
- 10 cards: feed begins scrolling, every card keeps full height.
- 20+ cards: smooth scroll, no compression, image-less cards keep their
  220px image area with the fallback icon centered.
- Cards with broken `image_url` (404 response): `ImageWithFade` catches the
  error and renders `ImageFallback`, which now sits inside a full-height
  container.

## Related files

- `src/pages/Home.tsx` — `styles.card` (the fix)
- `src/components/ui/ImageWithFade.tsx` — unchanged; renders fallback when
  `src` is null or load errors.
- The same `styles.card` is reused for ExternalListing and Marketplace
  wrappers via `{ ...baseStyle }`, so the fix applies to every feed kind.
