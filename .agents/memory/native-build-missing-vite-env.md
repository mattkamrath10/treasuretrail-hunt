---
name: Native build must carry every VITE_ env var
description: Codemagic/native AND local Android-Studio builds need all client VITE_ vars or the app launches to a config-missing/blank screen
---

**LOCAL (Android Studio on the user's PC) builds hit this too.** `build-android.bat` runs `npm run build` on the user's machine, which has NO Replit secrets and (previously) no `.env`, so the AAB shipped with blank Supabase config and on-device showed the `main.tsx` "App configuration missing" screen. Fix shipped: a committed **`.env.production`** at repo root holding `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE=https://treasuretrail-hunt.com`, `VITE_PUBLIC_WEB_URL=https://treasuretrail-hunt.com`. Vite loads `.env.production` in production mode (`npm run build`), so ANY machine bakes them in. These four are client-public (anon key/URL ship in every web bundle; API base is ignored on web) — safe to commit. NEVER put `SUPABASE_SERVICE_ROLE_KEY` in a VITE_/`.env.production` file. Verify a built AAB carries config: `rg -c "supabase\.co|treasuretrail-hunt\.com" <unzipped>/base/assets/**/*.js`.



Every `import.meta.env.VITE_*` the client reads is baked in at `npm run build` time. The native (Codemagic) build runs its own `npm run build` and does NOT inherit Replit's secrets, so any VITE_ var not explicitly provided to the Codemagic environment is `undefined` in the shipped bundle.

`src/lib/supabase.ts` calls `createClient(supabaseUrl, supabaseAnonKey)` at module import. With those undefined it throws during module evaluation — BEFORE React mounts — so the ErrorBoundary cannot catch it and the app shows a blank screen on launch (looks like a crash but isn't the push crash).

**Rule:** when adding any new `VITE_` var the client consumes, also add it to the Codemagic build environment, or the native app breaks while web keeps working.

**Why:** native build is a separate CI environment; web "works on my machine" because Replit injects the secrets, native doesn't.

**How to apply:** keep the set of VITE_ vars in `codemagic.yaml` (plus its `groups:`) in sync with `rg -o "import\.meta\.env\.VITE_[A-Z0-9_]+" src | sort -u`. Public-ish URLs can be inline `vars:`; keys go in a Codemagic UI env-var group referenced via `environment.groups`.
