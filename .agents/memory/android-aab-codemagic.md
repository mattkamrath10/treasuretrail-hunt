---
name: Android AAB via Codemagic
description: How TreasureTrail produces a Google Play .aab (and why not in Replit).
---

The Replit container has **no JDK and no Android SDK** (`java: command not found`,
empty `ANDROID_HOME`), so it cannot build a `.aab` (or iOS `.ipa`) locally. All
native builds run on **Codemagic** (the same CI used for iOS TestFlight).

**Why:** users repeatedly ask for "the newest .aab/.ipa from the codebase" — the
honest answer is the binary is produced in CI, not in this environment.

**How to apply:**
- `codemagic.yaml` has two workflows: `ios-testflight` and `android-aab`. The
  Android one runs `npm ci` -> `npm run build` -> `npx cap sync android` ->
  `cd android && ./gradlew bundleRelease`, and publishes
  `android/app/build/outputs/**/*.aab` as an artifact.
- Android release signing in `android/app/build.gradle` reads Codemagic's
  `CM_KEYSTORE_PATH/PASSWORD`, `CM_KEY_ALIAS/PASSWORD` env vars, only applied when
  present. Codemagic injects them when an Android keystore is attached via
  `android_signing: [treasuretrail_keystore]` (added in the Codemagic UI under
  Code signing identities -> Android keystores).
- **Google Play registered the Android app as `com.treasuretrailhunt` (NO dot).**
  This is the source of truth (Play Console upload error states it explicitly), so
  `android/app/build.gradle` `applicationId` MUST be `com.treasuretrailhunt`. Do NOT
  "fix" it to the dotted form — Play rejects any other package name. The `namespace`
  (code package where MainActivity lives) is the dotted `com.treasuretrail.hunt` and
  legitimately differs from applicationId; that mismatch is fine and is how the
  accepted June-2 build was structured. iOS bundle id is a separate matter.
- `versionCode` must be bumped for every Play upload (first upload can be 1).
- Web env vars (VITE_SUPABASE_URL/ANON_KEY) come from the Codemagic `supabase`
  group; missing client VITE_ vars = blank-screen launch.
