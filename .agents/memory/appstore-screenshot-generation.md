---
name: App Store screenshot generation
description: How to render compliant iOS/iPad App Store screenshots of this phone-first web app via headless Chromium.
---

# Generating App Store screenshots from the running web app

The app is phone-first React+Vite (BrowserRouter on web). To produce App Store
Connect screenshots at exact device pixel sizes, render the dev server
(`http://127.0.0.1:5000`) in headless Chromium at a logical viewport ×
deviceScaleFactor (e.g. 12.9" iPad Pro = 1024×1366 @2 → **2048×2732**).

**Why it's fiddly (cost multiple attempts):**
- Playwright's bundled Chromium fails on Nix (`libglib-2.0.so.0` missing). Fix:
  `installSystemDependencies(["chromium"])` and launch Playwright with
  `executablePath` pointing at the Nix chromium binary + `--no-sandbox`.
- First-run **onboarding overlay** covers every route. Dismiss by setting
  `localStorage 'tt_onboarded' = 'true'` via `addInitScript` before load.
- Guest browsing is required to see feeds, but **guest mode is in-memory React
  state, not persisted**. So: load `/`, click **"Browse as Guest"**, then for
  subsequent pages navigate **client-side** (`history.pushState` +
  `dispatchEvent(new PopStateEvent('popstate'))`) — a full `page.goto()` reloads
  the SPA and resets guest state back to the Login screen.

**ASC image compliance:** screenshots must be flattened with **no alpha
channel**. Playwright PNGs carry alpha; run them through ImageMagick
`-background white -alpha remove -alpha off -colorspace sRGB` before delivery.

**Delivery pattern:** copy PNGs into `public/` and serve a static download page
(e.g. `public/ipad-screenshots.html`) — Vite serves `public/` at root, bypassing
the SPA router (same trick as `public/pro-seller-image.html`). One JS button can
trigger sequential `<a download>` clicks for all files.
