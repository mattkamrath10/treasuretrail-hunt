// Centralized search types. Every search box in the app routes through the
// SearchService (see searchService.ts) and renders on the unified Search
// Results page (src/pages/SearchResults.tsx). Adding a new marketplace is a
// matter of implementing one more SearchProvider and registering it in the
// PROVIDERS array — no UI changes required.

export type SearchSource = 'treasuretrail' | 'ebay' | 'etsy';

export type SearchResultKind =
  | 'listing'
  | 'auction'
  | 'estate_sale'
  | 'yard_sale'
  | 'flash_find'
  | 'business'
  | 'external';

export interface SearchResultItem {
  id: string;
  source: SearchSource;
  kind: SearchResultKind;
  title: string;
  subtitle?: string | null;
  price?: number | string | null;
  imageUrl?: string | null;
  /** Internal app route (TreasureTrail items). Used by react-router navigate. */
  route?: string | null;
  /** External URL (eBay / Etsy / external listings). Opened in a new tab. */
  externalUrl?: string | null;
  /** Free-text category, used to pick branded fallback art. */
  category?: string | null;
  /** Resolved coordinates, when the underlying row has them. Used by the
   *  aggregator to compute distance from the searcher's location. */
  lat?: number | null;
  lng?: number | null;
  /** Great-circle miles from the searcher's location. Populated by the
   *  aggregator (not the provider) when both an origin and item coords exist. */
  distanceMiles?: number | null;
}

/**
 * A labeled group of results rendered as one block on the results page, e.g.
 * "Near You", "More TreasureTrail Results", "Nearby Events That May Have This
 * Item". The aggregator returns these in priority order; only non-empty
 * sections are included.
 */
export interface SearchSection {
  key: string;
  label: string;
  items: SearchResultItem[];
}

export interface SearchProvider {
  source: SearchSource;
  /** Human label shown above results, e.g. "Results from eBay". */
  label: string;
  /**
   * Whether this provider is currently usable. eBay/Etsy report false until
   * their API keys are provided, so the waterfall transparently skips them.
   */
  isEnabled(): boolean;
  /** Run the search. Must never throw — return [] on any failure. */
  search(term: string, signal?: AbortSignal): Promise<SearchResultItem[]>;
}

export interface SearchOutcome {
  term: string;
  /** Which source produced the displayed results, or null if none matched. */
  source: SearchSource | null;
  /** Display label for the producing source, or null. */
  label: string | null;
  /** Flattened view of every item across all sections (count + emptiness). */
  items: SearchResultItem[];
  /** Ordered, non-empty result sections. The UI renders these. */
  sections: SearchSection[];
}
