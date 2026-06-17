---
name: Native push plugin import must be bundled
description: Why push silently no-ops on device — the FCM plugin was loaded via a bare/variable dynamic import that the webview can't resolve.
---

Native push (`@capacitor-firebase/messaging`) registration silently does nothing
on a real device — no iOS "Allow Notifications" prompt, `device_tokens` stays
empty — when `src/lib/push.ts` loads the plugin via a **variable specifier +
`/* @vite-ignore */`** dynamic import.

**Why:** `@vite-ignore` tells Vite NOT to process/bundle the import, and a
variable specifier can't be statically analyzed anyway. The emitted code is a
bare `import('@capacitor-firebase/messaging')`. In the Capacitor webview
(`capacitor://localhost`) a bare module specifier has no import map, so it throws
`Failed to resolve module specifier`. `registerPush()` wraps the import in
try/catch, so the throw is swallowed and push becomes a clean no-op. This pattern
was originally intentional (to keep the web build from resolving an *absent*
plugin), but once the plugin is actually installed it breaks native push.

**How to apply:** load Capacitor plugins with a **literal** dynamic import and
**no** `@vite-ignore`: `await import('@capacitor-firebase/messaging')`. Vite then
bundles it as a lazy chunk that resolves on device. Keep the call behind the
`Capacitor.isNativePlatform()` guard so the chunk is never fetched on web. After
switching to a literal import, TS finally type-checks against the real plugin
types — `addListener` callbacks must match the plugin's event shapes
(`notification.data` is `unknown`, not `Record<string,unknown>`), or overload
resolution fails the build.

A "fresh TestFlight/Codemagic build" does NOT fix this — the bug is in the JS
bundle, so every build made before the import is corrected still no-ops push.
