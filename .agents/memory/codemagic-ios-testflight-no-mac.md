---
name: Codemagic iOS TestFlight signing without a Mac
description: How to get a Capacitor iOS app signed + shipped to TestFlight on Codemagic with no Mac and no manual CSR; the exact signing-step recipe that finally worked.
---

# Codemagic iOS → TestFlight with no Mac (TreasureTrail)

Goal achieved: build `com.treasuretrail.hunt` on Codemagic `mac_mini_m2` and upload to
App Store Connect / TestFlight from a Windows PC, no Apple CSR, no local Mac.

## The working signing recipe (codemagic.yaml `Set up code signing` step)
Order matters; each command's accepted flags matter more:
1. `keychain initialize`
2. Generate a private key yourself so Apple can ISSUE the distribution cert (this is
   the part that replaces a Mac-made CSR):
   `openssl genrsa -out /tmp/cert_private_key.pem 2048`
3. `app-store-connect fetch-signing-files "$BUNDLE_ID" --type IOS_APP_STORE --certificate-key @file:/tmp/cert_private_key.pem --create`
   — `--certificate-key` IS valid here and is required, or you get
   "Cannot save Signing Certificates without certificate private key".
4. `keychain add-certificates`  ← **NO `--certificate-key` flag**; that command does
   not accept it ("keychain: error: unrecognized arguments: --certificate-key").
   It auto-detects the cert that fetch-signing-files just saved.
5. `xcode-project use-profiles --project "$CM_BUILD_DIR/$XCODE_PROJECT"`

**Why:** flags are per-command in codemagic-cli-tools. `fetch-signing-files` takes
`--certificate-key`; `keychain add-certificates` does not. Mixing them up was the
final blocker after everything else already worked.

## Errors seen, in order, and what each really meant
- "No matching profiles found" → don't hardcode an `ios_signing` block; let
  fetch-signing-files `--create` make the profile.
- "'App' requires a provisioning profile" → set CODE_SIGN_STYLE/ProvisioningStyle
  to Manual in project.pbxproj and run `use-profiles` to attach.
- "Cannot save Signing Certificates without certificate private key" → no key to
  issue the cert; generate one and pass `--certificate-key` to fetch-signing-files.
- "401 Authentication credentials are missing or invalid" → NOT code. The App Store
  Connect API key entered in the Codemagic UI (Settings → Integrations → Developer
  Portal → Manage keys) was wrong. Fix = delete + re-add the key, paste Issuer ID
  (copy, never type), Key ID, re-upload the exact `AuthKey_<KEYID>.p8`.
- "keychain: unrecognized arguments: --certificate-key" → remove that flag from
  `keychain add-certificates` (see recipe).

## Recurring 409 cert-limit (will keep coming back until key is persisted)
Generating a fresh private key every run creates a NEW Apple Distribution cert per
build. Apple caps distribution certs at 2, so after ~2 builds every build dies at the
signing step with: `POST .../v1/certificates returned 409: You already have a current
Distribution certificate or a pending certificate request.`
- **Quick unblock:** revoke a Distribution cert at developer.apple.com → Certificates,
  then re-run the build. Works, but RECURS every couple of builds.
- **Permanent fix:** set ONE private key as Codemagic env var `CERTIFICATE_PRIVATE_KEY`
  (put it in the already-loaded `supabase` group, or any group referenced under
  `environment.groups`). The signing step now reuses it when present (`if [ -n
  "$CERTIFICATE_PRIVATE_KEY" ]`) so the same single cert is reused forever and no new
  cert is created. Still must revoke existing certs ONCE to clear the cap before the
  first persisted-key build.
- **Why:** `fetch-signing-files --create` only creates a cert when none matches the
  given key; same key in = same cert reused = no 409.

## Likely next manual step after first upload
TestFlight may show "Missing Compliance" (export encryption). Either answer the
encryption question = No in App Store Connect (one click), or add
`ITSAppUsesNonExemptEncryption = NO` to ios/App/App/Info.plist for future builds.
