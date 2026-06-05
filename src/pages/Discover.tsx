import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, ChevronRight, Radio, MapPin, Sparkles, Heart, ExternalLink, Calendar, Users,
} from 'lucide-react';
import { fetchPublishedEvents, fetchProHolderIds, PLATFORM_META, isLiveNow, isExpiredLive, type EventRow } from '../lib/events';
import { WhatnotIcon } from '../components/ui/WhatnotIcon';
import { fetchCommunityPosts } from '../lib/database';
import { fetchOpenWantedItemsWithRequesters, WANTED_CATEGORY_LABEL, type WantedItemWithRequester } from '../lib/wanted';
import type { CommunityPost } from '../lib/supabase';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { MediaFallback } from '../components/ui/MediaFallback';
import { PageScroll } from '../components/ui/PageScroll';
import { toThumbUrl } from '../lib/imageCompress';
import { HostEventCTA } from '../components/HostEventCTA';
import NotificationBell from '../components/NotificationBell';
import { maybeNotifyGoLive } from '../lib/notifications';
import { BoostedBadge, BOOSTED_CARD_GLOW } from '../components/ui/BoostedBadge';
import { UpgradeProCard } from '../components/ui/UpgradeProCard';
import { isBoosted } from '../lib/boost';
import { rankDiscoverFeed, STATIC_PROBES } from '../lib/feedRanking';
import { isProUser } from '../lib/entitlements';
import { monetizationHidden } from '../lib/platform';
import { useAuth } from '../context/AuthContext';

const LOG = '[DISCOVER]';

export default function Discover() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [finds, setFinds] = useState<CommunityPost[]>([]);
  const [wanted, setWanted] = useState<WantedItemWithRequester[]>([]);
  const [proHolders, setProHolders] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetchPublishedEvents({ limit: 40 }),
      fetchCommunityPosts(24),
      fetchOpenWantedItemsWithRequesters({ limit: 24 }),
    ]).then(async ([e, f, w]) => {
      if (cancelled) return;
      let eventRows: EventRow[] = [];
      if (e.status === 'fulfilled') { eventRows = e.value; setEvents(e.value); maybeNotifyGoLive(e.value); }
      else console.warn(LOG, 'events fetch failed', e.reason);
      if (f.status === 'fulfilled') setFinds(f.value);
      else console.warn(LOG, 'finds fetch failed', f.reason);
      if (w.status === 'fulfilled') setWanted(w.value);
      else console.warn(LOG, 'wanted fetch failed', w.reason);

      // Resolve which sellers are Pro so they get priority placement.
      // Best-effort — fetchProHolderIds swallows errors and returns an
      // empty set, so a failure just means no Pro boost this load.
      if (eventRows.length) {
        const pros = await fetchProHolderIds(eventRows.map((ev) => ev.holder_id));
        if (!cancelled) setProHolders(pros);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Pro sellers get priority placement (a real Pro benefit) — ranked above
  // ordinary content but still below paid boosts and live shows.
  const isProSeller = (e: EventRow) => proHolders.has(e.holder_id);

  // "Live Now" surface: rank by priority — live+boosted first, then live,
  // then boosted, then Pro sellers, then newest, with expired pushed to the
  // bottom. `rankDiscoverFeed` is the single source of truth for ordering.
  const liveAndOnline = rankDiscoverFeed(
    events.filter((e) => e.event_kind === 'online' || isLiveNow(e)),
    { isLive: isLiveNow, isExpired: isExpiredLive, createdAt: (e) => e.starts_at, isPro: isProSeller },
  );
  // Local events: no "live" concept, but boosted + Pro should still float up.
  const localEvents = rankDiscoverFeed(
    events.filter((e) => e.event_kind === 'local'),
    { ...STATIC_PROBES, createdAt: (e) => e.starts_at, isPro: isProSeller },
  );

  const q = query.trim().toLowerCase();
  const matchQ = (s: string | null | undefined) => !q || (s ?? '').toLowerCase().includes(q);

  return (
    <PageScroll style={s.page}>
      <header style={s.header}>
        <div style={s.brandRow}>
          <span style={s.brandWord}>TreasureTrail</span>
          <div style={s.headerActions}>
            <button
              onClick={() => navigate('/following')}
              aria-label="Following feed"
              style={s.followingBtn}
            >
              <Users size={16} style={{ color: 'var(--color-neutral-700)' }} />
            </button>
            <NotificationBell />
          </div>
        </div>
        <div style={s.searchRow}>
          <Search size={15} style={{ color: 'var(--color-neutral-400)', flexShrink: 0 }} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shows, sales, finds, and wanted items"
            style={s.searchInput}
            aria-label="Search Discover"
          />
        </div>
      </header>

      <HostEventCTA variant="home" />

      {!monetizationHidden() && !isProUser(profile) && (
        <div style={{ padding: '0 var(--space-4)', marginBottom: 'var(--space-2)' }}>
          <UpgradeProCard onUpgrade={() => navigate('/pro')} />
        </div>
      )}

      <Section
        title="Live Now"
        subtitle="Whatnot · Poshmark Live · eBay Live"
        accent="#ef4444"
        onSeeAll={() => navigate('/live')}
      >
        {liveAndOnline.filter((e) => matchQ(e.title) || matchQ(e.seller_handle)).slice(0, 16).map((e) => (
          <LiveCard key={e.id} event={e} onClick={() => navigate(`/event/${e.id}`)} />
        ))}
        {liveAndOnline.length === 0 && <SkeletonRow kind="live" />}
      </Section>

      <Section
        title="Local Events"
        subtitle="Yard sales · Estate sales · Flea markets · Auctions"
        accent="#f59e0b"
        onSeeAll={() => navigate('/events')}
      >
        {localEvents.filter((e) => matchQ(e.title) || matchQ(e.city) || matchQ(e.region)).slice(0, 16).map((e) => (
          <LocalEventCard key={e.id} event={e} onClick={() => navigate(`/event/${e.id}`)} />
        ))}
        {localEvents.length === 0 && <SkeletonRow kind="event" />}
      </Section>

      <Section
        title="Flash Finds"
        subtitle="Treasures uploaded by the community"
        accent="#8b5cf6"
        onSeeAll={() => navigate('/flash-finds')}
      >
        {finds.filter((p) => matchQ(p.caption) || matchQ(p.category)).slice(0, 16).map((p) => (
          <FindCard key={p.id} post={p} onClick={() => navigate(`/find/${p.id}`)} />
        ))}
        {finds.length === 0 && <SkeletonRow kind="find" />}
      </Section>

      <Section
        title="Wanted Items"
        subtitle="Buyers searching for treasures"
        accent="#10b981"
        onSeeAll={() => navigate('/wanted')}
      >
        {wanted.filter((w) => matchQ(w.title) || matchQ(w.category)).slice(0, 16).map((w) => (
          <WantedCard key={w.id} item={w} onClick={() => navigate(`/wanted/${w.id}`)} />
        ))}
        {wanted.length === 0 && <EmptyWantedTeaser onCreate={() => navigate('/sell/wanted')} />}
      </Section>

      <div style={{ height: 24 }} />
    </PageScroll>
  );
}

/* ---------- Section / row scaffolding ---------- */

function Section({ title, subtitle, accent, onSeeAll, children }: {
  title: string;
  subtitle?: string;
  accent: string;
  onSeeAll?: () => void;
  children: React.ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  // Desktop ergonomics: vertical mouse-wheel over a horizontal row
  // translates to horizontal scroll (Netflix/Whatnot behavior). Touch
  // and shift+wheel already work natively, so we only intercept the
  // pure-vertical wheel and only when the row actually overflows.
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel as EventListener);
  }, []);

  return (
    <section style={s.section}>
      <div style={s.sectionHead}>
        <div style={{ minWidth: 0 }}>
          <h2 style={s.sectionTitle}>
            <span style={{ ...s.sectionDot, background: accent }} />
            {title}
          </h2>
          {subtitle && <p style={s.sectionSub}>{subtitle}</p>}
        </div>
        {onSeeAll && (
          <button onClick={onSeeAll} style={s.seeAll} aria-label={`See all ${title}`}>
            See all <ChevronRight size={14} />
          </button>
        )}
      </div>
      <div ref={rowRef} style={s.row} className="tt-hscroll">
        {children}
      </div>
    </section>
  );
}

/* ---------- Cards ---------- */

function LiveCard({ event, onClick }: { event: EventRow; onClick: () => void }) {
  const platform = event.platform ? PLATFORM_META[event.platform] : null;
  const live = isLiveNow(event);
  const expired = isExpiredLive(event);
  const isWhatnot = event.platform === 'whatnot';
  const boosted = isBoosted(event);
  return (
    <article style={{ ...s.cardLg, ...(boosted ? BOOSTED_CARD_GLOW : null) }} onClick={onClick} role="button" tabIndex={0}>
      <div style={s.cardImgLg}>
        <ImageWithFade
          src={event.cover_thumb_url ?? toThumbUrl(event.cover_image_url)}
          fallbackSrc={event.cover_image_url}
          alt={event.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          fallback={<MediaFallback kind="live" seed={event.id} label={event.title} />}
        />
        <div style={s.cardOverlay} />
        <div style={s.cardBadgeRow}>
          {boosted && <BoostedBadge />}
          {live && (
            <span style={{ ...s.badge, background: '#dc2626' }}>
              <span style={s.liveDot} /> LIVE
            </span>
          )}
          {expired && (
            <span style={{ ...s.badge, background: 'rgba(0,0,0,0.7)', color: '#fff' }}>
              Past show
            </span>
          )}
          {platform && (
            <span style={{ ...s.badge, background: platform.color, color: isWhatnot ? '#000' : '#fff' }}>
              {isWhatnot ? <WhatnotIcon size={12} /> : <Radio size={10} />} {platform.label}
            </span>
          )}
        </div>
        {event.livestream_url && !expired && (
          <span style={s.cardCornerIcon}>
            <ExternalLink size={12} />
          </span>
        )}
      </div>
      <div style={s.cardBody}>
        <h3 style={s.cardTitle}>{event.title}</h3>
        <p style={s.cardMeta}>
          {event.seller_handle ? (event.seller_handle.startsWith('@') ? event.seller_handle : '@' + event.seller_handle) : (platform?.label ?? 'Live show')}
        </p>
      </div>
    </article>
  );
}

function LocalEventCard({ event, onClick }: { event: EventRow; onClick: () => void }) {
  const where = [event.city, event.region].filter(Boolean).join(', ') || event.address || 'Local event';
  const boosted = isBoosted(event);
  return (
    <article style={{ ...s.cardLg, ...(boosted ? BOOSTED_CARD_GLOW : null) }} onClick={onClick} role="button" tabIndex={0}>
      <div style={s.cardImgLg}>
        <ImageWithFade
          src={event.cover_thumb_url ?? toThumbUrl(event.cover_image_url)}
          fallbackSrc={event.cover_image_url}
          alt={event.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          fallback={<MediaFallback kind="event" seed={event.id} label={event.title} />}
        />
        <div style={s.cardOverlay} />
        <div style={s.cardBadgeRow}>
          {boosted && <BoostedBadge />}
          <span style={{ ...s.badge, background: 'rgba(245, 158, 11, 0.95)' }}>
            <Calendar size={10} /> {formatShort(event.starts_at)}
          </span>
        </div>
      </div>
      <div style={s.cardBody}>
        <h3 style={s.cardTitle}>{event.title}</h3>
        <p style={s.cardMeta}>
          <MapPin size={11} style={{ marginRight: 3, verticalAlign: '-2px' }} />{where}
        </p>
      </div>
    </article>
  );
}

function FindCard({ post, onClick }: { post: CommunityPost; onClick: () => void }) {
  const boosted = isBoosted(post);
  return (
    <article style={{ ...s.cardMd, ...(boosted ? BOOSTED_CARD_GLOW : null) }} onClick={onClick} role="button" tabIndex={0}>
      <div style={s.cardImgMd}>
        <ImageWithFade
          src={toThumbUrl(post.image_url)}
          fallbackSrc={post.image_url}
          alt={post.caption || 'Flash find'}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          fallback={<MediaFallback kind="find" seed={post.id} label={post.caption} />}
        />
        <div style={s.cardOverlay} />
        <div style={s.cardBadgeRow}>
          {boosted && <BoostedBadge />}
          {post.estimated_value != null && (
            <span style={{ ...s.badge, background: 'rgba(139, 92, 246, 0.95)' }}>
              <Sparkles size={10} /> ${Math.round(post.estimated_value)}
            </span>
          )}
        </div>
        {post.like_count > 0 && (
          <span style={s.cardCornerIcon}>
            <Heart size={11} fill="#fff" /> {post.like_count}
          </span>
        )}
      </div>
      <div style={s.cardBody}>
        <h3 style={s.cardTitleSm}>{post.caption || 'Untitled find'}</h3>
      </div>
    </article>
  );
}

function WantedCard({ item, onClick }: { item: WantedItemWithRequester; onClick: () => void }) {
  const where = [item.city, item.region].filter(Boolean).join(', ');
  const handle = item.requester?.username ?? null;
  const boosted = isBoosted(item);
  return (
    <article style={{ ...s.cardMd, ...(boosted ? BOOSTED_CARD_GLOW : null) }} onClick={onClick} role="button" tabIndex={0} aria-label={`Open wanted post: ${item.title}`}>
      <div style={s.cardImgMd}>
        <ImageWithFade
          src={item.thumb_url ?? toThumbUrl(item.image_url)}
          fallbackSrc={item.image_url}
          alt={item.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          fallback={<MediaFallback kind="wanted" seed={item.id} label={item.title} />}
        />
        <div style={s.cardOverlay} />
        <div style={s.cardBadgeRow}>
          {boosted && <BoostedBadge />}
          <span style={{ ...s.badge, background: 'rgba(16, 185, 129, 0.95)' }}>
            <Search size={10} /> {WANTED_CATEGORY_LABEL[item.category]}
          </span>
          {item.max_budget != null && (
            <span style={{ ...s.badge, background: 'rgba(15, 23, 42, 0.78)' }}>
              up to ${Math.round(item.max_budget)}
            </span>
          )}
        </div>
      </div>
      <div style={s.cardBody}>
        <h3 style={s.cardTitleSm}>{item.title}</h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          {handle ? (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981' }}>@{handle}</span>
          ) : (
            <span style={{ fontSize: 11, color: 'rgba(245,245,247,0.4)' }}>Requester unavailable</span>
          )}
          {where && <span style={s.cardMeta}><MapPin size={11} style={{ marginRight: 3, verticalAlign: '-2px' }} />{where}</span>}
        </div>
      </div>
    </article>
  );
}

function EmptyWantedTeaser({ onCreate }: { onCreate: () => void }) {
  return (
    <button onClick={onCreate} style={s.emptyTeaser}>
      <Search size={18} />
      <span>Be the first to post what you're looking for →</span>
    </button>
  );
}

function SkeletonRow({ kind }: { kind: 'live' | 'event' | 'find' }) {
  const wide = kind !== 'find';
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={wide ? s.cardLg : s.cardMd}>
          <div style={{ ...(wide ? s.cardImgLg : s.cardImgMd), background: '#1c1c22' }}>
            <MediaFallback kind={kind === 'live' ? 'live' : kind === 'event' ? 'event' : 'find'} seed={`skel-${i}`} />
          </div>
          <div style={s.cardBody}>
            <div style={{ height: 12, width: '70%', borderRadius: 4, background: '#1c1c22' }} />
            <div style={{ height: 10, width: '40%', borderRadius: 4, background: '#15151a', marginTop: 6 }} />
          </div>
        </div>
      ))}
    </>
  );
}

function formatShort(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

/* ---------- styles ---------- */

const s: Record<string, CSSProperties> = {
  page: {
    // PageScroll owns the scroll container — this just adds visual chrome.
    overflowX: 'hidden',
    WebkitOverflowScrolling: 'touch',
    background: 'radial-gradient(900px 500px at 50% -10%, rgba(217, 119, 6, 0.10), transparent 60%), #0b0b10',
    color: '#f5f5f7',
    paddingBottom: 16,
  },
  header: {
    position: 'sticky', top: 0, zIndex: 20,
    padding: '12px 16px 10px',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
    background: 'rgba(11,11,16,0.92)',
    backdropFilter: 'blur(10px)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  brandRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  followingBtn: {
    position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 44, minHeight: 44, width: 44, height: 44,
    border: '1px solid var(--color-neutral-100)', backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-full)', cursor: 'pointer', padding: 0,
  },
  brandWord: {
    fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em',
    background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
    WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
  },
  searchRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    marginTop: 10, padding: '10px 12px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
  },
  searchInput: {
    flex: 1, minWidth: 0,
    background: 'transparent', border: 'none', outline: 'none',
    color: '#fff', fontSize: 14,
  },
  section: { padding: '18px 0 4px' },
  sectionHead: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    padding: '0 16px 10px',
  },
  sectionTitle: {
    margin: 0, fontSize: 17, fontWeight: 800, color: '#fff',
    display: 'inline-flex', alignItems: 'center', gap: 8,
  },
  sectionDot: { width: 8, height: 8, borderRadius: 4, display: 'inline-block' },
  sectionSub: { margin: '2px 0 0', fontSize: 11, color: 'rgba(245,245,247,0.55)' },
  seeAll: {
    display: 'inline-flex', alignItems: 'center', gap: 2,
    padding: '6px 8px', borderRadius: 8,
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: '#fbbf24', fontSize: 12, fontWeight: 700, flexShrink: 0,
  },
  row: {
    display: 'flex',
    flexWrap: 'nowrap',
    gap: 12,
    overflowX: 'auto',
    overflowY: 'hidden',
    padding: '0 16px 4px',
    scrollSnapType: 'x mandatory',
    WebkitOverflowScrolling: 'touch',
    overscrollBehaviorX: 'contain',
    touchAction: 'pan-x pan-y',
  },
  cardLg: {
    flex: '0 0 auto',
    width: 248,
    scrollSnapAlign: 'start',
    cursor: 'pointer',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 14,
    overflow: 'hidden',
    transition: 'transform .18s ease',
  },
  cardImgLg: { position: 'relative', width: '100%', aspectRatio: '4 / 3', overflow: 'hidden', background: '#15151a' },
  cardMd: {
    flex: '0 0 auto',
    width: 168,
    scrollSnapAlign: 'start',
    cursor: 'pointer',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 14,
    overflow: 'hidden',
    transition: 'transform .18s ease',
  },
  cardImgMd: { position: 'relative', width: '100%', aspectRatio: '1 / 1', overflow: 'hidden', background: '#15151a' },
  cardOverlay: {
    position: 'absolute', inset: 'auto 0 0 0',
    height: '55%',
    background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.55) 100%)',
    pointerEvents: 'none',
  },
  cardBadgeRow: {
    position: 'absolute', top: 8, left: 8,
    display: 'flex', flexWrap: 'wrap', gap: 5,
    maxWidth: 'calc(100% - 16px)',
  },
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 7px', borderRadius: 999,
    fontSize: 9, fontWeight: 800, color: '#fff', letterSpacing: '0.04em',
    boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
  },
  liveDot: { width: 5, height: 5, borderRadius: '50%', background: '#fff' },
  cardCornerIcon: {
    position: 'absolute', bottom: 8, right: 8,
    display: 'inline-flex', alignItems: 'center', gap: 3,
    padding: '3px 6px', borderRadius: 999,
    background: 'rgba(0,0,0,0.5)', color: '#fff',
    fontSize: 10, fontWeight: 700,
  },
  cardBody: { padding: '10px 12px 12px' },
  cardTitle: {
    margin: 0, fontSize: 13, fontWeight: 700, color: '#fff',
    lineHeight: 1.3,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  },
  cardTitleSm: {
    margin: 0, fontSize: 12, fontWeight: 700, color: '#fff',
    lineHeight: 1.3,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  },
  cardMeta: { margin: '6px 0 0', fontSize: 11, color: 'rgba(245,245,247,0.6)', lineHeight: 1.3 },
  emptyTeaser: {
    flex: '1 0 auto',
    margin: '0 16px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '20px 16px',
    background: 'linear-gradient(135deg, rgba(16,185,129,0.10), rgba(16,185,129,0.04))',
    border: '1px dashed rgba(16,185,129,0.45)',
    borderRadius: 14, color: '#10b981',
    fontSize: 13, fontWeight: 700, cursor: 'pointer',
  },
};
