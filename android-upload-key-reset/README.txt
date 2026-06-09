TreasureTrail - New Android Upload Key (Google Play upload-key reset)
====================================================================

WHAT THIS IS
Your old upload key got lost/confusing. These files let you register a brand-new
upload key with Google Play, then sign all future updates with it.
Your LIVE app and its users are NOT affected - Google's app-signing key never
changes. This is Android/Google only and does not touch your Apple/iOS review.

FILES IN THIS ZIP
- treasuretrail-upload-NEW.jks   <- your new keystore  (KEEP SAFE - BACK IT UP)
- upload_certificate.pem         <- give THIS file to Google in the reset request

CREDENTIALS  (save these in a password manager RIGHT NOW)
- Keystore password : 83BLKxHcrb5KnxWvXP
- Key password      : 83BLKxHcrb5KnxWvXP   (same)
- Key alias         : upload

New key fingerprint (for your reference):
- SHA1: 4A:B1:B0:61:FF:7C:15:F8:E0:84:85:FB:40:6E:CC:FE:38:B4:DF:6E


STEP 1 - Request the upload key reset in Play Console
-----------------------------------------------------
1. Go to play.google.com/console  ->  select your app (com.treasuretrailhunt)
2. Left menu: Test and release  ->  Setup  ->  App integrity
3. Open the "App signing" panel.
4. Find "Request upload key reset"  (it may be under the "Upload key
   certificate" area or a help link "I lost my upload key").
5. Choose the reason (lost / no longer have access to my key).
6. UPLOAD the file:  upload_certificate.pem
7. Submit. Google takes up to ~48 hours to activate the new upload key
   (you'll get a confirmation email).


STEP 2 - After Google confirms, sign your app with the NEW key
--------------------------------------------------------------
1. Put treasuretrail-upload-NEW.jks somewhere safe on your PC (e.g. Documents),
   and back it up in a second place too.
2. In Android Studio, open your TT-upgrade project (the one with the new icons).
3. Build  ->  Generate Signed App Bundle / APK  ->  Android App Bundle  ->  Next
4. Choose existing...  ->  select treasuretrail-upload-NEW.jks
5. Enter the keystore password above; pick alias "upload"; enter the same key
   password. Tick "Remember passwords".
6. Select "release"  ->  Finish.
7. Upload the resulting .aab to Google Play as usual.


IMPORTANT
- Back up treasuretrail-upload-NEW.jks AND the password in two safe places.
- You can only reset the upload key about once per year, so do not lose this one.
- Make sure your app's versionCode is higher than any version already uploaded.
