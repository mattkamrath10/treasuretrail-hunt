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
  /** True for online/livestream events (used by the "Live Shows" row). */
  online: boolean;
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
// Boost floats to the very top across EVERY kind so paid/Pro promotion is
// always meaningfully visible: any actively boosted item — event, flash find,
// wanted, or event collectible — outranks all non-boosted content regardless of
// type. Below boosts the order favors the most interesting content (Decision 6):
// featured collectibles, then Pro/featured sellers & events, then everything
// else, so high-quality items aren't trapped on event detail pages.
const P_BOOST_PAID = 0; // active paid boost (any kind)
const P_BOOST_PRO = 1; // active Pro-included boost (any kind)
const P_FEATURED_ITEM = 2; // featured collectibles uploaded inside events (no active boost)
const P_FEATURED = 3; // Pro holders, verified/featured shops & events (no active boost)
const P_NORMAL = 4; // everything else

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
    online: e.event_kind === 'online',
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
    online: false,
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
    online: false,
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
    online: false,
  };
}

/**
 * Collectibles uploaded INSIDE an event (Hot Wheels, sports cards, antiques…)
 * surfaced as their own Discover slide so the best content isn't trapped on the
 * event detail page. They inherit the parent event's location, boost and Pro
 * status, and link to the event. Modeled as `find` kind so they live under the
 * Flash Finds filter alongside other collectibles.
 */
function eventItemToSlide(item: EventFeaturedItem, ev: EventRow): FeaturedSlide {
  const boosted = isBoosted(ev);
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
    priority: boostBucket(ev) ?? P_FEATURED_ITEM,
    sortTime: ts(item.created_at),
    fallbackKind: 'find',
    fallbackCategory: ev.category,
    searchText: `${item.title} ${ev.title} ${place}`.toLowerCase(),
    online: ev.event_kind === 'online',
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

/**
 * Normalize every Discover source into a single slide list (no location/search/
 * kind filtering, no ranking). Shared by the local feed builder and the
 * remote-boosted slideshow builder so they stay in lockstep.
 */
function normalizeAll(input: BuildFeaturedInput): FeaturedSlide[] {
  const { events, businesses, wanted, finds, eventItems, proHolders, findCoords } = input;

  // Resolve event collectibles against their parent (published) event so they
  // inherit its location/boost; items whose event isn't in the set are skipped.
  const eventById = new Map(events.map((e) => [e.id, e]));
  const itemSlides: FeaturedSlide[] = [];
  for (const it of eventItems ?? []) {
    const ev = eventById.get(it.event_id);
    if (ev) itemSlides.push(eventItemToSlide(it, ev));
  }

  return [
    ...events.map((e) => eventToSlide(e, proHolders)),
    ...businesses.map((b) => businessToSlide(b, proHolders)),
    ...wanted.map((w) => wantedToSlide(w)),
    ...finds.map((p) => findToSlide(p, findCoords)),
    ...itemSlides,
  ];
}

/**
 * Apply the active search query then kind filter, then rank boost-first:
 * priority bucket -> nearest-first (when located) -> newest. Sorts in place.
 */
function rankSlides(
  slides: FeaturedSlide[],
  query: string,
  filter: FeaturedFilter,
  located: boolean,
): FeaturedSlide[] {
  const q = query.trim().toLowerCase();
  let out = q ? slides.filter((sl) => sl.searchText.includes(q)) : slides;
  if (filter !== 'all') out = out.filter((sl) => sl.kind === filter);
  out.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (located) {
      const da = a.distanceMi ?? Infinity;
      const db = b.distanceMi ?? Infinity;
      if (da !== db) return da - db;
    }
    return b.sortTime - a.sortTime;
  });
  return out;
}

export function buildFeaturedSlides(input: BuildFeaturedInput): FeaturedSlide[] {
  const { location, radiusMi, query, filter } = input;
  let slides = normalizeAll(input);

  // Location filtering: distance-stamp coord-bearing items and drop those
  // beyond the radius. Events, businesses and wanted carry real coords; finds
  // are geocoded at read time (findCoords). Items whose location genuinely
  // can't be resolved (e.g. a blank-location find, or an online/no-address
  // event) are kept so we never hide content we simply can't pin. The local
  // feed always respects the radius — Decision 2 keeps the out-of-radius
  // boosted exposure to the slideshow only (buildRemoteBoostedSlides).
  if (location) {
    slides = slides.filter((sl) => {
      if (sl.lat == null || sl.lng == null) return true;
      sl.distanceMi = haversineMiles(location, { lat: sl.lat, lng: sl.lng });
      return sl.distanceMi <= radiusMi;
    });
  }

  return rankSlides(slides, query, filter, !!location);
}

/** True when a slide sits in one of the actively-boosted priority buckets. */
function isBoostBucket(sl: FeaturedSlide): boolean {
  return sl.priority === P_BOOST_PAID || sl.priority === P_BOOST_PRO;
}

/**
 * Boosted slides that fall OUTSIDE the local radius — the ones the local feed
 * drops by distance. Used to reserve a few hero positions for paid/Pro
 * promotion from anywhere (Decision 2) so a boosted Boise seller is still seen
 * from California. Returns [] when no location is set (nothing is "remote").
 * Items with no resolvable coords are excluded here because the local feed
 * already keeps them. Honors the active search + kind filter, ranked boost-first.
 */
export function buildRemoteBoostedSlides(input: BuildFeaturedInput): FeaturedSlide[] {
  const { location, radiusMi, query, filter } = input;
  if (!location) return [];
  const slides = normalizeAll(input).filter((sl) => {
    if (!isBoostBucket(sl)) return false;
    if (sl.lat == null || sl.lng == null) return false; // kept by the local feed
    sl.distanceMi = haversineMiles(location, { lat: sl.lat, lng: sl.lng });
    return sl.distanceMi > radiusMi; // strictly beyond the local radius
  });
  return rankSlides(slides, query, filter, true);
}

/**
 * Flash Finds carousel for the Discover hub. Returns only `find`-kind slides
 * (community flash finds plus featured collectibles uploaded inside events),
 * ranked boost-first (boosted → featured → everything else). Unlike
 * buildFeaturedSlides this does NOT hard-drop items beyond the radius: when a
 * location is set, in-area finds float to the front within each priority bucket
 * and all other finds follow, so the carousel always has content to scroll.
 */
export function buildFlashFindsCarousel(input: BuildFeaturedInput, cap = 20): FeaturedSlide[] {
  const { location, radiusMi } = input;
  const slides = normalizeAll(input).filter((sl) => sl.kind === 'find');
  if (location) {
    for (const sl of slides) {
      if (sl.lat != null && sl.lng != null) {
        sl.distanceMi = haversineMiles(location, { lat: sl.lat, lng: sl.lng });
      }
    }
  }
  slides.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (location) {
      const aNear = a.distanceMi != null && a.distanceMi <= radiusMi ? 0 : 1;
      const bNear = b.distanceMi != null && b.distanceMi <= radiusMi ? 0 : 1;
      if (aNear !== bNear) return aNear - bNear;
      const da = a.distanceMi ?? Infinity;
      const db = b.distanceMi ?? Infinity;
      if (da !== db) return da - db;
    }
    return b.sortTime - a.sortTime;
  });
  return slides.slice(0, cap);
}

/* ------------------------------------------------------------------ */
/* Slideshow composition (Decision 2 + 4)                             */
/* ------------------------------------------------------------------ */

export interface SlideshowOptions {
  /** Total hero slides. Default 8. */
  cap?: number;
  /** Max out-of-radius boosted slots reserved for promotion. Default 3. */
  reserveRemote?: number;
  /** Max slides one event contributes (the event + its collectibles share a
   *  target). Default 2 so a single event can't monopolise the hero. */
  perGroupMax?: number;
  /** Rotates which collectibles an over-capacity event exposes, so multiple
   *  items get visibility across visits/time. Default 0. */
  rotation?: number;
}

/** An event slide and its collectibles share the same `/event/:id` target, so
 *  `to` groups them for per-event capping and adjacency spacing. */
function slideGroupKey(sl: FeaturedSlide): string {
  return sl.to;
}

/**
 * Cap how many slides each event contributes. Groups over the cap expose a
 * rotating window (offset by `rotation`) so a 10-item Hot Wheels event shows
 * different collectibles over time instead of always the same one. Original
 * order is otherwise preserved; ids already in `seen` are skipped and added.
 */
function capPerGroup(
  slides: FeaturedSlide[],
  perGroupMax: number,
  rotation: number,
  seen: Set<string>,
): FeaturedSlide[] {
  const groups = new Map<string, FeaturedSlide[]>();
  for (const sl of slides) {
    const list = groups.get(slideGroupKey(sl));
    if (list) list.push(sl);
    else groups.set(slideGroupKey(sl), [sl]);
  }
  const allowed = new Set<string>();
  for (const members of groups.values()) {
    if (members.length <= perGroupMax) {
      for (const m of members) allowed.add(m.id);
    } else {
      const start = rotation % members.length;
      for (let i = 0; i < perGroupMax; i++) {
        allowed.add(members[(start + i) % members.length].id);
      }
    }
  }
  const out: FeaturedSlide[] = [];
  for (const sl of slides) {
    if (!allowed.has(sl.id) || seen.has(sl.id)) continue;
    seen.add(sl.id);
    out.push(sl);
  }
  return out;
}

/** Greedily reorder so no two adjacent slides come from the same event, while
 *  keeping the (priority-sorted) order as intact as possible. Caps to `cap`. */
function spaceByGroup(slides: FeaturedSlide[], cap: number): FeaturedSlide[] {
  const pool = [...slides];
  const out: FeaturedSlide[] = [];
  while (out.length < cap && pool.length) {
    const lastKey = out.length ? slideGroupKey(out[out.length - 1]) : null;
    let idx = pool.findIndex((sl) => slideGroupKey(sl) !== lastKey);
    if (idx === -1) idx = 0; // only same-group slides left — accept it
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

/**
 * Build the hero slideshow from the local (radius-respecting) ranked slides
 * plus a few boosted-from-anywhere slides (Decision 2 + 4):
 *  - majority stays local; up to `reserveRemote` positions go to remote boosts
 *  - one event contributes at most `perGroupMax` slides (rotating window)
 *  - no two adjacent slides come from the same event
 * Both inputs must already be ranked boost-first (buildFeaturedSlides /
 * buildRemoteBoostedSlides).
 */
export function composeSlideshow(
  local: FeaturedSlide[],
  remote: FeaturedSlide[],
  opts: SlideshowOptions = {},
): FeaturedSlide[] {
  const cap = Math.max(0, opts.cap ?? 8);
  if (cap === 0) return [];
  const reserveRemote = Math.max(0, Math.min(opts.reserveRemote ?? 3, cap));
  const perGroupMax = Math.max(1, opts.perGroupMax ?? 2);
  const rotation = Math.max(0, Math.floor(opts.rotation ?? 0));

  const seen = new Set<string>();
  const localCapped = capPerGroup(local, perGroupMax, rotation, seen);
  const remoteCapped = capPerGroup(remote, perGroupMax, rotation, seen).slice(0, reserveRemote);

  // Majority local: leave room for the reserved remote slots.
  const localCount = Math.max(0, cap - remoteCapped.length);
  const chosen = [...localCapped.slice(0, localCount), ...remoteCapped];

  // Stable re-sort keeps boost-first order (local precedes remote within a
  // bucket since it was concatenated first), then space same-event slides apart.
  chosen.sort((a, b) => a.priority - b.priority);
  return spaceByGroup(chosen, cap);
}

/* ------------------------------------------------------------------ */
/* Category-specific slideshow rows                                   */
/* ------------------------------------------------------------------ */

export interface CategoryRow {
  key: string;
  title: string;
  slides: FeaturedSlide[];
}

/** Does the slide's free-text (title/subtitle/category) contain any keyword? */
function kw(sl: FeaturedSlide, words: string[]): boolean {
  return words.some((w) => sl.searchText.includes(w));
}

type RowDef = { key: string; title: string; match: (sl: FeaturedSlide) => boolean };

// Themed sub-rows per category chip. Each row is built from the already-ranked,
// location/search-filtered slide set, so boosted content still floats to the
// front of every row. Rows that resolve to zero items are dropped by the
// caller, so the UI only ever shows rows that actually have content — the
// taxonomy (esp. Flash Finds) is keyword-driven and degrades gracefully as the
// catalog grows.
const CATEGORY_ROW_DEFS: Record<FeaturedFilter, RowDef[]> = {
  all: [
    { key: 'feat-events',  title: 'Featured Events',      match: (s) => s.kind === 'event' },
    { key: 'feat-finds',   title: 'Featured Flash Finds', match: (s) => s.kind === 'find' },
    { key: 'feat-biz',     title: 'Featured Businesses',  match: (s) => s.kind === 'business' },
  ],
  event: [
    { key: 'auctions',     title: 'Auctions',     match: (s) => s.kind === 'event' && s.fallbackCategory === 'auction' },
    { key: 'estate',       title: 'Estate Sales', match: (s) => s.kind === 'event' && s.fallbackCategory === 'estate_sale' },
    { key: 'flea',         title: 'Flea Markets', match: (s) => s.kind === 'event' && s.fallbackCategory === 'flea_market' },
    { key: 'live',         title: 'Live Shows',   match: (s) => s.kind === 'event' && s.online },
    { key: 'garage',       title: 'Garage Sales', match: (s) => s.kind === 'event' && s.fallbackCategory === 'yard_sale' },
  ],
  find: [
    { key: 'hotwheels',    title: 'Hot Wheels',    match: (s) => s.kind === 'find' && kw(s, ['hot wheel', 'hotwheel', 'matchbox', 'diecast', 'die-cast']) },
    { key: 'sportscards',  title: 'Sports Cards',  match: (s) => s.kind === 'find' && kw(s, ['sports card', 'sportscard', 'baseball card', 'basketball card', 'football card', 'pokemon', 'trading card']) },
    { key: 'antiques',     title: 'Antiques',      match: (s) => s.kind === 'find' && kw(s, ['antique', 'vintage']) },
    { key: 'coins',        title: 'Coins',         match: (s) => s.kind === 'find' && kw(s, ['coin', 'currency', 'bullion', 'silver dollar']) },
    { key: 'collectibles', title: 'Collectibles',  match: (s) => s.kind === 'find' && kw(s, ['collectible', 'figure', 'toy', 'comic']) },
    { key: 'rare',         title: 'Rare Finds',    match: (s) => s.kind === 'find' && kw(s, ['rare', 'limited', 'one of a kind', 'first edition']) },
  ],
  business: [
    { key: 'antique-stores',  title: 'Antique Stores',          match: (s) => s.kind === 'business' && s.fallbackCategory === 'antique_store' },
    { key: 'auction-houses',  title: 'Auction Houses',          match: (s) => s.kind === 'business' && s.fallbackCategory === 'auction_house' },
    { key: 'estate-cos',      title: 'Estate Sale Companies',   match: (s) => s.kind === 'business' && s.fallbackCategory === 'estate_sale_company' },
    { key: 'dealers',         title: 'Collectible Dealers',     match: (s) => s.kind === 'business' && (s.fallbackCategory === 'consignment_store' || s.fallbackCategory === 'vintage_store' || s.fallbackCategory === 'pawn_shop') },
  ],
  wanted: [],
};

/**
 * Build the themed slideshow rows for the selected category chip. Pass the
 * full ranked slide set (the `all` build) — rows self-filter by kind/category,
 * so they stay boost-ordered. Empty rows are omitted. `cap` limits each row.
 */
export function buildCategoryRows(
  slides: FeaturedSlide[],
  filter: FeaturedFilter,
  cap = 12,
): CategoryRow[] {
  const defs = CATEGORY_ROW_DEFS[filter] ?? [];
  const rows: CategoryRow[] = [];
  for (const def of defs) {
    const matched = slides.filter(def.match).slice(0, cap);
    if (matched.length) rows.push({ key: def.key, title: def.title, slides: matched });
  }
  return rows;
}
