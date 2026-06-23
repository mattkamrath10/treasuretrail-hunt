import type { PublicSeoLink, PublicSeoPageProps, PublicSeoSection } from '../../components/seo/PublicSeoPage';
import type { MarketplaceListing } from '../supabase';
import type { SeoStructuredDataNode } from '../../components/seo/SeoStructuredData';
import { findWantedSeoContentByTerms } from './publicContentCatalog';
import { findCategory } from './publicRouteData';

const SITE_ORIGIN = 'https://treasuretrail-hunt.com';

function absoluteUrl(path: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : SITE_ORIGIN;
  return new URL(path, origin).toString();
}

function listingPath(id: string) {
  return `/listing/${id}`;
}

function makeNode<T extends Record<string, unknown>>(type: string, props: T): SeoStructuredDataNode {
  return {
    '@context': 'https://schema.org',
    '@type': type,
    ...props,
  };
}

function makeBreadcrumbNode(parts: Array<{ label: string; href: string }>): SeoStructuredDataNode {
  return makeNode('BreadcrumbList', {
    itemListElement: parts.map((part, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: part.label,
      item: absoluteUrl(part.href),
    })),
  });
}

function makeProductNode(listing: MarketplaceListing, path: string): SeoStructuredDataNode {
  return makeNode('Product', {
    name: listing.title,
    description: listing.description || listing.title,
    category: listing.category,
    image: listing.image_url ? [listing.image_url] : undefined,
    url: absoluteUrl(path),
    offers: {
      '@type': 'Offer',
      price: listing.price,
      priceCurrency: 'USD',
      availability: listing.status === 'active' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: absoluteUrl(path),
    },
  });
}

function sectionFor(title: string, body: string, bullets?: string[], links?: PublicSeoLink[]): PublicSeoSection {
  return { title, body, bullets, links };
}

function dedupeLinks(links: PublicSeoLink[]): PublicSeoLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.href)) return false;
    seen.add(link.href);
    return true;
  });
}

function priceLabel(price: number) {
  return `$${price.toLocaleString()}`;
}

export function buildMarketplaceListingPage(
  listing: MarketplaceListing,
  relatedListings: MarketplaceListing[] = [],
): PublicSeoPageProps {
  const path = listingPath(listing.id);
  const sellerHandle = listing.profiles?.username || 'seller';
  const sellerLabel = `@${sellerHandle}`;
  const description = listing.description || `Public listing detail for ${listing.title}.`;
  const category = findCategory(listing.category);
  const wantedMatches = findWantedSeoContentByTerms([listing.title, listing.category, listing.description], 3);
  const wantedLinks = wantedMatches.map((item) => ({
    label: item.title,
    href: `/wanted/${item.slug}`,
    description: item.summary,
  }));
  const listingLinks = relatedListings.slice(0, 4).map((item) => ({
    label: item.title,
    href: listingPath(item.id),
    description: `${item.category || 'Marketplace'} listing from ${item.profiles?.username || 'another seller'}.`,
  }));
  const categoryLink = category
    ? {
        label: `${category.label} category page`,
        href: `/category/${category.slug}`,
        description: `Browse more ${category.label.toLowerCase()} pages.`,
      }
    : null;
  const relatedLinks = dedupeLinks([
    { label: 'Marketplace home', href: '/marketplace', description: 'Return to the marketplace feed.' },
    { label: `${sellerLabel} storefront`, href: `/seller/${sellerHandle}`, description: 'Open the seller storefront page.' },
    ...(categoryLink ? [categoryLink] : []),
    ...wantedLinks,
    ...listingLinks,
  ]);

  return {
    metadata: {
      title: listing.title,
      description,
      canonicalPath: path,
      ogType: 'website',
      siteName: 'TreasureTrail',
    },
    structuredData: [
      makeNode('WebPage', {
        name: listing.title,
        description,
        url: absoluteUrl(path),
        inLanguage: 'en-US',
      }),
      makeBreadcrumbNode([
        { label: 'TreasureTrail', href: '/' },
        { label: 'Marketplace', href: '/marketplace' },
        { label: listing.title, href: path },
      ]),
      makeProductNode(listing, path),
    ],
    heroMedia: listing.image_url
      ? {
          src: listing.image_url,
          alt: listing.title,
          caption: listing.category ? listing.category : 'Marketplace listing',
        }
      : null,
    eyebrow: 'Marketplace listing',
    title: listing.title,
    subtitle: `${listing.category || 'General marketplace'} item from ${sellerLabel}.`,
    description,
    locationLabel: listing.local_pickup ? 'Local pickup available' : 'Shipping only',
    breadcrumbs: [
      { label: 'TreasureTrail', href: '/' },
      { label: 'Marketplace', href: '/marketplace' },
      { label: listing.title, href: path },
    ],
    stats: [
      { label: 'Price', value: priceLabel(listing.price) },
      { label: 'Condition', value: listing.condition || 'Unknown' },
      { label: 'Seller', value: sellerLabel },
    ],
    highlights: [
      listing.auction_enabled ? 'Auction enabled' : 'Buy-now listing',
      listing.local_pickup ? 'Local pickup supported' : 'Remote fulfillment only',
      listing.status === 'active' ? 'Active listing' : `Status: ${listing.status}`,
    ],
    sections: [
      sectionFor(
        'Listing details',
        description,
        [
          `Category: ${listing.category || 'Uncategorized'}`,
          `Condition: ${listing.condition || 'Unknown'}`,
          `Posted recently from the live marketplace feed`,
        ],
        categoryLink ? [categoryLink] : undefined,
      ),
      sectionFor(
        'Seller storefront',
        `This listing is associated with ${sellerLabel}.`,
        [
          `Open the seller page to see more from ${sellerLabel}`,
          'Use the marketplace hub for broader browsing',
        ],
        [
          { label: `${sellerLabel} storefront`, href: `/seller/${sellerHandle}`, description: 'Open the public seller page.' },
        ],
      ),
      sectionFor(
        'Matching wanted posts',
        'These wanted pages share the same search shape as this listing.',
        wantedMatches.map((item) => item.summary),
        wantedLinks,
      ),
      sectionFor(
        'Related listings',
        'These nearby items share category, seller, or search intent.',
        relatedListings.map((item) => `${item.title} - ${priceLabel(item.price)}`),
        listingLinks,
      ),
    ],
    relatedLinks,
    faqs: [
      {
        question: 'Is this a public listing page?',
        answer: 'Yes. It is a crawlable detail route built from the live marketplace feed.',
      },
      {
        question: 'Where does the data come from?',
        answer: 'The page reads from the live marketplace listings table and uses the seller profile attached to the listing.',
      },
    ],
    primaryAction: { label: 'Open marketplace', href: '/marketplace' },
    secondaryAction: { label: 'Seller storefront', href: `/seller/${sellerHandle}` },
  };
}
