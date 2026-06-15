/**
 * Discover "Featured Near You" data + ranking layer.
 *
 * Normalizes the four Discover content sources (events, businesses, wanted
 * posts, flash finds) into a single `FeaturedSlide` shape, then filters by
 * location/search/kind and ranks them per the product spec:
 *
 *   boosted events -> pro businesses -> boosted wanted -> other featured -> rest
 *
 * Kept as pure functions so the Discover page stays lean and this is easy to
 * reason about (and unit-test) in isolation.
 */

import type { EventRow } from './events';
import type { BusinessRow } from './businesses';
import { BUSINESS_CATEGORY_META } from './businesses';
import type { WantedItemRow } from './wanted';
import { WANTED_CATEGORY_LABEL } from './wanted';
import type { CommunityPost } from './supabase';
import { isBoosted } from './boost';
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

// Priority buckets (lower = shown first), per spec #11.
const P_BOOSTED_EVENT = 0;
const P_PRO_BUSINESS = 1;
const P_BOOSTED_WANTED = 2;
const P_OTHER_FEATURED = 3;
const P_NORMAL = 4;

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
    priority: boosted ? P_BOOSTED_EVENT : pro ? P_OTHER_FEATURED : P_NORMAL,
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
  const priority = pro
    ? P_PRO_BUSINESS
    : b.featured || b.verified
      ? P_OTHER_FEATURED
      : P_NORMAL;
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
  const budget = w.max_budget != null ? `Up to $${Math.round(w.max_budget)}` : null;
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
    lat: null,
    lng: null,
    distanceMi: null,
    priority: boosted ? P_BOOSTED_WANTED : P_NORMAL,
    sortTime: ts(w.created_at),
    fallbackKind: 'wanted',
    fallbackCategory: w.category,
    searchText: `${w.title} ${subtitle} ${category}`.toLowerCase(),
  };
}

function findToSlide(p: CommunityPost): FeaturedSlide {
  const boosted = isBoosted(p);
  const title = p.caption || 'Untitled find';
  const value = p.estimated_value != null ? `Est. $${Math.round(p.estimated_value)}` : null;
  const subtitle = [value, p.location].filter(Boolean).join(' · ') || 'Community find';
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
    lat: null,
    lng: null,
    distanceMi: null,
    priority: boosted ? P_OTHER_FEATURED : P_NORMAL,
    sortTime: ts(p.created_at),
    fallbackKind: 'find',
    fallbackCategory: p.category,
    searchText: `${title} ${subtitle} ${p.category ?? ''}`.toLowerCase(),
  };
}

export interface BuildFeaturedInput {
  events: EventRow[];
  businesses: BusinessRow[];
  wanted: WantedItemRow[];
  finds: CommunityPost[];
  proHolders: Set<string>;
  location: { lat: number; lng: number } | null;
  radiusMi: number;
  query: string;
  filter: FeaturedFilter;
}

export function buildFeaturedSlides(input: BuildFeaturedInput): FeaturedSlide[] {
  const { events, businesses, wanted, finds, proHolders, location, radiusMi, query, filter } = input;

  let slides: FeaturedSlide[] = [
    ...events.map((e) => eventToSlide(e, proHolders)),
    ...businesses.map((b) => businessToSlide(b, proHolders)),
    ...wanted.map((w) => wantedToSlide(w)),
    ...finds.map((p) => findToSlide(p)),
  ];

  // Location filtering: distance-stamp coord-bearing items and drop those
  // beyond the radius. Items without coordinates (finds, location-less wanted)
  // are always kept so the slideshow never hides them outright.
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
