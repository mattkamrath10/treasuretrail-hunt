import { supabase } from './supabase';
import { geocodeLocation } from './geocode';

export type WantedCategory =
  | 'collectibles' | 'furniture' | 'electronics' | 'vintage' | 'cards'
  | 'jewelry' | 'art' | 'fashion' | 'toys' | 'tools' | 'books'
  | 'music' | 'sports' | 'home' | 'other';

export type WantedStatus = 'open' | 'fulfilled' | 'closed';

export const WANTED_CATEGORY_LABEL: Record<WantedCategory, string> = {
  collectibles: 'Collectibles',
  furniture:    'Furniture',
  electronics:  'Electronics',
  vintage:      'Vintage',
  cards:        'Trading cards',
  jewelry:      'Jewelry',
  art:          'Art',
  fashion:      'Fashion',
  toys:         'Toys',
  tools:        'Tools',
  books:        'Books',
  music:        'Music & vinyl',
  sports:       'Sports gear',
  home:         'Home & kitchen',
  other:        'Other',
};

/** Canonical list of every category value — drives validation + AI output
 *  normalization (Phase 7) so there is one source of truth for the enum. */
export const WANTED_CATEGORIES = Object.keys(WANTED_CATEGORY_LABEL) as WantedCategory[];

export interface WantedItemRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: WantedCategory;
  max_budget: number | null;
  city: string | null;
  region: string | null;
  image_url: string | null;
  thumb_url: string | null;
  status: WantedStatus;
  // Phase 1 monetization — boost + moderation. Optional for migration safety.
  boosted_at?: string | null;
  boost_expires_at?: string | null;
  boost_type?: 'paid' | 'pro' | null;
  priority_score?: number | null;
  is_hidden?: boolean | null;
  report_count?: number | null;
  created_at: string;
  updated_at: string;
}

export interface WantedUpsert {
  title: string;
  description?: string;
  category: WantedCategory;
  max_budget?: number | null;
  city?: string | null;
  region?: string | null;
  image_url?: string | null;
  thumb_url?: string | null;
  status?: WantedStatus;
  // Phase 1 Wanted Wizard — attributes the request to the failed search term
  // that produced it. Optional + migration-gated (see createWantedItem's 42703
  // fallback) so creation keeps working before the column is applied.
  source_search_term?: string | null;
  // Phase 3 Local-First Search — resolved coordinates (geocoded from
  // city/region on write) and how far the requester will travel (miles; null =
  // Anywhere). All migration-gated via the column-drop 42703 fallback.
  lat?: number | null;
  lng?: number | null;
  travel_distance?: number | null;
}

export async function fetchOpenWantedItems(opts?: { limit?: number; category?: WantedCategory }) {
  // is_hidden is gated on the Phase-1 monetization migration. Retry
  // without the filter on 42703 so the feed stays alive during rollout.
  const build = (withHidden: boolean) => {
    let q = supabase
      .from('wanted_items')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(opts?.limit ?? 50);
    if (withHidden) q = q.eq('is_hidden', false);
    if (opts?.category) q = q.eq('category', opts.category);
    return q;
  };
  let { data, error } = await build(true);
  if (error?.code === '42703' && /is_hidden/i.test(error.message ?? '')) {
    console.warn('[FETCH_OPEN_WANTED] is_hidden column missing — retrying without moderation filter. Apply migration 20260528000002_monetization_phase1.sql to enable.');
    ({ data, error } = await build(false));
  }
  if (error) throw new Error(error.message);
  return (data ?? []) as WantedItemRow[];
}

/** Lightweight identity slice attached to wanted items so cards/detail
 *  pages can render @username + avatar without a per-card round-trip. */
export interface WantedRequester {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}
export type WantedItemWithRequester = WantedItemRow & { requester: WantedRequester | null };

async function attachRequesters(rows: WantedItemRow[]): Promise<WantedItemWithRequester[]> {
  if (rows.length === 0) return [];
  const ids = Array.from(new Set(rows.map((r) => r.user_id)));
  // NOTE: the profiles table has `username` + `avatar_url` only — there is
  // no `display_name` column. Selecting a non-existent column 400s the whole
  // query and every wanted card silently falls back to "Requester unavailable".
  // If a display-name field is ever added, add it here AND to WantedRequester.
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', ids);
  // Profile fetch is best-effort — a stale or deleted requester just renders
  // the "Requester unavailable" empty state instead of blowing up the card.
  if (error) console.warn('[wanted] requester fetch failed:', error.message);
  const map = new Map(
    (data ?? []).map((p: any) => [
      p.id as string,
      { id: p.id, username: p.username ?? null, display_name: null, avatar_url: p.avatar_url ?? null } as WantedRequester,
    ]),
  );
  return rows.map((r) => ({ ...r, requester: map.get(r.user_id) ?? null }));
}

export async function fetchOpenWantedItemsWithRequesters(opts?: { limit?: number; category?: WantedCategory }) {
  const rows = await fetchOpenWantedItems(opts);
  return attachRequesters(rows);
}

export async function fetchWantedItemWithRequester(id: string): Promise<WantedItemWithRequester | null> {
  const { data, error } = await supabase
    .from('wanted_items')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [withReq] = await attachRequesters([data as WantedItemRow]);
  return withReq;
}

export async function fetchMyWantedItems(userId: string) {
  const { data, error } = await supabase
    .from('wanted_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as WantedItemRow[];
}

// Columns added by later-phase migrations that may not exist yet. We attempt
// the insert with all of them and, on a missing-column error naming one, drop
// that column and retry — so a Wanted Request can always be created, gaining the
// extra data once the migrations are applied. Postgres reports a missing column
// as 42703, but PostgREST (the path the client actually takes) reports it as
// PGRST204 "Could not find the 'X' column ... in the schema cache", so we must
// catch BOTH or the retry never fires and creation hard-fails (see the wizard
// "Could not find the 'source_search_term' column" failure).
const WANTED_GATED_COLUMNS = ['source_search_term', 'lat', 'lng', 'travel_distance'];

export async function createWantedItem(userId: string, input: WantedUpsert) {
  // Geocode-on-write (Phase 3): resolve coordinates from city/region so the
  // request can be distance-matched. Best-effort — never block creation on a
  // geocode miss, and only when the caller hasn't already supplied coords.
  const payload: Record<string, unknown> = { ...input, user_id: userId };
  if (payload.lat == null && payload.lng == null) {
    const locStr = [input.city, input.region].filter(Boolean).join(', ').trim();
    if (locStr) {
      try {
        const r = await geocodeLocation(locStr);
        if (r.ok) {
          payload.lat = r.point.lat;
          payload.lng = r.point.lng;
        }
      } catch {
        /* geocode failure is non-fatal — leave coords unset */
      }
    }
  }

  // Drop migration-gated columns one at a time as the DB reports them missing.
  for (let attempt = 0; attempt <= WANTED_GATED_COLUMNS.length; attempt++) {
    const { data, error } = await supabase
      .from('wanted_items')
      .insert(payload)
      .select('*')
      .single();
    if (!error) return data as WantedItemRow;
    if (error.code === '42703' || error.code === 'PGRST204') {
      const haystack = `${error.message ?? ''} ${error.details ?? ''}`;
      const missing = WANTED_GATED_COLUMNS.find(
        (c) => c in payload && haystack.toLowerCase().includes(c),
      );
      if (missing) {
        console.warn(`[CREATE_WANTED] ${missing} column missing — retrying without it. Apply the matching migration to enable it.`);
        delete payload[missing];
        continue;
      }
    }
    throw new Error(error.message);
  }
  throw new Error('createWantedItem failed: exhausted migration-gated retries');
}

export async function updateWantedItem(id: string, patch: Partial<WantedUpsert>) {
  const { data, error } = await supabase
    .from('wanted_items')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as WantedItemRow;
}

export async function deleteWantedItem(id: string) {
  const { error } = await supabase.from('wanted_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
