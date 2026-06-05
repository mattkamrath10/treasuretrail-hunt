---
name: iOS camera/photo crash needs Info.plist usage strings
description: Why "Take Photo" hard-crashes the iOS app and what privacy keys the WebView file inputs require
---

The app captures images via plain HTML `<input type="file" accept="image/*">` (some with `capture`), not the Capacitor Camera plugin. On iOS, when the user picks "Take Photo" (camera) or the photo library, the WKWebView triggers the native picker — and iOS **hard-crashes** the app instantly if the matching privacy usage description is missing from `ios/App/App/Info.plist`.

**Why:** Apple rejected (Guideline 2.1a) with "Profile → camera icon → Take Photo → crash." Root cause was a bare Info.plist with no `NS*UsageDescription` keys.

**How to apply:** Any feature that opens camera/photo-library from the webview requires these keys in Info.plist (add the ones you actually use):
- `NSCameraUsageDescription` — required for "Take Photo".
- `NSPhotoLibraryUsageDescription` — required for choosing existing photos.
- `NSPhotoLibraryAddUsageDescription` — required if the app saves images to the library.
- `NSMicrophoneUsageDescription` — required if video capture with audio is possible.

Camera/photo inputs live in Profile, FlashFinds, SellerEventForm, Community, WantedForm. Adding the inputs is not enough — the plist keys are the launch-safety gate. Codemagic builds the IPA, so the committed Info.plist is what ships.
