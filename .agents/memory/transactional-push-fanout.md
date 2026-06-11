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

## Native delivery is still gated
`src/lib/push.ts` is a no-op until `@capacitor-firebase/messaging` is reinstalled
and GoogleService-Info.plist / google-services.json + APNs key are configured.
Server fan-out runs regardless, but tokens won't register until the native setup
is done (see firebase-messaging-launch-crash.md — the plugin self-configures at
launch and hard-crashes iOS without the plist).
