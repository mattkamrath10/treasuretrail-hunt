/**
 * Blog / Articles data layer (SEO content engine).
 *
 * Content is admin-authored (AI-assisted) and stored in the `blog_posts` table.
 * All reads here use the public anon client and only ever see `published` rows
 * (enforced by RLS). Every fetcher SOFT-FAILS to an empty result when the table
 * doesn't exist yet (PostgREST `PGRST205`) or a column is missing during a
 * migration window (`42703`), so the app never breaks before the migration is
 * applied. Writes are server-side only (service role) — see /api/blog/*.
 */
import { supabase } from './supabase';

export interface BlogCategory {
  slug: string;
  label: string;
  blurb: string;
}

/** The 10 content categories from the growth plan (DB-constrained slugs). */
export const BLOG_CATEGORIES: BlogCategory[] = [
  { slug: 'estate-sales',     label: 'Estate Sales',     blurb: 'Finding, pricing, and winning estate sales.' },
  { slug: 'garage-sales',     label: 'Garage Sales',     blurb: 'Yard & garage sale strategy and routes.' },
  { slug: 'flea-markets',     label: 'Flea Markets',     blurb: 'Flea market hauls, haggling, and resale.' },
  { slug: 'auctions',         label: 'Auctions',         blurb: 'Live and online auction tactics.' },
  { slug: 'collectibles',     label: 'Collectibles',     blurb: 'What to collect and what it is worth.' },
  { slug: 'hot-wheels',       label: 'Hot Wheels',       blurb: 'Hunting and valuing Hot Wheels.' },
  { slug: 'vintage-toys',     label: 'Vintage Toys',     blurb: 'Vintage toy identification and value.' },
  { slug: 'reselling',        label: 'Reselling',        blurb: 'Sourcing, listing, and flipping for profit.' },
  { slug: 'treasure-hunting', label: 'Treasure Hunting', blurb: 'Tips for the everyday treasure hunter.' },
  { slug: 'event-hosting',    label: 'Event Hosting',    blurb: 'Run a sale or event that sells out.' },
];

const CATEGORY_BY_SLUG = new Map(BLOG_CATEGORIES.map((c) => [c.slug, c]));

export function categoryLabel(slug: string | null | undefined): string {
  if (!slug) return '';
  return CATEGORY_BY_SLUG.get(slug)?.label ?? slug;
}

export function getCategory(slug: string): BlogCategory | undefined {
  return CATEGORY_BY_SLUG.get(slug);
}

/** Central Valley counties this content program primarily targets. */
export const CENTRAL_VALLEY_COUNTIES = [
  'Madera County',
  'Fresno County',
  'Kings County',
  'Tulare County',
  'Kern County',
] as const;

export interface BlogFaq {
  q: string;
  a: string;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  seo_title: string | null;
  meta_description: string | null;
  excerpt: string | null;
  body_md: string;
  category: string;
  tags: string[];
  cover_image_url: string | null;
  cover_thumb_url: string | null;
  county: string | null;
  city: string | null;
  faq: BlogFaq[];
  author: string;
  read_minutes: number | null;
  status: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLS =
  'id, slug, title, seo_title, meta_description, excerpt, body_md, category, tags, ' +
  'cover_image_url, cover_thumb_url, county, city, faq, author, read_minutes, ' +
  'status, published_at, created_at, updated_at';

/** True when a Supabase error means "table/column not there yet" — soft-fail. */
function isMissingSchema(err: { code?: string } | null): boolean {
  return err?.code === 'PGRST205' || err?.code === '42703';
}

function normalize(row: any): BlogPost {
  return {
    ...row,
    tags: Array.isArray(row.tags) ? row.tags : [],
    faq: Array.isArray(row.faq) ? row.faq : [],
  } as BlogPost;
}

export interface ListPostsOpts {
  category?: string;
  county?: string;
  limit?: number;
}

/** Published posts, newest first. Optionally filtered by category / county. */
export async function fetchPublishedPosts(opts: ListPostsOpts = {}): Promise<BlogPost[]> {
  try {
    let q = supabase
      .from('blog_posts')
      .select(SELECT_COLS)
      .eq('status', 'published')
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (opts.category) q = q.eq('category', opts.category);
    if (opts.county) q = q.eq('county', opts.county);
    if (opts.limit) q = q.limit(opts.limit);

    const { data, error } = await q;
    if (error) {
      if (isMissingSchema(error)) return [];
      console.warn('[blog] fetchPublishedPosts failed:', error.message);
      return [];
    }
    return (data ?? []).map(normalize);
  } catch (e: any) {
    console.warn('[blog] fetchPublishedPosts threw:', e?.message);
    return [];
  }
}

/** A single published post by slug, or null if missing / not yet migrated. */
export async function fetchPostBySlug(slug: string): Promise<BlogPost | null> {
  try {
    const { data, error } = await supabase
      .from('blog_posts')
      .select(SELECT_COLS)
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();
    if (error) {
      if (isMissingSchema(error)) return null;
      console.warn('[blog] fetchPostBySlug failed:', error.message);
      return null;
    }
    return data ? normalize(data) : null;
  } catch (e: any) {
    console.warn('[blog] fetchPostBySlug threw:', e?.message);
    return null;
  }
}

/** Other published posts in the same category (for internal linking). */
export async function fetchRelatedPosts(
  category: string,
  excludeSlug: string,
  limit = 3,
): Promise<BlogPost[]> {
  try {
    const { data, error } = await supabase
      .from('blog_posts')
      .select(SELECT_COLS)
      .eq('status', 'published')
      .eq('category', category)
      .neq('slug', excludeSlug)
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      if (isMissingSchema(error)) return [];
      console.warn('[blog] fetchRelatedPosts failed:', error.message);
      return [];
    }
    return (data ?? []).map(normalize);
  } catch (e: any) {
    console.warn('[blog] fetchRelatedPosts threw:', e?.message);
    return [];
  }
}

/** Estimate read time from markdown body (~200 wpm). */
export function estimateReadMinutes(body: string): number {
  const words = (body || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
