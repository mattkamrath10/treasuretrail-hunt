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
}

export async function fetchOpenWantedItems(opts?: { limit?: number; category?: WantedCategory }) {
  let q = supabase
    .from('wanted_items')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 50);
  if (opts?.category) q = q.eq('category', opts.category);
  const { data, error } = await q;
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
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', ids);
  // Profile fetch is best-effort — a stale or deleted requester just renders
  // the "Requester unavailable" empty state instead of blowing up the card.
  if (error) console.warn('[wanted] requester fetch failed:', error.message);
  const map = new Map((data ?? []).map((p: any) => [p.id as string, p as WantedRequester]));
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
  const { data, error } = await supabase
    .from('wanted_items')
    .insert({ ...input, user_id: userId })
    .select('*')
    .single();
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
