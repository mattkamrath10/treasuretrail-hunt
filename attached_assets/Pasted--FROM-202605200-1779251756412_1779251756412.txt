
-- -----------------------------------------------------------------------------
-- FROM: 20260520000001_storage_avatars_policy_harden.sql
-- -----------------------------------------------------------------------------
-- # Harden avatars-bucket storage policies
--
-- Symptom: brand-new users hit `403 new row violates row-level security
-- policy` when uploading a Flash Find photo, even though the upload path
-- (`<auth.uid()>/finds/<ts>.<ext>`) matches their auth.uid().
--
-- Root cause options the previous policy was vulnerable to:
--   * `storage.foldername(name)[1]` can return NULL on some path shapes
--     (e.g. a leading slash or unexpected encoding), tripping RLS.
--   * Older Supabase storage builds defined `storage.foldername` slightly
--     differently. Newer projects can fail silently against the same path
--     that worked on an older project.
--
-- This patch replaces the path check with a direct prefix match
-- (`name LIKE auth.uid()::text || '/%'`), which is robust to both edge
-- cases and reads more clearly. It also makes the bucket existence
-- idempotent and re-asserts the public SELECT policy.

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND name LIKE (auth.uid()::text || '/%')
  );

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND name LIKE (auth.uid()::text || '/%')
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND name LIKE (auth.uid()::text || '/%')
  );

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND name LIKE (auth.uid()::text || '/%')
  );

DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
CREATE POLICY "Anyone can view avatars"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'avatars');
