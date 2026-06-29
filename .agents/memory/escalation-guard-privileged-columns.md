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

**CREATE OR REPLACE drift trap:** When a NEW migration `CREATE OR REPLACE`s an
existing escalation guard just to add one column, it must re-state EVERY line of
the latest prior definition (grep all migrations for the function name and use the
newest). Copying an OLD version silently drops later-added locks (e.g.
`membership_tier`, INSERT safe-baselines) and re-opens the leak. The replacement
is whole-body, not additive.

**CORRECTION — service-role does NOT bypass the jwt-claims check:** The comments
above (and in the migrations) claim "service-role / no-JWT connections bypass the
guard." That is FALSE for the supabase-js service-role client: the service_role
KEY is itself a JWT, so PostgREST sets `request.jwt.claims` (role=service_role)
and the `IF current_setting('request.jwt.claims') IS NOT NULL` guard FIRES,
silently reverting `role`/`founding_partner`/`membership_tier` writes. Confirmed
empirically: `admin().from('profiles').update({founding_partner:true})` returns
the row via `.select('id')` (looks like success) but the value stays false. So
the in-app admin "Make Founding Partner" / "Make Pro" buttons (server grants via
service-role) are SILENT NO-OPS on the live DB.
**Fix:** change the guard condition from "jwt.claims is non-empty" to "jwt role =
'authenticated'" (mirroring `prevent_business_field_escalation`, which already
does `IF v_role IS DISTINCT FROM 'authenticated' THEN RETURN NEW`). Then only
real logged-in users are restricted; service_role (server) and no-JWT (SQL
editor) pass through. Agent CANNOT apply this DDL — user pastes it in the
Supabase SQL editor. The SQL editor itself has no JWT, so a plain
`UPDATE profiles SET role='admin'` there works even WITHOUT the fix.
