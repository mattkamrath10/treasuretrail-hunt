-- PHASE 8 — Marketplace Interaction System
--
-- Adds the backing schema for the core conversion loop:
--   Feed item → Listing detail → Seller profile → Message seller
-- plus saved listings and scout requests.
--
-- Tables:
--   conversations          1:1 chat thread, optionally tied to a listing
--   messages (ALTER)       adds conversation_id + listing link columns
--   saved_listings         per-user bookmark across community_posts / marketplace
--   scout_requests         "scout this item" requests addressed to a seller
--
-- All policies require the caller to be a member (user_a_id or user_b_id) or
-- the row owner. Admin overrides reuse `public.is_admin()` introduced in
-- 20260519000001_admin_role_and_moderation.sql.

-- =============================================================
-- conversations
-- =============================================================
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Sentinel for "any listing kind" so a single thread can also be opened
  -- without a listing context. listing_kind is one of: 'marketplace',
  -- 'community_post', 'external_listing'. NULL if no listing context.
  listing_id uuid,
  listing_kind text,
  last_message_at timestamptz DEFAULT now(),
  last_message_preview text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT conversations_users_distinct CHECK (user_a_id <> user_b_id),
  -- Normalize the pair so any direction lookup hits the same row. We enforce
  -- user_a_id < user_b_id via the convention in `get_or_create_conversation`,
  -- and a partial-unique index keys the listing-context pair.
  CONSTRAINT conversations_user_ordering CHECK (user_a_id < user_b_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS conversations_pair_listing_uidx
  ON public.conversations(user_a_id, user_b_id, COALESCE(listing_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(listing_kind, ''));
CREATE INDEX IF NOT EXISTS conversations_user_a_idx ON public.conversations(user_a_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS conversations_user_b_idx ON public.conversations(user_b_id, last_message_at DESC);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read conversation" ON public.conversations;
CREATE POLICY "Members can read conversation"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id OR public.is_admin());

-- INSERT is funneled through the SECURITY DEFINER RPC `get_or_create_conversation`
-- (defined below) so the pair-ordering invariant cannot be violated by clients.
DROP POLICY IF EXISTS "No direct inserts" ON public.conversations;
CREATE POLICY "No direct inserts"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "Members can update last-message" ON public.conversations;
CREATE POLICY "Members can update last-message"
  ON public.conversations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id)
  WITH CHECK (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- =============================================================
-- messages — extend with conversation + listing link
-- =============================================================
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS listing_id uuid,
  ADD COLUMN IF NOT EXISTS listing_kind text;

CREATE INDEX IF NOT EXISTS messages_conversation_idx
  ON public.messages(conversation_id, created_at);

-- Tighten read policy: members of the conversation can read, plus admin.
DROP POLICY IF EXISTS "Users can read their own messages" ON public.messages;
CREATE POLICY "Members can read messages"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    auth.uid() = sender_id
    OR auth.uid() = receiver_id
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
    )
  );

-- INSERT: caller must be the sender and must be a member of the linked
-- conversation (when present).
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Members can send messages"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND (
      conversation_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = conversation_id
          AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
      )
    )
  );

-- UPDATE: receiver can mark read.
-- Existing "Users can update own sent messages" policy already allows the
-- receiver to set read_at; we keep it.

-- =============================================================
-- get_or_create_conversation RPC
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(
  p_other_user uuid,
  p_listing_id uuid DEFAULT NULL,
  p_listing_kind text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'must be authenticated';
  END IF;
  IF p_other_user IS NULL OR p_other_user = v_me THEN
    RAISE EXCEPTION 'invalid recipient';
  END IF;
  IF v_me < p_other_user THEN
    v_a := v_me; v_b := p_other_user;
  ELSE
    v_a := p_other_user; v_b := v_me;
  END IF;

  SELECT id INTO v_id
  FROM public.conversations
  WHERE user_a_id = v_a
    AND user_b_id = v_b
    AND COALESCE(listing_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_listing_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND COALESCE(listing_kind, '') = COALESCE(p_listing_kind, '');

  IF v_id IS NULL THEN
    INSERT INTO public.conversations (user_a_id, user_b_id, listing_id, listing_kind)
    VALUES (v_a, v_b, p_listing_id, p_listing_kind)
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_conversation(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_or_create_conversation(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid, uuid, text) TO authenticated;

-- =============================================================
-- saved_listings
-- =============================================================
CREATE TABLE IF NOT EXISTS public.saved_listings (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL,
  listing_kind text NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, listing_id, listing_kind)
);

CREATE INDEX IF NOT EXISTS saved_listings_user_idx
  ON public.saved_listings(user_id, created_at DESC);

ALTER TABLE public.saved_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads own saves" ON public.saved_listings;
CREATE POLICY "Owner reads own saves"
  ON public.saved_listings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owner inserts own saves" ON public.saved_listings;
CREATE POLICY "Owner inserts own saves"
  ON public.saved_listings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owner deletes own saves" ON public.saved_listings;
CREATE POLICY "Owner deletes own saves"
  ON public.saved_listings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- =============================================================
-- scout_requests
-- =============================================================
CREATE TABLE IF NOT EXISTS public.scout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  listing_kind text NOT NULL,
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'completed', 'cancelled')),
  -- Length cap defends against payload-bloat abuse; mirrored on the client.
  message text DEFAULT '' CHECK (char_length(message) <= 2000),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT scout_requests_distinct CHECK (requester_id <> seller_id)
);

CREATE INDEX IF NOT EXISTS scout_requests_seller_idx
  ON public.scout_requests(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scout_requests_requester_idx
  ON public.scout_requests(requester_id, created_at DESC);

ALTER TABLE public.scout_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants read scout request" ON public.scout_requests;
CREATE POLICY "Participants read scout request"
  ON public.scout_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = seller_id OR public.is_admin());

DROP POLICY IF EXISTS "Requester creates scout request" ON public.scout_requests;
CREATE POLICY "Requester creates scout request"
  ON public.scout_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "Seller updates scout request" ON public.scout_requests;
CREATE POLICY "Seller updates scout request"
  ON public.scout_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = seller_id OR auth.uid() = requester_id)
  WITH CHECK (auth.uid() = seller_id OR auth.uid() = requester_id);

-- =============================================================
-- legacy backfill: stitch existing 1:1 messages into conversations
--
-- Constraints we lean on:
--   * The `messages` table prior to this migration had NO listing_id /
--     listing_kind columns, so every existing row is listing-agnostic by
--     definition. Collapsing per-pair into a single listing-NULL
--     conversation is therefore correct, not lossy.
--   * The WHERE clause explicitly restricts to rows that still have NULL
--     listing context. If a future migration adds listing-scoped legacy
--     rows, they will NOT be touched by this block.
--   * Conversation lookup uses `ORDER BY created_at LIMIT 1` so we always
--     reuse the same row when the partial-unique index admits more than
--     one historical (a,b,NULL,NULL) row (defensive — the index should
--     prevent that, but the back-fill must not crash if it ever happens).
-- =============================================================
DO $$
DECLARE
  r record;
  v_id uuid;
BEGIN
  FOR r IN
    SELECT DISTINCT
      LEAST(sender_id, receiver_id) AS a,
      GREATEST(sender_id, receiver_id) AS b
    FROM public.messages
    WHERE conversation_id IS NULL
      AND listing_id IS NULL
      AND listing_kind IS NULL
  LOOP
    SELECT id INTO v_id FROM public.conversations
    WHERE user_a_id = r.a
      AND user_b_id = r.b
      AND listing_id IS NULL
      AND listing_kind IS NULL
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_id IS NULL THEN
      INSERT INTO public.conversations (user_a_id, user_b_id)
      VALUES (r.a, r.b)
      RETURNING id INTO v_id;
    END IF;

    UPDATE public.messages
    SET conversation_id = v_id
    WHERE conversation_id IS NULL
      AND listing_id IS NULL
      AND listing_kind IS NULL
      AND LEAST(sender_id, receiver_id) = r.a
      AND GREATEST(sender_id, receiver_id) = r.b;
  END LOOP;
END$$;
