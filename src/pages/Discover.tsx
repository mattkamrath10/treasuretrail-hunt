import { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlobalSearch } from '../lib/search/useGlobalSearch';
import {
  Search, ChevronRight, ChevronLeft, MapPin, Sparkles, Heart, Calendar, Users, Navigation,
} from 'lucide-react';
import { fetchPublishedEvents, fetchProHolderIds, type EventRow } from '../lib/events';
import { haversineMiles } from '../lib/geocode';
import { useSavedLocation, requestGpsLocation, saveZipLocation } from '../lib/userLocation';
import { fetchCommunityPosts } from '../lib/database';
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

// Default radius (miles) for "Events Near You". Expands in steps when empty.
const NEAR_RADIUS_DEFAULT = 75;

const EVENT_CATEGORY_LABEL: Record<string, string> = {
  estate_sale: 'Estate Sale',
  yard_sale: 'Yard Sale',
  flea_market: 'Flea Market',
  auction: 'Auction',
  pop_up: 'Pop-up',
  collectibles_show: 'Collectibles Show',
  other: 'Event',
};

function formatDistance(mi: number): string {
  if (mi < 1) return '<1 mi';
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}

export default function Discover() {
  const navigate = useNavigate();
  const goSearch = useGlobalSearch();
  const { profile } = useAuth();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [finds, setFinds] = useState<CommunityPost[]>([]);
  const [proHolders, setProHolders] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const savedLocation = useSavedLocation();
  const [nearRadius, setNearRadius] = useState(NEAR_RADIUS_DEFAULT);

  // Whenever the saved location changes (or is cleared), start back at the
  // default radius so each new location begins from 75 miles rather than a
  // previously-expanded radius.
  useEffect(() => {
    setNearRadius(NEAR_RADIUS_DEFAULT);
  }, [savedLocation?.savedAt]);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetchPublishedEvents({ limit: 40 }),
      fetchCommunityPosts(24),
    ]).then(async ([e, f]) => {
      if (cancelled) return;
      let eventRows: EventRow[] = [];
      if (e.status === 'fulfilled') { eventRows = e.value; setEvents(e.value); maybeNotifyGoLive(e.value); }
      else console.warn(LOG, 'events fetch failed', e.reason);
      if (f.status === 'fulfilled') setFinds(f.value);
      else console.warn(LOG, 'finds fetch failed', f.reason);

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

  // Local events: no "live" concept, but boosted + Pro should still float up.
  const localEvents = rankDiscoverFeed(
    events.filter((e) => e.event_kind === 'local'),
    { ...STATIC_PROBES, createdAt: (e) => e.starts_at, isPro: isProSeller },
  );

  const q = query.trim().toLowerCase();
  const matchQ = (s: string | null | undefined) => !q || (s ?? '').toLowerCase().includes(q);

  // "Events Near You": local events with coordinates, within the chosen radius
  // of the saved location, sorted nearest-first. Search box filters these too.
  const nearbyEvents = savedLocation
    ? localEvents
        .filter((e) => e.lat != null && e.lng != null)
        .filter((e) => matchQ(e.title) || matchQ(e.city) || matchQ(e.region))
        .map((e) => ({
          event: e,
          dist: haversineMiles(
            { lat: savedLocation.lat, lng: savedLocation.lng },
            { lat: e.lat as number, lng: e.lng as number },
          ),
        }))
        .filter((x) => x.dist <= nearRadius)
        .sort((a, b) => a.dist - b.dist)
    : [];

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
            onKeyDown={(e) => { if (e.key === 'Enter') goSearch(query); }}
            enterKeyHint="search"
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

      {!savedLocation ? (
        <LocationSetupCard />
      ) : (
        <NearbySection
          nearby={nearbyEvents}
          radius={nearRadius}
          onExpand={() => setNearRadius((r) => (r >= 250 ? r : r >= 150 ? 250 : 150))}
          onBrowse={() => navigate('/events')}
          onChange={() => navigate('/location-settings')}
          onOpen={(id) => navigate(`/event/${id}`)}
        />
      )}

      <Section
        title="Flash Finds"
        subtitle="Treasures uploaded by the community"
        accent="#8b5cf6"
        onSeeAll={() => navigate('/home', { state: { filter: 'flash_finds' } })}
      >
        {finds.filter((p) => matchQ(p.caption) || matchQ(p.category)).slice(0, 16).map((p) => (
          <FindCard key={p.id} post={p} onClick={() => navigate(`/find/${p.id}`)} />
        ))}
        {finds.length === 0 && <SkeletonRow kind="find" />}
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
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  // Recompute arrow availability from the row's scroll metrics.
  const update = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const max = scrollWidth - clientWidth;
    setCanLeft(scrollLeft > 2);
    setCanRight(scrollLeft < max - 2);
  }, []);

  // Recompute when content loads in (children change) and on first mount.
  useEffect(() => { update(); }, [update, children]);

  // Keep metrics fresh on element resize / viewport resize.
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, [update]);

  // Shift+wheel scrolls the carousel horizontally. A PLAIN wheel is left
  // untouched so it always scrolls the page vertically — users never get
  // trapped inside a row.
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey || e.deltaY === 0) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel as EventListener);
  }, []);

  // Arrow buttons scroll one card-group (~80% of the viewport) at a time.
  const scrollByGroup = (dir: 1 | -1) => {
    const el = rowRef.current;
    if (!el) return;
    const amount = Math.max(el.clientWidth * 0.8, 200);
    el.scrollBy({ left: dir * amount, behavior: 'smooth' });
  };

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
      <div className="tt-carousel" style={s.rowWrap}>
        <div
          style={{ ...s.edgeFade, ...s.edgeFadeLeft, opacity: canLeft ? 1 : 0 }}
          aria-hidden
        />
        <div
          style={{ ...s.edgeFade, ...s.edgeFadeRight, opacity: canRight ? 1 : 0 }}
          aria-hidden
        />
        {canLeft && (
          <button
            className="tt-carousel-arrow"
            style={{ ...s.arrow, left: 6 }}
            onClick={() => scrollByGroup(-1)}
            aria-label={`Scroll ${title} left`}
          >
            <ChevronLeft size={20} />
          </button>
        )}
        {canRight && (
          <button
            className="tt-carousel-arrow"
            style={{ ...s.arrow, right: 6 }}
            onClick={() => scrollByGroup(1)}
            aria-label={`Scroll ${title} right`}
          >
            <ChevronRight size={20} />
          </button>
        )}
        <div ref={rowRef} style={s.row} className="tt-hscroll" onScroll={update}>
          {children}
        </div>
      </div>
    </section>
  );
}

/* ---------- Cards ---------- */

function LocalEventCard({ event, onClick, distanceMi }: { event: EventRow; onClick: () => void; distanceMi?: number }) {
  const where = [event.city, event.region].filter(Boolean).join(', ') || event.address || 'Local event';
  const boosted = isBoosted(event);
  const category = EVENT_CATEGORY_LABEL[event.category] ?? 'Event';
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
          {distanceMi != null && (
            <span style={{ ...s.badge, background: 'rgba(34, 211, 238, 0.95)', color: '#04222a' }}>
              <Navigation size={10} /> {formatDistance(distanceMi)}
            </span>
          )}
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
        <p style={{ ...s.cardMeta, marginTop: 3, color: 'rgba(245,245,247,0.45)' }}>{category}</p>
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

/* ---------- Location personalization ---------- */

function LocationSetupCard() {
  const [mode, setMode] = useState<'idle' | 'zip'>('idle');
  const [zip, setZip] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onUseLocation = async () => {
    setBusy(true);
    setErr(null);
    const r = await requestGpsLocation();
    setBusy(false);
    if (!r.ok) {
      // No coordinates — fall back to manual ZIP entry so the user is never stuck.
      setMode('zip');
      setErr(
        r.reason === 'unsupported'
          ? "Location isn't available on this device. Enter your ZIP code instead."
          : 'Location permission denied. Enter your ZIP code instead.',
      );
    }
    // On success the saved-location store updates and Discover swaps this card
    // out for the "Events Near You" section automatically.
  };

  const onSaveZip = async () => {
    setBusy(true);
    setErr(null);
    const r = await saveZipLocation(zip);
    setBusy(false);
    if (!r.ok) {
      setErr(
        r.reason === 'invalid'
          ? 'Enter a 5-digit ZIP code.'
          : r.reason === 'not_found'
            ? "We couldn't find that ZIP code."
            : "Couldn't look up that ZIP. Try again.",
      );
    }
  };

  return (
    <div style={s.locCard}>
      <h2 style={s.locTitle}>
        <Navigation size={16} style={{ color: '#22d3ee' }} /> Find Events Near You
      </h2>
      <p style={s.locBody}>
        Share your location to see nearby estate sales, auctions, and flea markets first.
      </p>

      {mode === 'idle' ? (
        <div style={s.locBtnRow}>
          <button onClick={onUseLocation} disabled={busy} style={s.locBtnPrimary}>
            <Navigation size={15} /> {busy ? 'Locating…' : 'Use My Location'}
          </button>
          <button onClick={() => { setMode('zip'); setErr(null); }} disabled={busy} style={s.locBtnGhost}>
            <MapPin size={15} /> Enter ZIP Code
          </button>
        </div>
      ) : (
        <>
          <div style={s.locZipRow}>
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/[^\d]/g, '').slice(0, 5))}
              onKeyDown={(e) => { if (e.key === 'Enter') onSaveZip(); }}
              placeholder="ZIP code"
              inputMode="numeric"
              autoFocus
              style={s.locZipInput}
              aria-label="ZIP code"
            />
            <button onClick={onSaveZip} disabled={busy} style={s.locBtnPrimary}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
          <button onClick={() => { setMode('idle'); setErr(null); }} style={s.locLink}>
            Use my location instead
          </button>
        </>
      )}

      {err && <p style={s.locErr}>{err}</p>}
    </div>
  );
}

function NearbySection({ nearby, radius, onExpand, onBrowse, onChange, onOpen }: {
  nearby: { event: EventRow; dist: number }[];
  radius: number;
  onExpand: () => void;
  onBrowse: () => void;
  onChange: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <section style={s.section}>
      <div style={s.sectionHead}>
        <div style={{ minWidth: 0 }}>
          <h2 style={s.sectionTitle}>
            <span style={{ ...s.sectionDot, background: '#22d3ee' }} />
            Events Near You
          </h2>
          <p style={s.sectionSub}>Within {radius} miles of your location</p>
        </div>
        <button onClick={onChange} style={s.seeAll} aria-label="Change location">
          <MapPin size={13} /> Change
        </button>
      </div>

      {nearby.length === 0 ? (
        <div style={s.nearEmpty}>
          <p style={s.nearEmptyTitle}>No events found nearby</p>
          <p style={s.nearEmptyBody}>Try expanding your search radius or browse events nationwide.</p>
          <div style={s.nearEmptyBtns}>
            {radius < 250 && (
              <button onClick={onExpand} style={s.nearBtnPrimary}>Expand Radius</button>
            )}
            <button onClick={onBrowse} style={s.nearBtnGhost}>Browse Nationwide</button>
          </div>
        </div>
      ) : (
        <div style={s.row}>
          {nearby.slice(0, 16).map(({ event, dist }) => (
            <LocalEventCard key={event.id} event={event} distanceMi={dist} onClick={() => onOpen(event.id)} />
          ))}
        </div>
      )}
    </section>
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
  rowWrap: { position: 'relative' },
  arrow: {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    zIndex: 4,
    width: 40, height: 40, borderRadius: '50%',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(20,20,28,0.85)',
    border: '1px solid rgba(255,255,255,0.14)',
    color: '#fff', cursor: 'pointer', padding: 0,
    boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
    backdropFilter: 'blur(6px)',
  },
  edgeFade: {
    position: 'absolute', top: 0, bottom: 4, width: 44, zIndex: 3,
    pointerEvents: 'none', transition: 'opacity .18s ease',
  },
  edgeFadeLeft: { left: 0, background: 'linear-gradient(90deg, #0b0b10 0%, transparent 100%)' },
  edgeFadeRight: { right: 0, background: 'linear-gradient(270deg, #0b0b10 0%, transparent 100%)' },
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

  /* Location setup card (first launch / no saved location) */
  locCard: {
    margin: '4px 16px 8px',
    padding: 16,
    borderRadius: 16,
    background: 'linear-gradient(135deg, rgba(34,211,238,0.12), rgba(217,119,6,0.10))',
    border: '1px solid rgba(255,255,255,0.10)',
  },
  locTitle: {
    margin: 0, fontSize: 16, fontWeight: 800, color: '#fff',
    display: 'inline-flex', alignItems: 'center', gap: 8,
  },
  locBody: { margin: '6px 0 12px', fontSize: 12.5, color: 'rgba(245,245,247,0.7)', lineHeight: 1.4 },
  locBtnRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  locBtnPrimary: {
    flex: '1 1 auto',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '12px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
    background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
    color: '#1a1205', fontSize: 13, fontWeight: 800,
  },
  locBtnGhost: {
    flex: '1 1 auto',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '12px 14px', borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.18)', cursor: 'pointer',
    background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 13, fontWeight: 700,
  },
  locZipRow: { display: 'flex', gap: 8, alignItems: 'center' },
  locZipInput: {
    flex: 1, minWidth: 0,
    padding: '11px 12px', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(0,0,0,0.25)',
    color: '#fff', fontSize: 16, outline: 'none',
  },
  locLink: {
    background: 'transparent', border: 'none', color: '#22d3ee',
    fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '8px 2px', marginTop: 4,
  },
  locErr: { margin: '8px 0 0', fontSize: 12, color: '#fca5a5' },

  /* "Events Near You" empty state */
  nearEmpty: {
    margin: '0 16px',
    padding: '20px 16px', borderRadius: 14,
    background: 'rgba(255,255,255,0.04)',
    border: '1px dashed rgba(255,255,255,0.16)',
    textAlign: 'center',
  },
  nearEmptyTitle: { margin: 0, fontSize: 14, fontWeight: 800, color: '#fff' },
  nearEmptyBody: { margin: '6px 0 12px', fontSize: 12, color: 'rgba(245,245,247,0.6)' },
  nearEmptyBtns: { display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' },
  nearBtnPrimary: {
    padding: '10px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
    background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
    color: '#1a1205', fontSize: 12.5, fontWeight: 800,
  },
  nearBtnGhost: {
    padding: '10px 14px', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.18)', cursor: 'pointer',
    background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 12.5, fontWeight: 700,
  },
};
