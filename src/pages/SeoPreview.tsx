import PublicSeoPage from '../components/seo/PublicSeoPage';

export default function SeoPreview() {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://treasuretrail-hunt.com';
  return (
    <PublicSeoPage
      metadata={{
        title: 'SEO Foundation Preview',
        description: 'A reusable public page shell for county, city, category, event, wanted, and seller landing pages.',
        canonicalPath: '/seo-preview',
        robots: 'noindex, nofollow',
        ogType: 'website',
        siteName: 'TreasureTrail',
      }}
      structuredData={[
        {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'SEO Foundation Preview',
          description: 'A reusable public page shell for county, city, category, event, wanted, and seller landing pages.',
          url: `${origin}/seo-preview`,
          inLanguage: 'en-US',
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'TreasureTrail', item: `${origin}/` },
            { '@type': 'ListItem', position: 2, name: 'SEO Preview', item: `${origin}/seo-preview` },
          ],
        },
      ]}
      eyebrow="SEO Foundation Preview"
      title="Central Valley Treasure Trail"
      subtitle="A reusable public page shell for county, city, category, event, wanted, and seller landing pages."
      description="This preview shows the layout pattern that will power the crawlable SEO pages. It is intentionally content-driven so route-specific data, metadata, and structured data can all use the same shell."
      locationLabel="Preview mode"
      breadcrumbs={[
        { label: 'TreasureTrail', href: '/' },
        { label: 'SEO Preview', href: '/seo-preview' },
      ]}
      stats={[
        { label: 'Page model', value: 'Reusable shell' },
        { label: 'Target use', value: 'Public landing pages' },
        { label: 'Layout style', value: 'Full-width bands' },
      ]}
      highlights={[
        'Breadcrumbs, intro copy, and supporting context in one layout',
        'Related links and FAQ blocks for crawl depth',
        'Room for schema and metadata on every route',
      ]}
      sections={[
        {
          title: 'Shell layout',
          body: 'The shell renders a public page header, supporting summary, structured content sections, and connected link blocks. It avoids app-only navigation chrome and keeps the content readable for both search engines and visitors.',
          bullets: [
            'Clean hero with title, description, and action links',
            'Reusable sections for location, category, or seller content',
            'No dependency on authenticated app state',
          ],
        },
        {
          title: 'Content slots',
          body: 'Each SEO page can provide page-specific copy, related pages, and FAQ items without changing the outer shell. That keeps city, county, category, wanted, and seller pages on the same structural footing.',
          bullets: [
            'Page data comes from route-driven props',
            'Sections stay modular so one template can serve many page types',
            'The shell is ready for metadata and JSON-LD integration',
          ],
        },
      ]}
      relatedLinks={[
        { label: 'Fresno County landing page', href: '/ca/fresno-county', description: 'Central Valley county page pattern.' },
        { label: 'Estate sales category', href: '/category/estate-sales', description: 'Category page template target.' },
        { label: 'Seller storefront example', href: '/seller/johns-vintage-toys', description: 'Public seller page pattern.' },
      ]}
      faqs={[
        {
          question: 'What uses this shell?',
          answer: 'County pages, city pages, city plus category pages, seller storefronts, wanted posts, and public event pages all share the same structure.',
        },
        {
          question: 'Why build the shell before the routes?',
          answer: 'A stable shell lets route, metadata, and sitemap work focus on data and URLs instead of page structure.',
        },
      ]}
      primaryAction={{ label: 'Back to app', href: '/' }}
      secondaryAction={{ label: 'Open events', href: '/events' }}
    />
  );
}
