import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Search, MapPin } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  fetchOpenWantedItemsWithRequesters, WANTED_CATEGORY_LABEL,
  type WantedItemWithRequester,
} from '../lib/wanted';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { MediaFallback } from '../components/ui/MediaFallback';
import { toThumbUrl } from '../lib/imageCompress';
import { SkeletonList } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { PageScroll } from '../components/ui/PageScroll';

export default function Wanted({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState<WantedItemWithRequester[] | null>(null);
  const [query, setQuery] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOpenWantedItemsWithRequesters({ limit: 100 })
      .then((rows) => { if (!cancelled) setItems(rows); })
      .catch((e: any) => { if (!cancelled) { setItems([]); setErr(e?.message ?? 'Failed to load wanted items'); } });
    return () => { cancelled = true; };
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = (items ?? []).filter((i) =>
    !q
    || i.title.toLowerCase().includes(q)
    || (i.description ?? '').toLowerCase().includes(q)
    || (i.city ?? '').toLowerCase().includes(q)
  );

  return (
    <PageScroll style={s.page}>
      <header style={s.header}>
        <button onClick={onBack} style={s.backBtn} aria-label="Back"><ArrowLeft size={20} /></button>
        <div style={s.headerTitleWrap}>
          <h1 style={s.headerTitle}>Wanted</h1>
          <p style={s.headerSubtitle}>Buyers looking for specific items</p>
        </div>
        {user && (
          <button onClick={() => navigate('/sell/wanted')} style={s.newBtn} aria-label="Post a wanted item">
            <Plus size={16} /><span>Post</span>
          </button>
        )}
      </header>

      <div style={s.searchRow}>
        <Search size={15} style={{ color: 'var(--color-neutral-400)' }} />
        <input
          type="search"
          placeholder="Search by item, category, city…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={s.searchInput}
        />
      </div>

      {err && <p style={s.err}>{err}</p>}

      {items === null ? (
        <SkeletonList count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No wanted items yet"
          body={user ? "Be the first to post what you're looking for." : 'Sign up to post what you\'re looking for.'}
          action={user ? (
            <button onClick={() => navigate('/sell/wanted')} style={s.emptyCta}>
              Post a wanted item
            </button>
          ) : undefined}
        />
      ) : (
        <div style={s.grid}>
          {filtered.map((item) => <WantedCard key={item.id} item={item} />)}
        </div>
      )}
    </PageScroll>
  );
}

function WantedCard({ item }: { item: WantedItemWithRequester }) {
  const navigate = useNavigate();
  const [hover, setHover] = useState(false);
  const where = [item.city, item.region].filter(Boolean).join(', ');
  const handle = item.requester?.username ?? null;
  const open = () => navigate(`/wanted/${item.id}`);
  return (
    <article
      style={{
        ...s.card,
        cursor: 'pointer',
        transform: hover ? 'translateY(-2px)' : 'none',
        borderColor: hover ? 'rgba(16, 185, 129, 0.45)' : 'rgba(255,255,255,0.08)',
        boxShadow: hover ? '0 8px 24px rgba(16, 185, 129, 0.18)' : 'none',
        transition: 'transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
      role="button"
      tabIndex={0}
      aria-label={`Open wanted post: ${item.title}`}
    >
      <div style={s.cardImg}>
        <ImageWithFade
          src={item.thumb_url ?? toThumbUrl(item.image_url)}
          fallbackSrc={item.image_url}
          alt={item.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          fallback={<MediaFallback kind="wanted" seed={item.id} label={item.title} />}
        />
        <span style={s.wantedBadge}>WANTED</span>
        <span style={s.catBadge}>{WANTED_CATEGORY_LABEL[item.category]}</span>
        {item.max_budget != null && (
          <span style={s.budgetBadge}>up to ${Math.round(item.max_budget)}</span>
        )}
      </div>
      <div style={s.cardBody}>
        <h3 style={s.cardTitle}>{item.title}</h3>
        {item.description && <p style={s.cardDesc}>{item.description}</p>}
        <div style={s.cardFooter}>
          {handle ? (
            <span style={s.cardHandle}>@{handle}</span>
          ) : (
            <span style={s.cardHandleMuted}>Requester unavailable</span>
          )}
          {where && (
            <span style={s.cardMeta}>
              <MapPin size={11} style={{ marginRight: 3, verticalAlign: '-2px' }} />{where}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

const s: Record<string, CSSProperties> = {
  page: {
    // PageScroll owns the scroll — this only contributes visual chrome.
    background: '#0b0b10', color: '#f5f5f7', paddingBottom: 24,
  },
  header: {
    position: 'sticky', top: 0, zIndex: 10,
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '14px 16px',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)',
    background: 'rgba(11,11,16,0.92)',
    backdropFilter: 'blur(10px)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  backBtn: {
    flexShrink: 0,
    width: 36, height: 36, borderRadius: 10,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
    color: '#fff', cursor: 'pointer',
  },
  headerTitleWrap: { flex: 1, minWidth: 0 },
  headerTitle: { margin: 0, fontSize: 16, fontWeight: 800, color: '#fff' },
  headerSubtitle: { margin: 0, fontSize: 11, color: 'rgba(245,245,247,0.55)' },
  newBtn: {
    flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '8px 12px', minHeight: 36, borderRadius: 999,
    background: 'linear-gradient(135deg, #10b981, #047857)',
    color: '#fff', border: 'none',
    fontSize: 12, fontWeight: 800, cursor: 'pointer',
  },
  searchRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    margin: '12px 16px',
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
  },
  searchInput: {
    flex: 1, background: 'transparent', border: 'none', outline: 'none',
    color: '#fff', fontSize: 14, minWidth: 0,
  },
  err: { margin: '8px 16px', color: '#fca5a5', fontSize: 12 },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12,
    padding: '0 16px',
  },
  card: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14, overflow: 'hidden',
  },
  cardImg: { position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#15151a' },
  wantedBadge: {
    position: 'absolute', top: 8, left: 8,
    padding: '3px 8px', borderRadius: 999,
    background: 'linear-gradient(135deg, #10b981, #047857)',
    color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
  },
  catBadge: {
    position: 'absolute', top: 8, left: 76,
    padding: '3px 8px', borderRadius: 999,
    background: 'rgba(15, 23, 42, 0.78)', color: '#fff',
    fontSize: 10, fontWeight: 700,
  },
  budgetBadge: {
    position: 'absolute', top: 8, right: 8,
    padding: '3px 8px', borderRadius: 999,
    background: 'rgba(15, 23, 42, 0.78)', color: '#fff',
    fontSize: 10, fontWeight: 800,
  },
  cardBody: { padding: '12px 14px' },
  cardTitle: { margin: 0, fontSize: 14, fontWeight: 800, color: '#fff' },
  cardDesc: {
    margin: '6px 0 0', fontSize: 12, color: 'rgba(245,245,247,0.7)',
    lineHeight: 1.4,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  },
  cardMeta: { fontSize: 11, color: 'rgba(245,245,247,0.55)' },
  cardFooter: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, marginTop: 10, flexWrap: 'wrap',
  },
  cardHandle: { fontSize: 11, fontWeight: 700, color: '#10b981' },
  cardHandleMuted: { fontSize: 11, color: 'rgba(245,245,247,0.4)' },
  emptyCta: {
    minHeight: 44, padding: '10px 18px', borderRadius: 999,
    background: 'linear-gradient(135deg, #10b981, #047857)',
    color: '#fff', border: 'none', fontSize: 13, fontWeight: 800, cursor: 'pointer',
  },
};
