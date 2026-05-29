---
name: Firebase messaging iOS launch crash
description: Why @capacitor-firebase/messaging crashes a native iOS app on launch when Firebase config is missing, and the two valid fixes.
---

# @capacitor-firebase/messaging crashes iOS on launch without GoogleService-Info.plist

The iOS plugin configures Firebase **in its own `load()`** (runs at Capacitor
bridge startup, i.e. the instant the app launches), not when your JS calls it.
In `FirebaseMessaging.init()`:

```swift
if FirebaseApp.app() == nil { FirebaseApp.configure() }
UIApplication.shared.registerForRemoteNotifications()
Messaging.messaging().delegate = self
```

`FirebaseApp.configure()` aborts the process if `GoogleService-Info.plist` is not
in the app bundle → immediate "App Crashed" on open.

**Why it surprises:** `src/lib/push.ts` is fully `Capacitor.isNativePlatform()`-
guarded and dynamic-imports the plugin, so it *looks* like nothing runs until
`registerPush()`. Irrelevant — the native plugin self-initializes Firebase at
launch just by being compiled into the build.

**How to apply / fixes:**
- Correct fix (keeps push, constraint-safe): add a real `GoogleService-Info.plist`
  (Firebase project → iOS app with bundle `com.treasuretrail.hunt`) into
  `ios/App/App/` AND reference it in `project.pbxproj` so it lands in the bundle.
  Crash gone; full delivery additionally needs APNs key in Firebase + Push
  Notifications capability/entitlement.
- Fast fix (defers push): remove the `@capacitor-firebase/messaging` dependency so
  the plugin isn't compiled in. Then guard the JS dynamic import with a runtime
  specifier + `/* @vite-ignore */` so the web `vite build` doesn't fail resolving
  the now-absent module.
