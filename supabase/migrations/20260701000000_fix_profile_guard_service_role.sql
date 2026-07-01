-- ============================================================
-- FIX: profile escalation guard wrongly reverts service-role writes
-- ------------------------------------------------------------
-- BUG: prevent_profile_field_escalation() gated its "freeze the
-- privileged columns" logic on `request.jwt.claims` merely being
-- present/non-empty, on the assumption that the service-role
-- connection has NO JWT claims. That assumption is wrong: the
-- Supabase service-role KEY is itself a signed JWT, so PostgREST
-- populates request.jwt.claims (role = 'service_role') for it too.
--
-- Result: the admin grant module (server/grants.ts) — which uses the
-- service-role key — had its writes to founding_partner /
-- featured_profile / membership_tier / pro_member / role silently
-- reverted by this trigger. The UPDATE matched the row and returned
-- no error (so the app showed a success toast), but the values never
-- changed. Admins could not grant Founding Partner / Pro / Featured.
--
-- FIX: gate the freeze on the JWT *role*, fail-CLOSED. Only fully
-- trusted contexts write privileged columns freely: the service-role
-- key (role = 'service_role'), Supabase internal admin, and direct
-- postgres / no-JWT connections (role claim absent). EVERY other role —
-- 'authenticated', 'anon', and any unexpected/custom role a future auth
-- hook might emit — is frozen. This is stricter than the businesses
-- guard's "IS DISTINCT FROM 'authenticated'" deny pattern, which would
-- fail-open for unknown roles. NULLIF guards the empty '' setting so
-- `''::json` never raises.
--
-- This re-states the FULL profile guard (xp/level/reputation/
-- pro_member/membership_tier/scout_verified/treasure_rank/role/
-- founding_partner*/featured_profile*) from
-- 20260630000000_featured_profiles_and_links.sql; only the gate at the
-- top changed. Dropping any freeze line re-opens an escalation hole.
--
-- HOW TO APPLY: paste this whole file into the Supabase SQL editor and
-- run it. The agent cannot apply DDL; this must be run manually. It
-- affects the single shared Supabase database (dev + production).
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_profile_field_escalation()
RETURNS TRIGGER AS $$
DECLARE
  v_role text := nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role';
BEGIN
  -- Fail-closed: ONLY fully trusted contexts write privileged columns
  -- freely — the service-role key, Supabase internal admin, and
  -- direct postgres / no-JWT connections (role claim absent). That is
  -- how the admin grant module and future webhooks set them.
  IF v_role IS NULL OR v_role IN ('service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Everything else — 'authenticated', 'anon', and any unexpected role —
  -- is constrained.
  IF TG_OP = 'INSERT' THEN
    -- Force safe baselines; clients never create an elevated profile.
    NEW.xp                     = 0;
    NEW.level                  = 1;
    NEW.reputation_score       = 5.0;
    NEW.pro_member             = false;
    NEW.membership_tier        = 'free';
    NEW.scout_verified         = false;
    NEW.treasure_rank          = 'Hunter';
    NEW.role                   = 'user';
    NEW.founding_partner       = false;
    NEW.founding_partner_since = NULL;
    NEW.featured_profile       = false;
    NEW.featured_profile_since = NULL;
  ELSE
    -- Preserve server-managed fields; client-supplied values ignored.
    NEW.xp                     = OLD.xp;
    NEW.level                  = OLD.level;
    NEW.reputation_score       = OLD.reputation_score;
    NEW.pro_member             = OLD.pro_member;
    NEW.membership_tier        = OLD.membership_tier;
    NEW.scout_verified         = OLD.scout_verified;
    NEW.treasure_rank          = OLD.treasure_rank;
    NEW.role                   = OLD.role;
    NEW.founding_partner       = OLD.founding_partner;
    NEW.founding_partner_since = OLD.founding_partner_since;
    NEW.featured_profile       = OLD.featured_profile;
    NEW.featured_profile_since = OLD.featured_profile_since;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger definition is unchanged (BEFORE INSERT OR UPDATE on profiles),
-- so CREATE OR REPLACE FUNCTION above is sufficient. Re-assert for safety:
DROP TRIGGER IF EXISTS enforce_profile_field_protection ON public.profiles;
CREATE TRIGGER enforce_profile_field_protection
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_profile_field_escalation();
