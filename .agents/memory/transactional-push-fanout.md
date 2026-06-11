---
name: Transactional push fan-out (Phase 1)
description: How non-go-live native push fan-out works — claim column, server-derived recipient, actor=caller gate, and the DM-notification gap.
---

# Transactional push fan-out

Phase 1 fans out native FCM push for four existing in-app notification events:
new **message**, **wanted_post_response**, new **follow** (follower), and listing
activity (**listing_saved** / **listing_shared**). It mirrors the go-live push
pattern but unifies the dedupe claim on a single column.

## Rules / decisions
- **Claim column is `notifications.pushed_at`** (one column for all four types),
  not a per-event column like the go-live `events.*_at` claims. The fan-out row
  is the in-app notification itself, so one claim column suffices.
- **Recipient is ALWAYS derived server-side from the claimed notification row**
  (`candidate.user_id`), never trusted from the request body. The request
  `recipientId`/`relatedItemId` only *narrow* the candidate query.
- **Actor = caller (JWT), enforced server-side**: the endpoint filters
  `actor_user_id = verified caller`, so a caller can only push notifications they
  authored. This is the core authz gate — keep it.
- **Push pref defaults ON (opt-out)** in BOTH `defaultChannelValue`
  (client `notificationPrefs.ts`) and `pushEnabledFor` (`server/push.ts`). These
  two must stay in sync or the UI and delivery disagree.
- **Claim released only on wholly-transient send failure** (sent===0 AND
  transient), same resilience rule as go-live, so a temporary FCM outage doesn't
  permanently suppress the push.

## Gotcha: DMs had NO in-app notification before
`sendMessage` previously created no notification row at all (no trigger, no
client call). Phase 1 ADDS a `message` notification per message so push has a row
to fan out from. **Why it matters:** this means one notification + one push *per
message* — high-traffic chats can get noisy. If spam becomes a problem, add a
per-conversation debounce/coalesce; do NOT silently drop the notification (the
Alerts entry depends on it).

## Native enablement recipe (done once @capacitor-firebase/messaging is back)
`src/lib/push.ts` dynamically imports the plugin, so reinstalling the package +
`npx cap sync` re-activates it with NO code change. Pin the plugin to the
Capacitor major (Capacitor 8.3.x → `@capacitor-firebase/messaging@8.3.0`).
Non-obvious native steps `cap sync` does NOT do for you:
- **iOS plist must be added to the Xcode project manually.** `cap sync` copies
  files but never edits `project.pbxproj`. GoogleService-Info.plist needs a
  PBXFileReference + PBXBuildFile + entry in the App group + entry in the
  PBXResourcesBuildPhase, or it isn't bundled and FirebaseApp.configure() crashes
  at launch (see firebase-messaging-launch-crash.md).
- **iOS APNs entitlement.** Create `ios/App/App/App.entitlements` with
  `aps-environment` and set `CODE_SIGN_ENTITLEMENTS = App/App.entitlements;` in
  BOTH Debug and Release build configs. Value = `production` for the Codemagic
  TestFlight/App-Store pipeline; switch to `development` only for local on-device
  debug builds.
- **Apple Developer portal (user-only):** the App ID `com.treasuretrail.hunt`
  must have the Push Notifications capability enabled, else the fetched/created
  provisioning profile lacks the push entitlement.
- **Android needs nothing extra:** android/build.gradle already has the
  `com.google.gms:google-services` classpath and android/app/build.gradle
  conditionally applies the plugin when google-services.json is present.
Server fan-out runs regardless, but tokens won't register until the above + the
config files (iOS plist / Android json) and the FCM service-account credential
are all in place.
