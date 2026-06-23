-- =============================================================================
-- SEO PHASE 1 — Blog / Articles (organic-growth content engine)
-- =============================================================================
-- Backs the public Blog: evergreen + location articles that rank on Google and
-- funnel visitors into events / marketplace / sign-up. Content is created by an
-- admin (AI-assisted) and written SERVER-SIDE via the service-role key, so this
-- table intentionally has NO end-user write policies — only public reads of
-- published rows. The service role bypasses RLS for inserts/updates.
--
-- Design notes
--   * Mirrors existing table conventions (uuid pk, status enum, updated_at
--     trigger, partial indexes on published rows).
--   * `slug` is the public URL key (/blog/:slug) and must be unique.
--   * `county` / `city` power the Central Valley location pages later (Madera,
--     Fresno, Kings, Tulare, Kern). Free text; categories are constrained.
--   * `faq` is a jsonb array of { "q": string, "a": string } for FAQ schema.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.blog_posts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text NOT NULL UNIQUE,
  title            text NOT NULL,
  seo_title        text,
  meta_description text,
  excerpt          text,
  body_md          text NOT NULL DEFAULT '',
  category         text NOT NULL DEFAULT 'treasure-hunting'
                     CHECK (category IN (
                       'estate-sales','garage-sales','flea-markets','auctions',
                       'collectibles','hot-wheels','vintage-toys','reselling',
                       'treasure-hunting','event-hosting'
                     )),
  tags             text[] NOT NULL DEFAULT '{}',
  cover_image_url  text,
  cover_thumb_url  text,
  county           text,
  city             text,
  faq              jsonb NOT NULL DEFAULT '[]'::jsonb,
  author           text NOT NULL DEFAULT 'TreasureTrail',
  read_minutes     integer,
  status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','published','archived')),
  published_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blog_posts_status_idx
  ON public.blog_posts (status, published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS blog_posts_category_idx
  ON public.blog_posts (category) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS blog_posts_county_idx
  ON public.blog_posts (county) WHERE status = 'published';

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- Public read of published rows only. No anon/authenticated write policies:
-- all writes go through the service role (admin AI composer), which bypasses
-- RLS. This keeps the content surface admin-only with no self-serve path.
DROP POLICY IF EXISTS blog_posts_select_public ON public.blog_posts;
CREATE POLICY blog_posts_select_public ON public.blog_posts
  FOR SELECT TO authenticated, anon
  USING (status = 'published');

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.blog_posts_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS blog_posts_updated_at ON public.blog_posts;
CREATE TRIGGER blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.blog_posts_set_updated_at();
