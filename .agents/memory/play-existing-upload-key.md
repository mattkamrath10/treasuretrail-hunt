---
name: Play already has a registered upload key
description: TreasureTrail's Android app was already enrolled on Google Play with an existing upload key; generating a new keystore won't work without a reset.
---

The Google Play app is registered under package name **`com.treasuretrailhunt`**
(NO dot before "hunt") — confirmed by the Play Console "temporary app name
'com.treasuretrailhunt (unreviewed)'" banner and a successful internal-testing
upload of version 1 (1.0.0) on 2026-06-02. NOTE: `android/app/build.gradle`
`namespace` is `com.treasuretrail.hunt` and `capacitor.config.ts` appId is
`com.treasuretrail.hunt`, but the `applicationId` (the only one Play checks) MUST
stay `com.treasuretrailhunt`. Do not "fix" the applicationId to add the dot —
that mismatch is intentional and was proven to upload. It was uploaded with an
upload key whose certificate SHA1 is `76:E3:EC:DC:3A:2C:2A:78:E8:6B:12:A6:28:0E:AA:04:BC:28:C7:B1`.
That keystore was created **outside this Replit project** — it is NOT in the repo,
git history, or attached_assets.

**Why this matters:** an earlier session generated a brand-new keystore (cert SHA1
`B9:BE:DF:18:...`) on the assumption this was a first-time submission. Google Play
rejects bundles signed with it ("signed with the wrong key"). Play enforces the
originally-registered upload certificate.

**The real upload key's alias is `key0`, NOT `SRC`.** Read it definitively from a
genuinely-correct signed bundle: the AAB's `META-INF/<ALIAS>.RSA` filename is the
jarsigner alias upper-cased (`KEY0.RSA` ⇒ alias `key0`). Don't trust earlier
hand-notes guessing the alias.

To identify ANY keystore without its password: certs in a JKS are not encrypted by
the store password (only private keys + the HMAC are), so a manual JKS parser can
print alias + cert SHA1. A `.jks` file whose magic is `30 82…` is actually a
**PKCS12** (certs there ARE password-encrypted, so you can only read the
friendlyName/alias via `strings -e b`, not the cert SHA1).
`attached_assets/treasuretrail-upload_*.jks` is a PKCS12 with alias `key0` (the real
keystore) but its password is unknown/unrecoverable.

**How to apply / recover:**
- Path 1 (no wait): locate the ORIGINAL keystore and verify SHA1 == 76:E3:EC...; the
  password must be the one it was created with (Android Studio "Remember passwords"
  only re-fills the password for the EXACT keystore file path it was saved against —
  you cannot transplant one keystore's password onto another file).
- Path 2 (TAKEN 2026-06-09 — original password lost): requested **upload key reset**
  in Play Console → Test and release → Setup → App integrity → App signing. Generated
  a fresh keystore + `upload_certificate.pem` (`keytool -export -rfc ... -alias upload`)
  for the user to submit. New upload key SHA1
  `4A:B1:B0:61:FF:7C:15:F8:E0:84:85:FB:40:6E:CC:FE:38:B4:DF:6E`, alias `upload`,
  valid to 2053. After Google approves (~48h) sign with it and re-upload. Reset is
  ~once/year, so this new keystore must be backed up.
- Generated-keystore artifacts: `.local/android-keystore/` (the WRONG B9:BE:DF one)
  and `android-upload-key-reset/` (the NEW 4A:B1:B0 one). The reset bundle is also
  served at `public/upload-key-reset.zip` for download — remove it once the user
  confirms they've saved it.
