/**
 * Following feed — aggregates content from sellers the signed-in user
 * follows into a single, live-first ranked list.
 *
 * Content types: published events (incl. live online shows), active
 * marketplace listings, open wanted posts, and finds (community posts).
 * Each source is fetched with `.in(<ownerColumn>, ids)` and normalized
 * into a `FollowFeedItem`, then ranked through the SAME `rankDiscoverFeed`
 * helper the Discover feed uses, so live shows float to the top and the
 * boost/Pro priority order stays consistent across the app.
 *
 * Every fetch is best-effort: a failure (or the pre-monetization 42703
 * `is_hidden` column gap) degrades to an empty slice rather than blanking
 * the whole feed.
 */
import { supabase } from './supabase';
import { isLiveNow, isExpiredLive, type EventRow } from './events';
import { applyNextOccurrence } from './recurrence';
import { rankDiscoverFeed } from './feedRanking';
import type { CommunityPost, MarketplaceListing } from './supabase';
import type { WantedItemRow } from './wanted';

export type FollowFeedKind = 'event' | 'listing' | 'wanted' | 'find';

export interface FollowFeedItem {
  key: string;
  kind: FollowFeedKind;
  id: string;
  sellerId: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  route: string;
  badge: string;
  isLive: boolean;
  isExpired: boolean;
  createdAt: string;
  // Boost passthrough so `rankDiscoverFeed`'s `isBoosted()` works on the
  // normalized item (BoostableRow shape).
  boosted_at?: string | null;
  boost_expires_at?: string | null;
  boost_type?: 'paid' | 'pro' | null;
  priority_score?: number | null;
}

/** Ids of every seller the user follows. */
export async function fetchFollowingIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('followers')
    .select('following_id')
    .eq('follower_id', userId);
  if (error) return [];
  return (data ?? []).map((r) => (r as { following_id: string }).following_id);
}

async function fetchFollowedEvents(ids: string[]): Promise<EventRow[]> {
  const build = (withHidden: boolean) => {
    let q = supabase
      .from('events')
      .select('*')
      .eq('status', 'published')
      .in('holder_id', ids)
      .order('starts_at', { ascending: false })
      .limit(50);
    if (withHidden) q = q.eq('is_hidden', false);
    return q;
  };
  let { data, error } = await build(true);
  if (error?.code === '42703') ({ data, error } = await build(false));
  if (error) return [];
  return (data ?? []) as EventRow[];
}

async function fetchFollowedListings(ids: string[]): Promise<MarketplaceListing[]> {
  const build = (withHidden: boolean) => {
    let q = supabase
      .from('marketplace_listings')
      .select('*')
      .eq('status', 'active')
      .in('seller_id', ids)
      .order('created_at', { ascending: false })
      .limit(50);
    if (withHidden) q = q.eq('is_hidden', false);
    return q;
  };
  let { data, error } = await build(true);
  if (error?.code === '42703') ({ data, error } = await build(false));
  if (error) return [];
  return (data ?? []) as MarketplaceListing[];
}

async function fetchFollowedWanted(ids: string[]): Promise<WantedItemRow[]> {
  const build = (withHidden: boolean) => {
    let q = supabase
      .from('wanted_items')
      .select('*')
      .eq('status', 'open')
      .in('user_id', ids)
      .order('created_at', { ascending: false })
      .limit(50);
    if (withHidden) q = q.eq('is_hidden', false);
    return q;
  };
  let { data, error } = await build(true);
  if (error?.code === '42703') ({ data, error } = await build(false));
  if (error) return [];
  return (data ?? []) as WantedItemRow[];
}

async function fetchFollowedFinds(ids: string[]): Promise<CommunityPost[]> {
  const build = (withHidden: boolean) => {
    let q = supabase
      .from('community_posts')
      .select('*')
      .in('user_id', ids)
      .order('created_at', { ascending: false })
      .limit(50);
    if (withHidden) q = q.eq('is_hidden', false);
    return q;
  };
  let { data, error } = await build(true);
  if (error?.code === '42703') ({ data, error } = await build(false));
  if (error) return [];
  return (data ?? []) as CommunityPost[];
}

function mapEvent(e: EventRow): FollowFeedItem {
  const live = e.event_kind === 'online' && isLiveNow(e);
  const expired = isExpiredLive(e);
  const where = e.city || e.platform || (e.event_kind === 'online' ? 'Online live show' : 'Local event');
  return {
    key: `event:${e.id}`,
    kind: 'event',
    id: e.id,
    sellerId: e.holder_id,
    title: e.title,
    subtitle: where,
    imageUrl: e.cover_thumb_url || e.cover_image_url,
    route: `/event/${e.id}`,
    badge: live ? 'Live now' : expired ? 'Recently live' : 'Event',
    isLive: live,
    isExpired: expired,
    createdAt: e.created_at,
    boosted_at: e.boosted_at ?? null,
    boost_expires_at: e.boost_expires_at ?? null,
    boost_type: e.boost_type ?? null,
    priority_score: e.priority_score ?? null,
  };
}

function mapListing(l: MarketplaceListing): FollowFeedItem {
  const price = typeof l.price === 'number' ? `$${l.price.toLocaleString()}` : '';
  return {
    key: `listing:${l.id}`,
    kind: 'listing',
    id: l.id,
    sellerId: l.seller_id,
    title: l.title,
    subtitle: [price, l.condition].filter(Boolean).join(' · '),
    imageUrl: l.image_url,
    route: `/listing/${l.id}`,
    badge: 'For sale',
    isLive: false,
    isExpired: false,
    createdAt: l.created_at,
    boosted_at: l.boosted_at ?? null,
    boost_expires_at: l.boost_expires_at ?? null,
    boost_type: l.boost_type ?? null,
    priority_score: l.priority_score ?? null,
  };
}

function mapWanted(w: WantedItemRow): FollowFeedItem {
  const budget = typeof w.max_budget === 'number' ? `Budget: $${w.max_budget.toLocaleString()}` : '';
  return {
    key: `wanted:${w.id}`,
    kind: 'wanted',
    id: w.id,
    sellerId: w.user_id,
    title: w.title,
    subtitle: [budget, w.city].filter(Boolean).join(' · ') || 'Wanted',
    imageUrl: w.thumb_url || w.image_url,
    route: `/wanted/${w.id}`,
    badge: 'Wanted',
    isLive: false,
    isExpired: false,
    createdAt: w.created_at,
    boosted_at: w.boosted_at ?? null,
    boost_expires_at: w.boost_expires_at ?? null,
    boost_type: w.boost_type ?? null,
    priority_score: w.priority_score ?? null,
  };
}

function mapFind(p: CommunityPost): FollowFeedItem {
  return {
    key: `find:${p.id}`,
    kind: 'find',
    id: p.id,
    sellerId: p.user_id,
    title: p.caption || 'Find',
    subtitle: p.location || p.category || 'Find',
    imageUrl: p.image_url,
    route: `/find/${p.id}`,
    badge: 'Find',
    isLive: false,
    isExpired: false,
    createdAt: p.created_at,
    boosted_at: p.boosted_at ?? null,
    boost_expires_at: p.boost_expires_at ?? null,
    boost_type: p.boost_type ?? null,
    priority_score: p.priority_score ?? null,
  };
}

export interface FollowingFeed {
  items: FollowFeedItem[];
  followingCount: number;
  /** Raw event rows so callers can fire go-live notifications. */
  events: EventRow[];
}

export async function fetchFollowingFeed(userId: string): Promise<FollowingFeed> {
  const ids = await fetchFollowingIds(userId);
  if (ids.length === 0) return { items: [], followingCount: 0, events: [] };

  const [events, listings, wanted, finds] = await Promise.all([
    fetchFollowedEvents(ids).catch(() => [] as EventRow[]),
    fetchFollowedListings(ids).catch(() => [] as MarketplaceListing[]),
    fetchFollowedWanted(ids).catch(() => [] as WantedItemRow[]),
    fetchFollowedFinds(ids).catch(() => [] as CommunityPost[]),
  ]);

  const items: FollowFeedItem[] = [
    // Recurring events are single anchor rows — surface the next occurrence so
    // followed recurring events show their upcoming date / live state. Raw
    // `events` (returned below for go-live notifications) stay untouched.
    ...events.map((e) => mapEvent(applyNextOccurrence(e))),
    ...listings.map(mapListing),
    ...wanted.map(mapWanted),
    ...finds.map(mapFind),
  ];

  const ranked = rankDiscoverFeed(items, {
    isLive: (i) => i.isLive,
    isExpired: (i) => i.isExpired,
    createdAt: (i) => i.createdAt,
  });

  return { items: ranked, followingCount: ids.length, events };
}
