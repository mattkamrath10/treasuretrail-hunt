// Etsy provider — third stage of the waterfall. DISABLED until API keys are
// provided.
//
// HOW TO ENABLE LATER (no UI/flow changes needed):
//   1. Get an Etsy Open API v3 key (x-api-key keystring) by registering an app
//      in the Etsy developer portal. Listing search may require app approval.
//   2. Add a server proxy route, e.g. GET /api/search/etsy?q=... in
//      server/index.ts, that holds the secret key (it must NEVER ship in the
//      client bundle) and returns normalized SearchResultItem[].
//   3. Set the env flag VITE_ETSY_SEARCH_ENABLED=true so isEnabled() returns
//      true, and implement the fetch below against apiUrl('/api/search/etsy').
//
// Until then isEnabled() is false and the search service skips this provider.

import type { SearchProvider } from '../types';

export const etsyProvider: SearchProvider = {
  source: 'etsy',
  label: 'Results from Etsy',
  isEnabled: () => import.meta.env.VITE_ETSY_SEARCH_ENABLED === 'true',
  async search(/* term, signal */) {
    // Placeholder. When enabled, call the server proxy:
    //   const res = await fetch(apiUrl(`/api/search/etsy?q=${encodeURIComponent(term)}`), { signal });
    //   const json = await res.json();
    //   return json.items as SearchResultItem[];
    return [];
  },
};
