import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Clock } from 'lucide-react';
import {
  fetchPublishedPosts,
  BLOG_CATEGORIES,
  categoryLabel,
  type BlogPost,
} from '../lib/blog';
import { PageScroll } from '../components/ui/PageScroll';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { MediaFallback } from '../components/ui/MediaFallback';

/**
 * Blog — the public articles index. SEO landing surface that also lives inside
 * the native app. Lists published posts newest-first with category filter
 * chips. Renders an empty state (not an error) before the migration is applied.
 */
export default function Blog({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = 'Treasure Hunting Guides & Articles | TreasureTrail';
    let active = true;
    fetchPublishedPosts({ limit: 60 })
      .then((rows) => active && setPosts(rows))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <span style={st.headerTitle}>Guides & Articles</span>
        <div style={{ width: 36 }} />
      </header>

      <PageScroll style={{ background: 'var(--color-neutral-0)' }}>
        <div style={st.inner}>
          <div style={st.heroCard}>
            <BookOpen size={22} style={{ color: 'var(--color-primary-600, #c2410c)' }} />
            <h1 style={st.heroTitle}>Treasure Hunting Guides</h1>
            <p style={st.heroSub}>
              Tips, how-tos, and local guides for estate sales, flea markets,
              collectibles, and reselling across California's Central Valley.
            </p>
          </div>

          <div style={st.chips}>
            {BLOG_CATEGORIES.map((c) => (
              <button
                key={c.slug}
                style={st.chip}
                onClick={() => navigate(`/blog/category/${c.slug}`)}
              >
                {c.label}
              </button>
            ))}
          </div>

          {loading ? (
            <p style={st.empty}>Loading articles…</p>
          ) : posts.length === 0 ? (
            <div style={st.emptyCard}>
              <BookOpen size={28} style={{ color: 'var(--color-neutral-300)' }} />
              <span style={st.emptyTitle}>Articles coming soon</span>
              <span style={st.emptyDesc}>
                We're publishing fresh treasure-hunting guides. Check back shortly.
              </span>
            </div>
          ) : (
            <div style={st.list}>
              {posts.map((p) => (
                <ArticleCard key={p.id} post={p} onOpen={() => navigate(`/blog/${p.slug}`)} />
              ))}
            </div>
          )}
        </div>
      </PageScroll>
    </div>
  );
}

export function ArticleCard({ post, onOpen }: { post: BlogPost; onOpen: () => void }) {
  return (
    <button style={st.card} onClick={onOpen}>
      <div style={st.cardMedia}>
        <ImageWithFade
          src={post.cover_thumb_url ?? post.cover_image_url ?? undefined}
          fallbackSrc={post.cover_image_url ?? undefined}
          alt={post.title}
          fallback={<MediaFallback kind="event" seed={post.slug} />}
        />
      </div>
      <div style={st.cardBody}>
        <span style={st.cardCat}>{categoryLabel(post.category)}</span>
        <span style={st.cardTitle}>{post.title}</span>
        {post.excerpt ? <span style={st.cardExcerpt}>{post.excerpt}</span> : null}
        <span style={st.cardMeta}>
          {post.read_minutes ? (
            <>
              <Clock size={12} /> {post.read_minutes} min read
            </>
          ) : null}
        </span>
      </div>
    </button>
  );
}

const st: Record<string, CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--color-neutral-0)' },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-4)',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--space-3))',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  backBtn: {
    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', background: 'transparent', color: 'var(--color-neutral-700)', cursor: 'pointer',
  },
  headerTitle: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-900)' },
  inner: { padding: 'var(--space-4)', maxWidth: 720, margin: '0 auto', width: '100%' },
  heroCard: {
    display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
    padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)',
    background: 'var(--color-neutral-50)', border: '1px solid var(--color-neutral-100)',
    marginBottom: 'var(--space-4)',
  },
  heroTitle: { fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', margin: 0 },
  heroSub: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-600)', lineHeight: 1.6, margin: 0 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-5)' },
  chip: {
    padding: '6px 12px', borderRadius: 'var(--radius-full)',
    border: '1px solid var(--color-neutral-200)', background: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-700)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)',
    cursor: 'pointer',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' },
  card: {
    display: 'flex', gap: 'var(--space-3)', textAlign: 'left',
    padding: 'var(--space-2)', borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--color-neutral-100)', background: 'var(--color-neutral-0)',
    cursor: 'pointer', width: '100%',
  },
  cardMedia: {
    width: 104, height: 84, borderRadius: 'var(--radius-md)', overflow: 'hidden',
    flexShrink: 0, background: 'var(--color-neutral-100)',
  },
  cardBody: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1, padding: '2px 4px' },
  cardCat: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-primary-600, #c2410c)', textTransform: 'uppercase', letterSpacing: '0.04em' },
  cardTitle: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-900)', lineHeight: 1.3 },
  cardExcerpt: {
    fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-600)', lineHeight: 1.5,
    overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
  },
  cardMeta: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)', marginTop: 2 },
  empty: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-500)', textAlign: 'center', padding: 'var(--space-6) 0' },
  emptyCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)',
    textAlign: 'center', padding: 'var(--space-8) var(--space-4)',
  },
  emptyTitle: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-700)' },
  emptyDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-500)', maxWidth: 300, lineHeight: 1.5 },
};
