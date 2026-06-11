import { supabase } from './supabase';
import type { MarketplaceListing } from './supabase';
import { triggerNotificationPush } from './notifications';

/**
 * Reply-to-wanted-post (Phase 1).
 *
 * A `wanted_responses` row is the structured "I have this / here's my reply"
 * record for an OPEN wanted post. Inserting one fires exactly ONE
 * `wanted_post_response` in-app alert on the post owner (via the
 * `notify_wanted_post_response` AFTER INSERT trigger). The DM/conversation is
 * created separately by the caller; the row is purely the response record +
 * the alert trigger. Multiple hunters can respond to the same post.
 */
export interface WantedResponse {
  id: string;
  wanted_item_id: string;
  responder_id: string;
  message: string;
  photo_urls: string[];
  linked_listing_id: string | null;
  created_at: string;
}

export async function createWantedResponse(input: {
  wantedItemId: string;
  responderId: string;
  message: string;
  photoUrls?: string[];
  linkedListingId?: string | null;
}): Promise<{ response: WantedResponse | null; error: string | null }> {
  const message = input.message.trim();
  if (message.length < 1) return { response: null, error: 'A message is required.' };

  const { data, error } = await supabase
    .from('wanted_responses')
    .insert({
      wanted_item_id: input.wantedItemId,
      responder_id: input.responderId,
      message: message.slice(0, 2000),
      photo_urls: input.photoUrls ?? [],
      linked_listing_id: input.linkedListingId ?? null,
    })
    .select('*')
    .single();

  if (error) {
    // Table not migrated yet — surface a clear, non-fatal message.
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return {
        response: null,
        error: 'Responding isn’t available yet — the latest database update hasn’t been applied.',
      };
    }
    return { response: null, error: error.message };
  }
  // The in-app `wanted_post_response` notification is created by the
  // notify_wanted_post_response AFTER INSERT trigger. Fan out its native push
  // best-effort — the server resolves the post owner from the claimed row.
  void triggerNotificationPush({
    type: 'wanted_post_response',
    relatedItemId: input.wantedItemId,
  });
  return { response: data as WantedResponse, error: null };
}

export async function fetchWantedResponses(wantedItemId: string): Promise<WantedResponse[]> {
  const { data, error } = await supabase
    .from('wanted_responses')
    .select('*')
    .eq('wanted_item_id', wantedItemId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as WantedResponse[];
}

/** Lightweight slice of the responder's own ACTIVE listings, for the optional
 *  "link one of my listings" picker in the respond composer. */
export type MyListingOption = Pick<MarketplaceListing, 'id' | 'title' | 'image_url' | 'price'>;

export async function fetchMyActiveListings(userId: string): Promise<MyListingOption[]> {
  const { data, error } = await supabase
    .from('marketplace_listings')
    .select('id, title, image_url, price')
    .eq('seller_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []) as MyListingOption[];
}
