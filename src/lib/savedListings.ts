import { supabase } from './supabase';
import type { ListingKind } from './messaging';

export interface SavedListingRow {
  user_id: string;
  listing_id: string;
  listing_kind: ListingKind;
  created_at: string;
}

/**
 * Persist a save server-side (subject to RLS). The caller is expected to
 * pass their own auth uid; we still rely on the WITH CHECK policy to
 * prevent forgery.
 */
export async function saveListing(
  userId: string,
  listingId: string,
  listingKind: ListingKind,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('saved_listings')
    .upsert({ user_id: userId, listing_id: listingId, listing_kind: listingKind }, {
      onConflict: 'user_id,listing_id,listing_kind',
      ignoreDuplicates: true,
    });
  if (error) return { error: error.message };
  return { error: null };
}

export async function unsaveListing(
  userId: string,
  listingId: string,
  listingKind: ListingKind,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('saved_listings')
    .delete()
    .eq('user_id', userId)
    .eq('listing_id', listingId)
    .eq('listing_kind', listingKind);
  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Fetch every listing the user has saved. Returns rows so the caller can
 * group by kind and hydrate from the originating table.
 */
export async function fetchSavedListings(userId: string): Promise<SavedListingRow[]> {
  const { data, error } = await supabase
    .from('saved_listings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error || !data) return [];
  return data as SavedListingRow[];
}

/**
 * Lightweight existence check used by detail pages to render the
 * Save / Unsave toggle without fetching the whole list.
 */
export async function isListingSaved(
  userId: string,
  listingId: string,
  listingKind: ListingKind,
): Promise<boolean> {
  const { count } = await supabase
    .from('saved_listings')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('listing_id', listingId)
    .eq('listing_kind', listingKind);
  return (count ?? 0) > 0;
}
