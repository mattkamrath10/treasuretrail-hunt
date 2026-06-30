-- ============================================================
-- Featured Profiles + per-profile selling links
-- ------------------------------------------------------------
-- featured_profile is a PRIVILEGED column (admin-granted recognition that
-- pins a member to the top of the Featured Profiles directory). Like
-- founding_partner / pro_member, a normal JWT user must NEVER set it on
-- themselves, so it is added to the profile escalation guard. The ONLY way
-- to flip it is the service-role grant module (server/grants.ts) via the
-- admin-gated /api/admin/featured-profile endpoint.
--
-- The link_* columns are a user-owned "link tree" of external selling
-- profiles. They are NOT privileged — they flow through the normal profiles
-- upsert (AuthContext.updateProfile), so they are deliberately left OUT of
-- the escalation guard.
-- ============================================================

-- 1. Columns -------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS featured_profile boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_profile_since timestamptz,
  ADD COLUMN IF NOT EXISTS link_facebook_marketplace text,
  ADD COLUMN IF NOT EXISTS link_whatnot text,
  ADD COLUMN IF NOT EXISTS link_poshmark text,
  ADD COLUMN IF NOT EXISTS link_ebay text;

-- 2. Profile escalation guard -------------------------------
-- Re-create the guard with featured_profile / featured_profile_since frozen
-- for JWT clients (service-role has no JWT claims, so it bypasses this).
-- IMPORTANT: this re-states the FULL guard from
-- 20260622000000_founding_partner.sql (xp/level/reputation/pro_member/
-- membership_tier/scout_verified/treasure_rank/role/founding_partner*) and
-- adds featured_profile* on top. Dropping any line re-opens an escalation hole.
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
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
