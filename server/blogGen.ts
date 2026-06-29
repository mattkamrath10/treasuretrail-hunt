// =====================================================================
// Shared blog generation + persistence logic
// ---------------------------------------------------------------------
// Used by both the admin endpoints in index.ts (manual authoring) and the
// autopilot script in scripts/autopublishBlog.ts (scheduled, hands-off
// publishing). Keeping the prompt, normalization, and row-builder here means
// the manual and automated paths can never drift apart.
// =====================================================================
import type OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';

export const BLOG_CATEGORY_SLUGS = [
  'estate-sales',
  'garage-sales',
  'flea-markets',
  'auctions',
  'collectibles',
  'hot-wheels',
  'vintage-toys',
  'reselling',
  'treasure-hunting',
  'event-hosting',
];

export const BLOG_SYSTEM_PROMPT = `You are an expert SEO content writer for TreasureTrail, an app for finding estate sales, garage sales, flea markets, auctions, and collectibles. You write helpful, accurate, genuinely useful articles for treasure hunters and resellers, with a primary geographic focus on California's Central Valley (Madera, Fresno, Kings, Tulare, and Kern counties) when a location is provided.

Write in a warm, practical, expert tone. Use real, actionable advice — no fluff, no keyword stuffing. Target ~900-1300 words. Use markdown for the body (## and ### headings, short paragraphs, bullet lists). Naturally encourage readers to use TreasureTrail to find local events, but do not be salesy.

Return a SINGLE JSON object matching this schema exactly. No prose, no markdown fences:
{
  "title": string,            // compelling, specific H1 (<= 65 chars ideal)
  "slug": string,             // url-safe kebab-case, lowercase, no stop-word filler
  "seo_title": string,        // <= 60 chars, includes primary keyword
  "meta_description": string, // 140-160 chars, compelling, includes location if given
  "excerpt": string,          // 1-2 sentence summary for the article card
  "body_md": string,          // the full article in markdown (## headings, lists)
  "tags": string[],           // 4-8 lowercase topical tags
  "faq": [ { "q": string, "a": string } ]  // 3-5 relevant Q&As
}`;

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

export interface BlogGenParams {
  topic: string;
  category?: string;
  county?: string | null;
  city?: string | null;
}

export interface BlogDraft {
  title: string;
  slug: string;
  seo_title?: string;
  meta_description?: string;
  excerpt?: string;
  body_md: string;
  category: string;
  tags: string[];
  faq: { q: string; a: string }[];
  county: string | null;
  city: string | null;
  read_minutes: number;
}

function buildUserPrompt(p: BlogGenParams, cat: string): string {
  const locParts = [p.city, p.county].filter(Boolean).join(', ');
  return (
    `Topic: ${p.topic.trim()}\n` +
    `Category (slug): ${cat}\n` +
    (locParts ? `Location focus: ${locParts}, California Central Valley\n` : '') +
    `Write the article now as the JSON object.`
  );
}

// Calls the model and returns a normalized, ready-to-save draft. Throws on a
// bad topic or malformed model output so callers can surface a clean error.
export async function generateBlogDraft(
  openai: OpenAI,
  model: string,
  params: BlogGenParams,
): Promise<BlogDraft> {
  if (!params.topic || typeof params.topic !== 'string' || params.topic.trim().length < 3) {
    throw new Error('A topic is required.');
  }
  const cat =
    params.category && BLOG_CATEGORY_SLUGS.includes(params.category)
      ? params.category
      : 'treasure-hunting';

  const resp = await openai.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    max_completion_tokens: 3500,
    messages: [
      { role: 'system', content: BLOG_SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(params, cat) },
    ],
  });

  const raw = resp.choices[0]?.message?.content ?? '{}';
  let draft: any;
  try {
    draft = JSON.parse(raw);
  } catch {
    throw new Error('Model returned malformed JSON.');
  }

  draft.slug = slugify(draft.slug || draft.title || params.topic);
  draft.category = cat;
  draft.county = params.county || null;
  draft.city = params.city || null;
  if (!Array.isArray(draft.tags)) draft.tags = [];
  if (!Array.isArray(draft.faq)) draft.faq = [];
  const words = String(draft.body_md || '').trim().split(/\s+/).filter(Boolean).length;
  draft.read_minutes = Math.max(1, Math.round(words / 200));
  return draft as BlogDraft;
}

// Builds the blog_posts row from an arbitrary post payload, applying the same
// defaults and validation the admin save path uses.
export function buildPostRow(p: Record<string, any>): Record<string, any> {
  const title = typeof p.title === 'string' ? p.title.trim() : '';
  if (!title) throw new Error('title is required.');
  const category = BLOG_CATEGORY_SLUGS.includes(p.category) ? p.category : 'treasure-hunting';
  const status = p.status === 'published' ? 'published' : 'draft';
  const slug = slugify(p.slug || title);
  if (!slug) throw new Error('A valid slug is required.');

  return {
    slug,
    title,
    seo_title: p.seo_title ?? null,
    meta_description: p.meta_description ?? null,
    excerpt: p.excerpt ?? null,
    body_md: typeof p.body_md === 'string' ? p.body_md : '',
    category,
    tags: Array.isArray(p.tags) ? p.tags : [],
    cover_image_url: p.cover_image_url ?? null,
    cover_thumb_url: p.cover_thumb_url ?? null,
    county: p.county ?? null,
    city: p.city ?? null,
    faq: Array.isArray(p.faq) ? p.faq : [],
    author: typeof p.author === 'string' && p.author.trim() ? p.author.trim() : 'TreasureTrail',
    read_minutes: typeof p.read_minutes === 'number' ? p.read_minutes : null,
    status,
    published_at: status === 'published' ? (p.published_at || new Date().toISOString()) : null,
  };
}

// Upserts a post (keyed on slug) via a service-role client. Returns the saved
// { id, slug, status }. Throws on a database error.
export async function saveBlogPost(
  sb: SupabaseClient,
  post: Record<string, any>,
): Promise<{ id: string; slug: string; status: string }> {
  const row = buildPostRow(post);
  const { data, error } = await sb
    .from('blog_posts')
    .upsert(row, { onConflict: 'slug' })
    .select('id, slug, status')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; slug: string; status: string };
}

// ---------------------------------------------------------------------
// Autopilot topic rotation
// ---------------------------------------------------------------------
// A curated backlog of evergreen, location-aware topics. The scheduled job
// picks the first one whose slug isn't already published, so it works through
// the list without repeating, then falls back to a random pick once exhausted.
export interface AutopilotTopic {
  topic: string;
  category: string;
  county?: string;
  city?: string;
}

export const AUTOPILOT_TOPICS: AutopilotTopic[] = [
  { topic: 'How to find the best estate sales near you', category: 'estate-sales', county: 'Fresno' },
  { topic: 'A beginner’s guide to flipping garage sale finds for profit', category: 'reselling' },
  { topic: 'Spotting valuable vintage toys at flea markets', category: 'vintage-toys' },
  { topic: 'How to read a Hot Wheels for value: variations, eras, and rarity', category: 'hot-wheels' },
  { topic: 'Live online auctions vs. in-person auctions: which is better for resellers', category: 'auctions' },
  { topic: 'Estate sale etiquette: do’s and don’ts for serious treasure hunters', category: 'estate-sales', county: 'Kern' },
  { topic: 'The best days and times to hit garage sales for the best deals', category: 'garage-sales' },
  { topic: 'How to price collectibles you found at a thrift store', category: 'collectibles' },
  { topic: 'Hidden gem flea markets in California’s Central Valley', category: 'flea-markets', county: 'Tulare' },
  { topic: 'How to host a successful estate sale that draws a crowd', category: 'event-hosting', county: 'Madera' },
  { topic: 'Identifying authentic vintage clothing vs. reproductions', category: 'collectibles' },
  { topic: 'A reseller’s guide to sourcing inventory year-round', category: 'reselling' },
  { topic: 'What sells fast: the most in-demand secondhand categories right now', category: 'reselling' },
  { topic: 'How to safely buy and sell at local auctions', category: 'auctions' },
  { topic: 'Treasure hunting on a budget: maximizing finds with limited cash', category: 'treasure-hunting' },
  { topic: 'How to spot fakes and reproductions before you buy', category: 'collectibles' },
  { topic: 'Building a side hustle reselling vintage finds in the Central Valley', category: 'reselling', county: 'Kings' },
  { topic: 'The collector’s guide to vintage Pyrex and kitchenware', category: 'collectibles' },
  { topic: 'How to clean and restore vintage finds without ruining their value', category: 'treasure-hunting' },
  { topic: 'Garage sale vs. estate sale: what’s the difference and where to find more', category: 'garage-sales' },
];

// Returns the next topic to write about: the first curated topic whose slug
// isn't already in blog_posts, or a random one once they're all published.
export async function pickAutopilotTopic(sb: SupabaseClient): Promise<AutopilotTopic> {
  let usedSlugs = new Set<string>();
  try {
    const { data } = await sb.from('blog_posts').select('slug').limit(2000);
    usedSlugs = new Set((data ?? []).map((r: any) => String(r.slug)));
  } catch {
    // If the lookup fails we still want to publish something, so fall through
    // to the random pick below rather than blocking the whole run.
  }
  const fresh = AUTOPILOT_TOPICS.find((t) => !usedSlugs.has(slugify(t.topic)));
  if (fresh) return fresh;
  return AUTOPILOT_TOPICS[Math.floor(Math.random() * AUTOPILOT_TOPICS.length)];
}
