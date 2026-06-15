import { supabase } from './supabase';
import { apiUrl } from './apiBase';
import { BUSINESS_CATEGORIES, type BusinessCategory } from './businesses';

/**
 * AI-assisted Business Import (Phase 3) client helpers.
 *
 * Two extraction paths, mirroring the app's existing AI tools:
 *   - `analyzeBusinessCard` posts a business-card photo (data URL) to the
 *     vision endpoint (mirrors screenshotImport.ts / `/api/import/screenshot`).
 *   - `importBusinessFromUrl` posts a website or Facebook-page URL to the
 *     SSRF-protected scrape endpoint (mirrors events.ts importEventFromUrl /
 *     `/api/events/import`).
 *
 * Both return a DRAFT the caller pre-fills into the editable create form —
 * nothing is ever created automatically. Both fail SOFT (return null) on any
 * error, empty extraction, or when the user is over their AI scan quota, so the
 * user can always fall back to manual entry. Calls go through `apiUrl()` so they
 * work inside the Capacitor native webview.
 */

export interface ImportedBusiness {
  name: string;
  description: string;
  category: BusinessCategory | '';
  address: string;
  city: string;
  region: string;
  phone: string;
  email: string;
  website: string;
  facebook_url: string;
  hours: string;
  logo_url: string;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Validate an AI-supplied category against the known business categories. */
function coerceCategory(v: unknown): BusinessCategory | '' {
  const s = str(v);
  return (BUSINESS_CATEGORIES as string[]).includes(s) ? (s as BusinessCategory) : '';
}

function normalizeBusiness(d: any): ImportedBusiness {
  return {
    name: str(d?.name),
    description: str(d?.description),
    category: coerceCategory(d?.category),
    address: str(d?.address),
    city: str(d?.city),
    region: str(d?.region),
    phone: str(d?.phone),
    email: str(d?.email),
    website: str(d?.website),
    facebook_url: str(d?.facebook_url),
    hours: str(d?.hours),
    logo_url: str(d?.logo_url),
  };
}

/** True when the extraction yielded at least one usable field. */
function hasAnyField(b: ImportedBusiness): boolean {
  return !!(
    b.name || b.description || b.category || b.address || b.city || b.region ||
    b.phone || b.email || b.website || b.facebook_url || b.hours || b.logo_url
  );
}

const CARD_TIMEOUT_MS = 30000;
const URL_TIMEOUT_MS = 25000;

/**
 * Analyze a business-card photo (data URL) into draft business fields. Returns
 * null on any failure (network, auth, timeout, over-quota, low/empty
 * extraction) so the UI falls back to manual entry — never throws.
 */
export async function analyzeBusinessCard(imageDataUrl: string): Promise<ImportedBusiness | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CARD_TIMEOUT_MS);
    const res = await fetch(apiUrl('/api/import/business-card'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as
      | { data?: any; fallback?: boolean }
      | null;
    if (!body || body.fallback || !body.data) return null;
    const out = normalizeBusiness(body.data);
    return hasAnyField(out) ? out : null;
  } catch {
    return null;
  }
}

/**
 * Scrape public business info from a website or Facebook-page URL into draft
 * fields. Returns null on any failure (network, auth, blocked/invalid link,
 * over-quota, empty extraction) so the UI falls back to manual entry — never
 * throws. Facebook frequently blocks scraping, so this degrades gracefully.
 */
export async function importBusinessFromUrl(url: string): Promise<ImportedBusiness | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), URL_TIMEOUT_MS);
    const res = await fetch(apiUrl('/api/business/import'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));

    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; data?: any; error?: string }
      | null;
    if (!res.ok || !body?.ok || !body.data) return null;
    const out = normalizeBusiness(body.data);
    return hasAnyField(out) ? out : null;
  } catch {
    return null;
  }
}
