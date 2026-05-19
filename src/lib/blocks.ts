import { supabase } from './supabase';

export interface BlockRow {
  blocker_id: string;
  blocked_id: string;
  created_at: string;
}

/**
 * Block another user. Idempotent — duplicate blocks are silently absorbed
 * by the composite PK.
 */
export async function blockUser(
  blockerId: string,
  blockedId: string,
): Promise<{ error: string | null }> {
  if (blockerId === blockedId) {
    return { error: 'You cannot block yourself.' };
  }
  const { error } = await supabase
    .from('user_blocks')
    .upsert(
      { blocker_id: blockerId, blocked_id: blockedId },
      { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true },
    );
  if (error) return { error: error.message };
  return { error: null };
}

export async function unblockUser(
  blockerId: string,
  blockedId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Returns the set of user ids the caller has blocked. Used by the feed
 * queries to filter out posts/listings from blocked users client-side.
 * The DB does not enforce this filter (block is a soft UX feature, not a
 * privacy guarantee — blocked users can still see public listings).
 */
export async function fetchBlockedIds(blockerId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocked_id')
    .eq('blocker_id', blockerId);
  if (error || !data) return new Set();
  return new Set(data.map((r) => r.blocked_id as string));
}

export async function isUserBlocked(
  blockerId: string,
  blockedId: string,
): Promise<boolean> {
  const { count } = await supabase
    .from('user_blocks')
    .select('blocker_id', { count: 'exact', head: true })
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
  return (count ?? 0) > 0;
}
