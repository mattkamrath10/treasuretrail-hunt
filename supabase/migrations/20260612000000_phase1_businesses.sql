-- =============================================================================
-- PHASE 1 — Businesses on the Treasure Map
-- =============================================================================
-- Adds a `businesses` table so the map can show year-round brick-and-mortar
-- treasure-hunting locations (antique stores, thrift stores, pawn shops,
-- estate-sale companies, auction houses, consignment, flea markets, vintage)
-- alongside the transient `events` feed.
--
-- Design notes
--   * Mirrors the `events` table conventions: owner reference, lat/lng,
--     address/city/region, image columns, status enum, updated_at trigger.
--   * Ownership: ANY authenticated user may create a business (owner_id =
--     auth.uid()). Unlike events there is no is_holder() gate — a business is
--     a public place, not a seller account feature.
--   * RLS: public reads 'published' rows (or the owner's own); owner-only writes.
--   * `verified` and `featured` are privileged trust columns. A BEFORE
--     INSERT/UPDATE escalation guard forces them to stay false for normal
--     callers (request.jwt.claims role = 'authenticated'); only service-role
--     / admin may set them. Mirrors the revenue_lockdown escalation guard.
-- =============================================================================

-- 1. businesses --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.businesses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name             text NOT NULL,
  description      text NOT NULL DEFAULT '',
  category         text NOT NULL DEFAULT 'antique_store'
                     CHECK (category IN (
                       'antique_store','thrift_store','pawn_shop',
                       'estate_sale_company','auction_house','consignment_store',
                       'flea_market','vintage_store'
                     )),
  address          text,
  city             text,
  region           text,
  lat              double precision,
  lng              double precision,
  phone            text,
  website          text,
  facebook_url     text,
  hours            text,
  logo_url         text,
  logo_thumb_url   text,
  photos           jsonb NOT NULL DEFAULT '[]'::jsonb,
  status           text NOT NULL DEFAULT 'published'
                     CHECK (status IN ('draft','published','cancelled')),
  verified         boolean NOT NULL DEFAULT false,
  featured         boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS businesses_owner_idx    ON public.businesses (owner_id);
CREATE INDEX IF NOT EXISTS businesses_status_idx   ON public.businesses (status);
CREATE INDEX IF NOT EXISTS businesses_category_idx ON public.businesses (category) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS businesses_city_idx     ON public.businesses (city) WHERE status = 'published';

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS businesses_select_public ON public.businesses;
CREATE POLICY businesses_select_public ON public.businesses
  FOR SELECT TO authenticated, anon
  USING (status = 'published' OR auth.uid() = owner_id);

DROP POLICY IF EXISTS businesses_insert_own ON public.businesses;
CREATE POLICY businesses_insert_own ON public.businesses
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS businesses_update_own ON public.businesses;
CREATE POLICY businesses_update_own ON public.businesses
  FOR UPDATE TO authenticated
  USING      (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS businesses_delete_own ON public.businesses;
CREATE POLICY businesses_delete_own ON public.businesses
  FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);

-- 2. updated_at trigger ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.businesses_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS businesses_updated_at ON public.businesses;
CREATE TRIGGER businesses_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.businesses_set_updated_at();

-- 3. escalation guard for privileged columns --------------------------------
-- `verified` / `featured` confer trust + promotional visibility, so a normal
-- authenticated user must never be able to set them on themselves. The guard
-- runs as a trigger (RLS gates the row, the trigger gates the columns):
--   * INSERT  → force both false.
--   * UPDATE  → freeze both to their OLD values.
-- Service-role / admin callers (whose JWT role is NOT 'authenticated') bypass
-- the guard so backend grants can still flip the flags. Mirrors the pattern in
-- 20260529000002_revenue_lockdown.sql.
CREATE OR REPLACE FUNCTION public.prevent_business_field_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claims', true)::json ->> 'role';
BEGIN
  -- Only constrain normal end users. Service-role / admin (role <>
  -- 'authenticated', or no JWT at all in server context) may set the flags.
  IF v_role IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.verified := false;
    NEW.featured := false;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.verified := OLD.verified;
    NEW.featured := OLD.featured;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS businesses_prevent_escalation ON public.businesses;
CREATE TRIGGER businesses_prevent_escalation
  BEFORE INSERT OR UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.prevent_business_field_escalation();
