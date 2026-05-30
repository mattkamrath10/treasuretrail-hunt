---
name: iOS bottom-sheet must size by dvh, not vh
description: "Bottom-anchored sheets sized with vh hide their lowest controls behind the mobile Safari toolbar; use dvh."
---

A `position:fixed; inset:0` overlay + a `alignItems:flex-end` sheet sized with
`maxHeight:90vh` will hide the BOTTOM of the sheet behind the mobile Safari
toolbar — its lowest control (e.g. the Delete Account button Apple requires) is
unreachable even when the inner body scrolls.

**Why:** iOS `vh` is the LARGEST (toolbar-hidden) viewport. A fixed `inset:0`
overlay's bottom and a bottom-anchored sheet therefore extend below the visible
area, behind the toolbar. The body scroller bottoms out off-screen.

**How to apply:** size the overlay height AND the sheet max-height with `dvh`
(dynamic viewport), with a `vh` line first as the fallback. Inline React styles
can't express the duplicate-property fallback, so use CSS classes:
`.tt-modal-overlay{height:100vh;height:100dvh}` and
`.tt-sheet{max-height:90vh;max-height:90dvh}` in `src/styles/index.css`. Change
the overlay from `inset:0` to `top/left/right:0` so the class height wins, and
drop the inline `maxHeight`. Reuse these classes for every bottom sheet (LiveHub,
saved-searches, report, find-detail all use the same vh pattern).
