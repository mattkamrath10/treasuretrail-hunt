---
name: ImageWithFade cached-image race
description: Why ImageWithFade sometimes shows the fallback gradient instead of a valid image
---

`ImageWithFade` fades the `<img>` in (opacity 0→1) only after `onLoad` sets `loaded=true`, with the fallback (MediaFallback gradient) as an always-on background layer underneath.

**Bug:** when the browser serves the image straight from HTTP cache, the `<img>` can finish loading BEFORE React attaches the `onLoad` handler, so the handler never fires, `loaded` stays false, the img is stuck at `opacity:0`, and the fallback gradient shows through — even though the URL is a perfectly valid 200. Symptom: same saved/find image renders correctly on a device that loaded it fresh (phone) but shows the gradient on one serving it from cache (PC), or after navigating away and back.

**Fix (in place):** an `imgRef` + `useEffect([currentSrc])` that sets `loaded=true` when `imgRef.current.complete && naturalWidth>0`. `naturalWidth>0` prevents falsely marking a broken image as loaded.

**How to apply:** any future fade-in/opacity-gated image component must handle the already-`complete` cached case, not rely on `onLoad` alone. Don't "fix" a persistent fallback by assuming the URL is bad — check whether it's the cache race first (the URL is usually 200).
