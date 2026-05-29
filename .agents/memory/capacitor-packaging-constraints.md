---
name: Capacitor packaging constraints
description: Native (Capacitor) packaging gotchas for this app — router choice, API base, and the static-deployment/no-server blocker.
---

# Capacitor packaging constraints

## Production = single-domain Autoscale (one server serves dist + /api)
`.replit` is `deploymentTarget = "autoscale"` (build `npm run build`, run `npm run
start`). The Express server (`server/index.ts`) serves BOTH the `dist/` SPA and
the `/api/...` routes from one origin. It binds `0.0.0.0` on
`process.env.PORT ?? AI_SERVER_PORT ?? 3001` — Autoscale injects `PORT`; dev has
neither set so it falls to `3001`, which is exactly what the Vite `/api` proxy
targets, so the dev concurrently(web:5000 + api:3001) setup is unaffected.

**Why it matters:** prod was previously `static`, so `/api` had no host and
account deletion (`/api/account/delete`, Apple 5.1.1(v)) was broken in prod. Now
one deployment + one bill, no CORS, and native points `VITE_API_BASE` at the
single published `.replit.app` domain.

**How to apply (gotchas):**
- Static-serve block is guarded by `fs.existsSync(distDir)` and lives AFTER all
  `/api` routes; SPA fallback only fires for non-API GET/HEAD (`req.path === '/api'
  || startsWith('/api/')` is excluded) so API 404s stay JSON.
- After first Publish, set `VITE_API_BASE` to the published https URL, then
  rebuild + `npx cap sync`. `VITE_PUBLIC_WEB_URL` is optional (same host).
- Deployment inherits repl secrets (SUPABASE_SERVICE_ROLE_KEY etc.), so account
  deletion + admin grants work in prod automatically. Push still no-ops until
  `FIREBASE_SERVICE_ACCOUNT` is set (separate optional feature).

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
