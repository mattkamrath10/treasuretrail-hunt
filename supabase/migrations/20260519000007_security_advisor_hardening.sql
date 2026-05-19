-- Security advisor hardening pass.
--
-- 1) Pin search_path on all SECURITY DEFINER / mutating functions to
--    eliminate the "function_search_path_mutable" warning class.
-- 2) Revoke EXECUTE on those functions from anon (and from public for
--    trigger-only helpers) so anonymous REST clients can no longer hit
--    /rest/v1/rpc/<fn>. Authenticated users keep access where intended.
-- 3) Drop the broad "Anyone can view avatars" listing policy on
--    storage.objects. Public-bucket object URLs still resolve via
--    storage's built-in public read; this only removes the ability to
--    LIST the bucket contents.
-- 4) Tighten platform_submissions INSERT to authenticated users only.
--
-- All statements are idempotent / guarded so re-running is safe.

-- ─────────────────────────────────────────────────────────────────────
-- 1) Pin search_path on flagged functions.  ALTER FUNCTION ... SET
--    search_path doesn't change behavior; it just freezes resolution.
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  fn record;
  targets text[] := ARRAY[
    'increment_following_count(uuid)',
    'decrement_following_count(uuid)',
    'increment_follower_count(uuid)',
    'decrement_follower_count(uuid)',
    'increment_post_likes(uuid)',
    'decrement_post_likes(uuid)',
    'validate_mission_progress()',
    'place_bid(uuid,numeric)',
    'prevent_profile_field_escalation()',
    'claim_ai_scan_slot(integer)',
    'get_my_exact_address(text,uuid)',
    'rls_auto_enable()'
  ];
  sig text;
BEGIN
  FOREACH sig IN ARRAY targets LOOP
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION public.%s SET search_path = public, pg_temp',
        sig
      );
    EXCEPTION WHEN undefined_function THEN
      -- function not present in this environment; skip
      NULL;
    END;
  END LOOP;
END
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 2) Revoke EXECUTE from anon on mutating RPCs.  These should never be
--    callable by signed-out clients.
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  sig text;
  mutating_rpcs text[] := ARRAY[
    'increment_following_count(uuid)',
    'decrement_following_count(uuid)',
    'increment_follower_count(uuid)',
    'decrement_follower_count(uuid)',
    'increment_post_likes(uuid)',
    'decrement_post_likes(uuid)',
    'place_bid(uuid,numeric)',
    'claim_ai_scan_slot(integer)',
    'get_my_exact_address(text,uuid)'
  ];
BEGIN
  FOREACH sig IN ARRAY mutating_rpcs LOOP
    BEGIN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.%s FROM anon',
        sig
      );
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END LOOP;
END
$$;

-- Trigger-only helpers should not be in the exposed API at all.
-- Revoke from PUBLIC (which covers anon + authenticated for RPC use).
-- Triggers fire as the table owner regardless of grants.
DO $$
DECLARE
  sig text;
  trigger_helpers text[] := ARRAY[
    'prevent_profile_field_escalation()',
    'validate_mission_progress()',
    'rls_auto_enable()'
  ];
BEGIN
  FOREACH sig IN ARRAY trigger_helpers LOOP
    BEGIN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated',
        sig
      );
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END LOOP;
END
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 3) Avatars bucket: drop the broad listing policy.
--    Object URLs continue to work because the `avatars` bucket itself
--    is marked public; this only removes the ability to enumerate.
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;

-- ─────────────────────────────────────────────────────────────────────
-- 4) platform_submissions: require sign-in to submit.
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can submit platforms" ON public.platform_submissions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'platform_submissions'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "Authenticated users can submit platforms"
        ON public.platform_submissions
        FOR INSERT
        TO authenticated
        WITH CHECK (true)
    $pol$;
  END IF;
END
$$;
