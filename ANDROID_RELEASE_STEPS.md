# How to Publish a New Version of TreasureTrail to Google Play

Plain-English steps. You build the Android app file (`.aab`) yourself in
**Android Studio** on your PC, then upload it to the **Google Play Console**.
(We do **not** use Codemagic for Android.)

There are three parts: (A) make sure your project has the latest code,
(B) generate the signed app file in Android Studio, (C) upload it to Google Play.

---

## Before you start — two things that must be true

1. **Package name:** `com.treasuretrailhunt` (NO dot before "hunt") — this is
   exactly how your app is registered in Google Play. Do **not** change it to
   `com.treasuretrail.hunt`, or Google will reject the upload.
2. **Version number:** Google rejects any upload that reuses an old number.
   The current build is **versionCode 4 / version 1.0.3**. Next time you
   publish, that number must go up again (5, 6, 7…). See "Bumping the
   version" at the bottom.

---

## Part A — Make sure your project has the latest code

You have two project copies on your PC (`TreasureTrail-source` and
`TT for Android`). Build from the one you've been keeping up to date — and make
sure it has your newest changes before you build, or the app will come out
"old."

- If you update the app code in Replit, download the **newest** source from
  Replit and use that project in Android Studio.
- If web changes were made, the web part has to be refreshed into the Android
  project first (the `npm run build` + `npx cap sync android` step). If you're
  not sure this was done, ask for help with this one step.

---

## Part B — Generate the signed app file (.aab) in Android Studio

1. Open the project in **Android Studio** and let it finish loading (Gradle
   sync) at the bottom.
2. Top menu: **Build → Generate Signed App Bundle / APK…**
3. Choose **Android App Bundle** → **Next**.
4. Select your **keystore** (your signing key — see the warning below), then
   enter the keystore password, the key alias, and the key password → **Next**.
5. Choose the **release** build variant → **Finish**.
6. Wait for it to build. When it's done, a small popup appears in the
   bottom-right: **"App bundle generated successfully"** with a **locate** link.
   Click **locate** to jump straight to the file.

**Where the file is saved** (in case you miss the popup):

```
...\<your project>\app\build\outputs\bundle\release\app-release.aab
```

That `app-release.aab` is the file you upload. (Ignore `intermediary-bundle.aab`
— that's not the one.)

### ⚠️ About the keystore (very important)
You must sign with the **original** upload key you used the first time. If you
sign with a brand-new key, Google rejects it with *"not signed with the correct
key."* If the original key is lost, request an **upload key reset** in Play
Console (Test and release → App integrity → App signing) — don't just make a
new one.

---

## Part C — Upload to Google Play Console

1. Go to **https://play.google.com/console** and sign in.
2. Select your **TreasureTrail** app.
3. (Recommended) In the left menu: **Testing → Internal testing**, so you can
   try it yourself first. To go straight live, use **Production** instead.
4. Click **"Create new release."**
5. Under "App bundles," **upload the `app-release.aab`** you just generated.
6. Fill in **"Release notes"** (a short "What's new in this version").
7. Click **Next / Save**, review any warnings, then
   **"Start rollout"** and confirm.
8. Google reviews it — anywhere from a few hours to a couple of days. You'll
   get an email when it's live.

---

## Bumping the version (for next time)

Every new upload needs a higher **versionCode**. In Android Studio, open
**Gradle Scripts → build.gradle (Module :app)** and change these two lines:

```
versionCode 4        <- increase this by 1 every upload (5, 6, 7…)
versionName "1.0.3"  <- the version people see; bump however you like (1.0.4, 1.1.0…)
```

Save, let Gradle sync, then rebuild (Part B).

---

## Quick reference

| Thing                | Value                                            |
|----------------------|--------------------------------------------------|
| Package name         | `com.treasuretrailhunt`                          |
| Where you build      | Android Studio → Build → Generate Signed App Bundle |
| File you upload      | `app-release.aab`                                |
| File location        | `app\build\outputs\bundle\release\`              |
| Current version      | 1.0.3 (versionCode 4)                            |
| Where you upload     | Google Play Console                              |
