---
name: Go-live fan-out uses independent atomic-claim columns per channel
description: Why in-app and native push each have their own *_at dedupe column, and the rule for adding a third channel
---

# Go-live notification fan-out: one claim column per delivery channel

Each go-live delivery channel claims its own `events.<channel>_at` column in a single
UPDATE whose WHERE clause is BOTH the eligibility gate AND the dedupe:
- in-app notification → `go_live_notified_at` (claimed inside SECURITY DEFINER RPC `notify_followers_go_live`)
- native push (FCM) → `go_live_pushed_at` (claimed server-side via service role in `sendGoLivePush`)

**Why:** the channels can fail/retry independently (the in-app RPC may succeed while push
is unconfigured, or vice versa). Sharing one dedupe column would let a failure in one
channel permanently suppress the other. Separate columns let each fan out exactly once on
its own schedule. Both are still tied to the SAME event, so they stay semantically linked.

**How to apply:** to add a 4th channel, add a new `events.<channel>_pushed_at` column and
claim it with the same `UPDATE ... WHERE <col> IS NULL AND <eligibility gate> ... select().maybeSingle()`
pattern. Never reuse another channel's claim column. The eligibility gate (published +
online + started + within ~3h) must match the in-app RPC so channels don't diverge on who
counts as "live". Recipient lists are always derived server-side from `followers`
(never accepted from the caller), so the endpoint can't be used to reach non-followers.
The trigger endpoint only needs auth; the DB claim is the real authority.
