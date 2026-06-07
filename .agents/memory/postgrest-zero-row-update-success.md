---
name: PostgREST 0-row UPDATE returns success
description: Why every paid/grant writer must check affected rows, not just error
---

# PostgREST treats a 0-row UPDATE as success

An `.update(...).eq('id', x)` that matches NO row returns `{ error: null }` in
supabase-js. There is no "not found" error. So a writer that only checks
`if (error)` will report success even when nothing changed.

**Why this matters (revenue integrity):** the paid-state writers in
`server/grants.ts` (`grantPro`, `revokePro`, `applyBoost`) are the single source
of truth for entitlement. A mismatched/unknown `app_user_id` (RevenueCat alias /
transfer / deleted profile) would otherwise:
- grant: buyer pays, no row updated, webhook returns 200 -> buyer stays free.
- revoke: subscription expired, no row updated -> user keeps Pro for free.
- boost: bad targetId -> burns a paid boost against nothing.

**How to apply:** any service-role writer of a revenue/trust column must append
`.select('id')` and treat `data.length === 0` as a hard failure so the caller
(webhook/sync) returns 500 and RevenueCat retries — never mask it as success.
RevenueCat webhook user id should also fall back to `original_app_user_id` when
`app_user_id` is absent to reduce these mismatches.
