---
name: Escalation-guard privileged columns
description: Every revenue/trust column must be added to the BEFORE INSERT OR UPDATE escalation guard the moment it is created, or clients can self-grant it.
---

# Escalation-guard must list every privileged column

`profiles.prevent_profile_field_escalation()` and the content-table
`prevent_content_paid_field_escalation()` triggers protect paid/trust columns by
coercing protected columns whenever `request.jwt.claims` is non-empty (any
anon/authenticated client). Service-role / no-JWT connections bypass the guard and
are the ONLY legitimate writers of these columns.

**Why:** `membership_tier` was added to `profiles` *after* the trigger existed and
was never added to its reset list, so any logged-in user could self-upgrade to Pro
with a direct `update profiles set membership_tier='pro'` — the entire free-Pro
leak. RLS "update own profile" allows the row write; only the trigger blocks the
column. `pro_member` and `role` were protected, `membership_tier` was not.

**How to apply:** Whenever you add a column that confers a paid benefit, trust
level, rank, or role, add `NEW.<col> = OLD.<col>` to the matching escalation guard
in the SAME migration. Granting it must then go through `server/grants.ts`
(service-role). Don't rely on RLS alone — RLS gates the row, the trigger gates the
column. Moderation cols (`is_hidden`, `report_count`) are guarded too even though
nothing writes them yet (read-only filters in client), for defense in depth.

**INSERT matters too:** Guards must fire on `BEFORE INSERT OR UPDATE`. An
update-only guard leaves an INSERT hole — a client can create a row already-boosted,
or insert their own profile with `role='admin'`/`membership_tier='pro'` (which also
defeats any admin-role-based server gate). On INSERT, force safe baselines (matching
column DEFAULTs); on UPDATE, reset to OLD.
