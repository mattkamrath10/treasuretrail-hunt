---
name: Discover carousel wheel behavior
description: Deliberate UX rule for Discover horizontal rows — plain wheel scrolls the page, shift+wheel scrolls the carousel; do not re-add vertical-wheel hijack.
---

# Discover carousel wheel behavior

The Discover `<Section>` rows are horizontal carousels. A **plain mouse wheel
must scroll the PAGE vertically** — the wheel handler only acts when
`e.shiftKey` is held (then it maps deltaY -> horizontal scrollLeft).

**Why:** The page previously hijacked vertical wheel over a row into horizontal
scroll (Netflix-style). On desktop this trapped users inside a row when trying
to scroll down the page. The user explicitly asked that the wheel always scroll
the page and that horizontal navigation come from arrows + shift+wheel instead.

**How to apply:** Do NOT "helpfully" re-add a `el.scrollLeft += e.deltaY` on
plain (non-shift) wheel. Desktop horizontal nav = hover arrow buttons
(`.tt-carousel-arrow`, desktop-only via `@media (hover:none),(pointer:coarse)`)
that scroll ~80% of clientWidth; mobile = native swipe + a touch-only progress
bar. Carousel rows keep `touch-action: pan-x pan-y` and rely on `.tt-hscroll`
to hide the scrollbar — never put `pan-y` on an ancestor (kills iOS swipe).
