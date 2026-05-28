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
