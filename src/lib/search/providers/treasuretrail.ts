// TreasureTrail provider — the first (and always-enabled) stage of the search
// waterfall. Searches the local marketplace across every content type the spec
// calls for: Listings, Auctions, Estate Sales, Yard Sales, Flash Finds, and
// Business Listings.
//
// Strategy: reuse the existing, schema-drift-tolerant fetchers and the
// external_listings query (SELECT *), then filter client-side. This avoids
// brittle server-side `.or(...)` filters that 400 the whole query when one
// optional column is missing (see memory: supabase-select-schema-drift).
//
// Search algorithm:
//   1. Tokenize the query into individual words.
//   2. Score each item by summing per-token best-field scores:
//        title=100, tags=80, category=60, description=40, extra fields=20
//   3. Each token is tested with: exact substring → stem match → fuzzy match.
//   4. Category synonyms expand "furniture" to match items in tables/dressers/etc.
//   5. Items with score > 0 are included; sorted by relevanceScore descending.

import { supabase } from '../../supabase';
import { fetchCommunityPosts, fetchMarketplaceListings } from '../../database';
import { fetchPublishedEvents } from '../../events';
import {
  fetchPublishedBusinesses, fetchPublishedBusinessFeaturedItems,
  BUSINESS_CATEGORY_META, BUSINESS_AVAILABILITY_META,
} from '../../businesses';
import { fetchOpenWantedItems, WANTED_CATEGORY_LABEL, type WantedCategory } from '../../wanted';
import type { SearchProvider, SearchResultItem, SearchResultKind } from '../types';

/* ─────────────────────────── Field weights ─────────────────────────────── */

const W_TITLE = 100;
const W_TAGS = 80;
const W_CATEGORY = 60;
const W_DESCRIPTION = 40;
const W_EXTRA = 20;

/* ─────────────────── Category intelligence / synonyms ──────────────────── */

// Keys are user-searchable terms; values are related subcategory/item words.
// Allows "furniture" to surface items tagged as tables, dressers, buffets, etc.
const CATEGORY_SYNONYMS: Record<string, string[]> = {
  furniture: ['furniture', 'table', 'chair', 'dresser', 'cabinet', 'desk', 'bookcase', 'bookshelf', 'buffet', 'sofa', 'couch', 'wardrobe', 'armoire', 'chest', 'credenza', 'hutch', 'sideboard'],
  electronics: ['electronics', 'computer', 'laptop', 'phone', 'tablet', 'tv', 'television', 'audio', 'camera', 'console', 'stereo'],
  clothing: ['clothing', 'clothes', 'apparel', 'shirt', 'pants', 'dress', 'jacket', 'coat', 'shoes', 'boots', 'hat', 'blouse', 'skirt', 'suit'],
  toys: ['toys', 'toy', 'game', 'games', 'puzzle', 'doll', 'lego', 'action figure', 'figurine', 'stuffed'],
  tools: ['tools', 'tool', 'drill', 'saw', 'wrench', 'hammer', 'screwdriver', 'power tool', 'hand tool'],
  jewelry: ['jewelry', 'jewellery', 'ring', 'necklace', 'bracelet', 'earring', 'watch', 'brooch', 'pendant'],
  books: ['books', 'book', 'novel', 'textbook', 'magazine', 'comic', 'manual'],
  art: ['art', 'painting', 'print', 'sculpture', 'artwork', 'drawing', 'lithograph'],
  antiques: ['antiques', 'antique', 'vintage', 'collectible', 'collectibles', 'retro', 'heirloom', 'curio'],
  kitchen: ['kitchen', 'cookware', 'pot', 'pan', 'dish', 'appliance', 'coffee maker', 'blender', 'mixer'],
  sports: ['sports', 'sport', 'fitness', 'exercise', 'gym', 'outdoor', 'camping', 'fishing', 'bike', 'bicycle'],
};

/* ─────────────────────────── Stemmer ────────────────────────────────────── */

// Light suffix-stripping stemmer for common English plurals/verb forms.
// Not a full Porter stemmer — just enough for the query tokens we care about.
function stem(word: string): string {
  const w = word.toLowerCase();
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 5) return w.slice(0, -3) + 'y';   // batteries→battery
  if (w.endsWith('ves') && w.length > 5) return w.slice(0, -3) + 'f';   // knives→knife
  if (w.endsWith('sses') && w.length > 6) return w.slice(0, -2);         // glasses→glass
  if (w.endsWith('ses') && w.length > 5) return w.slice(0, -1);          // gases→gas
  if (w.endsWith('oes') && w.length > 5) return w.slice(0, -2);          // potatoes→potato
  if (w.endsWith('ing') && w.length > 6) return w.slice(0, -3);          // running→run
  if (w.endsWith('tion') && w.length > 6) return w.slice(0, -4);         // auction→auct (good enough)
  if (w.endsWith('ed') && w.length > 5) return w.slice(0, -2);           // painted→paint
  if (w.endsWith('er') && w.length > 5) return w.slice(0, -2);           // dresser→dress (good enough)
  if (w.endsWith('es') && w.length > 4) return w.slice(0, -1);           // tables→table
  if (w.endsWith('s') && w.length > 4) return w.slice(0, -1);            // chairs→chair
  return w;
}

/* ─────────────────────── Levenshtein distance ───────────────────────────── */

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  // Use two rows instead of a full matrix for memory efficiency.
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/* ─────────────────────────── Token scorer ───────────────────────────────── */

// Score a single token against a text field.
// Returns a multiplier: 1.0 = exact, 0.9 = stem, 0.5 = fuzzy, 0 = no match.
function scoreToken(token: string, text: string, allowFuzzy = false): number {
  if (!text || !token) return 0;
  const t = text.toLowerCase();

  // 1. Exact substring match.
  if (t.includes(token)) return 1.0;

  // 2. Stem-based match.
  const tokenStem = stem(token);
  if (tokenStem !== token && t.includes(tokenStem)) return 0.9;

  // 3. Fuzzy word-level match (only for longer tokens to avoid noise).
  if (allowFuzzy && token.length >= 4) {
    const maxDist = token.length >= 6 ? 2 : 1;
    const words = t.split(/[\s\W]+/).filter(Boolean);
    for (const word of words) {
      if (Math.abs(word.length - token.length) <= maxDist + 1) {
        if (levenshtein(word, token) <= maxDist) return 0.5;
        // Also try stem of the text word against the token.
        const wordStem = stem(word);
        if (wordStem !== word && Math.abs(wordStem.length - token.length) <= maxDist + 1) {
          if (levenshtein(wordStem, token) <= maxDist) return 0.45;
        }
      }
    }
  }

  return 0;
}

/* ─────────────────────────── Relevance scorer ───────────────────────────── */

interface ScoredFields {
  title?: string | null;
  tags?: string | null;
  category?: string | null;
  description?: string | null;
  extra?: string | null;   // city, region, seller handle, platform, etc.
}

/**
 * Compute a relevance score for an item against a raw search query.
 * Returns 0 when nothing matches (item should be excluded).
 *
 * Algorithm:
 *   - Tokenize the query into individual words.
 *   - For each token (expanded with category synonyms where applicable):
 *       multiply the token's field match multiplier by the field weight.
 *   - Sum the best-per-original-token scores across all fields.
 *   - Bonus: a multi-token query where ALL tokens match scores higher than
 *     a query where only some tokens match (complete-match multiplier ×1.5).
 */
function computeScore(query: string, fields: ScoredFields): number {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;

  let totalScore = 0;
  let matchedTokens = 0;

  for (const token of tokens) {
    // Expand this token with category synonyms so "furniture" matches "table".
    const variants = CATEGORY_SYNONYMS[token]
      ? Array.from(new Set([token, ...CATEGORY_SYNONYMS[token]]))
      : [token];

    let tokenBestScore = 0;

    for (const variant of variants) {
      const titleScore  = scoreToken(variant, fields.title ?? '', true)  * W_TITLE;
      const tagsScore   = scoreToken(variant, fields.tags ?? '', false)  * W_TAGS;
      const catScore    = scoreToken(variant, fields.category ?? '', false) * W_CATEGORY;
      const descScore   = scoreToken(variant, fields.description ?? '', true) * W_DESCRIPTION;
      const extraScore  = scoreToken(variant, fields.extra ?? '', false) * W_EXTRA;

      const best = Math.max(titleScore, tagsScore, catScore, descScore, extraScore);
      if (best > tokenBestScore) tokenBestScore = best;
    }

    if (tokenBestScore > 0) matchedTokens++;
    totalScore += tokenBestScore;
  }

  if (totalScore === 0) return 0;

  // Bonus for matching all tokens (complete-phrase quality boost).
  if (tokens.length > 1 && matchedTokens === tokens.length) {
    totalScore *= 1.5;
  }

  return Math.round(totalScore);
}

/* ─────────────────────────── Helpers ───────────────────────────────────── */

function numOrNull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) {
    return (value as { data: T[] }).data;
  }
  return [];
}

function eventKind(category?: string | null): SearchResultKind {
  const c = (category ?? '').toLowerCase();
  if (c.includes('estate')) return 'estate_sale';
  if (c.includes('yard') || c.includes('garage')) return 'yard_sale';
  return 'auction';
}

/* ─────────────────────────── Main search ───────────────────────────────── */

async function searchTreasureTrail(term: string): Promise<SearchResultItem[]> {
  const q = term.trim().toLowerCase();
  if (!q) return [];

  const [postsRaw, marketRaw, eventsRaw, businessesRaw, bizItemsRaw, wantedRaw, externalRaw] = await Promise.all([
    fetchCommunityPosts(100).catch(() => []),
    fetchMarketplaceListings(100).catch(() => []),
    fetchPublishedEvents({ limit: 100 }).catch(() => []),
    fetchPublishedBusinesses().catch(() => []),
    fetchPublishedBusinessFeaturedItems().catch(() => []),
    fetchOpenWantedItems({ limit: 100 }).catch(() => []),
    supabase
      .from('external_listings')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(100)
      .then((r) => r.data ?? [])
      .then((d) => d, () => []),
  ]);

  const items: SearchResultItem[] = [];

  // Flash Finds — community_posts
  for (const p of asArray<Record<string, unknown>>(postsRaw)) {
    const tags = Array.isArray(p.tags) ? (p.tags as string[]).join(' ') : String(p.tags ?? '');
    const score = computeScore(q, {
      title: p.caption as string,
      tags,
      category: p.category as string,
      description: p.description as string,
      extra: p.location as string,
    });
    if (score > 0) {
      items.push({
        id: String(p.id),
        source: 'treasuretrail',
        kind: 'flash_find',
        title: (p.caption as string) || 'Flash Find',
        subtitle: (p.location as string) || null,
        price: (p.estimated_value as number) ?? null,
        imageUrl: (p.image_url as string) ?? null,
        route: `/find/${p.id}`,
        category: (p.category as string) ?? null,
        relevanceScore: score,
      });
    }
  }

  // Wanted Requests — wanted_items (open requests; routed to the detail page)
  for (const w of asArray<Record<string, unknown>>(wantedRaw)) {
    const cat = w.category as WantedCategory;
    const score = computeScore(q, {
      title: w.title as string,
      category: WANTED_CATEGORY_LABEL[cat] ?? (w.category as string),
      description: w.description as string,
      extra: [w.city, w.region].filter(Boolean).join(' '),
    });
    if (score > 0) {
      const loc = [w.city, w.region].filter(Boolean).join(', ');
      items.push({
        id: String(w.id),
        source: 'treasuretrail',
        kind: 'wanted',
        title: (w.title as string) || 'In Search Of Request',
        subtitle: loc || null,
        price: (w.max_budget as number) ?? null,
        imageUrl: (w.thumb_url as string) || (w.image_url as string) || null,
        route: `/wanted/${w.id}`,
        category: (w.category as string) ?? null,
        lat: numOrNull(w.lat),
        lng: numOrNull(w.lng),
        relevanceScore: score,
      });
    }
  }

  // Business Listings — marketplace_listings
  for (const m of asArray<Record<string, unknown>>(marketRaw)) {
    const score = computeScore(q, {
      title: m.title as string,
      category: m.category as string,
      description: m.description as string,
      extra: [m.general_location, m.condition, m.subcategory].filter(Boolean).join(' '),
    });
    if (score > 0) {
      items.push({
        id: String(m.id),
        source: 'treasuretrail',
        kind: 'business',
        title: (m.title as string) || 'Listing',
        subtitle: (m.general_location as string) || (m.condition as string) || null,
        price: (m.price as number) ?? null,
        imageUrl: (m.image_url as string) ?? null,
        route: `/listing/${m.id}`,
        category: (m.category as string) ?? null,
        lat: numOrNull(m.lat),
        lng: numOrNull(m.lng),
        relevanceScore: score,
      });
    }
  }

  // Auctions / Estate Sales / Yard Sales — events
  for (const e of asArray<Record<string, unknown>>(eventsRaw)) {
    const score = computeScore(q, {
      title: e.title as string,
      category: e.category as string,
      description: e.description as string,
      extra: [e.city, e.region, e.address].filter(Boolean).join(' '),
    });
    if (score > 0) {
      const loc = [e.city, e.region].filter(Boolean).join(', ');
      items.push({
        id: String(e.id),
        source: 'treasuretrail',
        kind: eventKind(e.category as string),
        title: (e.title as string) || 'Event',
        subtitle: loc || null,
        price: null,
        imageUrl: (e.cover_thumb_url as string) || (e.cover_image_url as string) || null,
        route: `/event/${e.id}`,
        category: (e.category as string) ?? null,
        lat: numOrNull(e.lat),
        lng: numOrNull(e.lng),
        relevanceScore: score,
      });
    }
  }

  // Businesses on the Treasure Map — businesses
  for (const b of asArray<Record<string, unknown>>(businessesRaw)) {
    const cat = b.category as keyof typeof BUSINESS_CATEGORY_META;
    const catLabel = BUSINESS_CATEGORY_META[cat]?.label ?? '';
    const score = computeScore(q, {
      title: b.name as string,
      category: catLabel,
      description: b.description as string,
      extra: [b.city, b.region, b.address].filter(Boolean).join(' '),
    });
    if (score > 0) {
      const loc = [b.city, b.region].filter(Boolean).join(', ');
      items.push({
        id: String(b.id),
        source: 'treasuretrail',
        kind: 'business',
        title: (b.name as string) || 'Business',
        subtitle: loc || catLabel || null,
        price: null,
        imageUrl: (b.logo_thumb_url as string) || (b.logo_url as string) ||
          ((b.photos as any[])?.[0]?.thumb_url) || ((b.photos as any[])?.[0]?.url) || null,
        route: `/business/${b.id}`,
        category: catLabel || null,
        lat: numOrNull(b.lat),
        lng: numOrNull(b.lng),
        relevanceScore: score,
      });
    }
  }

  // Business featured items — surface a specific item and link back to its
  // business. These mirror event featured items but live on the Treasure Map.
  for (const it of asArray<Record<string, unknown>>(bizItemsRaw)) {
    const score = computeScore(q, {
      title: it.title as string,
      category: (it.category as string) ?? '',
      description: (it.description as string) ?? '',
      extra: (it.business_name as string) ?? '',
    });
    if (score > 0) {
      const avail = (it.availability as keyof typeof BUSINESS_AVAILABILITY_META) ?? 'available';
      const bizName = (it.business_name as string) || 'Business';
      const subtitle =
        avail === 'available'
          ? bizName
          : `${bizName} · ${BUSINESS_AVAILABILITY_META[avail]?.label ?? avail}`;
      items.push({
        id: `bizitem-${String(it.id)}`,
        source: 'treasuretrail',
        kind: 'business',
        title: (it.title as string) || 'Item',
        subtitle,
        price: (it.price as number) ?? null,
        imageUrl: (it.thumb_url as string) || (it.image_url as string) || null,
        route: `/business/${it.business_id}`,
        category: (it.category as string) ?? null,
        relevanceScore: score,
      });
    }
  }

  // Listings — external_listings
  for (const l of asArray<Record<string, unknown>>(externalRaw)) {
    const score = computeScore(q, {
      title: l.title as string,
      category: l.category as string,
      description: l.description as string,
      extra: [l.platform, l.seller_name].filter(Boolean).join(' '),
    });
    if (score > 0) {
      const url =
        (l.url as string) ||
        (l.listing_url as string) ||
        (l.source_url as string) ||
        (l.external_url as string) ||
        null;
      items.push({
        id: String(l.id),
        source: 'treasuretrail',
        kind: 'listing',
        title: (l.title as string) || 'Listing',
        subtitle: (l.platform as string) || null,
        price: (l.price as number) ?? null,
        imageUrl: (l.image_url as string) || (l.thumb_url as string) || null,
        route: url ? null : '/auctions',
        externalUrl: url,
        category: (l.category as string) ?? null,
        relevanceScore: score,
      });
    }
  }

  // Sort by relevance descending before handing off to the aggregator
  // (the aggregator will re-sort by distance within sections, but relevanceScore
  // is preserved so the UI can show it as a secondary sort signal).
  items.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));

  if (import.meta.env.DEV) {
    const tokens = q.split(/\s+/).filter(Boolean);
    console.debug(
      `[search] query="${q}" tokens=${JSON.stringify(tokens)} results=${items.length}`,
      items.slice(0, 5).map((it) => ({ title: it.title, score: it.relevanceScore, kind: it.kind })),
    );
  }

  return items;
}

export const treasureTrailProvider: SearchProvider = {
  source: 'treasuretrail',
  label: 'TreasureTrail Marketplace',
  isEnabled: () => true,
  search: searchTreasureTrail,
};
