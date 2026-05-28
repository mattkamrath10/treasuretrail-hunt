---
name: Mobile detail-page viewport containment
description: How TreasureTrail prevents horizontal page-pan on detail routes without breaking horizontal carousels.
---

Detail routes (FindDetail, ListingDetail, PublicProfile, etc.) must wrap in `<MobileDetailPage>` (src/components/ui/MobileDetailPage.tsx), not a hand-rolled `<div styles.page><div styles.scroll>` flex-column pair. The old pattern (`page: overflow:hidden + flex column`, `scroll: flex:1 overflowY:auto`) lets a single oversize image bleed wider than the viewport on iPhone Safari and the whole page pans sideways like a desktop site.

**Why:** AppShell's content slot is `overflow:hidden`, but on iOS that doesn't stop a child wider than the viewport from being pan-scrollable inside the slot — the page-level scroll container needs its own `overflowX:hidden` AND the html/body root needs `max-width:100vw; overflow-x:hidden` as a belt-and-suspenders. Plus every `<img>` gets a global `max-width:100%; height:auto` floor so a raw supabase asset (4032×3024) can't push layout out.

**How to apply:**
- New detail page → `<MobileDetailPage>` (don't reinvent). It bakes in width, maxWidth:100vw default, paddingBottom safe-area, overflowX:hidden, touchAction:pan-y.
- Caller `style` merges between defaults and the lock layer, so `maxWidth` IS overridable (PublicProfile passes 480) but `overflowX:hidden` + `touchAction:'pan-y'` are not.
- NEVER put `touch-action: pan-y` on html/body or on the generic PageScroll — iOS resolves touch-action by walking up the tree, so an ancestor pan-y kills horizontal swipe in Discover/FlashFinds carousels. Detail-page lock only.
- Horizontal carousels nested inside MobileDetailPage need their own `touch-action: pan-x` on the scrolling row. Detail pages currently have none, but Home/Discover do — that's why the root-level pan-y is forbidden.
- The sticky top-bar pattern (`position:sticky; top:0; zIndex:10`) still works inside MobileDetailPage because it's the active scroll context.
