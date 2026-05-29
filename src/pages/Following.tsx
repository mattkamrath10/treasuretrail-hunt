import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Compass } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PageScroll } from '../components/ui/PageScroll';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { MediaFallback } from '../components/ui/MediaFallback';
import { GuestOverlay } from '../components/GuestGate';
import { fetchFollowingFeed, type FollowFeedItem, type FollowFeedKind } from '../lib/followFeed';
import { maybeNotifyGoLive } from '../lib/notifications';

const FALLBACK_KIND: Record<FollowFeedKind, 'event' | 'live' | 'find' | 'wanted' | 'listing'> = {
  event: 'event',
  listing: 'listing',
  wanted: 'wanted',
  find: 'find',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

export default function Following({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const { user, isGuest } = useAuth();
  const [items, setItems] = useState<FollowFeedItem[]>([]);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetchFollowingFeed(user.id)
      .then((feed) => {
        if (cancelled) return;
        setItems(feed.items);
        setFollowingCount(feed.followingCount);
        setLoading(false);
        // Best-effort: surface a go-live alert to followers for any live show.
        maybeNotifyGoLive(feed.events);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  if (isGuest) {
    return (
      <PageScroll style={s.page}>
        <header style={s.header}>
          <button onClick={onBack} style={s.iconBtn} aria-label="Back">
            <ArrowLeft size={20} style={{ color: 'var(--color-neutral-700)' }} />
          </button>
          <h1 style={s.title}>Following</h1>
        </header>
        <GuestOverlay
          title="Your Following Feed"
          subtitle="Create a free account to follow sellers and see their new events, live shows, listings, and finds in one place."
        />
      </PageScroll>
    );
  }

  return (
    <PageScroll style={s.page}>
      <header style={s.header}>
        <button onClick={onBack} style={s.iconBtn} aria-label="Back">
          <ArrowLeft size={20} style={{ color: 'var(--color-neutral-700)' }} />
        </button>
        <div style={s.titleGroup}>
          <h1 style={s.title}>Following</h1>
          {followingCount > 0 && (
            <span style={s.countPill}>{followingCount} following</span>
          )}
        </div>
      </header>

      <div style={s.body}>
        {loading ? (
          <div style={s.stateBox}>
            <Users size={20} style={{ color: 'var(--color-neutral-300)' }} />
            <p style={s.stateText}>Loading…</p>
          </div>
        ) : followingCount === 0 ? (
          <div style={s.stateBox}>
            <Users size={36} style={{ color: 'var(--color-neutral-300)' }} />
            <p style={s.stateTitle}>You're not following anyone yet</p>
            <p style={s.stateText}>
              Follow sellers and hunters to see their new events, live shows, listings, and finds here.
            </p>
            <button onClick={() => navigate('/')} style={s.cta}>
              <Compass size={16} /> Discover sellers
            </button>
          </div>
        ) : items.length === 0 ? (
          <div style={s.stateBox}>
            <Users size={36} style={{ color: 'var(--color-neutral-300)' }} />
            <p style={s.stateTitle}>Nothing new yet</p>
            <p style={s.stateText}>
              The sellers you follow haven't posted recently. Check back soon for new shows and listings.
            </p>
          </div>
        ) : (
          <ul style={s.list}>
            {items.map((it, i) => (
              <li key={it.key}>
                <button
                  onClick={() => navigate(it.route)}
                  style={{ ...s.row, animationDelay: `${Math.min(i, 12) * 35}ms` }}
                >
                  <div style={s.thumb}>
                    <ImageWithFade
                      src={it.imageUrl}
                      alt={it.title}
                      style={s.thumbImg}
                      fallback={
                        <MediaFallback
                          kind={it.isLive ? 'live' : FALLBACK_KIND[it.kind]}
                          seed={it.id}
                          label={it.title}
                        />
                      }
                    />
                    {it.isLive && <span style={s.liveDot} aria-hidden />}
                  </div>
                  <div style={s.rowBody}>
                    <div style={s.rowHead}>
                      <span
                        style={{
                          ...s.badge,
                          ...(it.isLive ? s.badgeLive : null),
                        }}
                      >
                        {it.badge}
                      </span>
                      <span style={s.rowTime}>{timeAgo(it.createdAt)}</span>
                    </div>
                    <span style={s.rowTitle}>{it.title}</span>
                    {it.subtitle && <span style={s.rowSub}>{it.subtitle}</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageScroll>
  );
}

const s: Record<string, CSSProperties> = {
  page: { backgroundColor: 'var(--color-neutral-50)' },
  header: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderBottom: '1px solid var(--color-neutral-100)',
    position: 'sticky', top: 0, zIndex: 2,
  },
  iconBtn: {
    minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', backgroundColor: 'transparent', cursor: 'pointer', borderRadius: 'var(--radius-full)',
  },
  titleGroup: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' },
  title: { fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  countPill: {
    fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-primary-700)',
    backgroundColor: 'var(--color-primary-50)', border: '1px solid var(--color-primary-200)',
    padding: '2px var(--space-2)', borderRadius: 'var(--radius-full)',
  },
  body: { padding: 'var(--space-3)' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  row: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%', textAlign: 'left',
    padding: 'var(--space-2)', borderRadius: 'var(--radius-lg)',
    backgroundColor: 'var(--color-neutral-0)', border: '1px solid var(--color-neutral-100)',
    cursor: 'pointer', opacity: 0, animation: 'fadeIn 0.3s ease forwards',
  },
  thumb: {
    position: 'relative', width: 64, height: 64, flexShrink: 0,
    borderRadius: 'var(--radius-md)', overflow: 'hidden', backgroundColor: 'var(--color-neutral-100)',
  },
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover' },
  liveDot: {
    position: 'absolute', top: 6, left: 6, width: 10, height: 10, borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-error-500)', border: '2px solid var(--color-neutral-0)',
  },
  rowBody: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  rowHead: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  badge: {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
    color: 'var(--color-neutral-500)', backgroundColor: 'var(--color-neutral-100)',
    padding: '2px 6px', borderRadius: 'var(--radius-sm)',
  },
  badgeLive: { color: 'var(--color-neutral-0)', backgroundColor: 'var(--color-error-500)' },
  rowTime: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-400)' },
  rowTitle: {
    fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-900)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  rowSub: {
    fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  stateBox: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)',
    padding: 'var(--space-8) var(--space-6)', marginTop: 'var(--space-6)', textAlign: 'center',
  },
  stateTitle: { fontSize: 'var(--font-size-md)', fontWeight: 600, color: 'var(--color-neutral-700)' },
  stateText: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-400)', maxWidth: 320 },
  cta: {
    display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 'var(--space-3)',
    minHeight: 44, padding: '0 var(--space-4)', borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-500)', color: 'var(--color-neutral-0)',
    border: 'none', fontWeight: 600, fontSize: 'var(--font-size-sm)', cursor: 'pointer',
  },
};
