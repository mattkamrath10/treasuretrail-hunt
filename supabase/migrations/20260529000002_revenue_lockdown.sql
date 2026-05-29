-- Revenue protection lockdown
-- =====================================================================
-- Closes every path that let a JWT client grant itself paid benefits
-- for free. Paid state (Pro tier + content boosts), the admin role, and
-- moderation flags may now ONLY be written by service-role / no-JWT
-- connections (the backend grant module in server/grants.ts, and — next
-- phase — the Stripe webhook). No Stripe here.
--
-- Pattern mirrors the existing prevent_profile_field_escalation guard:
-- when request.jwt.claims is present (any anon/authenticated client),
-- server-managed columns are forced to a safe value. Service-role and
-- direct postgres connections have no JWT context and may write freely.
--
-- IMPORTANT: the guards run on BOTH INSERT and UPDATE. Update-only guards
-- left an INSERT hole — a client could create a row already-boosted, or
-- insert their own profile with role='admin' / membership_tier='pro'.
--   * On UPDATE, protected columns are reset to their prior (OLD) value.
--   * On INSERT, protected columns are forced to their safe baseline.
--
-- HOW TO APPLY: paste this whole file into the Supabase SQL editor and
-- run it. The agent cannot apply DDL; this must be run manually.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. profiles — protect membership_tier (the canonical Pro signal, which
--    tierOf() reads but which was never in the guard), alongside the
--    already-protected pro_member / role / gamification fields, on both
--    INSERT and UPDATE.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_profile_field_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('request.jwt.claims', true) IS NOT NULL
     AND current_setting('request.jwt.claims', true) != ''
  THEN
    IF TG_OP = 'INSERT' THEN
      -- Force safe baselines; clients never create an elevated profile.
      NEW.xp               = 0;
      NEW.level            = 1;
      NEW.reputation_score = 5.0;
      NEW.pro_member       = false;
      NEW.membership_tier  = 'free';
      NEW.scout_verified   = false;
      NEW.treasure_rank    = 'Hunter';
      NEW.role             = 'user';
    ELSE
      -- Preserve server-managed fields; client-supplied values ignored.
      NEW.xp               = OLD.xp;
      NEW.level            = OLD.level;
      NEW.reputation_score = OLD.reputation_score;
      NEW.pro_member       = OLD.pro_member;
      NEW.membership_tier  = OLD.membership_tier;
      NEW.scout_verified   = OLD.scout_verified;
      NEW.treasure_rank    = OLD.treasure_rank;
      NEW.role             = OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_profile_field_protection ON public.profiles;
CREATE TRIGGER enforce_profile_field_protection
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_profile_field_escalation();

-- ---------------------------------------------------------------------
-- 2. content tables — protect boost + moderation columns on both INSERT
--    and UPDATE. All four boostable tables carry the same six columns,
--    so a single generic guard is reused. Normal owner edits (title,
--    description, images, status, etc.) are untouched.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_content_paid_field_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('request.jwt.claims', true) IS NOT NULL
     AND current_setting('request.jwt.claims', true) != ''
  THEN
    IF TG_OP = 'INSERT' THEN
      -- New client-created content is never pre-boosted or pre-moderated.
      NEW.boosted_at       = NULL;
      NEW.boost_expires_at = NULL;
      NEW.boost_type       = NULL;
      NEW.priority_score   = 0;
      NEW.is_hidden        = false;
      NEW.report_count     = 0;
    ELSE
      NEW.boosted_at       = OLD.boosted_at;
      NEW.boost_expires_at = OLD.boost_expires_at;
      NEW.boost_type       = OLD.boost_type;
      NEW.priority_score   = OLD.priority_score;
      NEW.is_hidden        = OLD.is_hidden;
      NEW.report_count     = OLD.report_count;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_events_paid_protection ON public.events;
CREATE TRIGGER enforce_events_paid_protection
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION prevent_content_paid_field_escalation();

DROP TRIGGER IF EXISTS enforce_wanted_items_paid_protection ON public.wanted_items;
CREATE TRIGGER enforce_wanted_items_paid_protection
  BEFORE INSERT OR UPDATE ON public.wanted_items
  FOR EACH ROW EXECUTE FUNCTION prevent_content_paid_field_escalation();

DROP TRIGGER IF EXISTS enforce_community_posts_paid_protection ON public.community_posts;
CREATE TRIGGER enforce_community_posts_paid_protection
  BEFORE INSERT OR UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION prevent_content_paid_field_escalation();

DROP TRIGGER IF EXISTS enforce_marketplace_listings_paid_protection ON public.marketplace_listings;
CREATE TRIGGER enforce_marketplace_listings_paid_protection
  BEFORE INSERT OR UPDATE ON public.marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION prevent_content_paid_field_escalation();
