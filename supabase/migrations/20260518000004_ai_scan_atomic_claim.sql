/*
  # Atomic AI scan slot reservation

  Rate-limit needs to be race-safe. Previously the server did:
    count -> compare -> OpenAI -> insert
  Two parallel requests could both pass the count check and both spend OpenAI
  tokens, exceeding free/pro caps.

  Fix: `claim_ai_scan_slot(p_limit)` takes a per-user advisory lock, counts
  scans in the last 24h, and (if under limit) inserts a placeholder row in the
  same critical section. The placeholder row immediately counts against the
  user's limit. The server later updates the row with the OpenAI result, or
  deletes it on failure.

  Cache hits intentionally do NOT consume a slot or insert a row — the user is
  re-served their own recent identical result for free. Frontend communicates
  this with the "Reused recent scan" banner.
*/

CREATE OR REPLACE FUNCTION claim_ai_scan_slot(p_limit int)
RETURNS TABLE (allowed boolean, used int, scan_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_count int;
  v_new_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  -- Per-user advisory lock (auto-released at txn end).
  PERFORM pg_advisory_xact_lock(hashtext(v_user::text));

  SELECT COUNT(*) INTO v_count
  FROM ai_scans_log
  WHERE user_id = v_user
    AND created_at >= now() - interval '24 hours';

  IF v_count >= p_limit THEN
    RETURN QUERY SELECT false, v_count, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO ai_scans_log (user_id, model, image_hash, result_json, cached)
  VALUES (v_user, 'gpt-5.4', NULL, NULL, false)
  RETURNING id INTO v_new_id;

  RETURN QUERY SELECT true, v_count + 1, v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION claim_ai_scan_slot(int) FROM public;
GRANT EXECUTE ON FUNCTION claim_ai_scan_slot(int) TO authenticated;

NOTIFY pgrst, 'reload schema';
