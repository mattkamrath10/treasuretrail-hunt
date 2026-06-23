# TreasureTrail Central Valley SEO Backlog

This backlog maps the 30-day growth plan to the current codebase gap. The current workspace is a client-side Vite SPA with no public `robots.txt`, no sitemap, no server-side metadata rewriting, and no route structure for city/county/category landing pages. The first job is to build the SEO foundation, then layer the Central Valley pages on top.

## Gap Map

### What already exists

- Core app shell and auth-gated client routes in `src/App.tsx` and `src/components/AppShell.tsx`
- Public marketplace-style concepts in the product surface: events, wanted posts, seller profiles, listings, public profiles
- Basic meta tags in `index.html`

### What is missing

- Crawlable public route framework for SEO landing pages
- Dynamic city, county, category, event, wanted, and seller storefront pages
- Schema.org / JSON-LD support for public pages
- Canonical URL, Open Graph, and page-specific metadata generation
- XML sitemap generation
- `robots.txt`
- Search Console / indexing workflow support
- Internal link graph for local SEO pages
- Analytics tracking for indexed page growth and organic entry points

## Days 1-3: SEO Foundation

### Ticket SEO-001: Public SEO page shell

Scope:
- Add a reusable public-page layout for search-facing pages.

Likely files:
- `src/components/seo/PublicSeoPage.tsx`
- `src/components/seo/PublicSeoSection.tsx`
- `src/lib/seo/pageTypes.ts`

Work:
- Render title, intro copy, breadcrumb, related links, FAQ, and structured data from one layout.
- Keep it separate from authenticated app screens.
- Define a reusable page-data contract for page type, location, category, slug, and related entities.

Done when:
- A public page can render entirely from the shared shell.
- The shell can be reused by city, county, category, event, wanted, and seller pages.

### Ticket SEO-002: Dynamic SEO routes

Scope:
- Add the public route patterns needed for search landing pages.

Likely files:
- `src/components/AppShell.tsx`
- `src/lib/seo/routes.ts`
- `src/lib/seo/slugs.ts`

Work:
- Add route handlers for `/ca/:county`, `/ca/:county/:city`, `/ca/:county/:city/:category`, `/category/:category`, `/wanted/:slug`, `/seller/:handle`, and `/event/:slug`.
- Define slug normalization and lookup rules.
- Decide how missing content should fail: 404, redirect, or fallback.

Done when:
- Public routes resolve on hard refresh and deep links.
- Invalid slugs render a clean missing-page state instead of a blank shell.

### Ticket SEO-003: Metadata contract

Scope:
- Add page-specific metadata generation for public SEO pages.

Likely files:
- `src/lib/seo/metadata.ts`
- `src/components/seo/SeoHead.tsx`
- `index.html`

Work:
- Create helpers for title, description, canonical URL, Open Graph, Twitter card, and robots directives.
- Define default metadata plus page-level overrides.
- Make the contract work for each public page type.

Done when:
- Every SEO page can derive deterministic metadata from its route data.
- Canonical URLs and social preview fields are set per page.

### Ticket SEO-004: Schema.org payloads

Scope:
- Add structured data for public SEO pages.

Likely files:
- `src/lib/seo/schema.ts`
- `src/components/seo/SeoJsonLd.tsx`

Work:
- Generate JSON-LD for `WebPage`, `BreadcrumbList`, `Event`, `LocalBusiness` or `Store`, and `Product` or `ItemList` where relevant.
- Keep each payload minimal and page-type aware.

Done when:
- Each indexable page emits one valid JSON-LD payload appropriate to its content type.

### Ticket SEO-005: Sitemap and robots

Scope:
- Add crawler-facing discovery files.

Likely files:
- `public/robots.txt`
- `public/sitemap.xml`
- `src/lib/seo/sitemap.ts`
- optional build or server script if generation is automated

Work:
- Generate sitemap entries for home, county pages, city pages, category pages, city+category pages, seller storefront pages, public event pages, and public wanted pages.
- Decide whether sitemap generation runs at build time or through a server endpoint.
- Add `robots.txt` with the sitemap reference.

Done when:
- `sitemap.xml` includes every indexable public page.
- `robots.txt` points to the sitemap and allows intended crawl paths.

### Days 1-3 Definition of Done

- Public SEO pages can be rendered and indexed
- Canonical metadata is available per route
- Schema.org markup is present
- A sitemap can be generated
- Robots access is defined

## Days 4-5: Central Valley Structure

### County pages

- Fresno County
- Tulare County
- Kings County
- Kern County

### City pages

- Fresno
- Clovis
- Madera
- Visalia
- Porterville
- Tulare
- Dinuba
- Hanford
- Lemoore
- Bakersfield
- Delano

### Implementation gaps

- County and city data tables or config do not yet exist.
- No routing or content templates exist for this geography.

### Acceptance

- Each county and city has an indexable landing page.
- City pages belong to the correct county.
- Each page has localized intro copy and internal links to related pages.

## Days 6-7: Category Page System

### Target categories

- Estate Sales
- Garage Sales
- Yard Sales
- Flea Markets
- Auctions
- Swap Meets
- Collectibles
- Vintage Toys
- Hot Wheels
- Antiques
- Reselling
- Treasure Hunting

### Implementation gaps

- No canonical category directory exists.
- No category-to-city or category-to-event linkage exists for SEO.

### Acceptance

- Each category has a stable slug and landing page.
- Category pages can surface related cities, events, and wanted posts.

## Days 8-10: City + Category Pages

### Implementation gaps

- No combinatorial route layer exists for city + category pages.
- No content model exists for localized landing copy.

### Work

- Generate city/category combinations for the Central Valley set.
- Reuse one template with route-driven content.
- Add rules to avoid thin or duplicate pages.

### Acceptance

- City+category pages render unique titles, descriptions, and intro copy.
- Pages link back to the city and category parents.

## Days 11-12: Google Indexing Setup

### Implementation gaps

- No Search Console workflow exists in the app or deployment process.
- No validation flow exists for sitemap, robots, or canonical URLs.

### Work

- Verify Search Console ownership.
- Submit sitemap.
- Confirm robots rules.
- Confirm canonical URL formatting.
- Establish a manual indexing checklist.

## Days 13-15: Internal Linking

### Implementation gaps

- Public surfaces are not yet linked as an SEO graph.

### Work

- Link event pages to city, category, and related event pages.
- Link wanted posts to matching listings and similar wanted posts.
- Link seller storefronts to listings and events.
- Link county pages to city pages.
- Link city pages to events and categories.

### Acceptance

- Every public page has at least one parent and one sibling link path.
- Important indexable pages are reachable in a few clicks.

### Current implementation note

- County, city, category, wanted, seller, and event SEO pages now generate internal links from `src/lib/seo/routeCatalog.json` and `src/lib/seo/publicRouteData.ts`.
- County pages link to city children.
- City pages link to the county parent, city/category combinations, and local events.
- Category pages link to example city/category combinations and matching wanted posts.
- Wanted, seller, and event pages link to their geography, category hubs, and sibling records.

## Days 16-18: Wanted Post SEO

### Implementation gaps

- Wanted posts are public in the app, but not optimized as SEO pages.

### Work

- Create indexable wanted URLs and slugs.
- Generate SEO titles and descriptions.
- Add FAQ sections.
- Add structured data.
- Add related listings modules.

### Example targets

- Wanted Hot Wheels
- Wanted Vintage Toys
- Wanted Pyrex
- Wanted Cast Iron
- Wanted Antique Furniture

### Current implementation note

- Wanted post pages now read from `src/lib/seo/publicContentCatalog.ts` for title, summary, focus, search bullets, and FAQ-style guidance.
- The wanted page route also keeps its related links connected to county, city, category, and sibling wanted pages.
- Wanted pages now hydrate live matching inventory from Supabase marketplace listings through `src/lib/seo/publicLiveData.ts`.

## Days 19-21: Seller SEO

### Implementation gaps

- Seller profiles exist conceptually, but public storefront SEO pages do not.

### Work

- Create seller storefront URLs.
- Generate seller metadata.
- Add seller bios.
- Add seller listing feeds.
- Add seller event feeds.

### Example targets

- `/seller/johns-vintage-toys`
- `/seller/central-valley-picker`
- `/seller/fresno-collectibles`

### Current implementation note

- Seller storefront pages now read from `src/lib/seo/publicContentCatalog.ts` for storefront name, headline, bio, featured items, and trust notes.
- Seller pages also point to the local city page, matching category hubs, and connected event pages.
- Seller pages now hydrate live marketplace listings from Supabase through `src/lib/seo/publicLiveData.ts`.
- Marketplace listings now have a crawlable public detail route at `/listing/:id`.

### Event content note

- Event pages now read from `src/lib/seo/publicContentCatalog.ts` for title, summary, schedule, venue, host, and highlight copy.
- Event schema now includes richer event details and related event links from the catalog.
- Event pages now hydrate live event records from Supabase through `src/lib/seo/publicLiveData.ts`.

## Days 22-24: Cornerstone Content

### Work

- Publish 10 high-quality local SEO articles.
- Link each article into the city, category, and seller ecosystem.

### Articles

- Best Estate Sales in the Central Valley
- How to Find Estate Sales Near You
- Beginner's Guide to Garage Sale Flipping
- Treasure Hunting in California
- Best Flea Markets in the Central Valley
- How to Host a Successful Estate Sale
- Hot Wheels Collecting Guide
- Vintage Toy Collecting Guide
- Reselling for Beginners
- Antique Buying Guide

## Days 25-27: Event Content Automation

### Implementation gaps

- Event summary and metadata generation are only partially present.

### Work

- Generate event summaries.
- Generate SEO titles and meta descriptions.
- Generate Open Graph tags.
- Generate event schema.

## Days 28-29: Analytics Dashboard

### Implementation gaps

- No dashboard currently tracks organic SEO progress.

### Work

- Track indexed pages.
- Track city, county, event, seller, and wanted traffic.
- Track signups.
- Track host conversions.

## Day 30: Review

### Review items

- Indexed pages
- Impressions
- Clicks
- Event traffic
- Seller traffic
- Wanted post traffic
- Signup growth
- Host growth
- Phase 2 expansion plan

## Phase 1 Delivery Order

1. Add public SEO route infrastructure
2. Add metadata and schema generation
3. Add sitemap and robots support
4. Add county and city pages
5. Add category and city+category pages
6. Add wanted and seller SEO pages
7. Add internal linking
8. Add content and analytics
