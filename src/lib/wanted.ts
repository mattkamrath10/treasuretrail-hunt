import { supabase } from './supabase';

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

export async function createWantedItem(userId: string, input: WantedUpsert) {
  // source_search_term is gated on the Phase-1 wizard migration. Retry without
  // it on 42703 so a dead-end search can still become a Wanted post before the
  // column is applied. Apply migration 20260609000100_wanted_source_search_term.sql
  // to enable demand attribution.
  const build = (withSource: boolean) => {
    const payload: Record<string, unknown> = { ...input, user_id: userId };
    if (!withSource) delete payload.source_search_term;
    return supabase.from('wanted_items').insert(payload).select('*').single();
  };
  let { data, error } = await build(true);
  if (error?.code === '42703' && /source_search_term/i.test(error.message ?? '')) {
    console.warn('[CREATE_WANTED] source_search_term column missing — retrying without it.');
    ({ data, error } = await build(false));
  }
  if (error) throw new Error(error.message);
  return data as WantedItemRow;
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
