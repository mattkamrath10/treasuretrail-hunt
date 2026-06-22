-- ============================================================
-- Founding Partner program
-- ------------------------------------------------------------
-- Invite-only recognition badge granted by an admin to:
--   * founding-partner BUSINESSES (businesses.founding_partner)
--   * founding-partner SELLERS / live-show hosts (profiles.founding_partner)
--
-- Like `verified` / `featured` / `pro_member`, this is a privileged column:
-- a normal (JWT 'authenticated') user must NEVER be able to set it on
-- themselves. We add it to BOTH escalation guards so only the service-role
-- grant module (server/grants.ts) — or an admin — can flip it.
-- ============================================================

-- 1. Columns -------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS founding_partner boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS founding_partner_since timestamptz;

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS founding_partner boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS founding_partner_since timestamptz;

-- 2. Profile escalation guard -------------------------------
-- Re-create the guard with founding_partner / founding_partner_since frozen
-- for JWT clients (server service-role has no JWT claims, so it bypasses this).
-- IMPORTANT: keep this in lockstep with the previous definition in
-- 20260529000002_revenue_lockdown.sql — we re-state ALL prior locks
-- (xp/level/reputation/pro_member/membership_tier/scout_verified/
-- treasure_rank/role, with INSERT safe-baselines) and add founding_partner*
-- on top. Dropping any line here re-opens a privilege-escalation hole.
CREATE OR REPLACE FUNCTION prevent_profile_field_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('request.jwt.claims', true) IS NOT NULL
     AND current_setting('request.jwt.claims', true) != ''
  THEN
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
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Business escalation guard ------------------------------
-- Service-role / admin (JWT role <> 'authenticated', or no JWT) bypass; normal
-- users get founding_partner forced false on INSERT and frozen on UPDATE.
CREATE OR REPLACE FUNCTION public.prevent_business_field_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claims', true)::json ->> 'role';
BEGIN
  IF v_role IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.verified         := false;
    NEW.featured         := false;
    NEW.founding_partner := false;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.verified               := OLD.verified;
    NEW.featured               := OLD.featured;
    NEW.founding_partner       := OLD.founding_partner;
    NEW.founding_partner_since := OLD.founding_partner_since;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS businesses_prevent_escalation ON public.businesses;
CREATE TRIGGER businesses_prevent_escalation
  BEFORE INSERT OR UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.prevent_business_field_escalation();
