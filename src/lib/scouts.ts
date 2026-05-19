import { supabase } from './supabase';
import { notifyUser } from './notifications';
import type { ListingKind } from './messaging';

export interface ScoutRequest {
  id: string;
  listing_id: string;
  listing_kind: ListingKind;
  requester_id: string;
  seller_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'completed' | 'cancelled';
  message: string;
  created_at: string;
  updated_at: string;
}

/**
 * File a "scout this item" request against a listing's seller. Triggers a
 * seller-facing notification via the existing SECURITY DEFINER RPC; the
 * notification is best-effort and never blocks the scout insert.
 */
export async function createScoutRequest(input: {
  listingId: string;
  listingKind: ListingKind;
  sellerId: string;
  requesterId: string;
  message?: string;
  listingTitle?: string;
}): Promise<{ scout: ScoutRequest | null; error: string | null }> {
  if (input.sellerId === input.requesterId) {
    return { scout: null, error: 'You cannot scout your own listing' };
  }
  // Client-side guard mirrors the DB CHECK constraint. We accept a short
  // free-form note but never an essay; anything longer is rejected before
  // the round trip so the user sees instant feedback.
  const note = (input.message ?? '').slice(0, 2000);
  if ((input.message ?? '').length > 2000) {
    return { scout: null, error: 'Note is too long (max 2000 characters)' };
  }
  const { data, error } = await supabase
    .from('scout_requests')
    .insert({
      listing_id: input.listingId,
      listing_kind: input.listingKind,
      requester_id: input.requesterId,
      seller_id: input.sellerId,
      message: note,
    })
    .select('*')
    .single();
  if (error) return { scout: null, error: error.message };

  await notifyUser({
    target_user_id: input.sellerId,
    type: 'scout_response',
    title: 'New scout request',
    content: input.listingTitle ? `A hunter wants to scout “${input.listingTitle}”.` : 'A hunter wants to scout your listing.',
    related_item_id: input.listingId,
    related_item_type: input.listingKind,
  });

  return { scout: data as ScoutRequest, error: null };
}

/**
 * Has the current user already requested a scout for this listing? Used to
 * disable the button after submission.
 */
export async function hasOpenScoutRequest(
  listingId: string,
  listingKind: ListingKind,
  requesterId: string,
): Promise<boolean> {
  const { count } = await supabase
    .from('scout_requests')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', listingId)
    .eq('listing_kind', listingKind)
    .eq('requester_id', requesterId)
    .in('status', ['pending', 'accepted']);
  return (count ?? 0) > 0;
}
