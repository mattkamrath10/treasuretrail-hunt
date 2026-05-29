---
name: Modal / bottom-sheet background scroll lock
description: How TreasureTrail stops the page behind an open modal from scrolling on iOS Safari, given the app's non-body scroll architecture.
---

Background scroll lock for modals lives in `useScrollLock` (src/hooks/useScrollLock.ts), not in CSS on body.

**Why CSS body lock alone fails here:** the page scroll context is a `<PageScroll>` div (AppShell content slot is `overflow:hidden`), NOT `document.body`. So `body { overflow:hidden }` does nothing to the surface that actually scrolls, and on iOS Safari a `position:fixed` overlay still lets a touch drag the scroller behind it. The hook instead adds document-level non-passive `touchmove`+`wheel` listeners that `preventDefault()` for any gesture outside `[data-scroll-lock-allow]`, AND blocks at the allowed scroller's top/bottom boundary so momentum can't chain through (the rubber-band leak). It deliberately never sets `touch-action` — `pan-y` on html/body/page-scroller kills horizontal carousels (see ARCHITECTURE.md §1).

**How to apply:**
- In the modal component, call `useScrollLock(true)` (it self-cleans on unmount).
- Mark the modal's scrollable area (the `overflowY:auto` element) with `data-scroll-lock-allow` so it keeps scrolling; everything else freezes.
- Give that scroll area `overscrollBehavior:'contain'` + `WebkitOverflowScrolling:'touch'` as belt-and-suspenders.
- The hook is reference-counted, so stacking locks (dialog over sheet) restores body/html overflow only when the last lock releases.
- LiveHub's `mo` sheets share one `mo.body` style; all bodies carry the allow-marker, but only modals that actually call `useScrollLock` are locked.
