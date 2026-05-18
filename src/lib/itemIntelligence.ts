// Lightweight reseller-assist intelligence. No external APIs, no vision models —
// just deterministic heuristics over user-entered fields so we can ship useful
// pricing/marketplace/keyword guidance without per-image inference cost.

export type ConditionKey = 'mint' | 'good' | 'fair' | 'parts';

export interface ResaleEstimate {
  low: number;
  mid: number;
  high: number;
  multiplierLow: number;
  multiplierHigh: number;
}

export interface FeeEstimate {
  marketplace: string;
  feePct: number;
  feeAmount: number;
}

export interface ShippingEstimate {
  low: number;
  high: number;
  note: string;
}

export interface MarketplaceSuggestion {
  key: string;
  label: string;
  reason: string;
  feePct: number;
}

export interface ItemIntelligence {
  resale: ResaleEstimate | null;
  marketplaces: MarketplaceSuggestion[];
  keywords: string[];
  fees: FeeEstimate[];
  shipping: ShippingEstimate;
  tips: string[];
  watchOuts: string[];
}

const CATEGORY_MULTIPLIERS: Record<string, [number, number]> = {
  Watches: [2.5, 6.0],
  Jewelry: [2.0, 5.0],
  Furniture: [1.8, 3.5],
  Antiques: [2.0, 4.5],
  Sneakers: [1.5, 3.5],
  Toys: [2.0, 5.0],
  Collectibles: [2.5, 6.0],
  Tools: [1.5, 2.8],
  Electronics: [1.4, 2.5],
  Art: [2.0, 5.0],
  Books: [1.8, 3.5],
  Clothing: [1.5, 3.0],
  Other: [1.5, 3.0],
};

const CONDITION_MOD: Record<ConditionKey, number> = {
  mint: 1.10,
  good: 1.00,
  fair: 0.78,
  parts: 0.45,
};

const CATEGORY_MARKETPLACES: Record<string, MarketplaceSuggestion[]> = {
  Watches: [
    { key: 'ebay', label: 'eBay', reason: 'Largest watch resale market, global buyers', feePct: 13.25 },
    { key: 'whatnot', label: 'Whatnot', reason: 'Live watch auctions reach passionate collectors', feePct: 11 },
    { key: 'facebook_marketplace', label: 'Facebook Marketplace', reason: 'Local cash sales, no shipping needed', feePct: 0 },
  ],
  Jewelry: [
    { key: 'ebay', label: 'eBay', reason: 'Strong demand for vintage & designer pieces', feePct: 13.25 },
    { key: 'etsy', label: 'Etsy', reason: 'Vintage & handmade jewelry buyers', feePct: 6.5 },
    { key: 'poshmark', label: 'Poshmark', reason: 'Fashion-focused audience', feePct: 20 },
  ],
  Furniture: [
    { key: 'facebook_marketplace', label: 'Facebook Marketplace', reason: 'Best for local pickup, no shipping headaches', feePct: 0 },
    { key: 'craigslist', label: 'Craigslist', reason: 'Free listings, local buyers', feePct: 0 },
    { key: 'offerup', label: 'OfferUp', reason: 'Mobile-first local buyers', feePct: 0 },
  ],
  Antiques: [
    { key: 'ebay', label: 'eBay', reason: 'Wide reach for antique collectors', feePct: 13.25 },
    { key: 'local_auction_house', label: 'Local Auction House', reason: 'Best for high-value or appraised pieces', feePct: 15 },
    { key: 'hibid', label: 'HiBid', reason: 'Online auction reach for serious collectors', feePct: 10 },
  ],
  Sneakers: [
    { key: 'ebay', label: 'eBay', reason: 'Authenticated sneaker program for popular models', feePct: 13.25 },
    { key: 'whatnot', label: 'Whatnot', reason: 'Live sneaker auctions are red hot', feePct: 11 },
    { key: 'mercari', label: 'Mercari', reason: 'Low fees and easy shipping', feePct: 10 },
  ],
  Toys: [
    { key: 'ebay', label: 'eBay', reason: 'Vintage toy collectors flock here', feePct: 13.25 },
    { key: 'whatnot', label: 'Whatnot', reason: 'Toy collector live shows', feePct: 11 },
    { key: 'mercari', label: 'Mercari', reason: 'Lower fees for casual sales', feePct: 10 },
  ],
  Collectibles: [
    { key: 'ebay', label: 'eBay', reason: 'Deepest collector market online', feePct: 13.25 },
    { key: 'whatnot', label: 'Whatnot', reason: 'Live auctions move inventory fast', feePct: 11 },
    { key: 'mercari', label: 'Mercari', reason: 'Flat shipping options', feePct: 10 },
  ],
  Tools: [
    { key: 'facebook_marketplace', label: 'Facebook Marketplace', reason: 'Local tradespeople buy cash', feePct: 0 },
    { key: 'ebay', label: 'eBay', reason: 'National reach for power tools & brands', feePct: 13.25 },
    { key: 'offerup', label: 'OfferUp', reason: 'Local-first mobile buyers', feePct: 0 },
  ],
  Electronics: [
    { key: 'ebay', label: 'eBay', reason: 'Trusted by tech buyers nationwide', feePct: 13.25 },
    { key: 'mercari', label: 'Mercari', reason: 'Fast shipping flow for small electronics', feePct: 10 },
    { key: 'facebook_marketplace', label: 'Facebook Marketplace', reason: 'Local pickup avoids shipping fragile items', feePct: 0 },
  ],
  Art: [
    { key: 'etsy', label: 'Etsy', reason: 'Established art-buying audience', feePct: 6.5 },
    { key: 'ebay', label: 'eBay', reason: 'Broad reach for prints & paintings', feePct: 13.25 },
    { key: 'local_auction_house', label: 'Local Auction House', reason: 'Signed/listed artists do best at auction', feePct: 15 },
  ],
  Books: [
    { key: 'ebay', label: 'eBay', reason: 'Best for rare/first editions', feePct: 13.25 },
    { key: 'mercari', label: 'Mercari', reason: 'Easy media-mail shipping', feePct: 10 },
    { key: 'etsy', label: 'Etsy', reason: 'Vintage book collectors browse Etsy', feePct: 6.5 },
  ],
  Clothing: [
    { key: 'poshmark', label: 'Poshmark', reason: 'Fashion-first audience', feePct: 20 },
    { key: 'mercari', label: 'Mercari', reason: 'Flat low fees for casual clothing', feePct: 10 },
    { key: 'ebay', label: 'eBay', reason: 'Best for vintage & designer pieces', feePct: 13.25 },
  ],
  Other: [
    { key: 'facebook_marketplace', label: 'Facebook Marketplace', reason: 'Local cash, no fees', feePct: 0 },
    { key: 'ebay', label: 'eBay', reason: 'Catch-all marketplace', feePct: 13.25 },
    { key: 'mercari', label: 'Mercari', reason: 'Simple flat-fee selling', feePct: 10 },
  ],
};

const SHIPPING_BY_CATEGORY: Record<string, ShippingEstimate> = {
  Watches:      { low: 8,  high: 18, note: 'Small insured parcel' },
  Jewelry:      { low: 6,  high: 15, note: 'Small insured parcel' },
  Furniture:    { low: 0,  high: 0,  note: 'Local pickup only — shipping rarely makes sense' },
  Antiques:     { low: 20, high: 80, note: 'Often fragile — quote carefully' },
  Sneakers:     { low: 10, high: 18, note: 'Standard shoe box, regional rates' },
  Toys:         { low: 10, high: 25, note: 'Box + padding' },
  Collectibles: { low: 8,  high: 30, note: 'Pad well, declare value' },
  Tools:        { low: 15, high: 45, note: 'Heavy — calculated shipping recommended' },
  Electronics:  { low: 12, high: 35, note: 'Original box + insurance' },
  Art:          { low: 18, high: 60, note: 'Hard mailer or crate; insure' },
  Books:        { low: 4,  high: 12, note: 'USPS Media Mail is your friend' },
  Clothing:     { low: 5,  high: 12, note: 'Poly mailer, regional rate' },
  Other:        { low: 8,  high: 25, note: 'Depends on size and weight' },
};

const TIPS_BY_CATEGORY: Record<string, string[]> = {
  Watches: [
    'Photograph the dial, caseback, movement (if accessible), and serial.',
    'List the reference number — buyers search by it.',
    'Service history and box/papers can add 20–40% to value.',
  ],
  Jewelry: [
    'Weigh it on a gram scale and disclose karat / hallmark.',
    'Mention any stones, settings, and any documentation.',
    'Clean gently before photos but disclose any wear.',
  ],
  Furniture: [
    'Measure W × D × H and include in the listing — saves DM time.',
    'Mention maker, era, and any restoration done.',
    'Local pickup + cash is fastest; require ID for in-home pickup.',
  ],
  Antiques: [
    'Note any maker\'s marks, signatures, or labels.',
    'Disclose chips, repairs, and provenance.',
    'For high-value pieces, get an appraisal before pricing.',
  ],
  Sneakers: [
    'List size (US/EU), colorway, and SKU/style code.',
    'Photograph soles, insoles, and any wear.',
    'Mention if deadstock, VNDS, or worn.',
  ],
  Toys: [
    'Mention year, edition, and whether sealed/loose.',
    'Original box + accessories can multiply value.',
    'Look up recent sold comps on eBay before pricing.',
  ],
  Collectibles: [
    'Grade visually (Mint / NM / VG) and disclose flaws.',
    'Photograph in natural light, no flash glare.',
    'Mention any provenance or signed elements.',
  ],
  Tools: [
    'Confirm it powers on / runs; mention any missing parts.',
    'Brand + model number in the title boosts visibility.',
    'Bundle related accessories for higher total price.',
  ],
  Electronics: [
    'Test all functions, factory reset, and remove personal data.',
    'List model number, year, and storage/RAM.',
    'Original box, cables, and adapters add value.',
  ],
  Art: [
    'Photograph signature, back of canvas, and any labels.',
    'Measure unframed dimensions.',
    'Research the artist — listed/exhibited artists command more.',
  ],
  Books: [
    'Note edition, printing, and dust jacket condition.',
    'First editions / signed copies can be 5–20× normal value.',
    'Disclose foxing, water stains, or missing pages.',
  ],
  Clothing: [
    'List size, measurements (pit to pit, length), and material.',
    'Mention era / decade for vintage pieces.',
    'Steam or press before photos.',
  ],
  Other: [
    'Be specific in the title — buyers search by exact terms.',
    'Take 4–6 well-lit photos from different angles.',
    'Research recent sold comps before setting your price.',
  ],
};

const WATCH_OUTS_BY_CATEGORY: Record<string, string[]> = {
  Watches: ['Fakes are common — be ready to authenticate.', 'Shipping requires insurance and signature confirmation.'],
  Jewelry: ['Buyers often expect testing/appraisal for precious metals.', 'Use signature-required shipping.'],
  Furniture: ['Measure doorways before agreeing to pickup.', 'Stairs/elevator access affects pickup speed.'],
  Antiques: ['Disclose every flaw to avoid returns.', 'Fragile shipping = high risk of damage claims.'],
  Sneakers: ['Replicas are everywhere — keep receipts/proof of purchase.', 'Buyers expect authentication.'],
  Toys: ['Box condition is often graded separately from the toy.', 'Disclose any missing accessories.'],
  Collectibles: ['Graded items command much higher prices than raw.', 'Smell (smoke, mildew) can kill a sale.'],
  Tools: ['Heavy items = expensive shipping; quote first.', 'Disclose if cosmetic-only or fully functional.'],
  Electronics: ['Factory reset before shipping or pickup.', 'Battery health on phones/laptops should be disclosed.'],
  Art: ['Buyers expect provenance for higher prices.', 'Insure for shipping; art is fragile.'],
  Books: ['Disclose markings, signatures, and ex-library copies.', 'Media Mail is cheapest but slow.'],
  Clothing: ['Measurements matter more than tagged size.', 'Mention smoke-/pet-free home.'],
  Other: ['Be transparent about flaws — returns are expensive.', 'Use tracked shipping to avoid lost-package disputes.'],
};

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','for','with','of','in','on','at','to','from',
  'is','are','was','were','be','been','this','that','these','those','it','its',
  'my','your','our','their','very','just','really','some','any','all',
]);

export function extractKeywords(title: string, category: string, notes: string): string[] {
  const text = `${title} ${notes}`.toLowerCase();
  const tokens = text.match(/[a-z0-9]+/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    if (t.length < 3) continue;
    if (STOP_WORDS.has(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 8) break;
  }
  if (category && !seen.has(category.toLowerCase())) out.unshift(category.toLowerCase());
  return out.slice(0, 10);
}

export function estimateResale(
  purchasePrice: number | null,
  category: string,
  condition: ConditionKey | null,
): ResaleEstimate | null {
  if (purchasePrice === null || !Number.isFinite(purchasePrice) || purchasePrice <= 0) return null;
  const [mLow, mHigh] = CATEGORY_MULTIPLIERS[category] ?? CATEGORY_MULTIPLIERS.Other;
  const condMod = condition ? CONDITION_MOD[condition] : 1.0;
  const low = purchasePrice * mLow * condMod;
  const high = purchasePrice * mHigh * condMod;
  return {
    low: Math.round(low),
    high: Math.round(high),
    mid: Math.round((low + high) / 2),
    multiplierLow: mLow * condMod,
    multiplierHigh: mHigh * condMod,
  };
}

export function suggestMarketplaces(category: string): MarketplaceSuggestion[] {
  return CATEGORY_MARKETPLACES[category] ?? CATEGORY_MARKETPLACES.Other;
}

export function estimateShipping(category: string): ShippingEstimate {
  return SHIPPING_BY_CATEGORY[category] ?? SHIPPING_BY_CATEGORY.Other;
}

export function estimateFeesFor(
  resaleMid: number | null,
  marketplaces: MarketplaceSuggestion[],
): FeeEstimate[] {
  if (resaleMid === null) return [];
  return marketplaces.map((m) => ({
    marketplace: m.label,
    feePct: m.feePct,
    feeAmount: Math.round((resaleMid * m.feePct) / 100),
  }));
}

export function buildIntelligence(input: {
  title: string;
  category: string;
  notes: string;
  purchasePrice: number | null;
  condition: ConditionKey | null;
}): ItemIntelligence {
  const category = input.category || 'Other';
  const resale = estimateResale(input.purchasePrice, category, input.condition);
  const marketplaces = suggestMarketplaces(category);
  const shipping = estimateShipping(category);
  const fees = estimateFeesFor(resale?.mid ?? null, marketplaces);
  const keywords = extractKeywords(input.title, category, input.notes);
  const tips = TIPS_BY_CATEGORY[category] ?? TIPS_BY_CATEGORY.Other;
  const watchOuts = WATCH_OUTS_BY_CATEGORY[category] ?? WATCH_OUTS_BY_CATEGORY.Other;
  return { resale, marketplaces, keywords, fees, shipping, tips, watchOuts };
}

// ---------------------------------------------------------------------------
// localStorage-backed persistence for the lightweight side-actions.
// Keeps everything client-side; no schema changes required.
// ---------------------------------------------------------------------------

const LS_KEYS = {
  rareRadarDrafts: 'tt_rare_radar_drafts_v1',
  savedAnalyses:   'tt_saved_analyses_v1',
  watchedTrends:   'tt_watched_trends_v1',
} as const;

function readArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeArray<T>(key: string, items: T[], cap = 50): void {
  try {
    localStorage.setItem(key, JSON.stringify(items.slice(0, cap)));
  } catch {
    // Storage quota / disabled — silently noop; this is a best-effort cache.
  }
}

export interface RareRadarDraft {
  id: string;
  title: string;
  category: string;
  condition: ConditionKey | null;
  notes: string;
  imageUrl: string | null;
  budgetLow: number | null;
  budgetHigh: number | null;
  createdAt: string;
}

export function shareToRareRadar(draft: Omit<RareRadarDraft, 'id' | 'createdAt'>): RareRadarDraft {
  const item: RareRadarDraft = {
    ...draft,
    id: cryptoId(),
    createdAt: new Date().toISOString(),
  };
  const existing = readArray<RareRadarDraft>(LS_KEYS.rareRadarDrafts);
  writeArray(LS_KEYS.rareRadarDrafts, [item, ...existing]);
  return item;
}

export function getRareRadarDrafts(): RareRadarDraft[] {
  return readArray<RareRadarDraft>(LS_KEYS.rareRadarDrafts);
}

export function clearRareRadarDraft(id: string): void {
  const list = readArray<RareRadarDraft>(LS_KEYS.rareRadarDrafts);
  writeArray(LS_KEYS.rareRadarDrafts, list.filter((d) => d.id !== id));
}

export interface SavedAnalysis {
  id: string;
  title: string;
  category: string;
  condition: ConditionKey | null;
  purchasePrice: number | null;
  notes: string;
  imageUrl: string | null;
  intelligence: ItemIntelligence;
  createdAt: string;
}

export function saveAnalysis(analysis: Omit<SavedAnalysis, 'id' | 'createdAt'>): SavedAnalysis {
  const item: SavedAnalysis = {
    ...analysis,
    id: cryptoId(),
    createdAt: new Date().toISOString(),
  };
  const existing = readArray<SavedAnalysis>(LS_KEYS.savedAnalyses);
  writeArray(LS_KEYS.savedAnalyses, [item, ...existing]);
  return item;
}

export function getSavedAnalyses(): SavedAnalysis[] {
  return readArray<SavedAnalysis>(LS_KEYS.savedAnalyses);
}

export interface WatchedTrend {
  id: string;
  category: string;
  keywords: string[];
  createdAt: string;
}

export function watchTrend(input: { category: string; keywords: string[] }): WatchedTrend {
  const item: WatchedTrend = {
    id: cryptoId(),
    category: input.category,
    keywords: input.keywords,
    createdAt: new Date().toISOString(),
  };
  const existing = readArray<WatchedTrend>(LS_KEYS.watchedTrends);
  writeArray(LS_KEYS.watchedTrends, [item, ...existing]);
  return item;
}

export function getWatchedTrends(): WatchedTrend[] {
  return readArray<WatchedTrend>(LS_KEYS.watchedTrends);
}

function cryptoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Native share helper with clipboard fallback.
// ---------------------------------------------------------------------------

export interface ShareInput {
  title: string;
  text: string;
  url?: string;
}

export type ShareResult =
  | { ok: true; via: 'native' | 'clipboard' }
  | { ok: false; reason: 'cancelled' | 'unsupported' | 'error'; message?: string };

export async function shareItem(input: ShareInput): Promise<ShareResult> {
  // Try the Web Share API first (mobile + some desktop).
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: input.title,
        text: input.text,
        url: input.url,
      });
      return { ok: true, via: 'native' };
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name;
      if (name === 'AbortError') return { ok: false, reason: 'cancelled' };
      // Fall through to clipboard fallback.
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    const payload = [input.title, input.text, input.url].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(payload);
      return { ok: true, via: 'clipboard' };
    } catch (err: unknown) {
      return { ok: false, reason: 'error', message: (err as Error)?.message };
    }
  }

  return { ok: false, reason: 'unsupported' };
}
