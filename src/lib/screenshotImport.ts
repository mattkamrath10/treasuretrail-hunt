import { supabase } from './supabase';
import { apiUrl } from './apiBase';

/**
 * Smart Screenshot Import client helpers.
 *
 * Sends a screenshot data URL to the server's vision endpoint, which OCRs and
 * analyzes the image and returns a structured draft listing. This is a DRAFT
 * tool — nothing is published automatically. The caller reviews/edits the
 * result and publishes manually (gated by MARKETPLACE_CREATE_ENABLED).
 */

export const IMPORT_LISTING_TYPES = [
  'Auction',
  'Marketplace',
  'Estate Sale',
  'Yard Sale',
  'Swap Meet',
  'Other',
] as const;
export type ListingType = (typeof IMPORT_LISTING_TYPES)[number];

export const IMPORT_CATEGORIES = [
  'Electronics',
  'Furniture',
  'Books',
  'Collectibles',
  'Antiques',
  'Art',
  'Jewelry',
  'Watches',
  'Toys',
  'Tools',
  'Clothing',
  'Home & Garden',
  'Sports & Outdoors',
  'Other',
] as const;

export interface ImportedListing {
  title: string;
  description: string;
  category: string;
  subcategory: string;
  brand: string;
  condition: string;
  price: string;
  currentBid: string;
  auctionEndDate: string;
  lotNumber: string;
  marketplaceSource: string;
  sellerName: string;
  location: string;
  listingType: ListingType;
  confidenceScore: number;
}

export const BLANK_IMPORTED_LISTING: ImportedListing = {
  title: '',
  description: '',
  category: '',
  subcategory: '',
  brand: '',
  condition: '',
  price: '',
  currentBid: '',
  auctionEndDate: '',
  lotNumber: '',
  marketplaceSource: '',
  sellerName: '',
  location: '',
  listingType: 'Marketplace',
  confidenceScore: 0,
};

const ANALYZE_TIMEOUT_MS = 30000;

/**
 * Analyze a screenshot (data URL) into a draft listing. Returns null on any
 * failure (network, auth, timeout, low-confidence/empty extraction) so the UI
 * can fall back to manual entry — never throws.
 */
export async function analyzeScreenshot(imageDataUrl: string): Promise<ImportedListing | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ANALYZE_TIMEOUT_MS);
    const res = await fetch(apiUrl('/api/import/screenshot'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as
      | { data?: Partial<ImportedListing>; fallback?: boolean }
      | null;
    if (!body || body.fallback || !body.data) return null;
    return normalizeImported(body.data);
  } catch {
    return null;
  }
}

function normalizeImported(d: Partial<ImportedListing>): ImportedListing {
  const lt = (IMPORT_LISTING_TYPES as readonly string[]).includes(d.listingType as string)
    ? (d.listingType as ListingType)
    : 'Marketplace';
  const conf = Math.max(0, Math.min(100, Math.round(Number(d.confidenceScore) || 0)));
  return {
    ...BLANK_IMPORTED_LISTING,
    title: d.title ?? '',
    description: d.description ?? '',
    category: d.category ?? '',
    subcategory: d.subcategory ?? '',
    brand: d.brand ?? '',
    condition: d.condition ?? '',
    price: d.price ?? '',
    currentBid: d.currentBid ?? '',
    auctionEndDate: d.auctionEndDate ?? '',
    lotNumber: d.lotNumber ?? '',
    marketplaceSource: d.marketplaceSource ?? '',
    sellerName: d.sellerName ?? '',
    location: d.location ?? '',
    listingType: lt,
    confidenceScore: conf,
  };
}

/** Parse a price/bid string ("$2.50", "1,250") into a number, or 0. */
export function parsePriceInput(v: string): number {
  const n = parseFloat((v || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

const APP_CATEGORY_SET = new Set((IMPORT_CATEGORIES as readonly string[]).map((c) => c.toLowerCase()));

/** Best-effort map of the AI category onto a known app category. */
export function normalizeCategory(c: string): string {
  const s = (c || '').trim();
  if (!s) return 'Other';
  const hit = (IMPORT_CATEGORIES as readonly string[]).find((cat) => cat.toLowerCase() === s.toLowerCase());
  if (hit) return hit;
  return APP_CATEGORY_SET.has(s.toLowerCase()) ? s : s; // keep AI value; column is free text
}

/**
 * Compose a single description that folds in the extra extracted fields that
 * don't have dedicated marketplace_listings columns (brand, lot #, current
 * bid, auction end, seller, source, original link).
 */
export function composeListingDescription(d: ImportedListing, sourceUrl?: string): string {
  const lines: string[] = [];
  if (d.description.trim()) lines.push(d.description.trim());

  const details: string[] = [];
  if (d.brand) details.push(`Brand: ${d.brand}`);
  if (d.subcategory) details.push(`Type: ${d.subcategory}`);
  if (d.condition) details.push(`Condition: ${d.condition}`);
  if (d.listingType === 'Auction') {
    if (d.currentBid) details.push(`Current bid: $${parsePriceInput(d.currentBid).toFixed(2)}`);
    if (d.lotNumber) details.push(`Lot #: ${d.lotNumber}`);
    if (d.auctionEndDate) details.push(`Auction ends: ${d.auctionEndDate}`);
  }
  if (d.sellerName) details.push(`Seller: ${d.sellerName}`);
  if (d.marketplaceSource) details.push(`Source: ${d.marketplaceSource}`);
  if (sourceUrl && sourceUrl.trim()) details.push(`Original: ${sourceUrl.trim()}`);

  if (details.length) {
    lines.push('');
    lines.push(details.join('\n'));
  }
  return lines.join('\n').slice(0, 1800);
}

/** A plain-text summary of the draft for "Copy details" while publishing is gated. */
export function draftToPlainText(d: ImportedListing, sourceUrl?: string): string {
  const rows: Array<[string, string]> = [
    ['Title', d.title],
    ['Listing type', d.listingType],
    ['Category', d.category],
    ['Subcategory', d.subcategory],
    ['Brand', d.brand],
    ['Condition', d.condition],
    ['Price', d.price ? `$${parsePriceInput(d.price).toFixed(2)}` : ''],
    ['Current bid', d.currentBid ? `$${parsePriceInput(d.currentBid).toFixed(2)}` : ''],
    ['Lot #', d.lotNumber],
    ['Auction ends', d.auctionEndDate],
    ['Marketplace', d.marketplaceSource],
    ['Seller', d.sellerName],
    ['Location', d.location],
    ['Original link', sourceUrl ?? ''],
    ['Description', d.description],
  ];
  return rows
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `${k}: ${v.trim()}`)
    .join('\n');
}
