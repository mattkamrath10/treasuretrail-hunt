// Centralized search service — the single entry point every search box uses.
//
// Local-First aggregator. TreasureTrail is the primary source: its results are
// split by distance from the searcher's location into priority sections —
//   1. "Near You"                       (in-radius TreasureTrail listings)
//   2. "More TreasureTrail Results"     (out-of-radius / unknown distance)
//   3. "Nearby Events That May Have This Item" (events, sorted by distance)
//
// External marketplaces (eBay, Etsy, …) are then appended as their own
// section(s) BELOW the local results and ABOVE the Google fallback, honoring the
// local-first order (Phase 6). Each external provider implements the common
// SearchProvider interface, is feature-flagged via isEnabled(), and fails soft —
// a disabled provider or a provider error returns [] and never blanks the page.
// External results that carry coordinates participate in distance ordering
// ("Other Marketplaces Near You"); the rest fall into a shipping section
// ("Available to Ship"). Google Search / Google Shopping remain UI-only fallback
// entry points, always offered as the final step.
//
// Distance requires an `origin` (the searcher's coordinates) AND item coords.
// Without an origin we don't section by distance — TreasureTrail items render
// as one block, events as another, and external results as one block.
//
// External providers run concurrently with TreasureTrail so they never slow the
// local path; today they are disabled and resolve to [] immediately.

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

/**
 * External marketplace providers, in display order within their section group.
 * They are appended after the TreasureTrail/local sections, not used as a
 * last-resort waterfall — adding a marketplace is a single entry here.
 */
const EXTERNAL_PROVIDERS: SearchProvider[] = [ebayProvider, etsyProvider];

const EVENT_KINDS: ReadonlySet<SearchResultKind> = new Set<SearchResultKind>([
  'auction',
  'estate_sale',
  'yard_sale',
]);

// External-marketplace section labels.
const EXTERNAL_NEAR_LABEL = 'Other Marketplaces Near You';
const EXTERNAL_SHIPPING_LABEL = 'Available to Ship';
const EXTERNAL_ALL_LABEL = 'From Other Marketplaces';

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
  if (da !== db) return da - db;
  // Equal distance (or both unknown) → higher relevance first.
  return (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
};

const byRelevance = (a: SearchResultItem, b: SearchResultItem): number =>
  (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);

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
    sections.push({ key: 'tt', label: 'TreasureTrail Marketplace', items: [...listings].sort(byRelevance) });
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

/**
 * Run every enabled external provider (in parallel) and fold their results into
 * marketplace sections that sit below the local results. Located results are
 * distance-ordered; unlocated results go to a shipping section. Returns [] when
 * no external provider is enabled or returns anything.
 */
async function buildExternalSections(
  term: string,
  origin: GeoPoint | null,
  signal?: AbortSignal,
): Promise<SearchSection[]> {
  const perProvider = await Promise.all(
    EXTERNAL_PROVIDERS.map((provider) => safeSearch(provider, term, signal)),
  );
  const all = perProvider.flat();
  if (all.length === 0) return [];

  // No origin: can't order by distance, so present one combined block.
  if (!origin) {
    return [{ key: 'external', label: EXTERNAL_ALL_LABEL, items: all }];
  }

  const located: SearchResultItem[] = [];
  const shipping: SearchResultItem[] = [];
  for (const it of withDistance(all, origin)) {
    if (typeof it.distanceMiles === 'number') located.push(it);
    else shipping.push(it);
  }
  located.sort(byDistance);

  const sections: SearchSection[] = [];
  if (located.length) sections.push({ key: 'external-near', label: EXTERNAL_NEAR_LABEL, items: located });
  if (shipping.length) sections.push({ key: 'external-ship', label: EXTERNAL_SHIPPING_LABEL, items: shipping });
  return sections;
}

export async function runSearch(term: string, opts?: SearchOptions): Promise<SearchOutcome> {
  const q = term.trim();
  if (!q) return emptyOutcome(q);

  const origin = opts?.origin ?? null;
  const radiusMiles = opts?.radiusMiles;

  // Local path and external marketplaces run concurrently so external providers
  // never delay the local results.
  const [ttRaw, externalSections] = await Promise.all([
    safeSearch(treasureTrailProvider, q, opts?.signal),
    buildExternalSections(q, origin, opts?.signal),
  ]);

  const sections = [
    ...buildTreasureTrailSections(ttRaw, origin, radiusMiles),
    ...externalSections,
  ];

  if (sections.length === 0) return emptyOutcome(q);

  // Attribute the outcome to TreasureTrail when it produced anything; otherwise
  // to the first external section that did. (The UI renders per-section labels;
  // this is for callers that inspect the producing source.)
  const ttHasResults = ttRaw.length > 0;
  const firstExternal = externalSections[0];
  const source = ttHasResults
    ? treasureTrailProvider.source
    : firstExternal?.items[0]?.source ?? null;
  const label = ttHasResults
    ? treasureTrailProvider.label
    : firstExternal?.label ?? null;

  return {
    term: q,
    source,
    label,
    items: sections.flatMap((sec) => sec.items),
    sections,
  };
}
