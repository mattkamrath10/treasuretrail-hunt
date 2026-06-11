import { supabase } from './supabase';

/**
 * Channel-aware notification preferences (Phase 1).
 *
 * Preferences are stored as a single JSONB column (`profiles.notification_prefs`)
 * keyed by user-facing CATEGORY, each holding per-CHANNEL booleans. This means
 * email / sms / push can be switched on later with ZERO schema or rebuild work —
 * the structure already carries every channel. A shared category↔type map and
 * channel list drive BOTH the Alerts feed and the Notification Settings page.
 */

export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'push';

export type NotificationCategory =
  | 'messages'
  | 'followers'
  | 'event_reminders'
  | 'wanted_item_matches'
  | 'wanted_post_responses'
  | 'listing_activity'
  | 'auction_activity'
  | 'live_alerts';

/** Every channel the schema understands. In-App is live in Phase 1; the rest
 *  are surfaced disabled ("Coming Soon") but already persist if toggled. */
export const CHANNELS: NotificationChannel[] = ['in_app', 'email', 'sms', 'push'];

/** Active channels (toggles are interactive). In-app + push are live; push
 *  delivery is native-only but the preference applies wherever push is sent. */
export const ACTIVE_CHANNELS: NotificationChannel[] = ['in_app', 'push'];

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: 'In-App',
  email: 'Email',
  sms: 'SMS',
  push: 'Push',
};

/** Ordered for display in the settings page. */
export const CATEGORY_ORDER: NotificationCategory[] = [
  'messages',
  'wanted_post_responses',
  'wanted_item_matches',
  'followers',
  'listing_activity',
  'auction_activity',
  'event_reminders',
  'live_alerts',
];

export const CATEGORY_LABELS: Record<NotificationCategory, { label: string; description: string }> = {
  messages: {
    label: 'Messages',
    description: 'Direct messages from other hunters.',
  },
  wanted_post_responses: {
    label: 'Wanted Post Responses',
    description: 'When someone responds to a wanted post you created.',
  },
  wanted_item_matches: {
    label: 'Wanted Item Matches',
    description: 'Saved searches, Rare Radar, and marketplace matches.',
  },
  followers: {
    label: 'New Followers',
    description: 'When a hunter follows you.',
  },
  listing_activity: {
    label: 'Listing Activity',
    description: 'Saves, shares, and price drops on your listings.',
  },
  auction_activity: {
    label: 'Auction Activity',
    description: 'Outbids, wins, and auctions ending soon.',
  },
  event_reminders: {
    label: 'Event Reminders',
    description: 'Upcoming events and sales you follow.',
  },
  live_alerts: {
    label: 'Live Alerts',
    description: 'When a hunter you follow goes live.',
  },
};

/** Maps a raw notification `type` to its user-facing category. Types not in
 *  this map (e.g. `general`) have no category and are always shown. */
const TYPE_TO_CATEGORY: Record<string, NotificationCategory> = {
  message: 'messages',
  follow: 'followers',
  event_reminder: 'event_reminders',
  wanted_item_match: 'wanted_item_matches',
  saved_search_match: 'wanted_item_matches',
  rare_radar_match: 'wanted_item_matches',
  marketplace_match: 'wanted_item_matches',
  wanted_post_response: 'wanted_post_responses',
  listing_saved: 'listing_activity',
  listing_shared: 'listing_activity',
  price_drop: 'listing_activity',
  auction_outbid: 'auction_activity',
  auction_won: 'auction_activity',
  auction_ending: 'auction_activity',
  go_live: 'live_alerts',
};

export function categoryForType(type: string): NotificationCategory | null {
  return TYPE_TO_CATEGORY[type] ?? null;
}

export type NotificationPrefs = Partial<
  Record<NotificationCategory, Partial<Record<NotificationChannel, boolean>>>
>;

/** Built-in default: In-App and Push ON for every category (opt-out); Email
 *  and SMS OFF (opt-in). Keep in sync with pushEnabledFor() in server/push.ts. */
export function defaultChannelValue(channel: NotificationChannel): boolean {
  return channel === 'in_app' || channel === 'push';
}

export function isChannelEnabled(
  prefs: NotificationPrefs,
  category: NotificationCategory,
  channel: NotificationChannel,
): boolean {
  const cat = prefs?.[category];
  const v = cat?.[channel];
  return typeof v === 'boolean' ? v : defaultChannelValue(channel);
}

/**
 * Should a notification of this `type` appear in the in-app feed for the given
 * prefs? Unknown / category-less types (e.g. `general`) are always shown so we
 * never silently swallow a message we don't have a toggle for.
 */
export function isInAppEnabled(prefs: NotificationPrefs, type: string): boolean {
  const cat = categoryForType(type);
  if (!cat) return true;
  return isChannelEnabled(prefs, cat, 'in_app');
}

/** Immutably set one category/channel toggle. */
export function setPref(
  prefs: NotificationPrefs,
  category: NotificationCategory,
  channel: NotificationChannel,
  value: boolean,
): NotificationPrefs {
  return {
    ...prefs,
    [category]: { ...(prefs[category] ?? {}), [channel]: value },
  };
}

/**
 * Read the user's prefs. Degrades to defaults ({}) if the column hasn't been
 * migrated yet (42703) so the feed and settings page keep working pre-migration.
 */
export async function fetchNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const { data, error } = await supabase
    .from('profiles')
    .select('notification_prefs')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    if (error.code === '42703' || /notification_prefs/i.test(error.message ?? '')) {
      console.warn(
        '[NOTIF_PREFS] notification_prefs column missing — apply migration 20260609000001_notifications_phase1.sql to persist settings.',
      );
      return {};
    }
    return {};
  }
  return ((data as { notification_prefs?: NotificationPrefs } | null)?.notification_prefs ?? {}) as NotificationPrefs;
}

export async function saveNotificationPrefs(
  userId: string,
  prefs: NotificationPrefs,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .update({ notification_prefs: prefs })
    .eq('id', userId);
  if (error) {
    if (error.code === '42703' || /notification_prefs/i.test(error.message ?? '')) {
      return {
        error:
          'Settings can’t be saved yet — the notifications database update hasn’t been applied. Try again after it’s live.',
      };
    }
    return { error: error.message };
  }
  return { error: null };
}
