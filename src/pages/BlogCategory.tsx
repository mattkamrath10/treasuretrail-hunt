import { useEffect, useState, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { fetchPublishedPosts, getCategory, type BlogPost } from '../lib/blog';
import { PageScroll } from '../components/ui/PageScroll';
import { ArticleCard } from './Blog';

/**
 * BlogCategory — a single category index (e.g. /blog/category/estate-sales).
 * Same list UI as Blog, filtered to one category. Empty state, never an error,
 * before the migration runs or when a category has no published posts yet.
 */
export default function BlogCategory({ onBack }: { onBack: () => void }) {
  const { cat } = useParams<{ cat: string }>();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const category = cat ? getCategory(cat) : undefined;

  useEffect(() => {
    const label = category?.label ?? 'Articles';
    document.title = `${label} Guides | TreasureTrail`;
    let active = true;
    setLoading(true);
    fetchPublishedPosts({ category: cat, limit: 60 })
      .then((rows) => active && setPosts(rows))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [cat, category]);

  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <span style={st.headerTitle}>{category?.label ?? 'Articles'}</span>
        <div style={{ width: 36 }} />
      </header>

      <PageScroll style={{ background: 'var(--color-neutral-0)' }}>
        <div style={st.inner}>
          {category ? <p style={st.blurb}>{category.blurb}</p> : null}

          {loading ? (
            <p style={st.empty}>Loading…</p>
          ) : posts.length === 0 ? (
            <div style={st.emptyCard}>
              <BookOpen size={28} style={{ color: 'var(--color-neutral-300)' }} />
              <span style={st.emptyTitle}>No articles yet</span>
              <span style={st.emptyDesc}>New guides in this category are on the way.</span>
              <button style={st.linkBtn} onClick={() => navigate('/blog')}>
                Browse all guides
              </button>
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

const st: Record<string, CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--color-neutral-0)' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-4)',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--space-3))',
    borderBottom: '1px solid var(--color-neutral-100)', flexShrink: 0,
  },
  backBtn: {
    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', background: 'transparent', color: 'var(--color-neutral-700)', cursor: 'pointer',
  },
  headerTitle: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-900)' },
  inner: { padding: 'var(--space-4)', maxWidth: 720, margin: '0 auto', width: '100%' },
  blurb: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-600)', lineHeight: 1.6, marginBottom: 'var(--space-4)' },
  list: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' },
  empty: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-500)', textAlign: 'center', padding: 'var(--space-6) 0' },
  emptyCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)',
    textAlign: 'center', padding: 'var(--space-8) var(--space-4)',
  },
  emptyTitle: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-700)' },
  emptyDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-500)', maxWidth: 300, lineHeight: 1.5 },
  linkBtn: { border: 'none', background: 'transparent', color: 'var(--color-primary-600, #c2410c)', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer', marginTop: 'var(--space-2)' },
};
