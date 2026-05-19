/*
  # Admin role + moderation delete permission system

  Adds a `profiles.role` column ('user' | 'admin') and rewrites DELETE
  policies on every user-content table so that:

    - Owners can delete their own rows (existing behaviour)
    - Admins can delete ANY row

  A `SECURITY DEFINER` helper `public.is_admin()` reads the role of the
  current `auth.uid()` without triggering recursive RLS on the profiles
  table. All policies use that helper.

  Tables covered:
    - community_posts   (Flash Finds + general find feed)
    - flash_finds       (legacy table, still has rows)
    - marketplace_listings
    - external_listings (Live Events / Auctions)

  Storage:
    - `avatars` bucket: admin can delete any object (in addition to the
      existing "user can delete own folder" policy).

  After applying, mark the platform owner as admin (one-time):

      UPDATE profiles SET role = 'admin' WHERE username = 'matt';

  (Replace 'matt' with the real username if different.)
*/

-- ============================================================
-- 1. profiles.role column
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE profiles
      ADD COLUMN role text NOT NULL DEFAULT 'user'
      CHECK (role IN ('user', 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role) WHERE role = 'admin';

-- The existing security_hardening trigger silently resets
-- server-managed profile fields on JWT updates. Add `role` to that
-- protection list so users cannot self-promote to admin.
CREATE OR REPLACE FUNCTION prevent_profile_field_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('request.jwt.claims', true) IS NOT NULL
     AND current_setting('request.jwt.claims', true) != ''
  THEN
    NEW.xp               = OLD.xp;
    NEW.level            = OLD.level;
    NEW.reputation_score = OLD.reputation_score;
    NEW.pro_member       = OLD.pro_member;
    NEW.scout_verified   = OLD.scout_verified;
    NEW.treasure_rank    = OLD.treasure_rank;
    NEW.role             = OLD.role;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. is_admin() helper — SECURITY DEFINER avoids RLS recursion
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Postgres grants EXECUTE on functions to PUBLIC by default. Explicitly
-- strip that and re-grant to authenticated only.
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
GRANT  EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ============================================================
-- 3. DELETE policies: owner OR admin
-- ============================================================

-- community_posts
DROP POLICY IF EXISTS "Users can delete own posts" ON community_posts;
DROP POLICY IF EXISTS "Owner or admin can delete posts" ON community_posts;
CREATE POLICY "Owner or admin can delete posts"
  ON community_posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- flash_finds (legacy)
DROP POLICY IF EXISTS "Users can delete own flash finds" ON flash_finds;
DROP POLICY IF EXISTS "Owner or admin can delete flash finds" ON flash_finds;
CREATE POLICY "Owner or admin can delete flash finds"
  ON flash_finds FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- marketplace_listings
DROP POLICY IF EXISTS "Users can delete own listings" ON marketplace_listings;
DROP POLICY IF EXISTS "Owner or admin can delete listings" ON marketplace_listings;
CREATE POLICY "Owner or admin can delete listings"
  ON marketplace_listings FOR DELETE
  TO authenticated
  USING (auth.uid() = seller_id OR public.is_admin());

-- external_listings (Live Events / Auctions submitted by users)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'external_listings'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can delete own external listings" ON external_listings';
    EXECUTE 'DROP POLICY IF EXISTS "Owner or admin can delete external listings" ON external_listings';
    EXECUTE $POL$
      CREATE POLICY "Owner or admin can delete external listings"
        ON external_listings FOR DELETE
        TO authenticated
        USING (auth.uid() = user_id OR public.is_admin())
    $POL$;
  END IF;
END $$;

-- ============================================================
-- 4. Storage: admins can delete any avatars-bucket object
-- ============================================================

DROP POLICY IF EXISTS "Admins can delete any avatar" ON storage.objects;
CREATE POLICY "Admins can delete any avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND public.is_admin());

NOTIFY pgrst, 'reload schema';
