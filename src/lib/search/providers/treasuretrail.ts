// TreasureTrail provider — the first (and always-enabled) stage of the search
// waterfall. Searches the local marketplace across every content type the spec
// calls for: Listings, Auctions, Estate Sales, Yard Sales, Flash Finds, and
// Business Listings.
//
// Strategy: reuse the existing, schema-drift-tolerant fetchers and the
// external_listings query (SELECT *), then filter client-side. This avoids
// brittle server-side `.or(...)` filters that 400 the whole query when one
// optional column is missing (see memory: supabase-select-schema-drift).

import { supabase } from '../../supabase';
import { fetchCommunityPosts, fetchMarketplaceListings } from '../../database';
import { fetchPublishedEvents } from '../../events';
import type { SearchProvider, SearchResultItem, SearchResultKind } from '../types';

function matches(term: string, ...fields: Array<string | null | undefined>): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return false;
  return fields.some((f) => (f ?? '').toLowerCase().includes(q));
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

async function searchTreasureTrail(term: string): Promise<SearchResultItem[]> {
  const q = term.trim();
  if (!q) return [];

  const [postsRaw, marketRaw, eventsRaw, externalRaw] = await Promise.all([
    fetchCommunityPosts(100).catch(() => []),
    fetchMarketplaceListings(100).catch(() => []),
    fetchPublishedEvents({ limit: 100 }).catch(() => []),
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
    const tags = Array.isArray(p.tags) ? (p.tags as string[]).join(' ') : '';
    if (matches(q, p.caption as string, p.description as string, p.category as string, tags)) {
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
      });
    }
  }

  // Business Listings — marketplace_listings
  for (const m of asArray<Record<string, unknown>>(marketRaw)) {
    if (matches(q, m.title as string, m.description as string, m.category as string)) {
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
      });
    }
  }

  // Auctions / Estate Sales / Yard Sales — events
  for (const e of asArray<Record<string, unknown>>(eventsRaw)) {
    if (
      matches(
        q,
        e.title as string,
        e.description as string,
        e.category as string,
        e.city as string,
        e.region as string,
      )
    ) {
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
      });
    }
  }

  // Listings — external_listings (may link out to the source platform)
  for (const l of asArray<Record<string, unknown>>(externalRaw)) {
    if (matches(q, l.title as string, l.description as string, l.category as string, l.platform as string)) {
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
      });
    }
  }

  return items;
}

export const treasureTrailProvider: SearchProvider = {
  source: 'treasuretrail',
  label: 'TreasureTrail Marketplace',
  isEnabled: () => true,
  search: searchTreasureTrail,
};
