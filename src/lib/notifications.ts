import { supabase } from './supabase';
import type { Notification } from './supabase';

export type NotificationType =
  | 'rare_radar_match'
  | 'marketplace_match'
  | 'scout_response'
  | 'event_reminder'
  | 'saved_search_match'
  | 'message'
  | 'follow'
  | 'listing_saved'
  | 'listing_shared'
  | 'scout_request'
  | 'scout_application'
  | 'reputation_milestone'
  | 'general';

export type NotificationInput = {
  user_id: string;
  type: NotificationType | string;
  title: string;
  content?: string;
  actor_user_id?: string | null;
  related_item_id?: string | null;
  related_item_type?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Insert a notification addressed to the SAME user that is currently signed in.
 * RLS enforces (auth.uid() = user_id); cross-user writes must use `notifyUser`
 * (which routes through a SECURITY DEFINER RPC with a type allow-list).
 */
export async function createNotification(input: NotificationInput): Promise<{ error: string | null }> {
  const { error } = await supabase.from('notifications').insert({
    user_id: input.user_id,
    type: input.type,
    title: input.title,
    content: input.content ?? '',
    actor_user_id: input.actor_user_id ?? null,
    related_item_id: input.related_item_id ?? null,
    related_item_type: input.related_item_type ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Cross-user notification via SECURITY DEFINER RPC. The DB function enforces:
 *  - caller is authenticated
 *  - p_type is in the allowed set (follow, message, scout_response, listing_saved, listing_shared)
 *  - actor_user_id is stamped server-side as auth.uid()
 */
export async function notifyUser(input: {
  target_user_id: string;
  type:
    | 'follow'
    | 'message'
    | 'scout_response'
    | 'listing_saved'
    | 'listing_shared'
    | 'scout_request'
    | 'scout_application'
    | 'reputation_milestone';
  title: string;
  content?: string;
  related_item_id?: string | null;
  related_item_type?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('notify_user', {
    p_target: input.target_user_id,
    p_type: input.type,
    p_title: input.title,
    p_content: input.content ?? '',
    p_related_item_id: input.related_item_id ?? null,
    p_related_item_type: input.related_item_type ?? null,
    p_metadata: input.metadata ?? {},
  });
  if (error) return { error: error.message };
  return { error: null };
}

export async function fetchNotificationsList(
  userId: string,
  opts: { unreadOnly?: boolean; limit?: number } = {}
): Promise<Notification[]> {
  let q = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.unreadOnly) q = q.eq('read_status', false);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as Notification[];
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read_status', false);
  if (error) return 0;
  return count ?? 0;
}

export async function markRead(id: string): Promise<void> {
  await supabase.from('notifications').update({ read_status: true }).eq('id', id);
}

export async function markAllRead(userId: string): Promise<void> {
  await supabase
    .from('notifications')
    .update({ read_status: true })
    .eq('user_id', userId)
    .eq('read_status', false);
}

export async function clearRead(userId: string): Promise<void> {
  await supabase.from('notifications').delete().eq('user_id', userId).eq('read_status', true);
}

export type NotificationSubscription = { unsubscribe: () => void };

export function subscribeNotifications(
  userId: string,
  onChange: (n: Notification | null) => void
): NotificationSubscription {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => {
        onChange((payload.new as Notification) ?? (payload.old as Notification) ?? null);
      }
    )
    .subscribe();
  return {
    unsubscribe: () => {
      supabase.removeChannel(channel);
    },
  };
}
