import { supabase } from './supabase';

export type EventCategory =
  | 'estate_sale'
  | 'yard_sale'
  | 'flea_market'
  | 'auction'
  | 'pop_up'
  | 'collectibles_show'
  | 'other';

export type EventStatus = 'draft' | 'published' | 'cancelled';

export type EventKind = 'local' | 'online';

export type EventPlatform =
  | 'whatnot'
  | 'poshmark_live'
  | 'posh_party'
  | 'ebay_live'
  | 'other';

export type ShowCategory =
  | 'sneakers'
  | 'sportscards'
  | 'tradingcards'
  | 'coins'
  | 'jewelry'
  | 'vintage'
  | 'collectibles'
  | 'fashion'
  | 'toys'
  | 'art'
  | 'other';

/**
 * Per-platform metadata for badges, branding, and URL validation.
 *
 * `urlPattern` is mirrored from the DB CHECK constraint in
 * 20260527000002_phase2_online_events.sql — keep both in sync if either
 * changes, or the form will silently let users save URLs the DB then
 * rejects (or vice versa).
 */
export const PLATFORM_META: Record<
  EventPlatform,
  { label: string; color: string; urlPattern: RegExp; placeholderUrl: string }
> = {
  whatnot:       { label: 'Whatnot',       color: '#FFCC00', urlPattern: /^https:\/\/(www\.)?whatnot\.com\//i,                placeholderUrl: 'https://www.whatnot.com/live/...' },
  poshmark_live: { label: 'Poshmark Live', color: '#7C1F4E', urlPattern: /^https:\/\/(www\.)?(poshmark\.com|posh\.mk)\//i,    placeholderUrl: 'https://poshmark.com/show/...' },
  posh_party:    { label: 'Posh Party',    color: '#B83280', urlPattern: /^https:\/\/(www\.)?(poshmark\.com|posh\.mk)\//i,    placeholderUrl: 'https://poshmark.com/party/...' },
  ebay_live:     { label: 'eBay Live',     color: '#0064D2', urlPattern: /^https:\/\/(www\.)?ebay\.com\//i,                   placeholderUrl: 'https://www.ebay.com/live/...' },
  other:         { label: 'Other',         color: '#525252', urlPattern: /^https:\/\//i,                                       placeholderUrl: 'https://...' },
};

export const SHOW_CATEGORY_LABELS: Record<ShowCategory, string> = {
  sneakers:     'Sneakers',
  sportscards:  'Sports cards',
  tradingcards: 'Trading cards (TCG)',
  coins:        'Coins & bullion',
  jewelry:      'Jewelry',
  vintage:      'Vintage',
  collectibles: 'Collectibles',
  fashion:      'Fashion',
  toys:         'Toys',
  art:          'Art',
  other:        'Other',
};

export interface EventRow {
  id: string;
  holder_id: string;
  title: string;
  description: string;
  category: EventCategory;
  starts_at: string;
  ends_at: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  cover_image_url: string | null;
  cover_thumb_url: string | null;
  status: EventStatus;
  // Phase 2 — online live event fields.
  event_kind: EventKind;
  platform: EventPlatform | null;
  livestream_url: string | null;
  seller_handle: string | null;
  show_category: ShowCategory | null;
  created_at: string;
  updated_at: string;
}

export interface EventFeaturedItem {
  id: string;
  event_id: string;
  title: string;
  price: number | null;
  image_url: string | null;
  thumb_url: string | null;
  position: number;
  created_at: string;
}

export interface EventUpsert {
  id?: string;
  title: string;
  description?: string;
  category: EventCategory;
  starts_at: string;
  ends_at?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  lat?: number | null;
  lng?: number | null;
  cover_image_url?: string | null;
  cover_thumb_url?: string | null;
  status: EventStatus;
  // Phase 2.
  event_kind?: EventKind;
  platform?: EventPlatform | null;
  livestream_url?: string | null;
  seller_handle?: string | null;
  show_category?: ShowCategory | null;
}

/* ---------------- Time-based helpers (Live now / Starting soon) ---------- */

const SOON_WINDOW_MS    = 60 * 60 * 1000;       // 60 min before start
const ASSUMED_SHOW_LEN  = 2  * 60 * 60 * 1000;  // online events without
                                                // an ends_at → assume 2h
                                                // window so "Live Now"
                                                // doesn't stick forever.

export function isStartingSoon(e: EventRow, now: number = Date.now()): boolean {
  const start = new Date(e.starts_at).getTime();
  return start > now && start - now <= SOON_WINDOW_MS;
}

export function isLiveNow(e: EventRow, now: number = Date.now()): boolean {
  const start = new Date(e.starts_at).getTime();
  if (start > now) return false;
  const end = e.ends_at
    ? new Date(e.ends_at).getTime()
    : (e.event_kind === 'online' ? start + ASSUMED_SHOW_LEN : start + ASSUMED_SHOW_LEN);
  return now < end;
}

/**
 * An online (Whatnot etc) event whose computed show window has
 * already closed. We can't poll the platform to confirm the stream
 * actually ended, so we treat the assumed-2h window after `starts_at`
 * (or the explicit `ends_at`) as the source of truth. Used to:
 *   - drop the "LIVE" badge,
 *   - re-label CTAs to "Open on Whatnot" / "Recently Live",
 *   - swap the dead livestream URL for the seller's storefront so
 *     users never land on Whatnot's "show ended" page.
 */
export function isExpiredLive(e: EventRow, now: number = Date.now()): boolean {
  if (e.event_kind !== 'online') return false;
  const start = new Date(e.starts_at).getTime();
  if (start > now) return false;
  const end = e.ends_at
    ? new Date(e.ends_at).getTime()
    : start + ASSUMED_SHOW_LEN;
  return now >= end;
}

/**
 * Best-effort storefront URL for a given event's seller. For Whatnot
 * we can reconstruct `https://www.whatnot.com/user/<handle>` from the
 * `seller_handle` field. For everything else (and as a final fallback)
 * we return the platform's browse/home page instead of a dead show
 * URL.
 */
export function platformStorefrontUrl(e: EventRow): string {
  const handle = (e.seller_handle ?? '').trim().replace(/^@/, '');
  switch (e.platform) {
    case 'whatnot':
      return handle ? `https://www.whatnot.com/user/${encodeURIComponent(handle)}` : 'https://www.whatnot.com/';
    case 'poshmark_live':
    case 'posh_party':
      return handle ? `https://poshmark.com/closet/${encodeURIComponent(handle)}` : 'https://poshmark.com/';
    case 'ebay_live':
      return handle ? `https://www.ebay.com/usr/${encodeURIComponent(handle)}` : 'https://www.ebay.com/';
    default:
      return 'https://www.whatnot.com/';
  }
}

/**
 * Resolve the URL the "Open" CTA should actually navigate to. If the
 * show is still inside its live window we send users to the real
 * livestream; once the window has closed we fall back to the seller's
 * storefront so they land on something real (and can follow / catch
 * the next show) instead of a dead page.
 */
export function resolveExternalEventUrl(e: EventRow, now: number = Date.now()): string | null {
  if (!e.livestream_url) return null;
  if (isExpiredLive(e, now)) return platformStorefrontUrl(e);
  return e.livestream_url;
}

/* ---------------- Queries ------------------------------------------------ */

/** Public feed of published events, soonest first. */
export async function fetchPublishedEvents(opts?: { city?: string | null; limit?: number }) {
  let q = supabase
    .from('events')
    .select('*')
    .eq('status', 'published')
    .order('starts_at', { ascending: true })
    .limit(opts?.limit ?? 50);
  if (opts?.city) q = q.eq('city', opts.city);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as EventRow[];
}

/** All events owned by a holder (any status). */
export async function fetchMyEvents(holderId: string) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('holder_id', holderId)
    .order('starts_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as EventRow[];
}

export async function fetchEvent(id: string) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as EventRow | null;
}

/**
 * Owner-scoped fetch for the edit page. Without the `holder_id` filter
 * a holder could open another holder's published event URL and have the
 * edit form silently preload it (RLS still blocks saves, but the load
 * itself leaks edit affordances). Always use this for /seller/event/:id.
 */
export async function fetchMyEvent(id: string, holderId: string) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .eq('holder_id', holderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as EventRow | null;
}

export async function createEvent(holderId: string, input: EventUpsert) {
  const { data, error } = await supabase
    .from('events')
    .insert({ ...input, holder_id: holderId })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as EventRow;
}

export async function updateEvent(id: string, patch: Partial<EventUpsert>) {
  const { data, error } = await supabase
    .from('events')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as EventRow;
}

export async function deleteEvent(id: string) {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ---------------- Featured items ---------------- */

export async function fetchEventFeaturedItems(eventId: string) {
  const { data, error } = await supabase
    .from('event_featured_items')
    .select('*')
    .eq('event_id', eventId)
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as EventFeaturedItem[];
}

export async function addEventFeaturedItem(
  eventId: string,
  item: { title: string; price?: number | null; image_url?: string | null; thumb_url?: string | null; position?: number },
) {
  const { data, error } = await supabase
    .from('event_featured_items')
    .insert({ event_id: eventId, ...item })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as EventFeaturedItem;
}

export async function deleteEventFeaturedItem(id: string) {
  const { error } = await supabase.from('event_featured_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
