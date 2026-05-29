# Native Push Notifications — Setup Guide (Capacitor + Firebase Cloud Messaging)

This document covers everything that must be done **outside Replit** to turn the
TreasureTrail web app into real native iOS/Android apps with App Store / Play Store
push notifications. All the *in-project* code is already done (see "What's already
built" at the bottom).

Native push uses **device tokens** (FCM registration tokens), not phone numbers.
There is **no SMS and no email** involved.

---

## 0. Prerequisites you must obtain

| Requirement | Why | Cost |
| --- | --- | --- |
| **A Mac with Xcode** | iOS apps can only be built/signed/uploaded from macOS. | Mac hardware |
| **Apple Developer Program account** | Required to sign the app, create the APNs push key, and submit to the App Store. | $99/year |
| **Google Play Developer account** | Required to publish the Android app. | $25 one-time |
| **Firebase project** | Provides Firebase Cloud Messaging (FCM), which delivers push to both iOS and Android. | Free |
| **Android Studio** | To build/sign the Android app. | Free |

---

## 1. Firebase setup (FCM)

1. Go to <https://console.firebase.google.com> and **create a project** (e.g. `TreasureTrail`).
2. **Add an iOS app**
   - iOS bundle ID: **`com.treasuretrail.app`** (must match `capacitor.config.ts` `appId`).
   - Download **`GoogleService-Info.plist`**. You'll add it to the Xcode project (step 3).
3. **Add an Android app**
   - Android package name: **`com.treasuretrail.app`**.
   - Download **`google-services.json`**. You'll add it to the Android project (step 4).
4. **Create the server credential (service account)**
   - Firebase Console → ⚙️ **Project settings → Service accounts → Generate new private key**.
   - This downloads a JSON file. **This is a secret** — do not commit it.
   - In Replit, add it as a secret named **`FIREBASE_SERVICE_ACCOUNT`** with the **entire JSON file contents** as the value. The server reads this to send pushes; until it's set, push silently no-ops and the app works normally.

---

## 2. Apple Developer / APNs setup

Firebase delivers iOS push through Apple Push Notification service (APNs), so you must
give Firebase an APNs key:

1. Sign in to <https://developer.apple.com/account> (paid Apple Developer Program).
2. **Certificates, Identifiers & Profiles → Identifiers** → register an App ID with
   bundle ID **`com.treasuretrail.app`** and enable the **Push Notifications** capability.
3. **Keys → +** → create a new key, enable **Apple Push Notifications service (APNs)**,
   download the **`.p8`** file, and note the **Key ID** and your **Team ID**.
4. In **Firebase Console → Project settings → Cloud Messaging → Apple app
   configuration**, upload the **`.p8`** APNs key with its Key ID and Team ID.

> Without this step iOS pushes will not be delivered even though tokens register fine.

---

## 3. Build the native shell (run on your Mac / locally — NOT on Replit)

These commands add the native iOS/Android projects. They are intentionally **not run on
Replit** (native toolchains don't run in this Linux container). Clone the repo locally,
then:

```bash
# 1. Install deps and build the web assets
npm install
npm run build            # outputs to dist/ (Capacitor webDir)

# 2. Add the native platforms (creates ios/ and android/ folders)
npx cap add ios
npx cap add android

# 3. Copy the web build + plugins into the native projects
npx cap sync
```

### iOS-specific

- Open the project in Xcode: `npx cap open ios`
- Drag **`GoogleService-Info.plist`** into the Xcode project (into the `App` target).
- In **Signing & Capabilities**: select your Team, and add the **Push Notifications**
  capability and **Background Modes → Remote notifications**.
- Set the bundle identifier to **`com.treasuretrail.app`**.

### Android-specific

- Place **`google-services.json`** in `android/app/`.
- Open in Android Studio: `npx cap open android` and let Gradle sync.

---

## 4. Point the native app at your backend

The native webview loads bundled assets from `capacitor://localhost`, so **relative
`/api` calls won't reach the Express server**. The code already handles this via
`src/lib/apiBase.ts`, which reads **`VITE_API_BASE`**.

Before running `npm run build` for a native build, set:

```bash
VITE_API_BASE=https://<your-deployed-app>.replit.app
```

(Deploy the app first — use Replit's Publish — so you have a stable HTTPS URL.)
Leave `VITE_API_BASE` **unset** for the normal web build (it uses the Vite proxy).

---

## 5. Apply the database migration

Run `supabase/migrations/20260529000020_push_notifications.sql` against your Supabase
project (SQL editor or CLI). It creates the `device_tokens` table (own-rows-only RLS)
and adds `events.go_live_pushed_at`. Until applied, push silently no-ops.

---

## 6. Test push end-to-end

1. Apply the migration (step 5) and set `FIREBASE_SERVICE_ACCOUNT` (step 1.4).
2. Run the app on a **real device** (push doesn't work on simulators/emulators).
3. Log in → accept the notification permission prompt → a row appears in `device_tokens`.
4. Have a seller you follow start an **online live event**. The same trigger that fires
   the in-app notification also calls `POST /api/push/go-live`, and you should receive a
   native push. Tapping it opens `/event/:id`.

---

## 7. Store submission (high level)

- **iOS**: In Xcode, Archive → upload to App Store Connect → fill in listing, privacy,
  and submit for review. Note in App Privacy that you collect a device push token.
- **Android**: In Android Studio, build a signed **AAB** → upload in the Play Console →
  complete the listing and content rating → submit.

---

## What's already built (inside this project)

- **Dependencies**: `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`,
  `@capacitor/android`, `@capacitor-firebase/messaging`, `firebase` (web peer dep),
  `firebase-admin` (server).
- **`capacitor.config.ts`** — appId `com.treasuretrail.app`, webDir `dist`.
- **`src/lib/push.ts`** — native-only token registration/removal (no-op on web), token
  refresh listener, and notification-tap routing to `/event/:id`. Wired into `AppShell`
  (registers when logged in, removes on logout).
- **`src/lib/apiBase.ts`** — resolves the API base URL for web vs native.
- **`server/push.ts`** — trusted FCM sender. Atomically claims `go_live_pushed_at`
  (fires at most once per event), loads the seller's followers' device tokens via the
  service-role key, sends an FCM multicast, and prunes dead tokens.
- **`POST /api/push/go-live`** (in `server/index.ts`) — auth-required; the DB-side
  atomic claim + eligibility gate is the source of truth, so it can't be used to spam or
  to reach non-followers.
- **Tie-in**: `src/lib/notifications.ts` fires the push (fire-and-forget) right after the
  existing in-app `notify_followers_go_live` RPC, so push and in-app share one trigger.

Everything degrades quietly: with no `FIREBASE_SERVICE_ACCOUNT` and no migration, the
endpoint no-ops and the web app is unaffected. Payments/Stripe were not touched.
