---
name: Go-live native push fan-out
description: Rules for the server-side go-live push so it stays consistent with the in-app go-live RPC and never permanently suppresses an eligible event.
---

# Go-live native push fan-out

Native push (FCM via firebase-admin) is fired right after the in-app
`notify_followers_go_live` RPC and must stay tied to the SAME go-live event.

## Rule 1 — eligibility gate must mirror the in-app RPC exactly
The server-side atomic claim (`events.go_live_pushed_at`) must use the IDENTICAL
eligibility predicate as the in-app RPC, including the live-window UPPER bound:
`now() < COALESCE(ends_at, starts_at + interval '2 hours')`.
In PostgREST that upper bound is expressed as
`.or('ends_at.gt.<now>,and(ends_at.is.null,starts_at.gt.<now-2h>)')`.
**Why:** omitting the upper bound lets push fire for events the in-app logic
considers no longer live, breaking "same go-live semantics."
**How to apply:** if the in-app RPC's gate (migration `…_go_live_notifications`)
ever changes, change the push claim in `server/push.ts` in lockstep.

## Rule 2 — release the claim on wholly-transient delivery failure
The claim sets `go_live_pushed_at` BEFORE the FCM send and is not transactional
with delivery. If the multicast THROWS (transient FCM/network) and nothing was
delivered (`sent === 0`), reset `go_live_pushed_at` back to null (guarded by
`.eq('go_live_pushed_at', <our timestamp>)`) so a later trigger can retry.
**Why:** otherwise one FCM blip permanently suppresses that event's push.
**How to apply:** only release when `sent === 0` AND the failure was a thrown
multicast — per-token failures come back in `responses` (dead tokens, pruned),
they are not transient and must NOT trigger a release.
