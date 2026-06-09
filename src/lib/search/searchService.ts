// Centralized search service — the single entry point every search box uses.
//
// Local-First aggregator. TreasureTrail is the primary source: its results are
// split by distance from the searcher's location into priority sections —
//   1. "Near You"                       (in-radius TreasureTrail listings)
//   2. "More TreasureTrail Results"     (out-of-radius / unknown distance)
//   3. "Nearby Events That May Have This Item" (events, sorted by distance)
// If TreasureTrail returns nothing, we fall through to the next enabled
// marketplace provider (eBay → Etsy), preserving the old waterfall feel as a
// last resort. Google Search / Google Shopping remain UI-only fallback buttons.
//
// Distance requires an `origin` (the searcher's coordinates) AND item coords.
// Without an origin we don't section by distance — TreasureTrail items render
// as one block and events as another, exactly like before.

import type {
  SearchOutcome,
  SearchProvider,
  SearchResultItem,
  SearchSection,
  SearchResultKind,
} from './types';
import { treasureTrailProvider } from './providers/treasuretrail';
import { ebayProvider } from './providers/ebay';
import { etsyProvider } from './providers/etsy';
import { haversineMiles, type GeoPoint } from '../geocode';

/** Extra providers tried only when TreasureTrail returns nothing. */
const FALLBACK_PROVIDERS: SearchProvider[] = [ebayProvider, etsyProvider];

const EVENT_KINDS: ReadonlySet<SearchResultKind> = new Set<SearchResultKind>([
  'auction',
  'estate_sale',
  'yard_sale',
]);

export interface SearchOptions {
  signal?: AbortSignal;
  /** The searcher's coordinates. When present, results are distance-sectioned. */
  origin?: GeoPoint | null;
  /** Travel radius in miles. null/undefined = "Anywhere" (no upper bound). */
  radiusMiles?: number | null;
}

const emptyOutcome = (term: string): SearchOutcome => ({
  term,
  source: null,
  label: null,
  items: [],
  sections: [],
});

/** Attach `distanceMiles` to items that have coords, given an origin. */
function withDistance(items: SearchResultItem[], origin: GeoPoint | null): SearchResultItem[] {
  if (!origin) return items;
  return items.map((it) => {
    if (typeof it.lat === 'number' && typeof it.lng === 'number') {
      return { ...it, distanceMiles: haversineMiles(origin, { lat: it.lat, lng: it.lng }) };
    }
    return { ...it, distanceMiles: null };
  });
}

const byDistance = (a: SearchResultItem, b: SearchResultItem): number => {
  const da = a.distanceMiles ?? Number.POSITIVE_INFINITY;
  const db = b.distanceMiles ?? Number.POSITIVE_INFINITY;
  return da - db;
};

/** Build the ordered, non-empty TreasureTrail sections from its raw items. */
function buildTreasureTrailSections(
  rawItems: SearchResultItem[],
  origin: GeoPoint | null,
  radiusMiles: number | null | undefined,
): SearchSection[] {
  const items = withDistance(rawItems, origin);
  const events = items.filter((it) => EVENT_KINDS.has(it.kind));
  const listings = items.filter((it) => !EVENT_KINDS.has(it.kind));

  const sections: SearchSection[] = [];
  const radius = radiusMiles == null ? Number.POSITIVE_INFINITY : radiusMiles;

  if (origin) {
    const near: SearchResultItem[] = [];
    const rest: SearchResultItem[] = [];
    for (const it of listings) {
      if (typeof it.distanceMiles === 'number' && it.distanceMiles <= radius) near.push(it);
      else rest.push(it);
    }
    near.sort(byDistance);
    rest.sort(byDistance); // known-distance (out-of-radius) ahead of coord-less rows
    if (near.length) sections.push({ key: 'near', label: 'Near You', items: near });
    if (rest.length) sections.push({ key: 'tt-more', label: 'More TreasureTrail Results', items: rest });
  } else if (listings.length) {
    sections.push({ key: 'tt', label: 'TreasureTrail Marketplace', items: listings });
  }

  if (events.length) {
    const sortedEvents = origin ? [...events].sort(byDistance) : events;
    sections.push({
      key: 'events',
      label: origin ? 'Nearby Events That May Have This Item' : 'Events That May Have This Item',
      items: sortedEvents,
    });
  }

  return sections;
}

async function safeSearch(provider: SearchProvider, term: string, signal?: AbortSignal): Promise<SearchResultItem[]> {
  if (!provider.isEnabled()) return [];
  try {
    const items = await provider.search(term, signal);
    return items ?? [];
  } catch (err) {
    // A provider failure must never blank the screen — log and fall through.
    console.warn(`[search] provider "${provider.source}" failed`, err);
    return [];
  }
}

export async function runSearch(term: string, opts?: SearchOptions): Promise<SearchOutcome> {
  const q = term.trim();
  if (!q) return emptyOutcome(q);

  const origin = opts?.origin ?? null;
  const radiusMiles = opts?.radiusMiles;

  // Primary source: TreasureTrail, split into distance-aware sections.
  const ttRaw = await safeSearch(treasureTrailProvider, q, opts?.signal);
  if (ttRaw.length > 0) {
    const sections = buildTreasureTrailSections(ttRaw, origin, radiusMiles);
    return {
      term: q,
      source: treasureTrailProvider.source,
      label: treasureTrailProvider.label,
      items: sections.flatMap((sec) => sec.items),
      sections,
    };
  }

  // Fallback waterfall: first enabled marketplace that returns results wins.
  for (const provider of FALLBACK_PROVIDERS) {
    const items = await safeSearch(provider, q, opts?.signal);
    if (items.length > 0) {
      return {
        term: q,
        source: provider.source,
        label: provider.label,
        items,
        sections: [{ key: provider.source, label: provider.label, items }],
      };
    }
  }

  return emptyOutcome(q);
}
