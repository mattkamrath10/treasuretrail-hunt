import { supabase } from './supabase';
import { assertClean, GUIDELINE_MESSAGE } from './contentFilter';
import { apiUrl } from './apiBase';
import { normalizeEvents } from './recurrence';

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
  // Optional external event page (Facebook event, estate-sale site, HiBid
  // auction, Whatnot stream, etc). Optional so rows fetched before the
  // `20260529000001_event_url.sql` migration lands still typecheck.
  event_url?: string | null;
  // Recurrence — a recurring event is ONE row; the anchor starts_at/ends_at
  // define the first occurrence and these columns describe the repeat rule.
  // The next occurrence is computed at read time (see recurrence.ts). All
  // optional so rows fetched before the recurrence migration still typecheck.
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly' | null;
  recurrence_days?: number[] | null;
  recurrence_monthly_mode?: 'day_of_month' | 'nth_weekday' | null;
  recurrence_day_of_month?: number | null;
  recurrence_nth?: number | null;
  recurrence_weekday?: number | null;
  recurrence_until?: string | null;
  // Phase 1 monetization — boost + moderation. Optional so older code
  // paths that don't SELECT them still typecheck. See
  // `supabase/migrations/20260528000002_monetization_phase1.sql`.
  boosted_at?: string | null;
  boost_expires_at?: string | null;
  boost_type?: 'paid' | 'pro' | null;
  priority_score?: number | null;
  is_hidden?: boolean | null;
  report_count?: number | null;
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
  // Optional external event page link (any kind of event).
  event_url?: string | null;
  // Recurrence config (see EventRow for semantics).
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly' | null;
  recurrence_days?: number[] | null;
  recurrence_monthly_mode?: 'day_of_month' | 'nth_weekday' | null;
  recurrence_day_of_month?: number | null;
  recurrence_nth?: number | null;
  recurrence_weekday?: number | null;
  recurrence_until?: string | null;
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

/** Public feed of published events, soonest first.
 *
 * Hidden-row filtering is best-effort: until the Phase-1 monetization
 * migration (`20260528000002_monetization_phase1.sql`) lands, the
 * `is_hidden` column doesn't exist and Postgres returns 42703. We
 * detect that one error code and transparently retry without the
 * filter so the feed never goes blank during migration rollout. */
export async function fetchPublishedEvents(opts?: { city?: string | null; limit?: number }) {
  const build = (withHidden: boolean) => {
    let q = supabase
      .from('events')
      .select('*')
      .eq('status', 'published')
      .order('starts_at', { ascending: true })
      .limit(opts?.limit ?? 50);
    if (withHidden) q = q.eq('is_hidden', false);
    if (opts?.city) q = q.eq('city', opts.city);
    return q;
  };
  let { data, error } = await build(true);
  if (error?.code === '42703' && /is_hidden/i.test(error.message ?? '')) {
    console.warn('[FETCH_PUBLISHED_EVENTS] is_hidden column missing — retrying without moderation filter. Apply migration 20260528000002_monetization_phase1.sql to enable.');
    ({ data, error } = await build(false));
  }
  if (error) throw new Error(error.message);
  // Recurring events are stored as a single anchor row; normalize each to its
  // next upcoming occurrence (and re-sort soonest first) so the public feed,
  // Discover, nearby, category and search all show the right date.
  return normalizeEvents((data ?? []) as EventRow[]);
}

/**
 * Count a holder's *active local* events — used to enforce the free-tier
 * cap (1 active local event for free, unlimited for Pro). "Active" means
 * not cancelled; online live shows do not count against the local cap.
 * `excludeId` lets the edit form ignore the row being saved.
 *
 * The DB trigger in `20260529000003_free_tier_event_cap.sql` is the real
 * backstop; this client count drives the friendly pre-save UX so the user
 * sees an upgrade prompt instead of a raw Postgres error.
 */
export async function countActiveLocalEvents(holderId: string, excludeId?: string): Promise<number> {
  let q = supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('holder_id', holderId)
    .eq('event_kind', 'local')
    .neq('status', 'cancelled');
  if (excludeId) q = q.neq('id', excludeId);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Resolve which of the given holder ids are Pro members. Used by Discover
 * to give Pro sellers priority placement. Best-effort: any error returns
 * an empty set so the feed still renders (Pro just loses its boost that
 * load) rather than blanking out.
 */
export async function fetchProHolderIds(holderIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(holderIds)].filter(Boolean);
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, membership_tier, pro_member')
    .in('id', ids);
  if (error) {
    console.warn('[FETCH_PRO_HOLDERS] failed — Pro priority placement skipped this load:', error.message);
    return new Set();
  }
  const set = new Set<string>();
  for (const p of data ?? []) {
    const row = p as { id: string; membership_tier?: string | null; pro_member?: boolean | null };
    if (row.membership_tier === 'pro' || row.pro_member) set.add(row.id);
  }
  return set;
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

// Some optional columns are applied by hand in the Supabase SQL editor and may
// not exist yet at write time: `event_url` (20260529000001_event_url.sql) and
// the `recurrence*` columns (20260610000000_recurring_events.sql). Sending a
// field to a table without its column errors and would break ALL event
// creation/edits, so we strip the offending group and retry, mirroring the
// is_hidden pattern in fetchPublishedEvents.
//
// Two error shapes are possible: raw Postgres returns `42703`
// (undefined_column), while PostgREST's schema cache returns `PGRST204`
// ("Could not find the '<col>' column"). Tolerate both, scoped to known
// optional columns so we never mask an unrelated failure.
const RECURRENCE_COLS = [
  'recurrence', 'recurrence_days', 'recurrence_monthly_mode',
  'recurrence_day_of_month', 'recurrence_nth', 'recurrence_weekday', 'recurrence_until',
];

type MissingGroup = 'event_url' | 'recurrence';

function classifyMissingColumn(
  error: { code?: string; message?: string; details?: string } | null,
): MissingGroup | null {
  if (!error) return null;
  if (error.code !== '42703' && error.code !== 'PGRST204') return null;
  const haystack = `${error.message ?? ''} ${error.details ?? ''}`;
  if (/recurrence/i.test(haystack)) return 'recurrence';
  if (/event_url/i.test(haystack)) return 'event_url';
  return null;
}

/**
 * Run an event insert/update, transparently stripping optional column groups
 * (event_url, recurrence*) and retrying when the DB reports them missing. The
 * `run` callback receives the payload to send and returns the Supabase result.
 */
async function writeEventRow(
  base: Record<string, unknown>,
  run: (payload: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string; details?: string } | null }>,
): Promise<EventRow> {
  const stripped = new Set<MissingGroup>();
  for (let attempt = 0; attempt < 3; attempt++) {
    const payload: Record<string, unknown> = { ...base };
    if (stripped.has('event_url')) delete payload.event_url;
    if (stripped.has('recurrence')) for (const c of RECURRENCE_COLS) delete payload[c];

    const { data, error } = await run(payload);
    if (!error) return data as EventRow;

    const miss = classifyMissingColumn(error);
    if (miss && !stripped.has(miss)) {
      stripped.add(miss);
      console.warn(`[WRITE_EVENT] '${miss}' column(s) missing — retrying without them. Apply the matching migration to enable this feature.`);
      continue;
    }
    throw new Error(error.message ?? 'Failed to save event');
  }
  throw new Error('Failed to save event after stripping optional columns.');
}

export async function createEvent(holderId: string, input: EventUpsert) {
  if (assertClean(input.title, input.description).blocked) {
    throw new Error(GUIDELINE_MESSAGE);
  }
  return writeEventRow(
    { ...input, holder_id: holderId },
    (payload) => supabase.from('events').insert(payload).select('*').single(),
  );
}

/**
 * Normalized event data extracted from a pasted URL by the server's
 * `/api/events/import` endpoint. Mirrors the fields the SellerEventForm
 * pre-fills; everything is best-effort and may be null.
 */
export interface ImportedEvent {
  title: string | null;
  description: string | null;
  category: EventCategory | null;
  starts_at: string | null;
  ends_at: string | null;
  city: string | null;
  region: string | null;
  address: string | null;
  seller_name: string | null;
  lot_count: number | null;
  cover_image_url: string | null;
  event_kind: EventKind;
  platform: EventPlatform | null;
  livestream_url: string | null;
  event_url: string;
  site_name: string | null;
}

/**
 * Ask the server to fetch + extract event details from an external URL
 * (HiBid, Whatnot, eBay Live, Facebook Event, Poshmark Live, AuctionZip,
 * EstateSales.net, …). Uses `apiUrl()` so it works inside the Capacitor
 * webview, and forwards the user's bearer token. Throws a user-friendly
 * Error on failure so the caller can fall back to manual entry.
 */
export async function importEventFromUrl(url: string): Promise<ImportedEvent> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error('Please sign in to import events.');
  let resp: Response;
  try {
    resp = await fetch(apiUrl('/api/events/import'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url }),
    });
  } catch {
    throw new Error('Network error — check your connection and try again.');
  }
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json?.ok || !json?.data) {
    throw new Error(json?.error || 'Could not import this event. Try a different link or enter details manually.');
  }
  return json.data as ImportedEvent;
}

export async function updateEvent(id: string, patch: Partial<EventUpsert>) {
  return writeEventRow(
    { ...patch },
    (payload) => supabase.from('events').update(payload).eq('id', id).select('*').single(),
  );
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
