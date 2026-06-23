import type { PublicSeoBreadcrumb, PublicSeoLink, PublicSeoPageProps, PublicSeoSection } from '../../components/seo/PublicSeoPage';
import type { PublicSeoMetadata } from '../../components/seo/SeoHead';
import type { SeoStructuredDataNode } from '../../components/seo/SeoStructuredData';
import { getEventSeoContent, getSellerSeoContent, getWantedSeoContent } from './publicContentCatalog';
import routeCatalog from './routeCatalog.json';

export type SeoRouteKind = 'county' | 'city' | 'cityCategory' | 'category' | 'wanted' | 'seller' | 'event';

export type SeoRouteParams = {
  county?: string;
  city?: string;
  category?: string;
  slug?: string;
  handle?: string;
};

export type SeoPageContext = {
  canonicalPath: string;
};

const SITE_ORIGIN = 'https://treasuretrail-hunt.com';

type CountyRecord = {
  name: string;
  slug: string;
  cities: Array<{ name: string; slug: string }>;
};

type RouteCatalog = {
  counties: CountyRecord[];
  categories: Array<{ slug: string; label: string }>;
  seoPages: {
    wanted: Array<{
      slug: string;
      countySlug: string;
      citySlug: string;
      categorySlug: string;
      similarSlugs?: string[];
    }>;
    sellers: Array<{
      slug: string;
      countySlug: string;
      citySlug: string;
      categorySlugs: string[];
      eventSlugs?: string[];
    }>;
    events: Array<{
      slug: string;
      countySlug: string;
      citySlug: string;
      categorySlugs: string[];
      relatedEventSlugs?: string[];
    }>;
  };
};

const { counties: COUNTIES, categories: CATEGORY_ITEMS, seoPages: SEO_SAMPLE_PAGES } = routeCatalog as RouteCatalog;

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORY_ITEMS.map((item) => [item.slug, item.label]),
);

const CATEGORY_SLUGS = new Set(Object.keys(CATEGORY_LABELS));

function titleFromSlug(raw: string): string {
  return raw
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function absoluteUrl(path: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : SITE_ORIGIN;
  return new URL(path, origin).toString();
}

export function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function normalizeHandle(raw: string): string {
  return normalizeSlug(raw);
}

export function getSeoRouteCatalog() {
  return { counties: COUNTIES, categories: CATEGORY_ITEMS, seoPages: SEO_SAMPLE_PAGES };
}

export function findCounty(raw?: string) {
  if (!raw) return null;
  const slug = normalizeSlug(raw);
  return COUNTIES.find((county) => county.slug === slug) ?? null;
}

export function findCity(countySlug: string | undefined, citySlug: string | undefined) {
  const county = findCounty(countySlug);
  if (!county || !citySlug) return null;
  const slug = normalizeSlug(citySlug);
  return county.cities.find((city) => city.slug === slug) ?? null;
}

export function findCategory(raw?: string) {
  if (!raw) return null;
  const slug = normalizeSlug(raw);
  if (!CATEGORY_SLUGS.has(slug)) return null;
  return {
    slug,
    label: CATEGORY_LABELS[slug],
  };
}

function findWantedBySlug(raw?: string) {
  if (!raw) return null;
  const slug = normalizeSlug(raw);
  return SEO_SAMPLE_PAGES.wanted.find((item) => item.slug === slug) ?? null;
}

function findSellerBySlug(raw?: string) {
  if (!raw) return null;
  const slug = normalizeSlug(raw);
  return SEO_SAMPLE_PAGES.sellers.find((item) => item.slug === slug) ?? null;
}

function findEventBySlug(raw?: string) {
  if (!raw) return null;
  const slug = normalizeSlug(raw);
  return SEO_SAMPLE_PAGES.events.find((item) => item.slug === slug) ?? null;
}

function countyLabel(slug: string) {
  return findCounty(slug)?.name ?? titleFromSlug(slug);
}

function cityLabel(countySlug: string, citySlug: string) {
  return findCity(countySlug, citySlug)?.name ?? titleFromSlug(citySlug);
}

function dedupeLinks(links: PublicSeoLink[]): PublicSeoLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.href)) return false;
    seen.add(link.href);
    return true;
  });
}

function sectionFor(label: string, description: string, bullets: string[]): PublicSeoSection {
  return {
    title: label,
    body: description,
    bullets,
  };
}

function baseLinks(homeLabel: string, related: PublicSeoLink[]): PublicSeoLink[] {
  return [
    { label: homeLabel, href: '/', description: 'Return to the main TreasureTrail feed.' },
    ...related,
  ];
}

function countyInternalLinks(county: NonNullable<ReturnType<typeof findCounty>>): PublicSeoLink[] {
  return dedupeLinks(
    county.cities.map((city) => ({
      label: city.name,
      href: `/ca/${county.slug}/${city.slug}`,
      description: `Open the ${city.name} page in ${county.name}.`,
    })),
  );
}

function cityInternalLinks(county: NonNullable<ReturnType<typeof findCounty>>, city: NonNullable<ReturnType<typeof findCity>>): PublicSeoLink[] {
  const countyName = county.name;
  const cityHref = `/ca/${county.slug}/${city.slug}`;
  const categoryLinks = CATEGORY_ITEMS.slice(0, 4).map((category) => ({
    label: `${city.name} ${category.label}`,
    href: `${cityHref}/${category.slug}`,
    description: `Open the ${category.label.toLowerCase()} landing page for ${city.name}.`,
  }));

  const eventLinks = SEO_SAMPLE_PAGES.events
    .filter((event) => event.countySlug === county.slug && event.citySlug === city.slug)
    .map((event) => ({
      label: titleFromSlug(event.slug),
      href: `/event/${event.slug}`,
      description: `Related event page for ${city.name}, ${countyName}.`,
    }));

  return dedupeLinks(
    [
      { label: `${county.name} county page`, href: `/ca/${county.slug}`, description: `Go back to ${county.name}.` },
      ...categoryLinks,
      ...eventLinks,
    ],
  );
}

function categoryInternalLinks(category: NonNullable<ReturnType<typeof findCategory>>): PublicSeoLink[] {
  const countyExamples = SEO_SAMPLE_PAGES.events.length
    ? COUNTIES.flatMap((county) =>
        county.cities.slice(0, 1).map((city) => ({
          label: `${city.name} ${category.label}`,
          href: `/ca/${county.slug}/${city.slug}/${category.slug}`,
          description: `Example ${category.label.toLowerCase()} page in ${city.name}.`,
        })),
      )
    : [];

  const wantedLinks = SEO_SAMPLE_PAGES.wanted
    .filter((wanted) => wanted.categorySlug === category.slug)
    .map((wanted) => ({
      label: `Wanted ${titleFromSlug(wanted.slug)}`,
      href: `/wanted/${wanted.slug}`,
      description: `Matching wanted post for ${category.label.toLowerCase()}.`,
    }));

  return dedupeLinks([
    ...countyExamples.slice(0, 4),
    ...wantedLinks.slice(0, 3),
  ]);
}

function wantedInternalLinks(wanted: NonNullable<ReturnType<typeof findWantedBySlug>>): PublicSeoLink[] {
  const countyName = countyLabel(wanted.countySlug);
  const cityName = cityLabel(wanted.countySlug, wanted.citySlug);
  const category = findCategory(wanted.categorySlug);
  const similarLinks = (wanted.similarSlugs ?? [])
    .map((slug) => findWantedBySlug(slug))
    .filter((item): item is NonNullable<ReturnType<typeof findWantedBySlug>> => Boolean(item))
    .map((item) => ({
      label: `Wanted ${titleFromSlug(item.slug)}`,
      href: `/wanted/${item.slug}`,
      description: `Similar wanted post for ${titleFromSlug(item.slug)}.`,
    }));

  return dedupeLinks([
    {
      label: `${cityName} city page`,
      href: `/ca/${wanted.countySlug}/${wanted.citySlug}`,
      description: `Browse the broader ${cityName} page in ${countyName}.`,
    },
    ...(category
      ? [{
          label: `${category.label} category page`,
          href: `/category/${category.slug}`,
          description: `Open the matching category hub for ${category.label.toLowerCase()}.`,
        }]
      : []),
    ...similarLinks,
  ]);
}

function sellerInternalLinks(seller: NonNullable<ReturnType<typeof findSellerBySlug>>): PublicSeoLink[] {
  const countyName = countyLabel(seller.countySlug);
  const cityName = cityLabel(seller.countySlug, seller.citySlug);
  const categoryLinks = seller.categorySlugs
    .map((slug) => findCategory(slug))
    .filter((item): item is NonNullable<ReturnType<typeof findCategory>> => Boolean(item))
    .map((category) => ({
      label: `${category.label} category page`,
      href: `/category/${category.slug}`,
      description: `Browse the category hub for ${category.label.toLowerCase()}.`,
    }));

  const eventLinks = (seller.eventSlugs ?? [])
    .map((slug) => findEventBySlug(slug))
    .filter((item): item is NonNullable<ReturnType<typeof findEventBySlug>> => Boolean(item))
    .map((event) => ({
      label: titleFromSlug(event.slug),
      href: `/event/${event.slug}`,
      description: `Related event page for ${cityName}, ${countyName}.`,
    }));

  return dedupeLinks([
    {
      label: `${cityName} city page`,
      href: `/ca/${seller.countySlug}/${seller.citySlug}`,
      description: `Open the public page for ${cityName}, ${countyName}.`,
    },
    ...categoryLinks,
    ...eventLinks,
  ]);
}

function eventInternalLinks(event: NonNullable<ReturnType<typeof findEventBySlug>>): PublicSeoLink[] {
  const countyName = countyLabel(event.countySlug);
  const cityName = cityLabel(event.countySlug, event.citySlug);
  const categoryLinks = event.categorySlugs
    .map((slug) => findCategory(slug))
    .filter((item): item is NonNullable<ReturnType<typeof findCategory>> => Boolean(item))
    .map((category) => ({
      label: `${category.label} category page`,
      href: `/category/${category.slug}`,
      description: `Explore more ${category.label.toLowerCase()} pages.`,
    }));

  const relatedEvents = (event.relatedEventSlugs ?? [])
    .map((slug) => findEventBySlug(slug))
    .filter((item): item is NonNullable<ReturnType<typeof findEventBySlug>> => Boolean(item))
    .map((item) => ({
      label: titleFromSlug(item.slug),
      href: `/event/${item.slug}`,
      description: `Related event page in the same discovery cluster.`,
    }));

  return dedupeLinks([
    {
      label: `${cityName} city page`,
      href: `/ca/${event.countySlug}/${event.citySlug}`,
      description: `Return to ${cityName} in ${countyName}.`,
    },
    ...categoryLinks,
    ...relatedEvents,
  ]);
}

function makeBreadcrumbs(parts: Array<{ label: string; href: string }>): PublicSeoBreadcrumb[] {
  return parts;
}

function makeMetadata(
  title: string,
  description: string,
  canonicalPath: string,
  options?: { robots?: string; ogType?: 'website' | 'article' },
): PublicSeoMetadata {
  return {
    title,
    description,
    canonicalPath,
    robots: options?.robots,
    ogType: options?.ogType ?? 'website',
    siteName: 'TreasureTrail',
  };
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

function makeWebPageNode(title: string, description: string, canonicalPath: string): SeoStructuredDataNode {
  return makeNode('WebPage', {
    name: title,
    description,
    url: absoluteUrl(canonicalPath),
    inLanguage: 'en-US',
  });
}

function makeItemListNode(
  title: string,
  items: Array<{ label: string; href: string }>,
  canonicalPath: string,
): SeoStructuredDataNode {
  return makeNode('ItemList', {
    name: title,
    url: absoluteUrl(canonicalPath),
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      item: absoluteUrl(item.href),
    })),
  });
}

function makeEventNode(
  title: string,
  description: string,
  canonicalPath: string,
  options?: { startDate?: string; venue?: string; organizer?: string },
): SeoStructuredDataNode {
  return makeNode('Event', {
    name: title,
    description,
    url: absoluteUrl(canonicalPath),
    eventStatus: 'https://schema.org/EventScheduled',
    startDate: options?.startDate,
    location: options?.venue
      ? {
          '@type': 'Place',
          name: options.venue,
        }
      : undefined,
    organizer: options?.organizer
      ? {
          '@type': 'Organization',
          name: options.organizer,
        }
      : undefined,
  });
}

function makeLocalBusinessNode(
  title: string,
  description: string,
  canonicalPath: string,
  options?: { areaServed?: string },
): SeoStructuredDataNode {
  return makeNode('Store', {
    name: title,
    description,
    url: absoluteUrl(canonicalPath),
    areaServed: options?.areaServed,
  });
}

function makeProductNode(
  title: string,
  description: string,
  canonicalPath: string,
  options?: { category?: string },
): SeoStructuredDataNode {
  return makeNode('Product', {
    name: title,
    description,
    url: absoluteUrl(canonicalPath),
    category: options?.category,
  });
}

function missingPage(title: string, subtitle: string, description: string, canonicalPath: string): PublicSeoPageProps {
  return {
    metadata: makeMetadata(title, description, canonicalPath, { robots: 'noindex, nofollow' }),
    structuredData: [
      makeWebPageNode(title, description, canonicalPath),
      makeBreadcrumbNode([
        { label: 'TreasureTrail', href: '/' },
        { label: 'SEO pages', href: '/seo-preview' },
      ]),
    ],
    eyebrow: 'Page unavailable',
    title,
    subtitle,
    description,
    breadcrumbs: makeBreadcrumbs([
      { label: 'TreasureTrail', href: '/' },
      { label: 'SEO pages', href: '/seo-preview' },
    ]),
    stats: [
      { label: 'Status', value: 'Not found' },
      { label: 'Next step', value: 'Check the slug' },
    ],
    highlights: ['The route pattern is live', 'The requested page does not exist yet'],
    sections: [
      sectionFor(
        'Suggested next steps',
        'Use one of the known Central Valley counties, cities, or categories while the content catalog is being built.',
        ['County examples: Fresno County, Tulare County, Kings County, Kern County', 'City examples: Fresno, Visalia, Bakersfield', 'Category examples: Estate Sales, Auctions, Collectibles'],
      ),
    ],
    relatedLinks: baseLinks('Browse the app', [
      { label: 'SEO preview', href: '/seo-preview', description: 'Inspect the public page shell.' },
      { label: 'Events', href: '/events', description: 'Browse live TreasureTrail events.' },
    ]),
    faqs: [
      {
        question: 'Is this route broken?',
        answer: 'No. The route exists, but the requested slug is not in the SEO catalog yet.',
      },
    ],
    primaryAction: { label: 'SEO preview', href: '/seo-preview' },
    secondaryAction: { label: 'Back to home', href: '/' },
  };
}

function countyPage(county: NonNullable<ReturnType<typeof findCounty>>): PublicSeoPageProps {
  const cityNames = county.cities.map((city) => city.name);
  return {
    metadata: makeMetadata(
      county.name,
      `${county.name} landing page for estate sales, auctions, collectibles, wanted posts, and sellers across ${cityNames.join(', ')}.`,
      `/ca/${county.slug}`,
    ),
    structuredData: [
      makeWebPageNode(
        county.name,
        `${county.name} landing page for estate sales, auctions, collectibles, wanted posts, and sellers across ${cityNames.join(', ')}.`,
        `/ca/${county.slug}`,
      ),
      makeBreadcrumbNode([
        { label: 'TreasureTrail', href: '/' },
        { label: 'Central Valley', href: '/seo-preview' },
        { label: county.name, href: `/ca/${county.slug}` },
      ]),
      makeItemListNode(
        `${county.name} cities`,
        county.cities.map((city) => ({
          label: city.name,
          href: `/ca/${county.slug}/${city.slug}`,
        })),
        `/ca/${county.slug}`,
      ),
    ],
    eyebrow: 'Central Valley county guide',
    title: county.name,
    subtitle: `Browse TreasureTrail activity across ${county.name}.`,
    description: `${county.name} landing page for estate sales, auctions, collectibles, wanted posts, and sellers across ${cityNames.join(', ')}.`,
    locationLabel: county.name,
    breadcrumbs: makeBreadcrumbs([
      { label: 'TreasureTrail', href: '/' },
      { label: 'Central Valley', href: '/seo-preview' },
      { label: county.name, href: `/ca/${county.slug}` },
    ]),
    stats: [
      { label: 'Cities', value: String(county.cities.length) },
      { label: 'Focus', value: 'Local shopping + scouting' },
      { label: 'Page type', value: 'County landing page' },
    ],
    highlights: [
      `${county.cities.length} city pages linked from this county`,
      'Designed to support event, wanted, and seller discovery',
      'Built for crawl depth and local relevance',
    ],
    sections: [
      sectionFor(
        'County overview',
        `This county page introduces the local TreasureTrail footprint for ${county.name}. It will later pull in live events, sellers, wanted posts, and category links from the same geography.`,
        [
          'Anchor content for county-level search intent',
          'A parent page for city pages in the same region',
          'A natural place for internal links to related local pages',
        ],
      ),
      sectionFor(
        'Cities in this county',
        `These city pages are the next layer down from the county page.`,
        county.cities.map((city) => city.name),
      ),
    ],
    relatedLinks: baseLinks('Browse the county', countyInternalLinks(county)),
    faqs: [
      {
        question: `What covers ${county.name}?`,
        answer: `The county page will connect the city pages, local categories, public events, wanted posts, and seller storefronts for ${county.name}.`,
      },
    ],
    primaryAction: { label: 'Open first city', href: `/ca/${county.slug}/${county.cities[0].slug}` },
    secondaryAction: { label: 'SEO preview', href: '/seo-preview' },
  };
}

function cityPage(county: NonNullable<ReturnType<typeof findCounty>>, city: NonNullable<ReturnType<typeof findCity>>): PublicSeoPageProps {
  const countyLink = `/ca/${county.slug}`;
  return {
    metadata: makeMetadata(
      `${city.name}, ${county.name}`,
      `Browse estate sales, auctions, collectibles, wanted posts, and sellers in ${city.name}, ${county.name}.`,
      `/ca/${county.slug}/${city.slug}`,
    ),
    structuredData: [
      makeWebPageNode(
        `${city.name}, ${county.name}`,
        `Browse estate sales, auctions, collectibles, wanted posts, and sellers in ${city.name}, ${county.name}.`,
        `/ca/${county.slug}/${city.slug}`,
      ),
      makeBreadcrumbNode([
        { label: 'TreasureTrail', href: '/' },
        { label: county.name, href: countyLink },
        { label: city.name, href: `/ca/${county.slug}/${city.slug}` },
      ]),
      makeItemListNode(
        `${city.name} related pages`,
        [
          { label: `${city.name} estate sales`, href: `/ca/${county.slug}/${city.slug}/estate-sales` },
          { label: `${city.name} garage sales`, href: `/ca/${county.slug}/${city.slug}/garage-sales` },
          { label: `${city.name} auctions`, href: `/ca/${county.slug}/${city.slug}/auctions` },
          { label: `${city.name} collectibles`, href: `/ca/${county.slug}/${city.slug}/collectibles` },
        ],
        `/ca/${county.slug}/${city.slug}`,
      ),
    ],
    eyebrow: 'City landing page',
    title: `${city.name}, ${county.name}`,
    subtitle: `Local TreasureTrail results for ${city.name}.`,
    description: `Browse estate sales, auctions, collectibles, wanted posts, and sellers in ${city.name}, ${county.name}.`,
    locationLabel: `${city.name}, ${county.name}`,
    breadcrumbs: makeBreadcrumbs([
      { label: 'TreasureTrail', href: '/' },
      { label: county.name, href: countyLink },
      { label: city.name, href: `/ca/${county.slug}/${city.slug}` },
    ]),
    stats: [
      { label: 'County', value: county.name },
      { label: 'Category depth', value: 'City level' },
      { label: 'Page type', value: 'City landing page' },
    ],
    highlights: [
      `Parent county: ${county.name}`,
      'A bridge into city-category combinations',
      'Built to surface local search intent quickly',
    ],
    sections: [
      sectionFor(
        'City overview',
        `This page will become the main public landing page for ${city.name}. It is the place where we can summarize local activity and point people toward the most relevant category pages.`,
        [
          'Local summary copy for search',
          'Related links to events and categories',
          'A clean parent link back to the county page',
        ],
      ),
      sectionFor(
        'Popular local paths',
        'These are the first combinations this page should link to once real content is wired in.',
        ['Estate sales', 'Garage sales', 'Auctions', 'Collectibles'],
      ),
    ],
    relatedLinks: baseLinks('Browse the city', cityInternalLinks(county, city)),
    faqs: [
      {
        question: `Why a city page for ${city.name}?`,
        answer: `It gives us a durable local landing page that can rank for nearby search intent and link into category and event pages.`,
      },
    ],
    primaryAction: { label: 'Open county page', href: countyLink },
    secondaryAction: { label: 'SEO preview', href: '/seo-preview' },
  };
}

function cityCategoryPage(
  county: NonNullable<ReturnType<typeof findCounty>>,
  city: NonNullable<ReturnType<typeof findCity>>,
  category: NonNullable<ReturnType<typeof findCategory>>,
): PublicSeoPageProps {
  const cityHref = `/ca/${county.slug}/${city.slug}`;
  return {
    metadata: makeMetadata(
      `${city.name} ${category.label}`,
      `Discover ${category.label.toLowerCase()} in ${city.name}, ${county.name}. This page is the bridge between broad city intent and specific category searches.`,
      `/ca/${county.slug}/${city.slug}/${category.slug}`,
    ),
    structuredData: [
      makeWebPageNode(
        `${city.name} ${category.label}`,
        `Discover ${category.label.toLowerCase()} in ${city.name}, ${county.name}. This page is the bridge between broad city intent and specific category searches.`,
        `/ca/${county.slug}/${city.slug}/${category.slug}`,
      ),
      makeBreadcrumbNode([
        { label: 'TreasureTrail', href: '/' },
        { label: county.name, href: `/ca/${county.slug}` },
        { label: city.name, href: cityHref },
        { label: category.label, href: `/ca/${county.slug}/${city.slug}/${category.slug}` },
      ]),
      makeItemListNode(
        `${city.name} and ${category.label}`,
        [
          { label: `${city.name} city page`, href: cityHref },
          { label: `${county.name} county page`, href: `/ca/${county.slug}` },
          { label: `${category.label} category page`, href: `/category/${category.slug}` },
        ],
        `/ca/${county.slug}/${city.slug}/${category.slug}`,
      ),
    ],
    eyebrow: 'City + category landing page',
    title: `${city.name} ${category.label}`,
    subtitle: `A focused local landing page for ${category.label.toLowerCase()} in ${city.name}.`,
    description: `Discover ${category.label.toLowerCase()} in ${city.name}, ${county.name}. This page is the bridge between broad city intent and specific category searches.`,
    locationLabel: `${city.name}, ${county.name}`,
    breadcrumbs: makeBreadcrumbs([
      { label: 'TreasureTrail', href: '/' },
      { label: county.name, href: `/ca/${county.slug}` },
      { label: city.name, href: cityHref },
      { label: category.label, href: `/ca/${county.slug}/${city.slug}/${category.slug}` },
    ]),
    stats: [
      { label: 'County', value: county.name },
      { label: 'City', value: city.name },
      { label: 'Category', value: category.label },
    ],
    highlights: [
      'High-intent combination page',
      'Helps organize the future internal link graph',
      'Can rank for long-tail local search terms',
    ],
    sections: [
      sectionFor(
        `${city.name} ${category.label}`,
        `This page will eventually feature real listings and events for ${category.label.toLowerCase()} in ${city.name}. For now, it establishes the route pattern and page structure.`,
        [
          `Local ${category.label.toLowerCase()} searches`,
          `County and city navigation`,
          'Entry point for searchers who know both place and intent',
        ],
      ),
      sectionFor(
        'Related landing pages',
        'These are the next likely pages a searcher would want after landing here.',
        [
          `${city.name} city page`,
          `${county.name} county page`,
          `${category.label} category page`,
        ],
      ),
    ],
    relatedLinks: baseLinks('Browse the app', [
      { label: `${city.name} city page`, href: cityHref, description: 'Back to the broader city page.' },
      { label: `${category.label} category page`, href: `/category/${category.slug}`, description: 'Open the top-level category page.' },
      { label: `${county.name} county page`, href: `/ca/${county.slug}`, description: 'Go back to the county page.' },
    ]),
    faqs: [
      {
        question: `Why combine ${city.name} and ${category.label}?`,
        answer: `It matches how people search locally: they often care about both the place and the type of sale, item, or event.`,
      },
    ],
    primaryAction: { label: 'Open city page', href: cityHref },
    secondaryAction: { label: 'SEO preview', href: '/seo-preview' },
  };
}

function categoryPage(category: NonNullable<ReturnType<typeof findCategory>>): PublicSeoPageProps {
  return {
    metadata: makeMetadata(
      category.label,
      `Explore ${category.label.toLowerCase()} across the Central Valley and beyond.`,
      `/category/${category.slug}`,
    ),
    structuredData: [
      makeWebPageNode(
        category.label,
        `Explore ${category.label.toLowerCase()} across the Central Valley and beyond.`,
        `/category/${category.slug}`,
      ),
      makeBreadcrumbNode([
        { label: 'TreasureTrail', href: '/' },
        { label: category.label, href: `/category/${category.slug}` },
      ]),
      makeItemListNode(
        `${category.label} examples`,
        [
          { label: `Fresno ${category.label}`, href: `/ca/fresno-county/fresno/${category.slug}` },
          { label: `Bakersfield ${category.label}`, href: `/ca/kern-county/bakersfield/${category.slug}` },
        ],
        `/category/${category.slug}`,
      ),
    ],
    eyebrow: 'Category landing page',
    title: category.label,
    subtitle: `A broad TreasureTrail hub for ${category.label.toLowerCase()}.`,
    description: `Explore ${category.label.toLowerCase()} across the Central Valley and beyond.`,
    breadcrumbs: makeBreadcrumbs([
      { label: 'TreasureTrail', href: '/' },
      { label: category.label, href: `/category/${category.slug}` },
    ]),
    stats: [
      { label: 'Category', value: category.label },
      { label: 'Scope', value: 'Region-wide' },
      { label: 'Page type', value: 'Category landing page' },
    ],
    highlights: [
      'Top-level category target for search',
      'Links out to city and county combinations',
      'Will eventually aggregate live listings and events',
    ],
    sections: [
      sectionFor(
        `${category.label} overview`,
        `This page will serve as the canonical destination for ${category.label.toLowerCase()} searches.`,
        [
          'City combinations for Central Valley locations',
          'Links to related wanted posts and sellers',
          'Foundation for category-level structured data',
        ],
      ),
    ],
    relatedLinks: baseLinks('Browse the category', categoryInternalLinks(category)),
    faqs: [
      {
        question: `What belongs on the ${category.label} page?`,
        answer: `Listings, events, and internal links that help a searcher drill into the exact city or county they care about.`,
      },
    ],
    primaryAction: { label: 'SEO preview', href: '/seo-preview' },
    secondaryAction: { label: 'Back to home', href: '/' },
  };
}

function publicPersonPage(kind: 'wanted' | 'seller' | 'event', raw: string): PublicSeoPageProps {
  const slug = normalizeSlug(raw);
  const wantedRecord = kind === 'wanted' ? findWantedBySlug(slug) : null;
  const sellerRecord = kind === 'seller' ? findSellerBySlug(slug) : null;
  const eventRecord = kind === 'event' ? findEventBySlug(slug) : null;
  const wantedContent = kind === 'wanted' ? getWantedSeoContent(slug) : null;
  const sellerContent = kind === 'seller' ? getSellerSeoContent(slug) : null;
  const eventContent = kind === 'event' ? getEventSeoContent(slug) : null;
  const label =
    kind === 'wanted'
      ? wantedContent?.title ?? `Wanted ${titleFromSlug(slug)}`
      : kind === 'seller'
        ? sellerContent?.displayName ?? `Seller ${titleFromSlug(slug)}`
        : eventContent?.title ?? titleFromSlug(slug);
  const subtitleMap = {
    wanted: wantedContent?.focus ?? 'A public wanted post landing page.',
    seller: sellerContent?.headline ?? 'A public storefront landing page.',
    event: eventContent?.schedule ?? 'A public event landing page.',
  } as const;
  const descriptionMap = {
    wanted: wantedContent?.summary ?? `This route will eventually carry public wanted-post content for ${titleFromSlug(slug)}.`,
    seller: sellerContent?.bio ?? `This route will eventually carry a public storefront for ${titleFromSlug(slug)}.`,
    event: eventContent?.summary ?? `This route will eventually carry a public event page for ${titleFromSlug(slug)}.`,
  } as const;

  return {
    metadata: makeMetadata(
      label,
      descriptionMap[kind],
      `/${kind}/${slug}`,
      { ogType: kind === 'event' ? 'article' : 'website' },
    ),
    structuredData:
      kind === 'event'
        ? [
            makeWebPageNode(label, descriptionMap[kind], `/${kind}/${slug}`),
            makeBreadcrumbNode([
              { label: 'TreasureTrail', href: '/' },
              { label: `${kind} pages`, href: '/seo-preview' },
              { label: titleFromSlug(slug), href: `/${kind}/${slug}` },
            ]),
            makeEventNode(label, descriptionMap[kind], `/${kind}/${slug}`, {
              startDate: eventContent?.startDate,
              venue: eventContent?.venue,
              organizer: eventContent?.host,
            }),
          ]
        : kind === 'seller'
          ? [
              makeWebPageNode(label, descriptionMap[kind], `/${kind}/${slug}`),
              makeBreadcrumbNode([
                { label: 'TreasureTrail', href: '/' },
                { label: `${kind} pages`, href: '/seo-preview' },
                { label: titleFromSlug(slug), href: `/${kind}/${slug}` },
              ]),
              makeLocalBusinessNode(label, descriptionMap[kind], `/${kind}/${slug}`, {
                areaServed: sellerContent ? `${sellerContent.citySlug}, ${sellerContent.countySlug}` : undefined,
              }),
            ]
          : [
              makeWebPageNode(label, descriptionMap[kind], `/${kind}/${slug}`),
              makeBreadcrumbNode([
                { label: 'TreasureTrail', href: '/' },
                { label: `${kind} pages`, href: '/seo-preview' },
                { label: titleFromSlug(slug), href: `/${kind}/${slug}` },
              ]),
              makeProductNode(label, descriptionMap[kind], `/${kind}/${slug}`, {
                category: wantedContent?.categorySlug,
              }),
            ],
    eyebrow: kind === 'wanted' ? 'Wanted post' : kind === 'seller' ? 'Seller storefront' : 'Public event',
    title: label,
    subtitle: subtitleMap[kind],
    description: descriptionMap[kind],
    breadcrumbs: makeBreadcrumbs([
      { label: 'TreasureTrail', href: '/' },
      { label: `${kind} pages`, href: '/seo-preview' },
      { label: titleFromSlug(slug), href: `/${kind}/${slug}` },
    ]),
    stats: [
      kind === 'wanted'
        ? { label: 'Category', value: wantedContent?.categorySlug ?? 'wanted' }
        : kind === 'seller'
          ? { label: 'City', value: sellerContent ? `${titleFromSlug(sellerContent.citySlug)}, ${titleFromSlug(sellerContent.countySlug)}` : 'Unknown' }
          : { label: 'Host', value: eventContent?.host ?? 'Unknown' },
      kind === 'wanted'
        ? { label: 'Focus', value: wantedContent?.focus ?? 'Search intent' }
        : kind === 'seller'
          ? { label: 'Specialties', value: sellerContent?.categorySlugs.length ? sellerContent.categorySlugs.length.toString() : '0' }
          : { label: 'Schedule', value: eventContent?.schedule ?? 'TBD' },
      { label: 'Page type', value: 'Pattern route' },
    ],
    highlights: [
      kind === 'wanted'
        ? 'Wanted post content is sourced from a page catalog'
        : kind === 'seller'
          ? 'Seller storefront content is sourced from a page catalog'
          : 'Event content is sourced from a page catalog',
      kind === 'wanted'
        ? 'Match terms, location, and sibling wanted posts'
        : kind === 'seller'
          ? 'Surface specialties, featured items, and nearby events'
          : 'Surface schedule, venue, and connected category pages',
      'Good target for metadata and structured data',
    ],
    sections: [
      sectionFor(
        kind === 'wanted' ? 'Wanted details' : kind === 'seller' ? 'Seller profile' : 'Event details',
        kind === 'wanted'
          ? wantedContent?.summary ?? 'This page captures the wanted-post intent and points searchers toward matching local paths.'
          : kind === 'seller'
            ? sellerContent?.bio ?? 'This page introduces the storefront and what the seller tends to carry.'
            : eventContent?.summary ?? 'This page captures the event details and local discovery context.',
        kind === 'wanted'
          ? wantedContent?.searchBullets ?? ['Public URL is stable', 'Page shell is reusable', 'Fallback handling is explicit']
          : kind === 'seller'
            ? sellerContent?.featuredItems ?? ['Public URL is stable', 'Page shell is reusable', 'Fallback handling is explicit']
            : eventContent?.highlights ?? ['Public URL is stable', 'Page shell is reusable', 'Fallback handling is explicit'],
      ),
      sectionFor(
        kind === 'wanted' ? 'Search terms' : kind === 'seller' ? 'Featured inventory' : 'Event snapshot',
        kind === 'wanted'
          ? 'These are the words we expect searchers to use when landing on this wanted post.'
          : kind === 'seller'
            ? 'These are the categories and item types that define the storefront.'
            : 'These are the practical details a searcher would want before showing up.',
        kind === 'wanted'
          ? wantedContent?.searchBullets ?? ['collector lots', 'estate finds', 'vintage pieces']
          : kind === 'seller'
            ? sellerContent?.featuredItems ?? ['featured item one', 'featured item two']
            : eventContent
              ? [eventContent.venue, eventContent.schedule, eventContent.host]
              : ['venue', 'schedule', 'host'],
      ),
    ],
    relatedLinks: baseLinks(
      'Browse the page graph',
      kind === 'wanted'
        ? wantedRecord
          ? wantedInternalLinks(wantedRecord)
          : [
              { label: 'SEO preview', href: '/seo-preview', description: 'Inspect the shared shell.' },
              { label: 'Events', href: '/events', description: 'Browse the app experience.' },
            ]
        : kind === 'seller'
          ? sellerRecord
            ? sellerInternalLinks(sellerRecord)
            : [
                { label: 'SEO preview', href: '/seo-preview', description: 'Inspect the shared shell.' },
                { label: 'Events', href: '/events', description: 'Browse the app experience.' },
              ]
          : eventRecord
            ? eventInternalLinks(eventRecord)
            : [
                { label: 'SEO preview', href: '/seo-preview', description: 'Inspect the shared shell.' },
                { label: 'Events', href: '/events', description: 'Browse the app experience.' },
              ],
    ),
    faqs: [
      {
        question: kind === 'wanted' ? 'How do I use this wanted page?' : kind === 'seller' ? 'What does this storefront page show?' : 'What should I know before attending?',
        answer:
          kind === 'wanted'
            ? 'Use it to match search intent to likely local sources, then follow the county, city, and category links.'
            : kind === 'seller'
              ? 'Use it to understand what the seller specializes in, what they feature, and which events they connect to.'
              : 'Use it to check the venue, schedule, and connected category pages before you head out.',
      },
    ],
    primaryAction: { label: 'SEO preview', href: '/seo-preview' },
    secondaryAction: { label: 'Back to home', href: '/' },
  };
}

export function buildSeoPage(kind: SeoRouteKind, params: SeoRouteParams, context: SeoPageContext): PublicSeoPageProps {
  if (kind === 'county') {
    const county = findCounty(params.county);
    return county
      ? countyPage(county)
      : missingPage(
          'County not found',
          'The county route exists, but the requested county slug is not in the Central Valley catalog yet.',
          'Try Fresno County, Tulare County, Kings County, or Kern County.',
          context.canonicalPath,
        );
  }

  if (kind === 'city') {
    const county = findCounty(params.county);
    const city = findCity(params.county, params.city);
    return county && city
      ? cityPage(county, city)
      : missingPage(
          'City not found',
          'The city route exists, but the requested county or city slug is not in the catalog yet.',
          'Use one of the known Central Valley city paths under a supported county.',
          context.canonicalPath,
        );
  }

  if (kind === 'cityCategory') {
    const county = findCounty(params.county);
    const city = findCity(params.county, params.city);
    const category = findCategory(params.category);
    return county && city && category
      ? cityCategoryPage(county, city, category)
      : missingPage(
          'City category not found',
          'The city + category route exists, but one of the slugs is not recognized yet.',
          'Try a supported county, city, and category combination from the Central Valley list.',
          context.canonicalPath,
        );
  }

  if (kind === 'category') {
    const category = findCategory(params.category);
    return category
      ? categoryPage(category)
      : missingPage(
          'Category not found',
          'The category route exists, but the requested category slug is not in the SEO catalog yet.',
          'Try estate-sales, garage-sales, yard-sales, flea-markets, auctions, or collectibles.',
          context.canonicalPath,
        );
  }

  if (kind === 'wanted') {
    return publicPersonPage('wanted', params.slug ?? '');
  }

  if (kind === 'seller') {
    return publicPersonPage('seller', params.handle ?? '');
  }

  return publicPersonPage('event', params.slug ?? '');
}
