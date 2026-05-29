import { supabase } from './supabase';
import type { Notification } from './supabase';
import { isLiveNow, type EventRow } from './events';
import { apiUrl } from './apiBase';

/**
 * Fire-and-forget: ask the server to fan out a native push for this go-live
 * event. Tied to the SAME event as the in-app notification. The server claims
 * + dedupes atomically and no-ops when push isn't configured, so this is safe
 * to call best-effort right after the in-app RPC.
 */
async function triggerGoLivePush(eventId: string): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch(apiUrl('/api/push/go-live'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ eventId }),
    });
  } catch {
    /* push is best-effort; in-app notification already delivered */
  }
}

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
  | 'go_live'
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

/* ----------------------------- Go-Live alerts ---------------------------- */

// Per-session guard so each event only triggers one RPC attempt per page
// load cycle. The RPC itself is idempotent (dedupes server-side via
// events.go_live_notified_at), so this is purely to avoid redundant network
// calls when several surfaces render the same live event.
const goLiveAttempted = new Set<string>();

/**
 * Fire the server-side go-live notification for an event. The RPC verifies
 * liveness/eligibility, dedupes, and inserts notifications ONLY for the
 * seller's followers — so this is safe to call best-effort from any surface
 * that shows a live event. Returns the number of followers notified (0 if the
 * event was ineligible or already notified). Degrades quietly when the
 * migration that adds the RPC / column hasn't been applied yet.
 */
export async function notifyFollowersGoLive(
  eventId: string
): Promise<{ count: number; error: string | null }> {
  // The RPC is SECURITY DEFINER and requires auth.uid(); guests can't call it.
  // getSession() reads from local storage (no network), so this is cheap.
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user) return { count: 0, error: null };

  const { data, error } = await supabase.rpc('notify_followers_go_live', {
    p_event_id: eventId,
  });
  if (error) {
    // 42883 = undefined_function, 42703 = undefined_column. Either means the
    // go-live migration hasn't been applied yet; degrade silently.
    if (
      error.code === '42883' ||
      error.code === '42703' ||
      /notify_followers_go_live|go_live_notified_at/i.test(error.message ?? '')
    ) {
      console.warn(
        '[GO_LIVE] notify_followers_go_live unavailable — apply migration 20260529000010_go_live_notifications.sql to enable go-live alerts.'
      );
      return { count: 0, error: null };
    }
    return { count: 0, error: error.message };
  }
  // In-app notification delivered (or already claimed). Fan out the native
  // push for the SAME event — the server claims/dedupes independently, so this
  // is safe to call even when the in-app RPC found the event already notified.
  void triggerGoLivePush(eventId);
  return { count: (data as number) ?? 0, error: null };
}

/**
 * Best-effort: scan a list of events and fire go-live notifications for any
 * online show that is currently live and hasn't been attempted this session.
 * Fire-and-forget — the RPC is idempotent and followers-only.
 */
export function maybeNotifyGoLive(events: EventRow[]): void {
  const now = Date.now();
  for (const e of events) {
    if (e.event_kind !== 'online') continue;
    if (goLiveAttempted.has(e.id)) continue;
    if (!isLiveNow(e, now)) continue;
    goLiveAttempted.add(e.id);
    void notifyFollowersGoLive(e.id);
  }
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
