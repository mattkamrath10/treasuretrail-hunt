---
name: Wanted-response notification flow
description: How replying to a wanted post fires exactly one owner alert, and the channel-prefs gating model.
---

Replying to a wanted post ("Respond / I Have This" composer) does three writes:
getOrCreateConversation → sendMessage → createWantedResponse. Only the LAST one
fires the owner's alert, via the `wanted_responses` AFTER INSERT trigger
(`notify_wanted_post_response`), which inserts one `wanted_post_response`
notification with related_item_type='wanted_item', related_item_id=wanted_item_id.

**Why:** `sendMessage` does NOT call notify_user, and there is NO message-insert
trigger that auto-creates a notification. So the response trigger is the single
alert source — no dedupe needed. If a future change adds a message-notification
trigger, the wanted-reply flow would start double-notifying.

**How to apply:** sendMessage failure must be treated as blocking (don't create
the wanted_response or navigate) so an alert never fires for a DM that didn't send.

In-app notification gating is two-layer: the DB notify_user has a hard ALLOWLIST
(follow, message, listing_saved, listing_shared, wanted_post_response) and raises
on anything else; the per-user category prefs (profiles.notification_prefs jsonb)
are applied CLIENT-SIDE in Alerts via isInAppEnabled(prefs, type). Types with no
category (e.g. `general`) are always shown. Email/SMS/Push are Phase-2 placeholders
(ACTIVE_CHANNELS=['in_app']).
