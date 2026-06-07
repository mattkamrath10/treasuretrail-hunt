---
name: Service-role boost/grant writes must re-check ownership and row count
description: Why server-side paid-state writes (boost/grant) need explicit ownership + 0-row checks even though RLS protects the row for clients.
---

When the server applies a paid benefit on a user's behalf (e.g. redeeming an IAP
boost against one of their items), it uses the **service-role** Supabase client,
which **bypasses RLS entirely**. RLS only gates JWT clients; it does nothing for
service-role writes.

Two non-obvious traps when redeeming a purchase server-side:

1. **Ownership must be re-checked in code.** A signed-in buyer's request only
   proves *who they are*, not that the `targetId` they sent is *theirs*. Without
   an explicit `SELECT owner_col WHERE id = targetId` check, any authenticated
   user can boost anyone's content. Gate on ownership BEFORE consuming the
   purchase/claim so a foreign/missing target can't burn a paid transaction.

2. **PostgREST UPDATE affecting 0 rows is NOT an error.** `.update().eq('id', x)`
   returns `error === null` even when `x` matches nothing. Add `.select('id')`
   and treat an empty result as failure, or a bad id "succeeds" and silently
   consumes a one-time purchase. Same applies to any "did this write actually
   land?" check on service-role updates.

**Why:** both were real bugs caught in review of the RevenueCat boost-confirm
flow — exactly-once consumables were burnable with no effect, and cross-user
content mutation was possible.

**How to apply:** any new server endpoint that writes paid/privileged state on a
user's behalf via service-role: (a) verify the target row exists AND belongs to
the caller, (b) confirm the write hit ≥1 row, (c) release any atomic claim if the
apply step fails so the purchase stays retryable. Boost target owner columns:
events→`holder_id`, wanted_items→`user_id`, community_posts→`user_id`,
marketplace_listings→`seller_id`.
