---
name: iPad responsive width tokens
description: How the app widens on tablets and how fixed FABs/toasts must hug the centered content column
---

The whole app is a single centered column sized off the CSS var `--max-width`
(defined in `src/styles/index.css`, applied in `src/components/AppShell.tsx`
container, and reused by every page incl. the auth screens
Onboarding/Login/SignUp/ProfileSetup). On phones it fills the viewport; the
column is `margin: 0 auto`.

**Rule:** to support tablets, `--max-width` is widened via media queries
(`@media (min-width:700px){--max-width:760px}`, `(min-width:1024px){960px}`) —
NOT by editing individual screens. Change the token, the whole app scales.

**Rule:** a sibling token `--side-gutter: max(0px, calc((100vw - var(--max-width))/2))`
is 0 on phones and equals the empty margin on tablets. Any `position:fixed`
FAB anchored to a viewport edge must offset by it, e.g.
`right: calc(var(--side-gutter) + 20px)`, or it floats out in the empty iPad
margin detached from the content.

**Rule:** toasts using `left:50% + translateX(-50%)` are already centered over
the column (column is viewport-centered too) — do NOT re-position them. The only
defect is WIDTH: any toast using viewport-relative width (`90vw`, `90%`,
`calc(100% - 32px)`) overflows the column on iPad. Cap it:
`maxWidth: 'min(<original>, calc(var(--max-width) - 32px))'`.

**Why:** Apple rejected v1.0 build 21 under Guideline 4 (iPad Air 11" UI
"crowded/difficult to use") purely because the 480px cap rendered the app as a
narrow phone strip floating in the middle of the iPad with FABs/toasts drifting
into the empty margins. Fix was deliberately minimal (no redesign).

**How to apply:** new fixed/edge-anchored UI → offset by `--side-gutter`; new
toasts → centered + width capped to `--max-width`; never hard-code a viewport
width. Modal overlays (`inset:0` + centered inner sheet) were intentionally left
alone and are the next Guideline-4 risk if a reviewer pushes back (tiny sheet on
a huge backdrop), along with EventsMap, Discover carousels, and fixed
`repeat(2|3,1fr)` grids that don't add columns on tablet.
