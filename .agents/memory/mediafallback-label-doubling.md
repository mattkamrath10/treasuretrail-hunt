---
name: MediaFallback label doubling
description: Passing label to MediaFallback while also rendering a title caption double-renders the title.
---

# MediaFallback label vs caption title

`<MediaFallback>` (src/components/ui/MediaFallback.tsx) renders its own centered
text — either the palette brand label ("EVENT"/"FIND"/etc.) or the `label` prop
when you pass one.

**Rule:** if a card/slide draws its OWN title in a caption overlay, do NOT also
pass `label={title}` to the MediaFallback used as the ImageWithFade `fallback`.
Doing so paints the title twice (faint centered fallback text + the bold caption),
which reads as overlapping/duplicated text on image-less items.

**Why:** ImageWithFade always renders `fallback` as an always-on background layer,
so the fallback's text shows whenever the image is missing/loading — exactly the
case where the caption is also visible.

**How to apply:** for media slots with a separate title/caption, pass only
kind/category/seed to MediaFallback (let it show the short brand label or icon).
Reserve `label` for slots that have no other title.
