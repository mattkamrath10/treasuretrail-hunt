import { supabase } from './supabase';

/**
 * Demand Intelligence (Phase 5) — client access to the aggregate demand the
 * app captures from no-result searches and Wanted Requests.
 *
 * Capture (recordSearchDemand) is best-effort and MUST never break a search or
 * a wanted-request flow: every failure is swallowed. Reads are Pro-gated at the
 * data layer (the RPCs raise PRO_REQUIRED for non-Pro callers); the React gate
 * is only UX. Until migration 20260609000400_demand_intelligence.sql is applied
 * the RPCs are missing — capture silently no-ops and reads return empty, so the
 * app keeps working (mirrors the migration-gated fetcher pattern used elsewhere).
 */

export interface ItemDemand {
  term: string;
  category: string;
  total: number;
  lastRequestedAt: string | null;
}

export interface LocalDemand {
  term: string;
  category: string;
  total: number;
  nearestMiles: number | null;
}

/** True when the RPC simply isn't in the schema yet (migration unapplied). */
function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST202' ||
    /does not exist|find the function|schema cache/i.test(error.message ?? '')
  );
}

/**
 * Record one unit of demand for a term. Optional category + searcher location
 * sharpen the aggregates (location enables the "near you" radius counts). Always
 * resolves — a tracking failure can never block the caller's flow.
 */
export async function recordSearchDemand(
  term: string,
  category?: string | null,
  lat?: number | null,
  lng?: number | null,
): Promise<void> {
  const t = (term ?? '').trim();
  if (t.length < 2) return;
  try {
    await supabase.rpc('record_search_demand', {
      p_term: t,
      p_category: category ?? '',
      p_lat: typeof lat === 'number' && Number.isFinite(lat) ? lat : null,
      p_lng: typeof lng === 'number' && Number.isFinite(lng) ? lng : null,
    });
  } catch {
    /* best-effort — demand capture must never surface to the user */
  }
}

/**
 * Top demand by item across all locations (Pro only). Returns [] when the
 * migration isn't applied; rethrows a real PRO_REQUIRED/transport error so the
 * UI can distinguish "not entitled" from "no data".
 */
export async function fetchDemandByItem(limit = 20): Promise<ItemDemand[]> {
  const { data, error } = await supabase.rpc('fetch_demand_by_item', { p_limit: limit });
  if (error) {
    if (isMissingFunction(error)) return [];
    throw new Error(error.message || 'Failed to load demand');
  }
  return (data ?? []).map((r: any) => ({
    term: r.term,
    category: r.category ?? '',
    total: r.total ?? 0,
    lastRequestedAt: r.last_requested_at ?? null,
  }));
}

/**
 * Demand within `radiusMiles` of a point (Pro only). Returns [] when the
 * migration isn't applied; rethrows real errors (incl. PRO_REQUIRED).
 */
export async function fetchLocalDemand(
  lat: number,
  lng: number,
  radiusMiles = 25,
  limit = 20,
): Promise<LocalDemand[]> {
  const { data, error } = await supabase.rpc('fetch_local_demand', {
    p_lat: lat,
    p_lng: lng,
    p_radius_miles: radiusMiles,
    p_limit: limit,
  });
  if (error) {
    if (isMissingFunction(error)) return [];
    throw new Error(error.message || 'Failed to load local demand');
  }
  return (data ?? []).map((r: any) => ({
    term: r.term,
    category: r.category ?? '',
    total: r.total ?? 0,
    nearestMiles: typeof r.nearest_miles === 'number' ? r.nearest_miles : null,
  }));
}
