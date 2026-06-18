/**
 * Discover "Featured Near You" data + ranking layer.
 *
 * Normalizes the Discover content sources (events, businesses, wanted posts,
 * flash finds, and collectibles uploaded inside events) into a single
 * `FeaturedSlide` shape, then filters by location/search/kind and ranks them
 * boost-first so paid promotion is always meaningfully visible:
 *
 *   boosted (paid) -> boosted (pro) -> pro/featured sellers -> everything else
 *
 * Boost outranks content KIND on purpose: a boosted flash find beats a
 * non-boosted event, within and across categories.
 *
 * Kept as pure functions so the Discover page stays lean and this is easy to
 * reason about (and unit-test) in isolation.
 */

import type { EventRow, EventFeaturedItem } from './events';
import type { BusinessRow } from './businesses';
import { BUSINESS_CATEGORY_META } from './businesses';
import type { WantedItemRow } from './wanted';
import { WANTED_CATEGORY_LABEL } from './wanted';
import type { CommunityPost } from './supabase';
import { isBoosted, type BoostableRow } from './boost';
import { haversineMiles } from './geocode';
import { toThumbUrl } from './imageCompress';

export type FeaturedKind = 'event' | 'business' | 'find' | 'wanted';
export type FeaturedFilter = 'all' | FeaturedKind;

export interface FeaturedSlide {
  id: string;
  kind: FeaturedKind;
  title: string;
  subtitle: string;
  category: string | null;
  image: string | null;
  imageFull: string | null;
  accent: string;
  badge: 'Boosted' | 'Pro' | 'Featured' | 'Verified' | null;
  to: string;
  lat: number | null;
  lng: number | null;
  distanceMi: number | null;
  priority: number;
  sortTime: number;
  fallbackKind: 'event' | 'find' | 'wanted' | 'listing';
  fallbackCategory: string | null;
  searchText: string;
}

export const FEATURED_KIND_ACCENT: Record<FeaturedKind, string> = {
  event: '#f59e0b',
  business: '#22d3ee',
  find: '#8b5cf6',
  wanted: '#f97316',
};

export const FEATURED_KIND_LABEL: Record<FeaturedKind, string> = {
  event: 'Event',
  business: 'Business',
  find: 'Flash Find',
  wanted: 'Wanted',
};

const EVENT_CATEGORY_LABEL: Record<string, string> = {
  estate_sale: 'Estate Sale',
  yard_sale: 'Yard Sale',
  flea_market: 'Flea Market',
  auction: 'Auction',
  pop_up: 'Pop-up',
  collectibles_show: 'Collectibles Show',
  other: 'Event',
};

// Priority buckets (lower = shown first).
//
// Boost now floats to the very top across EVERY kind so paid/Pro promotion is
// always meaningfully visible (audit fix): any actively boosted item — event,
// flash find, wanted, or event collectible — outranks all non-boosted content
// regardless of type. Below boosts, Pro/featured sellers sit above normal.
const P_BOOST_PAID = 0; // active paid boost (any kind)
const P_BOOST_PRO = 1; // active Pro-included boost (any kind)
const P_FEATURED = 2; // Pro holders, verified/featured shops (no active boost)
const P_NORMAL = 3; // everything else

/**
 * Bucket for an actively boosted row (paid above Pro), or null when the row
 * has no active boost. Lets every builder share one consistent boost rule.
 */
function boostBucket(row: BoostableRow | null | undefined): number | null {
  if (!isBoosted(row)) return null;
  return row?.boost_type === 'pro' ? P_BOOST_PRO : P_BOOST_PAID;
}

function ts(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function placeLabel(city: string | null, region: string | null, fallback: string): string {
  return [city, region].filter(Boolean).join(', ') || fallback;
}

function eventToSlide(e: EventRow, proHolders: Set<string>): FeaturedSlide {
  const boosted = isBoosted(e);
  const pro = proHolders.has(e.holder_id);
  const category = EVENT_CATEGORY_LABEL[e.category] ?? 'Event';
  const subtitle = placeLabel(e.city, e.region, e.address ?? 'Local event');
  return {
    id: `event:${e.id}`,
    kind: 'event',
    title: e.title,
    subtitle,
    category,
    image: e.cover_thumb_url ?? toThumbUrl(e.cover_image_url),
    imageFull: e.cover_image_url,
    accent: FEATURED_KIND_ACCENT.event,
    badge: boosted ? 'Boosted' : pro ? 'Pro' : null,
    to: `/event/${e.id}`,
    lat: e.lat,
    lng: e.lng,
    distanceMi: null,
    priority: boostBucket(e) ?? (pro ? P_FEATURED : P_NORMAL),
    sortTime: ts(e.starts_at),
    fallbackKind: 'event',
    fallbackCategory: e.category,
    searchText: `${e.title} ${subtitle} ${category}`.toLowerCase(),
  };
}

function businessToSlide(b: BusinessRow, proOwners: Set<string>): FeaturedSlide {
  const pro = proOwners.has(b.owner_id);
  const meta = BUSINESS_CATEGORY_META[b.category];
  const category = meta?.label ?? 'Business';
  const subtitle = placeLabel(b.city, b.region, b.address ?? 'Local business');
  const photo = b.photos?.[0];
  const image = photo?.thumb_url ?? photo?.url ?? b.logo_thumb_url ?? b.logo_url;
  const imageFull = photo?.url ?? b.logo_url ?? null;
  const priority = pro || b.featured || b.verified ? P_FEATURED : P_NORMAL;
  return {
    id: `business:${b.id}`,
    kind: 'business',
    title: b.name,
    subtitle,
    category,
    image,
    imageFull,
    accent: FEATURED_KIND_ACCENT.business,
    badge: pro ? 'Pro' : b.featured ? 'Featured' : b.verified ? 'Verified' : null,
    to: `/business/${b.id}`,
    lat: b.lat,
    lng: b.lng,
    distanceMi: null,
    priority,
    sortTime: ts(b.created_at),
    fallbackKind: 'listing',
    fallbackCategory: b.category,
    searchText: `${b.name} ${subtitle} ${category}`.toLowerCase(),
  };
}

function wantedToSlide(w: WantedItemRow): FeaturedSlide {
  const boosted = isBoosted(w);
  const category = WANTED_CATEGORY_LABEL[w.category] ?? 'Wanted';
  const place = placeLabel(w.city, w.region, 'Anywhere');
  const budget = w.max_budget != null ? `Budget: $${Math.round(w.max_budget)}` : null;
  const subtitle = [budget, place].filter(Boolean).join(' · ') || place;
  return {
    id: `wanted:${w.id}`,
    kind: 'wanted',
    title: w.title,
    subtitle,
    category,
    image: w.thumb_url ?? toThumbUrl(w.image_url),
    imageFull: w.image_url,
    accent: FEATURED_KIND_ACCENT.wanted,
    badge: boosted ? 'Boosted' : null,
    to: `/wanted/${w.id}`,
    lat: w.lat ?? null,
    lng: w.lng ?? null,
    distanceMi: null,
    priority: boostBucket(w) ?? P_NORMAL,
    sortTime: ts(w.created_at),
    fallbackKind: 'wanted',
    fallbackCategory: w.category,
    searchText: `${w.title} ${subtitle} ${category}`.toLowerCase(),
  };
}

function findToSlide(
  p: CommunityPost,
  findCoords?: Map<string, { lat: number; lng: number }>,
): FeaturedSlide {
  const boosted = isBoosted(p);
  const title = p.caption || 'Untitled find';
  const value = p.estimated_value != null ? `Est. $${Math.round(p.estimated_value)}` : null;
  const subtitle = [value, p.location].filter(Boolean).join(' · ') || 'Community find';
  const pt = findCoords?.get(p.id) ?? null;
  return {
    id: `find:${p.id}`,
    kind: 'find',
    title,
    subtitle,
    category: p.category || null,
    image: toThumbUrl(p.image_url),
    imageFull: p.image_url,
    accent: FEATURED_KIND_ACCENT.find,
    badge: boosted ? 'Boosted' : null,
    to: `/find/${p.id}`,
    lat: pt?.lat ?? null,
    lng: pt?.lng ?? null,
    distanceMi: null,
    priority: boostBucket(p) ?? P_NORMAL,
    sortTime: ts(p.created_at),
    fallbackKind: 'find',
    fallbackCategory: p.category,
    searchText: `${title} ${subtitle} ${p.category ?? ''}`.toLowerCase(),
  };
}

/**
 * Collectibles uploaded INSIDE an event (Hot Wheels, sports cards, antiques…)
 * surfaced as their own Discover slide so the best content isn't trapped on the
 * event detail page. They inherit the parent event's location, boost and Pro
 * status, and link to the event. Modeled as `find` kind so they live under the
 * Flash Finds filter alongside other collectibles.
 */
function eventItemToSlide(item: EventFeaturedItem, ev: EventRow, proHolders: Set<string>): FeaturedSlide {
  const boosted = isBoosted(ev);
  const pro = proHolders.has(ev.holder_id);
  const place = placeLabel(ev.city, ev.region, ev.address ?? 'Local event');
  const price = item.price != null ? `$${Math.round(item.price)}` : null;
  const subtitle = [price, `at ${ev.title}`].filter(Boolean).join(' · ') || place;
  return {
    id: `eventitem:${item.id}`,
    kind: 'find',
    title: item.title || 'Featured item',
    subtitle,
    category: EVENT_CATEGORY_LABEL[ev.category] ?? 'Collectible',
    image: item.thumb_url ?? toThumbUrl(item.image_url),
    imageFull: item.image_url,
    accent: FEATURED_KIND_ACCENT.find,
    badge: boosted ? 'Boosted' : 'Featured',
    to: `/event/${ev.id}`,
    lat: ev.lat,
    lng: ev.lng,
    distanceMi: null,
    priority: boostBucket(ev) ?? (pro ? P_FEATURED : P_NORMAL),
    sortTime: ts(item.created_at),
    fallbackKind: 'find',
    fallbackCategory: ev.category,
    searchText: `${item.title} ${ev.title} ${place}`.toLowerCase(),
  };
}

export interface BuildFeaturedInput {
  events: EventRow[];
  businesses: BusinessRow[];
  wanted: WantedItemRow[];
  finds: CommunityPost[];
  /** Featured collectibles uploaded inside events (surfaced individually). */
  eventItems?: EventFeaturedItem[];
  proHolders: Set<string>;
  /** Read-time geocoded coords for finds (community posts have no coord
   *  columns), keyed by post id. Lets finds be distance-filtered too. */
  findCoords?: Map<string, { lat: number; lng: number }>;
  location: { lat: number; lng: number } | null;
  radiusMi: number;
  query: string;
  filter: FeaturedFilter;
}

export function buildFeaturedSlides(input: BuildFeaturedInput): FeaturedSlide[] {
  const { events, businesses, wanted, finds, eventItems, proHolders, findCoords, location, radiusMi, query, filter } = input;

  // Resolve event collectibles against their parent (published) event so they
  // inherit its location/boost; items whose event isn't in the set are skipped.
  const eventById = new Map(events.map((e) => [e.id, e]));
  const itemSlides: FeaturedSlide[] = [];
  for (const it of eventItems ?? []) {
    const ev = eventById.get(it.event_id);
    if (ev) itemSlides.push(eventItemToSlide(it, ev, proHolders));
  }

  let slides: FeaturedSlide[] = [
    ...events.map((e) => eventToSlide(e, proHolders)),
    ...businesses.map((b) => businessToSlide(b, proHolders)),
    ...wanted.map((w) => wantedToSlide(w)),
    ...finds.map((p) => findToSlide(p, findCoords)),
    ...itemSlides,
  ];

  // Location filtering: distance-stamp coord-bearing items and drop those
  // beyond the radius. Events, businesses and wanted carry real coords;
  // finds are geocoded at read time (findCoords). The only items kept without
  // a distance check are those whose location genuinely can't be resolved
  // (e.g. a find with a vague/blank location), so the area stays relevant
  // without hiding content we simply can't pin.
  if (location) {
    slides = slides.filter((sl) => {
      if (sl.lat == null || sl.lng == null) return true;
      sl.distanceMi = haversineMiles(location, { lat: sl.lat, lng: sl.lng });
      return sl.distanceMi <= radiusMi;
    });
  }

  // Search filter (#9).
  const q = query.trim().toLowerCase();
  if (q) slides = slides.filter((sl) => sl.searchText.includes(q));

  // Kind filter (#6/#7).
  if (filter !== 'all') slides = slides.filter((sl) => sl.kind === filter);

  // Rank: priority bucket, then nearest-first (when located), then newest.
  slides.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (location) {
      const da = a.distanceMi ?? Infinity;
      const db = b.distanceMi ?? Infinity;
      if (da !== db) return da - db;
    }
    return b.sortTime - a.sortTime;
  });

  return slides;
}
