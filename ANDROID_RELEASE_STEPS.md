# How to Publish a New Version of TreasureTrail to Google Play

Plain-English steps. You do **not** need Android Studio — your app is built
in the cloud by **Codemagic**, and then you upload the result to the
**Google Play Console**.

There are three parts: (A) get your latest code ready, (B) build the app
file on Codemagic, (C) upload it to Google Play.

---

## Before you start — two things that must be true

1. **Package name:** `com.treasuretrail.hunt` (already set — do not change it).
2. **Version number:** Google rejects any upload that reuses an old number.
   The current build is **versionCode 4 / version 1.0.3**. Next time you
   publish, that number must go up again (5, 6, 7…). See "Bumping the
   version" at the bottom.

---

## Part A — Make sure your latest changes are in the build source

Codemagic builds from your connected code repository, **not** from this
editor directly. So before building, make sure your most recent changes are
pushed/synced to that repository.

- If you use the Git panel here, commit and push your latest changes.
- If you're unsure whether it's connected/pushed, ask for help with this one
  step — it's the most common reason a build comes out "old."

---

## Part B — Build the app file (.aab) on Codemagic

1. Go to **https://codemagic.io** and sign in.
2. Open your **TreasureTrail** app.
3. Find the workflow named **"Android AAB (TreasureTrail)"**.
4. Make sure it's set to build from the correct branch (usually `main`).
5. Click **"Start new build."**
6. Wait ~10–15 minutes. When it finishes (green check), open the build and
   go to the **Artifacts** tab.
7. **Download the `.aab` file.** This is your app. Save it somewhere you can
   find it.

### One-time setup (only if a build fails for "signing")
Codemagic needs your **upload keystore** (your app's signing key) stored
under the exact name **`treasuretrail_keystore`**:
Codemagic → Code signing identities → Android keystores → Add key.

⚠️ **VERY IMPORTANT:** It must be the **original** signing key you used the
first time you published TreasureTrail. If you upload a brand-new key, Google
will reject the build with an error like *"not signed with the correct key."*
If you've lost the original key, you'll need to request an **upload key reset**
from Google Play support — don't just make a new one.

---

## Part C — Upload to Google Play Console

1. Go to **https://play.google.com/console** and sign in.
2. Select your **TreasureTrail** app.
3. (Recommended first time) In the left menu: **Testing → Internal testing**,
   so you can try it yourself before the public sees it. To go straight live,
   use **Release → Production** instead.
4. Click **"Create new release."**
5. Under "App bundles," **upload the `.aab` file** you downloaded from Codemagic.
6. Fill in **"Release notes"** (a short "What's new in this version").
7. Click **Next / Save**, review any warnings, then
   **"Start rollout to Production"** (or to your testing track) and confirm.
8. Google reviews it — this can take anywhere from a few hours to a couple of
   days. You'll get an email when it's live.

---

## Bumping the version (for next time)

Every new upload needs a higher **versionCode**. This lives in
`android/app/build.gradle`:

```
versionCode 4        <- increase this by 1 every upload (5, 6, 7…)
versionName "1.0.3"  <- the version people see; bump however you like (1.0.4, 1.1.0…)
```

Change those two lines, push the code, then rebuild on Codemagic (Part B).

---

## Quick reference

| Thing                | Value                          |
|----------------------|--------------------------------|
| Package name         | `com.treasuretrail.hunt`       |
| Codemagic workflow   | Android AAB (TreasureTrail)    |
| Keystore name        | `treasuretrail_keystore`       |
| Current version      | 1.0.3 (versionCode 4)          |
| File you upload      | the `.aab` from Codemagic      |
| Where you upload     | Google Play Console            |
