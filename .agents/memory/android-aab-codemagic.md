---
name: Android AAB built locally in Android Studio (NOT Codemagic)
description: How TreasureTrail's Google Play .aab is actually produced, and the package-name rule.
---

The user builds the Google Play `.aab` **locally in Android Studio on their
Windows PC** — NOT on Codemagic. They do not have an active Codemagic
subscription for Android. Do not tell them to "start a build on Codemagic" or
"download the .aab from the Codemagic Artifacts tab" for Android; that is wrong
and frustrates them.

**Why:** confirmed directly by the user (2026-06-05) and by their local file
layout (`Documents\TreasureTrail-source\...` and `Documents\TT for Android\...`
each containing `app-release.aab` + `intermediary-bundle.aab` from Gradle).

**How to apply:**
- AAB is generated via Android Studio: **Build → Generate Signed App Bundle /
  APK → Android App Bundle → (select original keystore) → release → Finish**.
- Output lands at `<project>\app\build\outputs\bundle\release\app-release.aab`
  (that's the upload file; `intermediary-bundle.aab` is NOT). After a build,
  Android Studio shows a bottom-right "locate" link to it. A freshly-built file
  often won't show in Windows *Documents* search yet — browse to the folder.
- The Replit container has no JDK/Android SDK, so it cannot build the `.aab`
  here regardless. `codemagic.yaml` still contains an `android-aab` workflow,
  but it is NOT the path the user uses — leave it, don't point them at it.
- **Google Play registered the app as `com.treasuretrailhunt` (NO dot).** This
  is the source of truth (Play Console "temporary app name
  'com.treasuretrailhunt'" banner + accepted v1 upload 2026-06-02), so
  `android/app/build.gradle` `applicationId` MUST be `com.treasuretrailhunt`.
  Do NOT "fix" it to the dotted form. `namespace` is the dotted
  `com.treasuretrail.hunt` and legitimately differs from applicationId.
- `versionCode` must increase for every Play upload (gaps are fine).
- iOS/TestFlight may still be a separate Codemagic matter; this note is Android.
