// Centralized search service — the single entry point every search box uses.
//
// Waterfall order: TreasureTrail → eBay → Etsy. The first provider that is
// enabled AND returns at least one result wins ("display results and stop").
// Google Search / Google Shopping are the final fallback, surfaced as buttons
// by the UI when no provider returns results — not as providers here.
//
// To add a marketplace later: implement a SearchProvider and insert it into
// PROVIDERS in the desired priority position. No UI changes required.

import type { SearchOutcome, SearchProvider } from './types';
import { treasureTrailProvider } from './providers/treasuretrail';
import { ebayProvider } from './providers/ebay';
import { etsyProvider } from './providers/etsy';

export const PROVIDERS: SearchProvider[] = [
  treasureTrailProvider,
  ebayProvider,
  etsyProvider,
];

export async function runSearch(term: string, signal?: AbortSignal): Promise<SearchOutcome> {
  const q = term.trim();
  const empty: SearchOutcome = { term: q, source: null, label: null, items: [] };
  if (!q) return empty;

  for (const provider of PROVIDERS) {
    if (!provider.isEnabled()) continue;
    try {
      const items = await provider.search(q, signal);
      if (items && items.length > 0) {
        return { term: q, source: provider.source, label: provider.label, items };
      }
    } catch (err) {
      // A provider failure must never blank the screen — log and fall through
      // to the next stage of the waterfall.
      console.warn(`[search] provider "${provider.source}" failed`, err);
    }
  }

  return empty;
}
