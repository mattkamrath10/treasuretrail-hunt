import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Globe2, Link2, MapPin, Search, Star } from 'lucide-react';
import SeoHead, { type PublicSeoMetadata } from './SeoHead';
import SeoStructuredData, { type SeoStructuredDataNode } from './SeoStructuredData';

export type PublicSeoBreadcrumb = {
  label: string;
  href: string;
};

export type PublicSeoStat = {
  label: string;
  value: string;
};

export type PublicSeoLink = {
  label: string;
  href: string;
  description?: string;
};

export type PublicSeoFaq = {
  question: string;
  answer: string;
};

export type PublicSeoSection = {
  title: string;
  body: string;
  bullets?: string[];
  links?: PublicSeoLink[];
};

export type PublicSeoPageProps = {
  metadata?: PublicSeoMetadata | null;
  structuredData?: SeoStructuredDataNode[] | null;
  heroMedia?: {
    src: string;
    alt: string;
    caption?: string;
  } | null;
  eyebrow?: string;
  title: string;
  subtitle: string;
  description: string;
  locationLabel?: string;
  breadcrumbs?: PublicSeoBreadcrumb[];
  stats?: PublicSeoStat[];
  highlights?: string[];
  sections?: PublicSeoSection[];
  relatedLinks?: PublicSeoLink[];
  faqs?: PublicSeoFaq[];
  primaryAction?: {
    label: string;
    href: string;
  };
  secondaryAction?: {
    label: string;
    href: string;
  };
};

function SectionTitle({ icon, title, caption }: { icon: ReactNode; title: string; caption?: string }) {
  return (
    <div style={styles.sectionHeading}>
      <div style={styles.sectionIcon}>{icon}</div>
      <div>
        <h2 style={styles.sectionTitle}>{title}</h2>
        {caption ? <p style={styles.sectionCaption}>{caption}</p> : null}
      </div>
    </div>
  );
}

function ArrowLink({ href, label }: { href: string; label: string }) {
  return (
    <Link to={href} style={styles.linkRow}>
      <span>{label}</span>
      <ChevronRight size={16} />
    </Link>
  );
}

export default function PublicSeoPage({
  metadata,
  structuredData,
  heroMedia,
  eyebrow,
  title,
  subtitle,
  description,
  locationLabel,
  breadcrumbs = [],
  stats = [],
  highlights = [],
  sections = [],
  relatedLinks = [],
  faqs = [],
  primaryAction,
  secondaryAction,
}: PublicSeoPageProps) {
  return (
    <main style={styles.page}>
      <SeoHead metadata={metadata} />
      <SeoStructuredData nodes={structuredData} />
      <section style={styles.hero}>
        <div style={styles.heroGrid}>
          <div style={styles.heroCopy}>
            <div style={styles.breadcrumbs} aria-label="Breadcrumb">
              {breadcrumbs.length ? (
                breadcrumbs.map((crumb, index) => (
                  <span key={crumb.href} style={styles.crumb}>
                    <Link to={crumb.href} style={styles.crumbLink}>
                      {crumb.label}
                    </Link>
                    {index < breadcrumbs.length - 1 ? <ChevronRight size={12} style={styles.crumbIcon} /> : null}
                  </span>
                ))
              ) : (
                <span style={styles.crumb}>
                  <span style={styles.crumbCurrent}>TreasureTrail</span>
                </span>
              )}
            </div>

            {eyebrow ? <p style={styles.eyebrow}>{eyebrow}</p> : null}
            <h1 style={styles.title}>{title}</h1>
            <p style={styles.subtitle}>{subtitle}</p>
            <p style={styles.description}>{description}</p>

            <div style={styles.actionRow}>
              {primaryAction ? (
                <Link to={primaryAction.href} style={styles.primaryAction}>
                  <Search size={16} />
                  <span>{primaryAction.label}</span>
                </Link>
              ) : null}
              {secondaryAction ? (
                <Link to={secondaryAction.href} style={styles.secondaryAction}>
                  <Link2 size={16} />
                  <span>{secondaryAction.label}</span>
                </Link>
              ) : null}
            </div>
          </div>

          <aside style={styles.heroAside} aria-label="Page summary">
            {heroMedia ? (
              <figure style={styles.heroMediaFigure}>
                <img src={heroMedia.src} alt={heroMedia.alt} style={styles.heroMediaImage} />
                {heroMedia.caption ? <figcaption style={styles.heroMediaCaption}>{heroMedia.caption}</figcaption> : null}
              </figure>
            ) : null}

            <div style={styles.summaryHeader}>
              <Globe2 size={16} />
              <span>Overview</span>
            </div>

            {locationLabel ? (
              <div style={styles.locationRow}>
                <MapPin size={16} />
                <span>{locationLabel}</span>
              </div>
            ) : null}

            {stats.length ? (
              <dl style={styles.stats}>
                {stats.map((stat) => (
                  <div key={stat.label} style={styles.statItem}>
                    <dt style={styles.statLabel}>{stat.label}</dt>
                    <dd style={styles.statValue}>{stat.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {highlights.length ? (
              <div style={styles.highlights}>
                {highlights.map((item) => (
                  <div key={item} style={styles.highlightRow}>
                    <Star size={14} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </aside>
        </div>
      </section>

      <section style={styles.band}>
        <div style={styles.bandInner}>
          {sections.length ? (
            <div style={styles.sectionStack}>
              {sections.map((section) => (
                <article key={section.title} style={styles.sectionBlock}>
                  <SectionTitle
                    icon={<Search size={16} />}
                    title={section.title}
                    caption="Local details and supporting context"
                  />
                  <p style={styles.sectionBody}>{section.body}</p>
                  {section.bullets?.length ? (
                    <ul style={styles.bullets}>
                      {section.bullets.map((bullet) => (
                        <li key={bullet} style={styles.bulletItem}>
                          <span style={styles.bulletDot} />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {section.links?.length ? (
                    <div style={styles.inlineLinkList}>
                      {section.links.map((link) => (
                        <div key={link.href} style={styles.inlineLinkItem}>
                          <ArrowLink href={link.href} label={link.label} />
                          {link.description ? <p style={styles.linkDescription}>{link.description}</p> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}

          {relatedLinks.length ? (
            <section style={styles.sectionBlock}>
              <SectionTitle
                icon={<Link2 size={16} />}
                title="Related Pages"
                caption="Keep the crawl path tight and connected"
              />
              <div style={styles.linkList}>
                {relatedLinks.map((link) => (
                  <div key={link.href} style={styles.linkItem}>
                    <ArrowLink href={link.href} label={link.label} />
                    {link.description ? <p style={styles.linkDescription}>{link.description}</p> : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {faqs.length ? (
            <section style={styles.sectionBlock}>
              <SectionTitle
                icon={<Star size={16} />}
                title="FAQ"
                caption="Helpful answers for searchers"
              />
              <div style={styles.faqList}>
                {faqs.map((faq) => (
                  <details key={faq.question} style={styles.faqItem}>
                    <summary style={styles.faqQuestion}>{faq.question}</summary>
                    <p style={styles.faqAnswer}>{faq.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100%',
    background:
      'linear-gradient(180deg, rgba(234,179,8,0.08) 0%, rgba(20,184,166,0.04) 36%, rgba(249,115,22,0.04) 100%)',
    color: 'var(--color-neutral-900)',
  },
  hero: {
    padding: 'clamp(20px, 4vw, 40px) clamp(16px, 4vw, 32px) 0',
  },
  heroGrid: {
    maxWidth: '1120px',
    margin: '0 auto',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.6fr) minmax(280px, 0.8fr)',
    gap: '24px',
    alignItems: 'stretch',
  },
  heroCopy: {
    padding: '28px 0 36px',
  },
  breadcrumbs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    alignItems: 'center',
    marginBottom: '14px',
    color: 'var(--color-neutral-600)',
    fontSize: 'var(--font-size-sm)',
  },
  crumb: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  },
  crumbLink: {
    color: 'var(--color-neutral-600)',
  },
  crumbCurrent: {
    color: 'var(--color-neutral-700)',
    fontWeight: 'var(--font-weight-medium)',
  },
  crumbIcon: {
    color: 'var(--color-neutral-400)',
  },
  eyebrow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '10px',
    color: 'var(--color-primary-700)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    textTransform: 'uppercase',
    letterSpacing: '0',
  },
  title: {
    fontSize: 'clamp(2rem, 4vw, 3.5rem)',
    lineHeight: '1.05',
    letterSpacing: '0',
    marginBottom: '14px',
    maxWidth: '12ch',
  },
  subtitle: {
    fontSize: 'clamp(1.05rem, 2vw, 1.3rem)',
    lineHeight: '1.45',
    color: 'var(--color-neutral-800)',
    maxWidth: '58ch',
    marginBottom: '14px',
  },
  description: {
    color: 'var(--color-neutral-700)',
    maxWidth: '62ch',
    marginBottom: '22px',
  },
  actionRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
  },
  primaryAction: {
    minHeight: '44px',
    padding: '0 16px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--color-neutral-900)',
    color: 'var(--color-neutral-0)',
    fontWeight: 'var(--font-weight-semibold)',
  },
  secondaryAction: {
    minHeight: '44px',
    padding: '0 16px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    borderRadius: 'var(--radius-md)',
    background: 'rgba(255,255,255,0.72)',
    border: '1px solid var(--color-neutral-200)',
    color: 'var(--color-neutral-900)',
    fontWeight: 'var(--font-weight-semibold)',
  },
  heroAside: {
    padding: '20px',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid rgba(17,24,39,0.08)',
    background: 'rgba(255,255,255,0.8)',
    boxShadow: 'var(--shadow-md)',
    alignSelf: 'start',
  },
  heroMediaFigure: {
    display: 'grid',
    gap: '10px',
    marginBottom: '16px',
  },
  heroMediaImage: {
    width: '100%',
    aspectRatio: '4 / 3',
    objectFit: 'cover',
    borderRadius: 'var(--radius-md)',
    background: 'var(--color-neutral-100)',
  },
  heroMediaCaption: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  summaryHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    marginBottom: '14px',
  },
  locationRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: 'var(--color-neutral-700)',
    marginBottom: '16px',
  },
  stats: {
    display: 'grid',
    gap: '12px',
    marginBottom: '16px',
  },
  statItem: {
    padding: '12px 0',
    borderTop: '1px solid var(--color-neutral-100)',
  },
  statLabel: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-600)',
    marginBottom: '4px',
  },
  statValue: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },
  highlights: {
    display: 'grid',
    gap: '10px',
  },
  highlightRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: 'var(--color-neutral-800)',
  },
  band: {
    padding: '0 clamp(16px, 4vw, 32px) 40px',
  },
  bandInner: {
    maxWidth: '1120px',
    margin: '0 auto',
    display: 'grid',
    gap: '20px',
  },
  sectionStack: {
    display: 'grid',
    gap: '18px',
  },
  sectionBlock: {
    paddingTop: '20px',
    borderTop: '1px solid rgba(17,24,39,0.1)',
  },
  sectionHeading: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    marginBottom: '12px',
  },
  sectionIcon: {
    width: '34px',
    height: '34px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(234,179,8,0.14)',
    color: 'var(--color-primary-700)',
    flexShrink: 0,
  },
  sectionTitle: {
    fontSize: 'var(--font-size-xl)',
    lineHeight: '1.2',
    marginBottom: '4px',
  },
  sectionCaption: {
    color: 'var(--color-neutral-600)',
    fontSize: 'var(--font-size-sm)',
  },
  sectionBody: {
    maxWidth: '70ch',
    color: 'var(--color-neutral-700)',
  },
  bullets: {
    listStyle: 'none',
    display: 'grid',
    gap: '10px',
    marginTop: '14px',
  },
  bulletItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    color: 'var(--color-neutral-700)',
  },
  bulletDot: {
    width: '6px',
    height: '6px',
    borderRadius: '9999px',
    background: 'var(--color-primary-500)',
    marginTop: '9px',
    flexShrink: 0,
  },
  linkList: {
    display: 'grid',
    gap: '14px',
  },
  inlineLinkList: {
    display: 'grid',
    gap: '12px',
    marginTop: '14px',
  },
  inlineLinkItem: {
    padding: '12px 0',
    borderTop: '1px solid var(--color-neutral-100)',
  },
  linkItem: {
    padding: '14px 0',
    borderTop: '1px solid var(--color-neutral-100)',
  },
  linkRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    color: 'var(--color-neutral-900)',
    fontWeight: 'var(--font-weight-semibold)',
  },
  linkDescription: {
    marginTop: '6px',
    color: 'var(--color-neutral-600)',
    maxWidth: '58ch',
  },
  faqList: {
    display: 'grid',
    gap: '12px',
  },
  faqItem: {
    padding: '14px 0',
    borderTop: '1px solid var(--color-neutral-100)',
  },
  faqQuestion: {
    cursor: 'pointer',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },
  faqAnswer: {
    marginTop: '8px',
    color: 'var(--color-neutral-700)',
    maxWidth: '68ch',
  },
};
