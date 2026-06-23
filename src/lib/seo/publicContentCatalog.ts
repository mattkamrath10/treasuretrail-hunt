function titleFromSlug(raw: string): string {
  return raw
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export type WantedSeoContent = {
  slug: string;
  title: string;
  summary: string;
  focus: string;
  countySlug: string;
  citySlug: string;
  categorySlug: string;
  searchBullets: string[];
};

export type SellerSeoContent = {
  slug: string;
  displayName: string;
  headline: string;
  bio: string;
  countySlug: string;
  citySlug: string;
  categorySlugs: string[];
  featuredItems: string[];
  trustNotes: string[];
};

export type EventSeoContent = {
  slug: string;
  title: string;
  summary: string;
  countySlug: string;
  citySlug: string;
  categorySlugs: string[];
  host: string;
  venue: string;
  startDate: string;
  schedule: string;
  highlights: string[];
};

const WANTED_CONTENT: WantedSeoContent[] = [
  {
    slug: 'hot-wheels',
    title: 'Wanted Hot Wheels',
    summary: 'Looking for original Hot Wheels, Redline-era castings, and clean loose lots from estate sales and swap meets.',
    focus: 'Classic toy car collections and carded finds',
    countySlug: 'fresno-county',
    citySlug: 'fresno',
    categorySlug: 'hot-wheels',
    searchBullets: ['Redline castings', 'Blister cards', 'Loose lots', 'Display sets'],
  },
  {
    slug: 'vintage-toys',
    title: 'Wanted Vintage Toys',
    summary: 'A broad wanted post for boxed toys, die-cast sets, action figures, and nostalgic childhood collections.',
    focus: 'General vintage toy sourcing',
    countySlug: 'fresno-county',
    citySlug: 'clovis',
    categorySlug: 'vintage-toys',
    searchBullets: ['Boxed toys', 'NIB pieces', 'Toy lots', 'Collector carryouts'],
  },
  {
    slug: 'pyrex',
    title: 'Wanted Pyrex',
    summary: 'Searching for Pyrex bowls, bakeware, and hard-to-find patterns from kitchen estates and garage sales.',
    focus: 'Kitchenware and pattern hunting',
    countySlug: 'tulare-county',
    citySlug: 'visalia',
    categorySlug: 'collectibles',
    searchBullets: ['Rare patterns', 'Complete sets', 'Mixing bowls', 'Vintage kitchen lots'],
  },
  {
    slug: 'cast-iron',
    title: 'Wanted Cast Iron',
    summary: 'Looking for cast iron pans, Dutch ovens, and restored cookware with good seasoning and solid handles.',
    focus: 'Cookware and heirloom kitchen tools',
    countySlug: 'kings-county',
    citySlug: 'hanford',
    categorySlug: 'antiques',
    searchBullets: ['Skillets', 'Dutch ovens', 'Restoration projects', 'Estate kitchen finds'],
  },
  {
    slug: 'antique-furniture',
    title: 'Wanted Antique Furniture',
    summary: 'Seeking dressers, tables, chairs, and storage pieces with strong lines and honest wear.',
    focus: 'Furniture with local pickup potential',
    countySlug: 'kern-county',
    citySlug: 'bakersfield',
    categorySlug: 'antiques',
    searchBullets: ['Dressers', 'Dining tables', 'Cabinets', 'Statement pieces'],
  },
];

const SELLER_CONTENT: SellerSeoContent[] = [
  {
    slug: 'johns-vintage-toys',
    displayName: "John's Vintage Toys",
    headline: 'Vintage toy storefront from Fresno',
    bio: 'Collector-run storefront focused on vintage toy lots, display pieces, and clean local pickup inventory.',
    countySlug: 'fresno-county',
    citySlug: 'fresno',
    categorySlugs: ['vintage-toys', 'collectibles'],
    featuredItems: ['Hot Wheels assortments', 'Loose vintage toy lots', 'Display case favorites'],
    trustNotes: ['Local pickup in Fresno', 'Curated toy inventory', 'Regular estate-sale sourcing'],
  },
  {
    slug: 'central-valley-picker',
    displayName: 'Central Valley Picker',
    headline: 'Antiques and collectibles seller in Visalia',
    bio: 'A pickup-focused seller with a mix of antiques, collectibles, and market-ready estate finds.',
    countySlug: 'tulare-county',
    citySlug: 'visalia',
    categorySlugs: ['antiques', 'collectibles'],
    featuredItems: ['Small furniture', 'Glassware', 'Mid-century decor'],
    trustNotes: ['Meets by appointment', 'Revisits estate-sale inventory quickly', 'Strong local pickup footprint'],
  },
  {
    slug: 'fresno-collectibles',
    displayName: 'Fresno Collectibles',
    headline: 'Collectibles storefront serving North Fresno and Clovis',
    bio: 'Focused on collectible lots, toy carryouts, and vintage resale pieces with broad Central Valley appeal.',
    countySlug: 'fresno-county',
    citySlug: 'clovis',
    categorySlugs: ['collectibles', 'antiques'],
    featuredItems: ['Vintage advertising', 'Collectible tins', 'Resale-ready bundles'],
    trustNotes: ['Fast response time', 'Handles bundled lots well', 'Good fit for treasure hunters'],
  },
];

const EVENT_CONTENT: EventSeoContent[] = [
  {
    slug: 'fresno-estate-sale-weekend',
    title: 'Fresno Estate Sale Weekend',
    summary: 'A Fresno weekend sale with estate contents, collectible pull-outs, and toy lots worth a slow walkthrough.',
    countySlug: 'fresno-county',
    citySlug: 'fresno',
    categorySlugs: ['estate-sales', 'collectibles'],
    host: 'Valley Estate Routes',
    venue: 'Fresno, CA',
    startDate: '2026-06-27T08:00:00-07:00',
    schedule: 'Saturday and Sunday, 8:00 AM to 2:00 PM',
    highlights: ['Early access for collectors', 'Toy and kitchen lots', 'Local pickup welcome'],
  },
  {
    slug: 'bakersfield-garage-sale-fair',
    title: 'Bakersfield Garage Sale Fair',
    summary: 'A curated garage-sale cluster in Bakersfield with family cleanouts, tools, and everyday resale stock.',
    countySlug: 'kern-county',
    citySlug: 'bakersfield',
    categorySlugs: ['garage-sales', 'yard-sales'],
    host: 'South Valley Sale Club',
    venue: 'Bakersfield, CA',
    startDate: '2026-07-03T09:00:00-07:00',
    schedule: 'Friday, 9:00 AM to 1:00 PM',
    highlights: ['Multi-house route', 'Tool tables', 'Kid gear and home goods'],
  },
  {
    slug: 'visalia-auction-market',
    title: 'Visalia Auction Market',
    summary: 'An auction-style event in Visalia with estate lots, antique pieces, and crossover collectible inventory.',
    countySlug: 'tulare-county',
    citySlug: 'visalia',
    categorySlugs: ['auctions', 'estate-sales'],
    host: 'Visalia Market Crew',
    venue: 'Visalia, CA',
    startDate: '2026-07-05T10:00:00-07:00',
    schedule: 'Sunday, 10:00 AM to 3:00 PM',
    highlights: ['Bidding and buy-now lots', 'Antique furniture', 'Collector-friendly categories'],
  },
  {
    slug: 'kern-county-swap-meet',
    title: 'Kern County Swap Meet',
    summary: 'A Kern County swap meet built around collectibles, casual trading, and broad local discovery.',
    countySlug: 'kern-county',
    citySlug: 'bakersfield',
    categorySlugs: ['swap-meets', 'collectibles'],
    host: 'Kern County Traders',
    venue: 'Bakersfield, CA',
    startDate: '2026-07-12T07:30:00-07:00',
    schedule: 'Sunday, 7:30 AM to 1:30 PM',
    highlights: ['Vendor tables', 'Swap-friendly inventory', 'Neighboring city traffic'],
  },
];

function findBySlug<T extends { slug: string }>(items: T[], raw?: string): T | null {
  if (!raw) return null;
  const slug = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return items.find((item) => item.slug === slug) ?? null;
}

export function findWantedSeoContent(raw?: string): WantedSeoContent | null {
  return findBySlug(WANTED_CONTENT, raw);
}

export function findWantedSeoContentByTerms(terms: string[], limit = 4): WantedSeoContent[] {
  const normalizedTerms = terms.map((term) => term.trim().toLowerCase()).filter(Boolean);
  if (!normalizedTerms.length) return [];

  return WANTED_CONTENT.filter((item) => {
    const haystack = [
      item.slug,
      item.title,
      item.summary,
      item.focus,
      item.categorySlug,
      ...item.searchBullets,
    ]
      .join(' ')
      .toLowerCase();
    return normalizedTerms.some((term) => haystack.includes(term));
  }).slice(0, limit);
}

export function getAllWantedSeoContent(): WantedSeoContent[] {
  return [...WANTED_CONTENT];
}

export function findSellerSeoContent(raw?: string): SellerSeoContent | null {
  return findBySlug(SELLER_CONTENT, raw);
}

export function getAllSellerSeoContent(): SellerSeoContent[] {
  return [...SELLER_CONTENT];
}

export function findEventSeoContent(raw?: string): EventSeoContent | null {
  return findBySlug(EVENT_CONTENT, raw);
}

export function getAllEventSeoContent(): EventSeoContent[] {
  return [...EVENT_CONTENT];
}

export function getWantedSeoContent(raw: string): WantedSeoContent {
  return (
    findWantedSeoContent(raw) ?? {
      slug: raw,
      title: `Wanted ${titleFromSlug(raw)}`,
      summary: `Public wanted-post content for ${titleFromSlug(raw)}.`,
      focus: 'Placeholder wanted post',
      countySlug: 'fresno-county',
      citySlug: 'fresno',
      categorySlug: 'collectibles',
      searchBullets: ['Collector lots', 'Estate finds', 'Vintage pieces'],
    }
  );
}

export function getSellerSeoContent(raw: string): SellerSeoContent {
  return (
    findSellerSeoContent(raw) ?? {
      slug: raw,
      displayName: titleFromSlug(raw),
      headline: 'Public seller storefront',
      bio: `Public storefront content for ${titleFromSlug(raw)}.`,
      countySlug: 'fresno-county',
      citySlug: 'fresno',
      categorySlugs: ['collectibles'],
      featuredItems: ['Featured item one', 'Featured item two'],
      trustNotes: ['Placeholder storefront details', 'Add seller biography next'],
    }
  );
}

export function getEventSeoContent(raw: string): EventSeoContent {
  return (
    findEventSeoContent(raw) ?? {
      slug: raw,
      title: titleFromSlug(raw),
      summary: `Public event content for ${titleFromSlug(raw)}.`,
      countySlug: 'fresno-county',
      citySlug: 'fresno',
      categorySlugs: ['estate-sales'],
      host: 'TreasureTrail',
      venue: 'Central Valley',
      startDate: new Date().toISOString(),
      schedule: 'Time to be announced',
      highlights: ['Placeholder event details', 'Add event description next'],
    }
  );
}
