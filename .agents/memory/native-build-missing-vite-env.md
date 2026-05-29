---
name: Native build must carry every VITE_ env var
description: Codemagic/native iOS build needs all client VITE_ vars or the app launches to a blank screen
---

Every `import.meta.env.VITE_*` the client reads is baked in at `npm run build` time. The native (Codemagic) build runs its own `npm run build` and does NOT inherit Replit's secrets, so any VITE_ var not explicitly provided to the Codemagic environment is `undefined` in the shipped bundle.

`src/lib/supabase.ts` calls `createClient(supabaseUrl, supabaseAnonKey)` at module import. With those undefined it throws during module evaluation — BEFORE React mounts — so the ErrorBoundary cannot catch it and the app shows a blank screen on launch (looks like a crash but isn't the push crash).

**Rule:** when adding any new `VITE_` var the client consumes, also add it to the Codemagic build environment, or the native app breaks while web keeps working.

**Why:** native build is a separate CI environment; web "works on my machine" because Replit injects the secrets, native doesn't.

**How to apply:** keep the set of VITE_ vars in `codemagic.yaml` (plus its `groups:`) in sync with `rg -o "import\.meta\.env\.VITE_[A-Z0-9_]+" src | sort -u`. Public-ish URLs can be inline `vars:`; keys go in a Codemagic UI env-var group referenced via `environment.groups`.
