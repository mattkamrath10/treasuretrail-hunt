---
name: Capacitor packaging constraints
description: Native (Capacitor) packaging gotchas for this app — router choice, API base, and the static-deployment/no-server blocker.
---

# Capacitor packaging constraints

## Production has NO API server (static deployment)
`.replit` uses `deploymentTarget = "static"` — only the `dist/` web bundle is
published. The Express server (`server/index.ts`, run by `npm run dev`/`start`)
**does not run in production**.

**Why it matters:** every `/api/...` call has no production host. Concretely,
account deletion (`/api/account/delete`, an Apple 5.1.1(v) requirement) silently
fails in prod, and the native app has nowhere valid to point `VITE_API_BASE`.

**How to apply:** before shipping native (or relying on any `/api` feature in
prod), the server must be deployed (Autoscale / Reserved VM, or separately).
Then set `VITE_API_BASE` (server https) and `VITE_PUBLIC_WEB_URL` (web app https)
and rebuild + `npx cap sync`. Don't assume `/api` works in prod just because it
works in dev (dev runs web+api together via `concurrently`).

## Router must be platform-conditional, not blanket HashRouter
Native webview serves bundled files from `capacitor://localhost` with no
SPA fallback, so `BrowserRouter` deep routes / reloads 404. But a blanket
`HashRouter` swap breaks the **web** side: many pages build share URLs as
`window.location.origin + '/path'` and would need `/#/` rewriting, and
pathname-based route detection would miss.

**Decision:** choose the router by platform — `HashRouter` on native,
`BrowserRouter` on web (`Capacitor.isNativePlatform()` in `src/main.tsx`). Any
code that reads the current route from the URL (not via React Router) must read
the **hash on native, pathname on web**, and any native-only hard navigation
must use the `#/route` form.

**Why:** keeps web behavior identical (zero share-link regression) while making
native routing reliable. Web share links stay path-based and resolve via the
host SPA fallback (`public/_redirects`, `dist/404.html`).
