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

export interface BlockedUser {
  id: string;
  username: string | null;
  avatar_url: string | null;
  created_at: string;
}

/**
 * Returns the users the caller has blocked, with enough profile info to show
 * them in a management list (the Profile → Account → Blocked Users screen).
 * Because blocked users' content is hidden everywhere else in the app, this
 * list is the only place a user can find and undo a block.
 */
export async function fetchBlockedUsers(blockerId: string): Promise<BlockedUser[]> {
  const { data: rows, error } = await supabase
    .from('user_blocks')
    .select('blocked_id, created_at')
    .eq('blocker_id', blockerId)
    .order('created_at', { ascending: false });
  if (error || !rows || rows.length === 0) return [];

  const ids = rows.map((r) => r.blocked_id as string);
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', ids);

  const byId = new Map(
    (profs ?? []).map((p) => [p.id as string, p as { id: string; username: string | null; avatar_url: string | null }]),
  );

  return rows.map((r) => {
    const prof = byId.get(r.blocked_id as string);
    return {
      id: r.blocked_id as string,
      username: prof?.username ?? null,
      avatar_url: prof?.avatar_url ?? null,
      created_at: r.created_at as string,
    };
  });
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
