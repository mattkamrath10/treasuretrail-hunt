import { supabase } from './supabase';

export type EventClickKind = 'directions' | 'featured_item' | 'contact' | 'share' | 'livestream';

/**
 * Record a view of an event. Dedupes per (event, viewer, day) via the
 * SECURITY DEFINER RPC. Best-effort — tracking failures must never break
 * the page render.
 */
export async function trackEventView(eventId: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('track_event_view', { p_event_id: eventId });
    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e?.message ?? 'track_event_view failed' };
  }
}

/**
 * Log a CTA click. No dedupe — we want raw totals for the analytics card
 * ("23 directions taps").
 */
export async function trackEventClick(
  eventId: string,
  kind: EventClickKind,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('track_event_click', {
      p_event_id: eventId,
      p_click_kind: kind,
    });
    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e?.message ?? 'track_event_click failed' };
  }
}

export interface EventEngagement {
  view_count: number;
  save_count: number;
  click_counts: Record<EventClickKind, number>;
}

const ZERO_CLICKS: EventEngagement['click_counts'] = {
  directions: 0,
  featured_item: 0,
  contact: 0,
  share: 0,
  livestream: 0,
};

/**
 * One-shot engagement fetch for a single event. NOTE: currently unused. The
 * count views it reads have their direct SELECT grant revoked by
 * `20260529000004_seller_reach_rpc.sql` (reach is Pro-gated at the data layer),
 * so if a per-event card is reintroduced this must be reimplemented as a
 * SECURITY DEFINER RPC that checks ownership (and tier, if it should be Pro).
 */
export async function fetchEventEngagement(eventId: string): Promise<EventEngagement> {
  const [viewsRes, savesRes, clicksRes] = await Promise.all([
    supabase.from('event_view_counts').select('view_count').eq('event_id', eventId).maybeSingle(),
    supabase.from('event_save_counts').select('save_count').eq('event_id', eventId).maybeSingle(),
    supabase.from('event_click_counts').select('click_kind, click_count').eq('event_id', eventId),
  ]);
  const click_counts: EventEngagement['click_counts'] = { ...ZERO_CLICKS };
  for (const row of clicksRes.data ?? []) {
    const k = (row as any).click_kind as EventClickKind;
    if (k in click_counts) click_counts[k] = (row as any).click_count ?? 0;
  }
  return {
    view_count: (viewsRes.data?.view_count as number | undefined) ?? 0,
    save_count: (savesRes.data?.save_count as number | undefined) ?? 0,
    click_counts,
  };
}

export interface SellerReachRow { views: number; saves: number; taps: number }
export interface SellerReach {
  totals: SellerReachRow;
  /** Per-event reach, keyed by event id. Missing ids → no activity. */
  perEvent: Record<string, SellerReachRow>;
}

/**
 * Aggregate reach (views, saves, CTA taps) across many of a seller's events
 * for the Pro Reach Analytics dashboard.
 *
 * Pro is enforced at the DATA layer, not just the UI: the preferred path is
 * the SECURITY DEFINER RPC `fetch_seller_reach`, which checks the caller is
 * Pro AND owns each event before returning anything. The React gate is then
 * just UX — a free holder who hand-crafts an API call still gets nothing.
 *
 * Until that migration (`20260529000004_seller_reach_rpc.sql`) is applied,
 * we fall back to the owner-readable count views so the feature still works
 * for Pro users today. The fallback triggers ONLY when the function is
 * missing — a real PRO_REQUIRED/permission error propagates. This mirrors
 * the migration-gated fetcher pattern used elsewhere in the app.
 */
export async function fetchSellerReach(eventIds: string[]): Promise<SellerReach> {
  const ids = [...new Set(eventIds)].filter(Boolean);
  if (ids.length === 0) return { totals: { views: 0, saves: 0, taps: 0 }, perEvent: {} };

  const { data, error } = await supabase.rpc('fetch_seller_reach', { p_event_ids: ids });
  if (!error) return aggregateReachRows(data ?? []);

  const missing =
    error.code === 'PGRST202' ||
    /does not exist|find the function|schema cache/i.test(error.message ?? '');
  if (!missing) {
    // Real failure (incl. PRO_REQUIRED from the RPC, or a transport error) —
    // surface it instead of silently reporting zero reach.
    throw new Error(error.message || 'Failed to load reach analytics');
  }
  console.warn(
    '[SELLER_REACH] RPC unavailable — using owner-readable fallback. Apply migration 20260529000004_seller_reach_rpc.sql to enforce Pro at the data layer:',
    error.message,
  );
  return fetchSellerReachDirect(ids);
}

function aggregateReachRows(rows: any[]): SellerReach {
  const perEvent: Record<string, SellerReachRow> = {};
  let views = 0, saves = 0, taps = 0;
  for (const r of rows) {
    const row: SellerReachRow = { views: r.views ?? 0, saves: r.saves ?? 0, taps: r.taps ?? 0 };
    perEvent[r.event_id] = row;
    views += row.views; saves += row.saves; taps += row.taps;
  }
  return { totals: { views, saves, taps }, perEvent };
}

/**
 * Fallback aggregation over the owner-readable count views (three batched
 * queries). Fails fast on any query error so a partial load can't masquerade
 * as "0 reach".
 */
async function fetchSellerReachDirect(ids: string[]): Promise<SellerReach> {
  const [viewsRes, savesRes, clicksRes] = await Promise.all([
    supabase.from('event_view_counts').select('event_id, view_count').in('event_id', ids),
    supabase.from('event_save_counts').select('event_id, save_count').in('event_id', ids),
    supabase.from('event_click_counts').select('event_id, click_count').in('event_id', ids),
  ]);
  if (viewsRes.error) throw new Error(viewsRes.error.message);
  if (savesRes.error) throw new Error(savesRes.error.message);
  if (clicksRes.error) throw new Error(clicksRes.error.message);

  const perEvent: Record<string, SellerReachRow> = {};
  const ensure = (id: string): SellerReachRow => (perEvent[id] ??= { views: 0, saves: 0, taps: 0 });

  for (const r of viewsRes.data ?? []) ensure((r as any).event_id).views = (r as any).view_count ?? 0;
  for (const r of savesRes.data ?? []) ensure((r as any).event_id).saves = (r as any).save_count ?? 0;
  for (const r of clicksRes.data ?? []) ensure((r as any).event_id).taps += (r as any).click_count ?? 0;

  let views = 0, saves = 0, taps = 0;
  for (const id of Object.keys(perEvent)) {
    const e = perEvent[id];
    views += e.views; saves += e.saves; taps += e.taps;
  }
  return { totals: { views, saves, taps }, perEvent };
}
