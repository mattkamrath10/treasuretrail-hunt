---
name: Native /api fetches must go through apiUrl()
description: Why relative '/api/...' fetches silently break in the Capacitor native shell
---

# Every /api call must use apiUrl() (and browser-opened links use publicWebUrl())

In the Capacitor native shell the webview serves bundled assets from
`capacitor://localhost` (iOS) / `http://localhost` (Android). A relative
`fetch('/api/...')` therefore resolves to `capacitor://localhost/api/...` and
never reaches the deployed Express backend — the feature silently fails only on
device, not on web.

**Why:** `src/lib/apiBase.ts` exists exactly to fix this: `apiUrl(path)` prefixes
`VITE_API_BASE` on native and stays relative on web. `publicWebUrl(path)` does the
same for browser-opened links (e.g. password-reset). This bites late because it
only fails on a real device — web and the Replit preview look fine.

**How to apply:** when reviewing for native/App-Store readiness, grep
`fetch\(['"\`]/api` across `src` — any hit that isn't wrapped in `apiUrl()` is a
native blocker. `VITE_API_BASE`/`VITE_PUBLIC_WEB_URL` are build-time Vite vars
(baked into the bundle); they are set as Replit **shared** env vars, and `.env*`
is gitignored so a committed env file is not an option — CI builds must set them
in the CI environment.
