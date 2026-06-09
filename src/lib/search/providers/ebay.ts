// eBay provider — second stage of the waterfall. DISABLED until API keys are
// provided.
//
// HOW TO ENABLE LATER (no UI/flow changes needed):
//   1. Get eBay Buy/Browse API credentials (App ID + Cert ID) from the eBay
//      Developer Program. The Browse API uses an OAuth application token
//      (client-credentials grant).
//   2. Add a server proxy route, e.g. GET /api/search/ebay?q=... in
//      server/index.ts, that holds the secret key (it must NEVER ship in the
//      client bundle) and returns normalized SearchResultItem[].
//   3. Set the env flag VITE_EBAY_SEARCH_ENABLED=true so isEnabled() returns
//      true, and implement the fetch below against apiUrl('/api/search/ebay').
//
// Until then isEnabled() is false and the search service skips this provider.

import type { SearchProvider } from '../types';

export const ebayProvider: SearchProvider = {
  source: 'ebay',
  label: 'Results from eBay',
  isEnabled: () => import.meta.env.VITE_EBAY_SEARCH_ENABLED === 'true',
  async search(/* term, signal */) {
    // Placeholder. When enabled, call the server proxy:
    //   const res = await fetch(apiUrl(`/api/search/ebay?q=${encodeURIComponent(term)}`), { signal });
    //   const json = await res.json();
    //   return json.items as SearchResultItem[];
    return [];
  },
};
