import { describe, it, expect, vi, beforeEach } from 'vitest';

// A chainable, awaitable Supabase query-builder stub. The provider's
// external_listings query does `.select().eq().order().limit().then()`, so
// every method returns the builder and `.then` resolves to an empty dataset.
function makeQueryBuilder() {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    then: (onFulfilled: (v: { data: unknown[] }) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve({ data: [] }).then(onFulfilled, onRejected),
  };
  return builder;
}

vi.mock('../../supabase', () => ({
  supabase: { from: () => makeQueryBuilder() },
}));

vi.mock('../../database', () => ({
  fetchCommunityPosts: vi.fn(async () => []),
  fetchMarketplaceListings: vi.fn(async () => []),
}));

vi.mock('../../events', () => ({
  fetchPublishedEvents: vi.fn(async () => []),
}));

vi.mock('../../businesses', () => ({
  fetchPublishedBusinesses: vi.fn(async () => []),
  fetchPublishedBusinessFeaturedItems: vi.fn(async () => []),
  BUSINESS_CATEGORY_META: {},
  BUSINESS_AVAILABILITY_META: {},
}));

// Keep the real category-label map (so the provider scores against accurate
// labels) but stub the network fetch with a single open Wanted request.
const wantedFixture = [
  {
    id: 'w-123',
    user_id: 'u1',
    title: 'Vintage Pyrex bowl set',
    description: 'Looking for a complete vintage Pyrex mixing bowl set',
    category: 'vintage',
    max_budget: 80,
    city: 'Austin',
    region: 'TX',
    image_url: null,
    thumb_url: null,
    status: 'open',
    lat: 30.26,
    lng: -97.74,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

vi.mock('../../wanted', async (importActual) => {
  const actual = await importActual<typeof import('../../wanted')>();
  return {
    ...actual,
    fetchOpenWantedItems: vi.fn(async () => wantedFixture),
  };
});

import { treasureTrailProvider } from './treasuretrail';

describe('treasureTrailProvider — Wanted requests in search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns kind:'wanted' results routed to /wanted/:id for a matching query", async () => {
    const results = await treasureTrailProvider.search('pyrex');

    const wanted = results.filter((r) => r.kind === 'wanted');
    expect(wanted).toHaveLength(1);

    const [item] = wanted;
    expect(item.kind).toBe('wanted');
    expect(item.route).toBe('/wanted/w-123');
    expect(item.source).toBe('treasuretrail');
    expect(item.title).toBe('Vintage Pyrex bowl set');
    expect(item.relevanceScore ?? 0).toBeGreaterThan(0);
  });

  it('does not surface the Wanted request when nothing matches', async () => {
    const results = await treasureTrailProvider.search('zzzznevermatcheszzz');
    expect(results.some((r) => r.kind === 'wanted')).toBe(false);
  });
});
