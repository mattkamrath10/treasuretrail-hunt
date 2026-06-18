import { describe, it, expect } from 'vitest';
import { buildFeaturedSlides, type BuildFeaturedInput } from './discoverFeatured';
import type { EventRow, EventFeaturedItem } from './events';
import type { BusinessRow } from './businesses';
import type { WantedItemRow } from './wanted';
import type { CommunityPost } from './supabase';

// Far-future expiry so isBoosted() always treats these rows as actively
// boosted regardless of when the suite runs. (monetizationHidden() is false,
// so boost ranking is live — see boost.ts.)
const FUTURE = '2099-01-01T00:00:00.000Z';

let seq = 0;
const uid = (p: string) => `${p}-${++seq}`;

function makeEvent(over: Partial<EventRow> = {}): EventRow {
  const id = over.id ?? uid('ev');
  return {
    id,
    holder_id: 'holder-1',
    title: 'Test Event',
    description: '',
    category: 'estate_sale',
    starts_at: '2026-01-01T00:00:00.000Z',
    ends_at: null,
    address: null,
    city: 'Austin',
    region: 'TX',
    lat: null,
    lng: null,
    cover_image_url: null,
    cover_thumb_url: null,
    status: 'published',
    event_kind: 'in_person',
    platform: null,
    livestream_url: null,
    seller_handle: null,
    show_category: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  } as EventRow;
}

function makeBusiness(over: Partial<BusinessRow> = {}): BusinessRow {
  const id = over.id ?? uid('biz');
  return {
    id,
    owner_id: 'owner-1',
    name: 'Test Business',
    description: '',
    category: 'antique_store',
    address: null,
    city: 'Austin',
    region: 'TX',
    lat: null,
    lng: null,
    phone: null,
    website: null,
    facebook_url: null,
    hours: null,
    logo_url: null,
    logo_thumb_url: null,
    photos: [],
    status: 'published',
    verified: false,
    featured: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  } as BusinessRow;
}

function makeWanted(over: Partial<WantedItemRow> = {}): WantedItemRow {
  const id = over.id ?? uid('w');
  return {
    id,
    user_id: 'user-1',
    title: 'Test Wanted',
    description: '',
    category: 'collectibles',
    max_budget: null,
    city: 'Austin',
    region: 'TX',
    image_url: null,
    thumb_url: null,
    status: 'open',
    lat: null,
    lng: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  } as WantedItemRow;
}

function makeFind(over: Partial<CommunityPost> = {}): CommunityPost {
  const id = over.id ?? uid('find');
  return {
    id,
    user_id: 'user-1',
    type: 'find',
    caption: 'Test Find',
    image_url: null,
    tags: [],
    location: 'Austin, TX',
    rarity_score: null,
    estimated_value: null,
    scout_assisted: false,
    for_sale: false,
    category: 'collectibles',
    like_count: 0,
    comment_count: 0,
    share_count: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  } as CommunityPost;
}

function makeEventItem(over: Partial<EventFeaturedItem> = {}): EventFeaturedItem {
  const id = over.id ?? uid('item');
  return {
    id,
    event_id: 'ev-parent',
    title: 'Test Item',
    price: null,
    image_url: null,
    thumb_url: null,
    position: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  } as EventFeaturedItem;
}

function baseInput(over: Partial<BuildFeaturedInput> = {}): BuildFeaturedInput {
  return {
    events: [],
    businesses: [],
    wanted: [],
    finds: [],
    eventItems: [],
    proHolders: new Set<string>(),
    findCoords: undefined,
    location: null,
    radiusMi: 100,
    query: '',
    filter: 'all',
    ...over,
  };
}

describe('buildFeaturedSlides — priority bucket ordering', () => {
  it('orders boosted-paid > boosted-pro > pro/featured > normal across kinds', () => {
    // A normal event, a Pro-held event (no boost), a Pro-boost wanted, and a
    // paid-boost find. Boost outranks content kind on purpose.
    const normalEvent = makeEvent({ id: 'ev-normal', holder_id: 'plain' });
    const proEvent = makeEvent({ id: 'ev-pro', holder_id: 'pro-holder' });
    const proBoostWanted = makeWanted({
      id: 'w-proboost',
      boost_expires_at: FUTURE,
      boost_type: 'pro',
    });
    const paidBoostFind = makeFind({
      id: 'find-paidboost',
      boost_expires_at: FUTURE,
      boost_type: 'paid',
    });

    const slides = buildFeaturedSlides(
      baseInput({
        events: [normalEvent, proEvent],
        wanted: [proBoostWanted],
        finds: [paidBoostFind],
        proHolders: new Set(['pro-holder']),
      }),
    );

    expect(slides.map((s) => s.id)).toEqual([
      'find:find-paidboost', // P_BOOST_PAID (0)
      'wanted:w-proboost', // P_BOOST_PRO (1)
      'event:ev-pro', // P_FEATURED (2)
      'event:ev-normal', // P_NORMAL (3)
    ]);
  });

  it('treats verified/featured businesses as featured, plain ones as normal', () => {
    const verified = makeBusiness({ id: 'biz-verified', verified: true });
    const featured = makeBusiness({ id: 'biz-featured', featured: true });
    const proOwned = makeBusiness({ id: 'biz-pro', owner_id: 'pro-owner' });
    const plain = makeBusiness({ id: 'biz-plain' });

    const slides = buildFeaturedSlides(
      baseInput({
        businesses: [plain, verified, featured, proOwned],
        proHolders: new Set(['pro-owner']),
      }),
    );

    // The three featured-bucket businesses come before the plain one; the plain
    // one is last.
    expect(slides[slides.length - 1].id).toBe('business:biz-plain');
    expect(slides.slice(0, 3).map((s) => s.id).sort()).toEqual([
      'business:biz-featured',
      'business:biz-pro',
      'business:biz-verified',
    ]);
  });
});

describe('buildFeaturedSlides — tie-break ordering', () => {
  it('within a bucket sorts nearest-first when located', () => {
    const near = makeEvent({ id: 'ev-near', lat: 30.27, lng: -97.74 });
    const far = makeEvent({ id: 'ev-far', lat: 30.5, lng: -97.9 });

    const slides = buildFeaturedSlides(
      baseInput({
        events: [far, near],
        location: { lat: 30.27, lng: -97.74 },
        radiusMi: 100,
      }),
    );

    expect(slides.map((s) => s.id)).toEqual(['event:ev-near', 'event:ev-far']);
  });

  it('within a bucket sorts newest-first when not located', () => {
    const older = makeEvent({ id: 'ev-older', starts_at: '2026-01-01T00:00:00.000Z' });
    const newer = makeEvent({ id: 'ev-newer', starts_at: '2026-06-01T00:00:00.000Z' });

    const slides = buildFeaturedSlides(
      baseInput({ events: [older, newer] }),
    );

    expect(slides.map((s) => s.id)).toEqual(['event:ev-newer', 'event:ev-older']);
  });

  it('keeps priority above distance — a far boosted item still beats a near normal one', () => {
    const nearNormal = makeEvent({ id: 'ev-near-normal', lat: 30.27, lng: -97.74 });
    const farBoosted = makeEvent({
      id: 'ev-far-boost',
      lat: 30.5,
      lng: -97.9,
      boost_expires_at: FUTURE,
      boost_type: 'paid',
    });

    const slides = buildFeaturedSlides(
      baseInput({
        events: [nearNormal, farBoosted],
        location: { lat: 30.27, lng: -97.74 },
        radiusMi: 100,
      }),
    );

    expect(slides.map((s) => s.id)).toEqual([
      'event:ev-far-boost',
      'event:ev-near-normal',
    ]);
  });
});

describe('buildFeaturedSlides — radius filtering', () => {
  it('drops coord-bearing items beyond the radius and stamps distance on those kept', () => {
    const inside = makeEvent({ id: 'ev-inside', lat: 30.30, lng: -97.74 });
    const outside = makeEvent({ id: 'ev-outside', lat: 40.0, lng: -97.74 }); // ~670mi north

    const slides = buildFeaturedSlides(
      baseInput({
        events: [inside, outside],
        location: { lat: 30.27, lng: -97.74 },
        radiusMi: 100,
      }),
    );

    expect(slides.map((s) => s.id)).toEqual(['event:ev-inside']);
    expect(slides[0].distanceMi).not.toBeNull();
    expect(slides[0].distanceMi!).toBeLessThan(100);
  });

  it('keeps items with no resolvable coords even when located', () => {
    const noCoords = makeEvent({ id: 'ev-nocoords', lat: null, lng: null });
    const outside = makeEvent({ id: 'ev-outside', lat: 40.0, lng: -97.74 });

    const slides = buildFeaturedSlides(
      baseInput({
        events: [noCoords, outside],
        location: { lat: 30.27, lng: -97.74 },
        radiusMi: 100,
      }),
    );

    expect(slides.map((s) => s.id)).toEqual(['event:ev-nocoords']);
  });

  it('does not distance-filter at all when no location is set', () => {
    const farA = makeEvent({ id: 'ev-a', lat: 40.0, lng: -97.74 });
    const farB = makeEvent({ id: 'ev-b', lat: 10.0, lng: -50.0 });

    const slides = buildFeaturedSlides(baseInput({ events: [farA, farB] }));

    expect(slides).toHaveLength(2);
    expect(slides.every((s) => s.distanceMi === null)).toBe(true);
  });

  it('distance-filters finds via read-time geocoded findCoords', () => {
    const nearFind = makeFind({ id: 'find-near' });
    const farFind = makeFind({ id: 'find-far' });
    const findCoords = new Map([
      ['find-near', { lat: 30.30, lng: -97.74 }],
      ['find-far', { lat: 45.0, lng: -97.74 }],
    ]);

    const slides = buildFeaturedSlides(
      baseInput({
        finds: [nearFind, farFind],
        findCoords,
        location: { lat: 30.27, lng: -97.74 },
        radiusMi: 100,
      }),
    );

    expect(slides.map((s) => s.id)).toEqual(['find:find-near']);
  });
});

describe('buildFeaturedSlides — search filtering', () => {
  it('keeps only slides whose searchText contains the query (case-insensitive)', () => {
    const match = makeEvent({ id: 'ev-match', title: 'Vintage Pyrex Sale' });
    const noMatch = makeEvent({ id: 'ev-nomatch', title: 'Garage cleanout' });

    const slides = buildFeaturedSlides(
      baseInput({ events: [match, noMatch], query: 'PYREX' }),
    );

    expect(slides.map((s) => s.id)).toEqual(['event:ev-match']);
  });

  it('matches against subtitle/category text, not just the title', () => {
    const match = makeWanted({ id: 'w-match', title: 'Some thing', city: 'Portland', region: 'OR' });
    const noMatch = makeWanted({ id: 'w-nomatch', title: 'Other thing', city: 'Austin', region: 'TX' });

    const slides = buildFeaturedSlides(
      baseInput({ wanted: [match, noMatch], query: 'portland' }),
    );

    expect(slides.map((s) => s.id)).toEqual(['wanted:w-match']);
  });

  it('treats a whitespace-only query as no filter', () => {
    const a = makeEvent({ id: 'ev-a' });
    const b = makeEvent({ id: 'ev-b' });

    const slides = buildFeaturedSlides(baseInput({ events: [a, b], query: '   ' }));

    expect(slides).toHaveLength(2);
  });
});

describe('buildFeaturedSlides — kind filtering', () => {
  it("returns every kind when filter is 'all'", () => {
    const slides = buildFeaturedSlides(
      baseInput({
        events: [makeEvent()],
        businesses: [makeBusiness()],
        wanted: [makeWanted()],
        finds: [makeFind()],
        filter: 'all',
      }),
    );

    expect(new Set(slides.map((s) => s.kind))).toEqual(
      new Set(['event', 'business', 'wanted', 'find']),
    );
  });

  it('restricts to the selected kind', () => {
    const slides = buildFeaturedSlides(
      baseInput({
        events: [makeEvent()],
        businesses: [makeBusiness()],
        wanted: [makeWanted()],
        finds: [makeFind()],
        filter: 'business',
      }),
    );

    expect(slides).toHaveLength(1);
    expect(slides[0].kind).toBe('business');
  });

  it("surfaces event collectibles under the 'find' kind", () => {
    const ev = makeEvent({ id: 'ev-parent' });
    const item = makeEventItem({ id: 'col-1', event_id: 'ev-parent', title: 'Hot Wheels lot' });

    const slides = buildFeaturedSlides(
      baseInput({ events: [ev], eventItems: [item], filter: 'find' }),
    );

    expect(slides.map((s) => s.id)).toEqual(['eventitem:col-1']);
    expect(slides[0].kind).toBe('find');
  });
});

describe('buildFeaturedSlides — event collectibles resolution', () => {
  it('skips event items whose parent event is not in the set', () => {
    const orphan = makeEventItem({ id: 'orphan', event_id: 'missing-event' });

    const slides = buildFeaturedSlides(baseInput({ events: [], eventItems: [orphan] }));

    expect(slides).toHaveLength(0);
  });

  it('inherits the parent event boost so collectibles float boost-first', () => {
    const boostedEvent = makeEvent({
      id: 'ev-boost',
      boost_expires_at: FUTURE,
      boost_type: 'paid',
    });
    const normalFind = makeFind({ id: 'find-normal' });
    const item = makeEventItem({ id: 'col-1', event_id: 'ev-boost' });

    const slides = buildFeaturedSlides(
      baseInput({
        events: [boostedEvent],
        finds: [normalFind],
        eventItems: [item],
        filter: 'find',
      }),
    );

    // Both are 'find' kind; the collectible inherits the paid boost so it leads.
    expect(slides.map((s) => s.id)).toEqual(['eventitem:col-1', 'find:find-normal']);
  });
});
