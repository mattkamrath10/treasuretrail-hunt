import type { PublicSeoLink, PublicSeoPageProps, PublicSeoSection } from '../../components/seo/PublicSeoPage';
import {
  fetchMarketplaceListingsBySellerHandle,
  fetchMarketplaceListingsByTerms,
  fetchPublicProfileByHandle,
  fetchWantedMatches,
} from '../database';
import { fetchPublishedEvents, PLATFORM_META, type EventRow } from '../events';
import { findCategory, type SeoRouteKind, type SeoRouteParams } from './publicRouteData';
import {
  findWantedSeoContentByTerms,
  getAllEventSeoContent,
  getEventSeoContent,
  getSellerSeoContent,
  getWantedSeoContent,
} from './publicContentCatalog';

function titleFromSlug(raw: string): string {
  return raw
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function listingLabel(title: string, price?: number | null) {
  return price ? `${title} - $${price.toLocaleString()}` : title;
}

function slugifyTitle(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function dedupeLinks(links: PublicSeoLink[]): PublicSeoLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.href)) return false;
    seen.add(link.href);
    return true;
  });
}

function formatDate(value?: string | null) {
  if (!value) return 'TBD';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'TBD';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function eventRouteSlug(event: EventRow) {
  return slugifyTitle(event.title) || event.id;
}

function eventLocation(event: EventRow) {
  return [event.city, event.region].filter(Boolean).join(', ') || event.address || 'Central Valley';
}

function eventCategoryLabel(category?: string | null) {
  return category ? titleFromSlug(category.replace(/_/g, '-')) : 'Community';
}

function eventKindLabel(event: EventRow) {
  if (event.event_kind !== 'online') return 'Local event';
  return event.platform ? `${PLATFORM_META[event.platform]?.label ?? 'Online'} live event` : 'Online live event';
}

function eventImage(event: EventRow) {
  return event.cover_image_url || event.cover_thumb_url || null;
}

async function loadPublishedEvents(limit = 8) {
  try {
    return await fetchPublishedEvents({ limit });
  } catch {
    return [] as EventRow[];
  }
}

export async function loadLiveSeoEnhancements(kind: SeoRouteKind, params: SeoRouteParams): Promise<Partial<PublicSeoPageProps>> {
  if (kind === 'wanted') {
    const wanted = getWantedSeoContent(params.slug ?? '');
    const matches = await fetchWantedMatches(
      [
        wanted.title,
        wanted.focus,
        wanted.categorySlug.replace(/-/g, ' '),
        ...wanted.searchBullets,
      ],
      5,
    );
    const wantedMatches = findWantedSeoContentByTerms(
      [wanted.title, wanted.focus, wanted.categorySlug.replace(/-/g, ' '), ...wanted.searchBullets],
      3,
    );
    const cityName = titleFromSlug(wanted.citySlug);
    const countyName = titleFromSlug(wanted.countySlug);
    const category = findCategory(wanted.categorySlug);
    const liveListingLinks = matches.map((listing) => ({
      label: listingLabel(listing.title, listing.price),
      href: `/listing/${listing.id}`,
      description: `Open the marketplace listing for ${listing.profiles?.username || 'the seller'}.`,
    }));
    const sellerLinks = dedupeLinks(
      matches
        .map((listing) => listing.profiles?.username)
        .filter((handle): handle is string => Boolean(handle))
        .map((handle) => ({
          label: `@${handle} storefront`,
          href: `/seller/${handle}`,
          description: `Open the seller storefront for ${handle}.`,
        })),
    );
    const wantedLinks = wantedMatches.map((item) => ({
      label: item.title,
      href: `/wanted/${item.slug}`,
      description: item.summary,
    }));
    const relatedLinks = dedupeLinks([
      { label: 'Marketplace home', href: '/marketplace', description: 'Browse the full marketplace feed.' },
      { label: `${cityName} city page`, href: `/ca/${wanted.countySlug}/${wanted.citySlug}`, description: `Open the local city page for ${cityName}, ${countyName}.` },
      ...(category
        ? [{
            label: `${category.label} category page`,
            href: `/category/${category.slug}`,
            description: `Browse the ${category.label.toLowerCase()} hub.`,
          }]
        : []),
      ...liveListingLinks,
      ...sellerLinks,
      ...wantedLinks,
    ]);

    const liveSection: PublicSeoSection = {
      title: 'Live matching inventory',
      body: `These current marketplace listings share the same search shape as ${wanted.title}.`,
      bullets: matches.map((listing) => `${listing.title} in ${listing.category || 'other'} - ${listing.price ? `$${listing.price.toLocaleString()}` : 'price on request'}`),
      links: liveListingLinks,
    };

    return {
      stats: [
        { label: 'Matched listings', value: String(matches.length) },
        { label: 'Focus', value: wanted.focus },
        { label: 'Page type', value: 'Wanted post' },
      ],
      highlights: [
        `${matches.length} live listings matched to the wanted intent`,
        `Seeded category: ${wanted.categorySlug}`,
        'Live inventory is surfaced from marketplace listings',
      ],
      sections: [
        liveSection,
        {
          title: 'Seller storefronts',
          body: 'These seller pages are the next step after a matched listing.',
          bullets: sellerLinks.map((item) => item.label),
          links: sellerLinks,
        },
        {
          title: 'Related wanted posts',
          body: 'These wanted posts sit nearby in the same search neighborhood.',
          bullets: wantedMatches.map((item) => item.summary),
          links: wantedLinks,
        },
      ],
      relatedLinks,
    };
  }

  if (kind === 'seller') {
    const seller = getSellerSeoContent(params.handle ?? '');
    const profile = await fetchPublicProfileByHandle(seller.slug);
    const listings = await fetchMarketplaceListingsBySellerHandle(seller.slug, 6);
    const relatedWanted = findWantedSeoContentByTerms([seller.displayName, seller.headline, seller.bio, ...seller.categorySlugs], 3);
    const relatedEvents = getAllEventSeoContent().filter((item) =>
      item.countySlug === seller.countySlug
      || item.citySlug === seller.citySlug
      || item.categorySlugs.some((slug) => seller.categorySlugs.includes(slug)),
    );
    const displayName = profile?.business_name?.trim() || (profile?.username ? `@${profile.username}` : seller.displayName);
    const pageTitle = displayName;
    const bio = profile?.business_bio?.trim() || profile?.bio?.trim() || seller.bio;
    const trustLabel = profile?.founding_partner
      ? 'Founding partner'
      : profile?.scout_verified
        ? 'Scout verified'
        : 'Public seller profile';
    const categories = profile?.favorite_categories?.length
      ? profile.favorite_categories.map((item) => item.trim()).filter(Boolean)
      : seller.categorySlugs.map((slug) => titleFromSlug(slug));
    const primaryListing = listings[0] ?? null;
    const categoryLinks = dedupeLinks(
      seller.categorySlugs
        .map((slug) => findCategory(slug))
        .filter((item): item is NonNullable<ReturnType<typeof findCategory>> => Boolean(item))
        .map((category) => ({
          label: `${category.label} category page`,
          href: `/category/${category.slug}`,
          description: `Browse the category hub for ${category.label.toLowerCase()}.`,
        })),
    );
    const listingLinks = listings.map((listing) => ({
      label: listingLabel(listing.title, listing.price),
      href: `/listing/${listing.id}`,
      description: `Open the marketplace listing for ${listing.profiles?.username || seller.slug}.`,
    }));
    const wantedLinks = relatedWanted.map((item) => ({
      label: item.title,
      href: `/wanted/${item.slug}`,
      description: item.summary,
    }));
    const eventLinks = relatedEvents.slice(0, 4).map((item) => ({
      label: item.title,
      href: `/event/${item.slug}`,
      description: `${titleFromSlug(item.citySlug)} event tied to ${seller.displayName}.`,
    }));
    const relatedLinks = dedupeLinks([
      { label: 'Marketplace home', href: '/marketplace', description: 'Return to the marketplace feed.' },
      { label: `${titleFromSlug(seller.citySlug)} city page`, href: `/ca/${seller.countySlug}/${seller.citySlug}`, description: `Open the public page for ${titleFromSlug(seller.citySlug)}.` },
      ...categoryLinks,
      ...listingLinks,
      ...wantedLinks,
      ...eventLinks,
    ]);

    const liveSection: PublicSeoSection = {
      title: 'Live seller inventory',
      body: `These current marketplace listings are attributed to ${displayName}.`,
      bullets: listings.map((listing) => `${listing.title} in ${listing.category || 'other'} - ${listing.price ? `$${listing.price.toLocaleString()}` : 'price on request'}`),
      links: listingLinks,
    };

    return {
      metadata: {
        title: pageTitle,
        description: bio,
        canonicalPath: `/seller/${seller.slug}`,
        ogType: 'website',
        siteName: 'TreasureTrail',
      },
      title: pageTitle,
      subtitle: profile?.pro_member
        ? `${trustLabel} storefront with live inventory.`
        : `${seller.headline} with live inventory from the marketplace feed.`,
      description: bio,
      locationLabel: `${titleFromSlug(seller.citySlug)}, ${titleFromSlug(seller.countySlug)}`,
      heroMedia: primaryListing?.image_url
        ? {
            src: primaryListing.image_url,
            alt: primaryListing.title,
            caption: primaryListing.category ? primaryListing.category : 'Featured listing',
          }
        : profile?.business_logo_url || profile?.avatar_url
          ? {
              src: profile.business_logo_url || profile.avatar_url || '',
              alt: pageTitle,
              caption: 'Seller profile image',
            }
          : null,
      stats: [
        { label: 'Live listings', value: String(listings.length) },
        { label: 'City', value: `${titleFromSlug(seller.citySlug)}, ${titleFromSlug(seller.countySlug)}` },
        { label: 'Trust', value: trustLabel },
        { label: 'Page type', value: 'Seller storefront' },
      ],
      highlights: [
        `${listings.length} live listings tied to this seller`,
        `Primary categories: ${categories.join(', ')}`,
        profile?.membership_tier === 'pro' ? 'Pro seller profile' : trustLabel,
      ],
      sections: [
        {
          title: 'Seller profile',
          body: bio,
          bullets: [
            `Handle: ${profile?.username ? `@${profile.username}` : seller.slug}`,
            `Tier: ${profile?.membership_tier ?? 'free'}`,
            profile?.account_type === 'holder' ? 'Event holder account' : 'Marketplace profile',
          ],
          links: categoryLinks,
        },
        {
          title: 'Trusted signals',
          body: 'This storefront combines the seller identity record with the active marketplace listings that belong to it.',
          bullets: [
            `Verified: ${profile?.scout_verified ? 'Yes' : 'No'}`,
            `Favorites: ${categories.join(', ')}`,
            `Followers: ${profile?.follower_count ?? 0}`,
          ],
        },
        liveSection,
        {
          title: 'Related wanted posts and events',
          body: 'These pages extend the seller footprint into matching buyer intent and local activity.',
          bullets: [...wantedLinks.map((item) => item.label), ...eventLinks.map((item) => item.label)],
          links: [...wantedLinks, ...eventLinks],
        },
      ],
      relatedLinks,
    };
  }

  const event = getEventSeoContent(params.slug ?? '');
  const events = await loadPublishedEvents(8);
  const routeSlug = params.slug ?? '';
  const normalizedRouteSlug = slugifyTitle(routeSlug);
  const liveEvent = events.find((item) =>
    item.id.toLowerCase() === routeSlug.toLowerCase()
    || eventRouteSlug(item) === normalizedRouteSlug,
  ) ?? null;
  const current = liveEvent ?? events[0] ?? null;
  const categoryLinks = dedupeLinks(
    event.categorySlugs
      .map((slug) => findCategory(slug))
      .filter((item): item is NonNullable<ReturnType<typeof findCategory>> => Boolean(item))
      .map((category) => ({
        label: `${category.label} category page`,
        href: `/category/${category.slug}`,
        description: `Explore more ${category.label.toLowerCase()} pages.`,
      })),
  );
  const matchingListings = await fetchMarketplaceListingsByTerms(
    [event.title, event.summary, event.host, event.venue, current?.title, current?.description, current?.category, ...event.categorySlugs].filter(Boolean) as string[],
    4,
  );
  const listingLinks = matchingListings.map((listing) => ({
    label: listingLabel(listing.title, listing.price),
    href: `/listing/${listing.id}`,
    description: `Open the marketplace listing from ${listing.profiles?.username || 'the seller'}.`,
  }));
  const sellerLinks = dedupeLinks(
    matchingListings
      .map((listing) => listing.profiles?.username)
      .filter((handle): handle is string => Boolean(handle))
      .map((handle) => ({
        label: `@${handle} storefront`,
        href: `/seller/${handle}`,
        description: `Open the seller storefront for ${handle}.`,
      })),
  );
  const relatedWanted = findWantedSeoContentByTerms([event.title, event.summary, event.host, event.venue, ...event.categorySlugs], 3);
  const wantedLinks = relatedWanted.map((item) => ({
    label: item.title,
    href: `/wanted/${item.slug}`,
    description: item.summary,
  }));
  const liveEventLinks = events
    .filter((item) => !current || item.id !== current.id)
    .slice(0, 4)
    .map((item) => ({
      label: item.title,
      href: `/event/${eventRouteSlug(item)}`,
      description: `Open another live event record in the same feed.`,
    }));
  const eventSection: PublicSeoSection = {
    title: 'Live event records',
    body: 'These are the actual published events currently available in the app feed.',
    bullets: events.map((item) => `${item.title} in ${eventLocation(item)} - starts ${formatDate(item.starts_at)}`),
    links: events.map((item) => ({
      label: `${item.title} / ${eventLocation(item)}`,
      href: `/event/${eventRouteSlug(item)}`,
      description: `Open the SEO event page for this published event.`,
    })),
  };
  const relatedLinks = dedupeLinks([
    { label: 'Marketplace home', href: '/marketplace', description: 'Browse the marketplace feed.' },
    { label: `${titleFromSlug(event.citySlug)} city page`, href: `/ca/${event.countySlug}/${event.citySlug}`, description: `Open the public page for ${titleFromSlug(event.citySlug)}.` },
    ...categoryLinks,
    ...listingLinks,
    ...sellerLinks,
    ...wantedLinks,
    ...liveEventLinks,
  ]);
  const currentImage = current ? eventImage(current) : null;

  return {
    metadata: current
      ? {
          title: current.title,
          description: current.description || event.summary,
          canonicalPath: `/event/${routeSlug || eventRouteSlug(current)}`,
          ogType: 'article',
          siteName: 'TreasureTrail',
        }
      : undefined,
    heroMedia: currentImage
      ? {
          src: currentImage,
          alt: current?.title || event.title,
          caption: current ? eventLocation(current) : 'Live event',
        }
      : null,
    title: current?.title || event.title,
    subtitle: current
      ? `${eventKindLabel(current)} in ${eventLocation(current)}`
      : event.schedule,
    description: current?.description || event.summary,
    locationLabel: current ? eventLocation(current) : `${titleFromSlug(event.citySlug)}, ${titleFromSlug(event.countySlug)}`,
    stats: [
      { label: 'Live event records', value: String(events.length) },
      { label: 'Status', value: current?.status || 'Catalog fallback' },
      { label: 'Category', value: current ? eventCategoryLabel(current.category) : event.categorySlugs.join(', ') },
      { label: 'Page type', value: 'Public event' },
    ],
    highlights: [
      current ? `Live record: ${current.status}` : `${events.length} published event records loaded from Supabase`,
      current ? `Starts ${formatDate(current.starts_at)}` : 'Event page can fall back to catalog content',
      current ? eventKindLabel(current) : 'Open public event',
    ],
    sections: [
      {
        title: 'Event record',
        body: current?.description || event.summary,
        bullets: current
          ? [
              `Type: ${eventCategoryLabel(current.category)}`,
              `Region: ${eventLocation(current)}`,
              `Status: ${current.status || 'published'}`,
            ]
          : [
              `Type: ${event.categorySlugs.join(', ')}`,
              `Region: ${titleFromSlug(event.citySlug)}, ${titleFromSlug(event.countySlug)}`,
              `Schedule: ${event.schedule}`,
            ],
        links: [...categoryLinks, ...wantedLinks],
      },
      {
        title: 'Event details',
        body: current ? 'This section reflects the published event row attached to the route.' : 'This is the fallback content used while the live row is unavailable.',
        bullets: current
          ? [
              `Kind: ${eventKindLabel(current)}`,
              `Starts: ${formatDate(current.starts_at)}`,
              `Ends: ${current.ends_at ? formatDate(current.ends_at) : 'No end time set'}`,
            ]
          : event.highlights,
        links: [...listingLinks, ...sellerLinks],
      },
      eventSection,
    ],
    relatedLinks,
  };
}
