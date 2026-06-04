---
name: Play already has a registered upload key
description: TreasureTrail's Android app was already enrolled on Google Play with an existing upload key; generating a new keystore won't work without a reset.
---

`com.treasuretrail.hunt` was uploaded to Google Play at least once before, with an
upload key whose certificate SHA1 is `76:E3:EC:DC:3A:2C:2A:78:E8:6B:12:A6:28:0E:AA:04:BC:28:C7:B1`.
That keystore was created **outside this Replit project** — it is NOT in the repo,
git history, or attached_assets.

**Why this matters:** an earlier session generated a brand-new keystore (cert SHA1
`B9:BE:DF:18:...`) on the assumption this was a first-time submission. Google Play
rejects bundles signed with it ("signed with the wrong key"). Play enforces the
originally-registered upload certificate.

**How to apply / recover:**
- Path 1 (no wait): locate the ORIGINAL keystore (user's Windows machine, backups,
  password manager) and verify its SHA1 == 76:E3:EC... before signing.
- Path 2 (original lost): the app uses Play App Signing, so request an **upload key
  reset** in Play Console → Test and release → Setup → App integrity → App signing.
  Submit the new key's public cert (export with
  `keytool -export -rfc -keystore <ks> -alias upload -file upload_certificate.pem`).
  After Google approves (~up to 48h), sign with the new keystore and re-upload.
- Generated-keystore artifacts live under `.local/android-keystore/` (jks, csv,
  upload_certificate.pem) — these are git-ignored.
