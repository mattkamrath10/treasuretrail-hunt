import { supabase } from './supabase';
import type { ListingKind } from './messaging';

/**
 * Record a view of a listing. Calls the SECURITY DEFINER RPC which dedupes
 * per (listing, viewer, day) so refresh-spam can't inflate counts.
 *
 * Best-effort: a tracking failure must never block UI rendering. We swallow
 * errors and return them so callers can log if they want.
 */
export async function trackListingView(
  listingId: string,
  listingKind: ListingKind,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('track_listing_view', {
      p_listing_id: listingId,
      p_listing_kind: listingKind,
    });
    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e?.message ?? 'track_listing_view failed' };
  }
}

export interface ListingEngagement {
  view_count: number;
  save_count: number;
}

/**
 * Fetch view + save counts for a single listing in one shot. Used by the
 * listing detail header to show "12 viewed · 3 saved".
 */
export async function fetchListingEngagement(
  listingId: string,
  listingKind: ListingKind,
): Promise<ListingEngagement> {
  const [viewsRes, savesRes] = await Promise.all([
    supabase
      .from('listing_view_counts')
      .select('view_count')
      .eq('listing_id', listingId)
      .eq('listing_kind', listingKind)
      .maybeSingle(),
    supabase
      .from('listing_save_counts')
      .select('save_count')
      .eq('listing_id', listingId)
      .eq('listing_kind', listingKind)
      .maybeSingle(),
  ]);
  return {
    view_count: (viewsRes.data?.view_count as number | undefined) ?? 0,
    save_count: (savesRes.data?.save_count as number | undefined) ?? 0,
  };
}
