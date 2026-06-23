import { useEffect, useState, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, ChevronRight } from 'lucide-react';
import { fetchPostBySlug, categoryLabel, type BlogPost } from '../lib/blog';
import { MobileDetailPage } from '../components/ui/MobileDetailPage';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { MediaFallback } from '../components/ui/MediaFallback';
import { Markdown } from '../components/ui/Markdown';
import { publicWebUrl } from '../lib/apiBase';

const JSONLD_ID = 'blog-article-jsonld';

/**
 * BlogArticle — single article detail. Wrapped in MobileDetailPage for iOS
 * containment. Sets document.title + meta description and injects Article +
 * FAQPage JSON-LD so the page is rich-result eligible on Google. Server-side OG
 * injection (server/index.ts) handles social unfurls for crawlers that never
 * run our JS; this client-side meta keeps in-app/browser navigation correct.
 */
export default function BlogArticle({ onBack }: { onBack: () => void }) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchPostBySlug(slug ?? '')
      .then((p) => active && setPost(p))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!post) return;
    const url = publicWebUrl(`/blog/${post.slug}`);
    document.title = `${post.seo_title || post.title} | TreasureTrail`;
    setMeta('description', post.meta_description || post.excerpt || '');

    const graph: any[] = [
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        description: post.meta_description || post.excerpt || '',
        image: post.cover_image_url || undefined,
        datePublished: post.published_at || post.created_at,
        dateModified: post.updated_at,
        author: { '@type': 'Organization', name: post.author || 'TreasureTrail' },
        publisher: { '@type': 'Organization', name: 'TreasureTrail' },
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        articleSection: categoryLabel(post.category),
      },
    ];
    if (post.faq.length) {
      graph.push({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: post.faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      });
    }
    let el = document.getElementById(JSONLD_ID) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement('script');
      el.id = JSONLD_ID;
      el.type = 'application/ld+json';
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(graph.length === 1 ? graph[0] : graph);

    return () => {
      document.getElementById(JSONLD_ID)?.remove();
    };
  }, [post]);

  if (loading) {
    return (
      <MobileDetailPage>
        <ArticleHeader onBack={onBack} />
        <p style={st.center}>Loading…</p>
      </MobileDetailPage>
    );
  }

  if (!post) {
    return (
      <MobileDetailPage>
        <ArticleHeader onBack={onBack} />
        <div style={st.missing}>
          <span style={st.missingTitle}>Article not found</span>
          <button style={st.linkBtn} onClick={() => navigate('/blog')}>
            Browse all guides
          </button>
        </div>
      </MobileDetailPage>
    );
  }

  return (
    <MobileDetailPage>
      <ArticleHeader onBack={onBack} />
      <article style={st.article}>
        <button style={st.catLink} onClick={() => navigate(`/blog/category/${post.category}`)}>
          {categoryLabel(post.category)}
        </button>
        <h1 style={st.title}>{post.title}</h1>
        <div style={st.byline}>
          <span>{post.author}</span>
          {post.read_minutes ? (
            <span style={st.bylineMeta}>
              <Clock size={12} /> {post.read_minutes} min read
            </span>
          ) : null}
          {(post.city || post.county) ? (
            <span style={st.bylineMeta}>{[post.city, post.county].filter(Boolean).join(', ')}</span>
          ) : null}
        </div>

        {(post.cover_image_url || post.cover_thumb_url) ? (
          <div style={st.cover}>
            <ImageWithFade
              src={post.cover_image_url ?? post.cover_thumb_url ?? undefined}
              fallbackSrc={post.cover_thumb_url ?? undefined}
              alt={post.title}
              fallback={<MediaFallback kind="event" seed={post.slug} />}
            />
          </div>
        ) : null}

        <div style={st.body}>
          <Markdown source={post.body_md} />
        </div>

        {post.faq.length ? (
          <section style={st.faqSection}>
            <h2 style={st.faqHeading}>Frequently asked questions</h2>
            {post.faq.map((f, i) => (
              <details key={i} style={st.faqItem}>
                <summary style={st.faqQ}>{f.q}</summary>
                <p style={st.faqA}>{f.a}</p>
              </details>
            ))}
          </section>
        ) : null}

        <div style={st.ctaCard}>
          <span style={st.ctaTitle}>Find treasure near you</span>
          <span style={st.ctaSub}>Browse live estate sales, flea markets, and events on TreasureTrail.</span>
          <button style={st.ctaBtn} onClick={() => navigate('/live')}>
            See events <ChevronRight size={16} />
          </button>
        </div>
      </article>
    </MobileDetailPage>
  );
}

function ArticleHeader({ onBack }: { onBack: () => void }) {
  return (
    <header style={st.header}>
      <button onClick={onBack} style={st.backBtn} aria-label="Back">
        <ArrowLeft size={20} />
      </button>
      <span style={st.headerTitle}>Article</span>
      <div style={{ width: 36 }} />
    </header>
  );
}

function setMeta(name: string, content: string) {
  let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

const st: Record<string, CSSProperties> = {
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-4)',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--space-3))',
    borderBottom: '1px solid var(--color-neutral-100)',
    position: 'sticky', top: 0, background: 'var(--color-neutral-0)', zIndex: 2,
  },
  backBtn: {
    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', background: 'transparent', color: 'var(--color-neutral-700)', cursor: 'pointer',
  },
  headerTitle: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-900)' },
  center: { textAlign: 'center', padding: 'var(--space-8) 0', color: 'var(--color-neutral-500)' },
  missing: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-8) var(--space-4)' },
  missingTitle: { fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-700)' },
  linkBtn: { border: 'none', background: 'transparent', color: 'var(--color-primary-600, #c2410c)', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer' },
  article: { padding: 'var(--space-4)', maxWidth: 720, margin: '0 auto', width: '100%' },
  catLink: {
    alignSelf: 'flex-start', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
    fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-primary-600, #c2410c)', textTransform: 'uppercase', letterSpacing: '0.04em',
    marginBottom: 'var(--space-2)',
  },
  title: { fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', lineHeight: 1.2, margin: '0 0 var(--space-2)' },
  byline: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)', marginBottom: 'var(--space-4)' },
  bylineMeta: { display: 'inline-flex', alignItems: 'center', gap: 4 },
  cover: { width: '100%', aspectRatio: '16 / 9', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--color-neutral-100)', marginBottom: 'var(--space-5)' },
  body: { marginBottom: 'var(--space-6)' },
  faqSection: { borderTop: '1px solid var(--color-neutral-100)', paddingTop: 'var(--space-5)', marginBottom: 'var(--space-6)' },
  faqHeading: { fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', margin: '0 0 var(--space-3)' },
  faqItem: { borderBottom: '1px solid var(--color-neutral-100)', padding: 'var(--space-3) 0' },
  faqQ: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)', cursor: 'pointer' },
  faqA: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-600)', lineHeight: 1.6, margin: 'var(--space-2) 0 0' },
  ctaCard: {
    display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', alignItems: 'flex-start',
    padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)',
    background: 'var(--color-neutral-50)', border: '1px solid var(--color-neutral-100)',
  },
  ctaTitle: { fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  ctaSub: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-600)', lineHeight: 1.5 },
  ctaBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 'var(--space-2)',
    padding: '10px 16px', borderRadius: 'var(--radius-md)', border: 'none',
    background: 'var(--color-primary-600, #c2410c)', color: '#fff',
    fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer',
  },
};
