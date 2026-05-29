# TreasureTrail — App Store & Google Play Submission Guide

Packaging-readiness audit + native build instructions + store checklists.
Companion to `CAPACITOR_PUSH_SETUP.md` (push/FCM setup). No feature changes —
this document is an assessment + runbook only.

App identity (from `capacitor.config.ts`):
- **App ID / Bundle ID:** `com.treasuretrail.hunt`
- **App name:** `TreasureTrail`
- **Web assets dir:** `dist`

---

## 0. TL;DR — Can we package today?

**Closer — the backend deployment blocker is now resolved in config.** Earlier
passes fixed the code-level packaging issues (router, push-tap nav, password-reset
URL, platform-aware API base). This pass made the Express server deployment-ready
and switched the deployment from `static` to **single-domain Autoscale**:

> ✅ **The Express server now serves both the web app and `/api/...` from one
> origin.** It binds `0.0.0.0` on the deployment's `PORT`, serves the built `dist/`
> SPA (with deep-link fallback), and `.replit` is set to `deploymentTarget =
> "autoscale"` (build `npm run build`, run `npm run start`). Once the owner clicks
> **Publish**, account deletion (`/api/account/delete`), push trigger, and the AI
> endpoints become live, and `VITE_API_BASE` can point at the single `.replit.app`
> domain. See [§5](#5-authentication-inside-capacitor) and [§8](#8-blockers).

**Remaining hard work is native build packaging** (generate `ios/`+`android/`
projects, app icons/splash) — see [§8 Blockers](#8-blockers).

### Fixed in this pass (deployment)
- ✅ **Server deployment-ready:** binds `0.0.0.0` on `process.env.PORT`, serves
  `dist/` + SPA fallback for non-API GETs. `server/index.ts`.
- ✅ **Single-domain Autoscale:** `.replit` `deploymentTarget = "autoscale"`,
  `build = npm run build`, `run = npm run start`. One origin for web + API.

### Fixed in earlier passes (code)
- ✅ **Router:** platform-conditional — `HashRouter` on native (Capacitor),
  `BrowserRouter` on web (web share links unchanged). `src/main.tsx`.
- ✅ **Push tap:** navigates via the hash (`#/event/:id`) so taps resolve in the
  native webview instead of 404-ing. `src/lib/push.ts`.
- ✅ **Password reset:** redirect uses the public https web domain via
  `publicWebUrl()` instead of `capacitor://localhost`. `src/pages/Login.tsx`.
- ✅ **API base:** `apiUrl()` is platform-aware (web always relative; native uses
  `VITE_API_BASE`). New `publicWebUrl()` for browser-opened links.
  `src/lib/apiBase.ts`.
- ✅ **Route detection:** cold-load public-share detection now reads the hash on
  native. `src/App.tsx`.

---

## 1. Capacitor configuration — VERIFIED

| Item | Status | Notes |
| --- | --- | --- |
| `@capacitor/core`, `cli`, `ios`, `android` installed | ✅ | v8.3.4 |
| `@capacitor-firebase/messaging` installed | ✅ | v8.2.0 (push) |
| `capacitor.config.ts` present | ✅ | appId/appName/webDir all set |
| `webDir: 'dist'` matches Vite output | ✅ | `npm run build` → `dist/` |
| Native `ios/` project generated | ❌ | not yet — `npx cap add ios` |
| Native `android/` project generated | ❌ | not yet — `npx cap add android` |
| Helper plugins (splash, status bar, app, keyboard) | ⚠️ | not installed — recommended below |

**Recommended extra plugins** (quality-of-life, not strictly required):
```bash
npm i @capacitor/splash-screen @capacitor/status-bar @capacitor/app @capacitor/keyboard
```
- `@capacitor/app` is needed if you want **deep links / universal links** (e.g. a
  push or shared URL opening a specific screen from outside the app).
- `@capacitor/status-bar` lets you control the status bar color to match the
  `#eab308` theme.

---

## 2. Native iOS & Android project instructions

> Run from the project root. iOS steps require a **Mac with Xcode**.

```bash
# 1. Build the web bundle Capacitor will wrap
npm run build

# 2. Add the native projects (one-time)
npx cap add ios
npx cap add android

# 3. Copy the web build + plugins into the native projects
npx cap sync

# 4. Open the native IDEs
npx cap open ios       # Xcode
npx cap open android   # Android Studio
```

**Every time you change web code or env**, repeat:
```bash
npm run build && npx cap sync
```

Optional convenience scripts to add to `package.json` (`scripts`):
```json
"cap:sync": "npm run build && npx cap sync",
"cap:ios": "npm run build && npx cap sync && npx cap open ios",
"cap:android": "npm run build && npx cap sync && npx cap open android"
```

**Critical native build settings**
- **iOS:** set the Signing Team, confirm Bundle Identifier `com.treasuretrail.hunt`,
  set Version (e.g. `1.0.0`) and Build (`1`). Add the **Push Notifications**
  capability and **Background Modes → Remote notifications** (for FCM). Drop in
  `GoogleService-Info.plist` (see `CAPACITOR_PUSH_SETUP.md`).
- **Android:** confirm `applicationId` `com.treasuretrail.hunt`, set
  `versionCode`/`versionName`, target **SDK 34+** (Play requirement), add
  `google-services.json`, and configure **Play App Signing** (upload keystore).

---

## 3. App icons & splash screen — ACTION REQUIRED

**Current state:** only **web/PWA** icons exist in `public/` (`icon-192.png`,
`icon-512.png`, `apple-touch-icon.png`, favicons). These are **not** native app
icons and will not satisfy the stores.

**What the stores require**
- **iOS:** an App Icon set including **1024×1024** (App Store) plus all device
  sizes; no alpha/transparency on the 1024 marketing icon.
- **Android:** an **adaptive icon** (separate foreground + background layers) at
  all mipmap densities, plus a **512×512** Play Store icon.
- **Splash screen:** a high-res source (recommended **2732×2732**, centered logo
  on solid background) for the launch screen.

**Recommended generation flow** — create one master `icon.png` (1024×1024) and one
`splash.png` (2732×2732) under `resources/`, then:
```bash
npm i -D @capacitor/assets
mkdir resources   # put icon.png (1024x1024) + splash.png (2732x2732) here
npx capacitor-assets generate            # all icons + splashes for both platforms
```
This populates the iOS asset catalog and Android mipmaps automatically. Re-run
after changing artwork, then `npx cap sync`.

---

## 4. Routing inside a Capacitor shell — ✅ FIXED

**Original problem:** `src/main.tsx` used **`BrowserRouter`** (HTML5 History API).
In a Capacitor webview the app is served from `capacitor://localhost` (iOS) or
`http://localhost` (Android) with **no server-side SPA fallback**, so any hard
navigation / reload to a non-root path (e.g. the push-tap handler loading
`/event/:id`) would request a file that doesn't exist → blank screen. The web SPA
fallback (`public/_redirects`, `dist/404.html`) is hosting-only and does nothing
natively.

**Fix applied — platform-conditional router** (`src/main.tsx`):
```tsx
const Router = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter;
```
- **Native →** `HashRouter`: every route is `index.html#/…`, which always resolves
  inside the webview (bulletproof on cold start, reload, and deep nav).
- **Web →** `BrowserRouter` (unchanged): clean URLs, and existing share links like
  `origin/listing/:id` keep resolving via the host SPA fallback. This avoids a
  regression that a blanket `HashRouter` swap would cause (all `window.location`
  share-URL generators would have needed `/#/` rewriting).

**Supporting fixes**
- `src/lib/push.ts` — notification tap now navigates via the hash
  (`window.location.assign('#/event/:id')`); this handler only runs on native.
- `src/App.tsx` — `currentRoutePath()` reads the route from the hash on native and
  `pathname` on web, so cold-load public-share detection works under both routers.

> Note: `vite.config.ts` sets no `base` (defaults to `/`), which is correct for
> Capacitor — assets resolve against the localhost root. No change needed.

**Routes audited** (all should be verified post-fix): `/`, `/home`, `/flash-finds`,
`/sell`, `/sell/wanted`, `/wanted`, `/wanted/:id`, `/rare-radar`, `/auctions`,
`/messages`, `/messages/:id`, `/alerts`, `/marketplace`, `/pro`, `/safety`,
`/privacy`, `/terms`, `/community`, `/events`, `/following`, `/seller`,
`/seller/analytics`, `/seller/new`, `/seller/event/:id`, `/event/:id`, `/live`,
`/achievements`, `/profile`, `/profile/:username`, `/u/:username`, `/find/:id`,
`/listing/:id`, `*` (404).

> Note: `vite.config.ts` sets no `base`, which defaults to `/`. That is fine for
> Capacitor (assets resolve against the localhost root). No change needed there.

---

## 5. Authentication inside Capacitor

**Finding:** auth is **email/password only** (`signInWithPassword`, `signUp` in
`src/context/AuthContext.tsx`). There is **no OAuth / social login**
(`signInWithOAuth` is not used).

| Aspect | Status | Notes |
| --- | --- | --- |
| Email/password sign-in & sign-up | ✅ | Plain Supabase API calls — work in webview |
| OAuth redirect / deep-link config | ✅ n/a | No social login, so no redirect handling needed |
| Sign in with Apple required? | ✅ No | Apple Guideline 4.8 only applies if you offer 3rd-party social login |
| Session persistence | ⚠️ verify | `createClient` uses defaults (webview `localStorage`). Verify the session survives an app cold-start; consider a `@capacitor/preferences` storage adapter for robustness |
| **Password reset** | ✅ **fixed** | `Login.tsx` now uses `publicWebUrl('/login')`. Web → real origin (unchanged); native → the configured public web domain instead of `capacitor://localhost`. Requires `VITE_PUBLIC_WEB_URL` (or `VITE_API_BASE`) at native build time |
| **API base URL for `/api`** | ✅ **ready** | `apiUrl()` uses `VITE_API_BASE` on native only. The server is now deployed-ready and the deployment is Autoscale; set `VITE_API_BASE` to the published `.replit.app` domain after the first publish |

### ✅ Deployment architecture — resolved (single-domain Autoscale)

`.replit` is now `deploymentTarget = "autoscale"` (build `npm run build`, run `npm
run start`). The Express server (`server/index.ts`) binds `0.0.0.0` on the
deployment's `PORT` and serves **both** the `dist/` web bundle (with SPA deep-link
fallback) **and** the `/api/...` routes from one origin. Consequences:

- **Account deletion works in production once published.** `deleteAccount()` POSTs
  to `/api/account/delete`, which is now a live handler backed by the
  service-role key (present as a repl secret, inherited by the deployment).
  Satisfies **Apple Guideline 5.1.1(v)**.
- **Native has a single host for `VITE_API_BASE`.** The published `.replit.app`
  domain serves both the web app and `/api/...`, so push trigger, AI scan, and
  account deletion all resolve in the native app against one URL.

**Remaining owner steps (after clicking Publish):**
- Set `VITE_API_BASE` = the published https URL (serves both web + `/api`).
- `VITE_PUBLIC_WEB_URL` is optional now — since web and API share the host,
  `VITE_API_BASE` alone covers the reset link.
- Rebuild + `npx cap sync` so the value bakes into the native bundle.

> CORS is permissive (`server/index.ts` uses `cors()`, Bearer-token auth, no
> cookies), so the native localhost origin is compatible. Locally verified:
> `npm run start` serves the SPA, the deep-link fallback, and `/api/health`,
> `/api/account/delete` (401 unauth), `/api/ai-scan` (401 unauth), `/api/push/go-live`
> from one port.

---

## 6. App Store (iOS) submission checklist

**Accounts & tooling**
- [ ] Apple Developer Program membership ($99/yr), Mac + Xcode
- [ ] App record created in App Store Connect with bundle ID `com.treasuretrail.hunt`

**Build config**
- [ ] `HashRouter` fix applied (§4) and `VITE_API_BASE` set (§5)
- [ ] App icons + splash generated (§3); 1024×1024 marketing icon, no alpha
- [ ] Version `1.0.0` / Build `1`; Deployment target iOS 14+ (Capacitor 8 baseline)
- [ ] Push capability + Background Modes (Remote notifications); `GoogleService-Info.plist` added; APNs key uploaded to Firebase (see `CAPACITOR_PUSH_SETUP.md`)
- [ ] **Encryption compliance:** add `ITSAppUsesNonExemptEncryption = NO` to Info.plist (HTTPS-only, no custom crypto)
- [ ] **Privacy manifest** `PrivacyInfo.xcprivacy` (iOS 17+): declare required-reason APIs (e.g. UserDefaults) + data types collected
- [ ] Safe-area / notch: verify content respects safe areas (status bar style is `black-translucent`; confirm `viewport-fit=cover` + safe-area insets render correctly)

**App Store Connect metadata**
- [ ] Screenshots: 6.7" + 6.5" iPhone (and 5.5" if supporting older), no status-bar mockups violating guidelines
- [ ] App description, keywords, support URL, marketing URL
- [ ] **Privacy Policy URL** → `https://<your-domain>/privacy` (in-app: Profile → ⚙️ Settings → Privacy Policy)
- [ ] **Privacy "Nutrition Label"**: declare data collected (account info, user content, identifiers/device token for push)
- [ ] **Account deletion** present ✅ (Guideline 5.1.1(v)) — Profile → ⚙️ Settings → Delete Account
- [ ] Age rating questionnaire; demo account credentials for review (since content is behind login)
- [ ] Content rights / UGC moderation note (app has user-generated listings/community) — describe moderation + reporting in review notes

**Pre-submit**
- [ ] TestFlight internal build runs on a real device: launch, login, all tabs, push receipt + tap routing
- [ ] No private APIs, no broken links, no placeholder content

---

## 7. Google Play (Android) submission checklist

**Accounts & tooling**
- [ ] Google Play Developer account ($25 one-time), Android Studio
- [ ] App created in Play Console with package `com.treasuretrail.hunt`

**Build config**
- [ ] `HashRouter` fix applied (§4) and `VITE_API_BASE` set (§5)
- [ ] Adaptive icon + 512×512 Play icon + splash generated (§3)
- [ ] `versionCode` 1 / `versionName` 1.0.0; **target SDK 34+**
- [ ] `google-services.json` added; FCM configured (see `CAPACITOR_PUSH_SETUP.md`)
- [ ] `POST_NOTIFICATIONS` runtime permission handled (Android 13+; the messaging plugin's `requestPermissions()` covers this)
- [ ] **Play App Signing** enabled; signed **AAB** (`.aab`) produced, not APK

**Play Console listing**
- [ ] Store listing: title, short + full description, feature graphic (1024×500), phone screenshots
- [ ] **Privacy Policy URL** → `https://<your-domain>/privacy`
- [ ] **Data safety form**: declare collected data (account, user content, device identifiers for push) + that data is encrypted in transit
- [ ] Content rating questionnaire (IARC)
- [ ] Target audience & content (not directed at children); UGC + moderation declaration
- [ ] **Account deletion**: provide the in-app path (Profile → Settings → Delete Account) and, per Play policy, a **web URL** for account/data deletion requests

**Pre-submit**
- [ ] Internal testing track build runs on a real device: launch, login, all tabs, push receipt + tap routing
- [ ] No crashes in pre-launch report

---

## 8. Blockers (what prevents packaging today)

| # | Severity | Blocker | Status / Fix |
| --- | --- | --- | --- |
| 1 | 🔴 High | **No API server in production** (`deploymentTarget = "static"`) → native `/api` has no host; account deletion broken in prod | ✅ **Resolved** — server is deployment-ready (binds `0.0.0.0`/`PORT`, serves `dist/` + `/api`); `.replit` switched to single-domain **Autoscale**. Owner just clicks **Publish** (§5) |
| 2 | 🔴 High | **`BrowserRouter`** broke deep routes + push-tap nav in the webview | ✅ **Fixed** — platform-conditional router + hash push-tap (§4) |
| 3 | 🔴 High | **No native projects** (`ios/`, `android/`) generated | ⏳ `npx cap add ios && npx cap add android` (§2) |
| 4 | 🔴 High | **No native app icons / splash** (only web PWA icons exist) | ⏳ Generate with `@capacitor/assets` from a 1024² icon + 2732² splash (§3) |
| 5 | 🟠 Med | **`VITE_API_BASE`** not set for native | ✅ Code ready (platform-aware) + server now deployed-ready; ⏳ set value to the published domain after first Publish (§5) |
| 6 | 🟠 Med | **Password reset link** used `capacitor://localhost` → unopenable in email | ✅ **Fixed** — `publicWebUrl('/login')` (§5); set `VITE_PUBLIC_WEB_URL` at native build |
| 7 | 🟠 Med | **Firebase native files / APNs** not yet added | ⏳ Follow `CAPACITOR_PUSH_SETUP.md`; add `GoogleService-Info.plist` + `google-services.json` |
| 8 | 🟡 Low | Session persistence relies on webview `localStorage` default | ⏳ Verify cold-start session; optionally add `@capacitor/preferences` |
| 9 | 🟡 Low | Safe-area handling for notch (`viewport-fit=cover`) | ⏳ Verify on a notched device after first build |

**Not blockers (already good):** account-deletion **UI + endpoint exist** (Apple
5.1.1(v)) — they only need the server deployed (#1); Privacy & Terms pages exist
at `/privacy` and `/terms`; no OAuth so no Sign-in-with-Apple requirement and no
deep-link redirect plumbing needed; CORS permits the native origin; `webDir`
matches the Vite build output; web build verified (`tsc` + `vite build` clean,
app renders with no regression after the router change).
