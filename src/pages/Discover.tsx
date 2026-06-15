import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlobalSearch } from '../lib/search/useGlobalSearch';
import { Search, MapPin, Navigation, Users, X } from 'lucide-react';
import { fetchPublishedEvents, fetchProHolderIds, type EventRow } from '../lib/events';
import { fetchPublishedBusinesses, type BusinessRow } from '../lib/businesses';
import { fetchOpenWantedItems, type WantedItemRow } from '../lib/wanted';
import { fetchCommunityPosts } from '../lib/database';
import type { CommunityPost } from '../lib/supabase';
import {
  useSavedLocation,
  requestGpsLocation,
  saveTextLocation,
  clearSavedLocation,
} from '../lib/userLocation';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { MediaFallback } from '../components/ui/MediaFallback';
import { PageScroll } from '../components/ui/PageScroll';
import { HostEventCTA } from '../components/HostEventCTA';
import NotificationBell from '../components/NotificationBell';
import { maybeNotifyGoLive } from '../lib/notifications';
import { UpgradeProCard } from '../components/ui/UpgradeProCard';
import { isProUser } from '../lib/entitlements';
import { monetizationHidden } from '../lib/platform';
import { useAuth } from '../context/AuthContext';
import { FeaturedSlideshow } from '../components/discover/FeaturedSlideshow';
import {
  buildFeaturedSlides,
  type FeaturedFilter,
  type FeaturedSlide,
} from '../lib/discoverFeatured';

const LOG = '[DISCOVER]';

// Default radius (miles) for location filtering. Expands in steps when empty.
const NEAR_RADIUS_DEFAULT = 75;

// Slides shown in the rotating hero. The grid below shows the full set.
const SLIDESHOW_CAP = 8;

const FILTERS: { key: FeaturedFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'event', label: 'Events' },
  { key: 'business', label: 'Businesses' },
  { key: 'find', label: 'Flash Finds' },
  { key: 'wanted', label: 'Wanted' },
];

export default function Discover() {
  const navigate = useNavigate();
  const goSearch = useGlobalSearch();
  const { profile } = useAuth();

  const [events, setEvents] = useState<EventRow[]>([]);
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [wanted, setWanted] = useState<WantedItemRow[]>([]);
  const [finds, setFinds] = useState<CommunityPost[]>([]);
  const [proHolders, setProHolders] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FeaturedFilter>('all');
  const savedLocation = useSavedLocation();
  const [nearRadius, setNearRadius] = useState(NEAR_RADIUS_DEFAULT);

  // Each new saved location starts back at the default radius.
  useEffect(() => {
    setNearRadius(NEAR_RADIUS_DEFAULT);
  }, [savedLocation?.savedAt]);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetchPublishedEvents({ limit: 40 }),
      fetchPublishedBusinesses(),
      fetchOpenWantedItems({ limit: 40 }),
      fetchCommunityPosts(24),
    ]).then(async ([e, b, w, f]) => {
      if (cancelled) return;
      let evs: EventRow[] = [];
      let bus: BusinessRow[] = [];
      if (e.status === 'fulfilled') { evs = e.value; setEvents(e.value); maybeNotifyGoLive(e.value); }
      else console.warn(LOG, 'events fetch failed', e.reason);
      if (b.status === 'fulfilled') { bus = b.value; setBusinesses(b.value); }
      else console.warn(LOG, 'businesses fetch failed', b.reason);
      if (w.status === 'fulfilled') setWanted(w.value);
      else console.warn(LOG, 'wanted fetch failed', w.reason);
      if (f.status === 'fulfilled') setFinds(f.value);
      else console.warn(LOG, 'finds fetch failed', f.reason);
      setLoaded(true);

      // Resolve which event holders / business owners are Pro so they get
      // priority placement. Best-effort — fetchProHolderIds swallows errors.
      const ownerIds = [...evs.map((x) => x.holder_id), ...bus.map((x) => x.owner_id)];
      if (ownerIds.length) {
        const pros = await fetchProHolderIds(ownerIds);
        if (!cancelled) setProHolders(pros);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Full ranked set across all kinds (location + search applied). Kind chips
  // filter this without re-ranking.
  const base = useMemo(
    () => buildFeaturedSlides({
      events, businesses, wanted, finds, proHolders,
      location: savedLocation ? { lat: savedLocation.lat, lng: savedLocation.lng } : null,
      radiusMi: nearRadius,
      query,
      filter: 'all',
    }),
    [events, businesses, wanted, finds, proHolders, savedLocation, nearRadius, query],
  );

  const counts = useMemo(() => {
    const c = { all: base.length, event: 0, business: 0, find: 0, wanted: 0 };
    for (const sl of base) c[sl.kind] += 1;
    return c;
  }, [base]);

  const slides = useMemo(
    () => (filter === 'all' ? base : base.filter((sl) => sl.kind === filter)),
    [base, filter],
  );

  const filterKey = `${filter}|${query.trim().toLowerCase()}|${savedLocation?.savedAt ?? ''}`;
  const canExpand = !!savedLocation && nearRadius < 250;

  return (
    <PageScroll style={s.page}>
      <header style={s.header}>
        <div style={s.brandRow}>
          <span style={s.brandWord}>TreasureTrail</span>
          <div style={s.headerActions}>
            <button onClick={() => navigate('/following')} aria-label="Following feed" style={s.followingBtn}>
              <Users size={16} style={{ color: '#fff' }} />
            </button>
            <NotificationBell />
          </div>
        </div>
        <div style={s.searchRow}>
          <Search size={15} style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
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
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear search" style={s.clearSearch}>
              <X size={15} />
            </button>
          )}
        </div>
      </header>

      <section style={s.featuredHead}>
        <div style={{ minWidth: 0 }}>
          <h2 style={s.featuredTitle}>Featured Near You</h2>
          <p style={s.featuredSub}>
            {savedLocation
              ? `Within ${nearRadius} miles of ${savedLocation.label ?? 'your location'}`
              : 'Boosted events, top shops, wanted posts and finds'}
          </p>
        </div>
      </section>

      <LocationControl radius={nearRadius} />

      {loaded ? (
        <FeaturedSlideshow
          slides={slides.slice(0, SLIDESHOW_CAP)}
          filterKey={filterKey}
          onOpen={(to) => navigate(to)}
        />
      ) : (
        <SlideshowSkeleton />
      )}

      <div className="tt-hscroll" style={s.chips}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const n = counts[f.key];
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{ ...s.chip, ...(active ? s.chipActive : null) }}
              aria-pressed={active}
            >
              {f.label}
              {loaded && <span style={{ ...s.chipCount, ...(active ? s.chipCountActive : null) }}>{n}</span>}
            </button>
          );
        })}
      </div>

      {loaded && slides.length === 0 ? (
        <div style={s.gridEmpty}>
          <p style={s.gridEmptyTitle}>Nothing here yet</p>
          <p style={s.gridEmptyBody}>
            {savedLocation
              ? 'Try a wider radius, a different filter, or browse nationwide.'
              : 'Set your location or try a different filter.'}
          </p>
          {canExpand && (
            <button onClick={() => setNearRadius((r) => (r >= 150 ? 250 : 150))} style={s.expandBtn}>
              Widen radius
            </button>
          )}
        </div>
      ) : (
        <div style={s.grid}>
          {slides.map((sl) => (
            <FeaturedGridCard key={sl.id} slide={sl} onClick={() => navigate(sl.to)} />
          ))}
        </div>
      )}

      <div style={{ padding: '8px 0 4px' }}>
        <HostEventCTA variant="home" />
      </div>

      {!monetizationHidden() && !isProUser(profile) && (
        <div style={{ padding: '4px 16px 8px' }}>
          <UpgradeProCard onUpgrade={() => navigate('/pro')} />
        </div>
      )}

      <div style={{ height: 24 }} />
    </PageScroll>
  );
}

/* ---------- Location control (GPS / ZIP / City, State) ---------- */

function LocationControl({ radius }: { radius: number }) {
  const saved = useSavedLocation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<null | 'gps' | 'text'>(null);
  const [err, setErr] = useState<string | null>(null);

  // Auto-open the editor the first time when no location is set.
  useEffect(() => { if (!saved) setOpen(true); }, [saved]);

  const onGps = async () => {
    setBusy('gps');
    setErr(null);
    const r = await requestGpsLocation();
    setBusy(null);
    if (r.ok) { setOpen(false); }
    else {
      setErr(r.reason === 'unsupported'
        ? "Location isn't available on this device — enter a ZIP or City, State."
        : 'Permission denied — enter a ZIP or City, State instead.');
    }
  };

  const onSaveText = async () => {
    if (!text.trim()) { setErr('Enter a ZIP or City, State.'); return; }
    setBusy('text');
    setErr(null);
    const r = await saveTextLocation(text);
    setBusy(null);
    if (r.ok) { setOpen(false); setText(''); }
    else {
      setErr(r.reason === 'not_found'
        ? "We couldn't find that place. Try a ZIP or \"City, State\"."
        : r.reason === 'invalid'
          ? 'Enter a ZIP or City, State.'
          : "Lookup failed. Try again.");
    }
  };

  if (saved && !open) {
    return (
      <div style={s.locBar}>
        <span style={s.locPill}>
          <MapPin size={13} style={{ color: '#22d3ee' }} />
          {saved.label ?? 'Your location'}
          <span style={s.locRadius}>· {radius} mi</span>
        </span>
        <button onClick={() => setOpen(true)} style={s.locChange}>Change</button>
      </div>
    );
  }

  return (
    <div style={s.locEditor}>
      <div style={s.locInputRow}>
        <MapPin size={15} style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSaveText(); }}
          placeholder="ZIP or City, State"
          enterKeyHint="search"
          style={s.locInput}
          aria-label="ZIP code or City, State"
        />
        <button onClick={onSaveText} disabled={busy === 'text'} style={s.locSave}>
          {busy === 'text' ? '…' : 'Save'}
        </button>
      </div>
      <div style={s.locBtns}>
        <button onClick={onGps} disabled={busy === 'gps'} style={s.locGhost}>
          <Navigation size={14} /> {busy === 'gps' ? 'Locating…' : 'Use my location'}
        </button>
        {saved && (
          <button onClick={() => { clearSavedLocation(); setOpen(true); }} style={s.locGhost}>Clear</button>
        )}
        {saved && (
          <button onClick={() => { setOpen(false); setErr(null); }} style={s.locGhost}>Cancel</button>
        )}
      </div>
      {err && <p style={s.locErr}>{err}</p>}
    </div>
  );
}

/* ---------- Grid card ---------- */

function FeaturedGridCard({ slide, onClick }: { slide: FeaturedSlide; onClick: () => void }) {
  return (
    <button style={s.card} onClick={onClick} aria-label={`Open ${slide.title}`}>
      <div style={s.cardImg}>
        <ImageWithFade
          src={slide.image}
          fallbackSrc={slide.imageFull}
          alt={slide.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          fallback={
            <MediaFallback
              kind={slide.fallbackKind}
              category={slide.fallbackCategory ?? undefined}
              seed={slide.id}
            />
          }
        />
        <div style={s.cardOverlay} />
        <div style={s.cardBadges}>
          <span style={{ ...s.cardKind, background: slide.accent }}>{slide.kind === 'find' ? 'Find' : slide.kind === 'business' ? 'Shop' : slide.kind === 'wanted' ? 'Wanted' : 'Event'}</span>
          {slide.badge && <span style={s.cardBadge}>{slide.badge}</span>}
        </div>
        {slide.distanceMi != null && (
          <span style={s.cardDistance}>
            <Navigation size={9} /> {slide.distanceMi < 10 ? slide.distanceMi.toFixed(1) : Math.round(slide.distanceMi)} mi
          </span>
        )}
      </div>
      <div style={s.cardBody}>
        <h3 style={s.cardTitle}>{slide.title}</h3>
        <p style={s.cardMeta}>{slide.subtitle}</p>
      </div>
    </button>
  );
}

function SlideshowSkeleton() {
  return (
    <div style={{ padding: '0 16px' }}>
      <div style={{ ...s.skel, aspectRatio: '16 / 10', maxHeight: 320, borderRadius: 18 }} />
    </div>
  );
}

/* ---------- styles ---------- */

const s: Record<string, CSSProperties> = {
  page: {
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
  headerActions: { display: 'flex', alignItems: 'center', gap: 8 },
  followingBtn: {
    position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 40, minHeight: 40, width: 40, height: 40,
    border: '1px solid rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 999, cursor: 'pointer', padding: 0,
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
  clearSearch: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 24, height: 24, borderRadius: 999, flexShrink: 0,
    border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', padding: 0,
  },
  featuredHead: { padding: '18px 16px 10px' },
  featuredTitle: { margin: 0, fontSize: 19, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' },
  featuredSub: { margin: '3px 0 0', fontSize: 12, color: 'rgba(245,245,247,0.55)' },

  // Location control
  locBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    margin: '0 16px 12px',
  },
  locPill: {
    display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0,
    fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,0.85)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  locRadius: { color: 'rgba(255,255,255,0.5)', fontWeight: 600 },
  locChange: {
    flexShrink: 0, padding: '6px 12px', borderRadius: 999,
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
    color: '#fbbf24', fontSize: 12, fontWeight: 700, cursor: 'pointer',
  },
  locEditor: {
    margin: '0 16px 12px', padding: 12, borderRadius: 14,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  },
  locInputRow: { display: 'flex', alignItems: 'center', gap: 8 },
  locInput: {
    flex: 1, minWidth: 0, padding: '9px 10px', borderRadius: 10,
    background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.12)',
    color: '#fff', fontSize: 15, outline: 'none',
  },
  locSave: {
    flexShrink: 0, padding: '9px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
    background: '#f97316', color: '#1a0c00', fontSize: 13, fontWeight: 800,
  },
  locBtns: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  locGhost: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 12px', borderRadius: 10,
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
    color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
  },
  locErr: { margin: '8px 0 0', fontSize: 12, color: '#fca5a5' },

  // Chips
  chips: {
    display: 'flex', flexWrap: 'nowrap', gap: 8,
    padding: '14px 16px 6px',
    overflowX: 'auto',
  },
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
    padding: '8px 14px', borderRadius: 999,
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
    color: 'rgba(255,255,255,0.82)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  chipActive: {
    background: '#f97316', border: '1px solid #f97316', color: '#1a0c00',
  },
  chipCount: {
    fontSize: 11, fontWeight: 800,
    padding: '1px 7px', borderRadius: 999,
    background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)',
  },
  chipCountActive: { background: 'rgba(0,0,0,0.18)', color: '#1a0c00' },

  // Grid
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12,
    padding: '12px 16px 4px',
  },
  card: {
    display: 'flex', flexDirection: 'column', textAlign: 'left',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14, overflow: 'hidden', cursor: 'pointer', padding: 0,
    color: '#fff', WebkitTapHighlightColor: 'transparent',
  },
  cardImg: { position: 'relative', width: '100%', aspectRatio: '4 / 3', background: '#15151a' },
  cardOverlay: {
    position: 'absolute', inset: 0,
    background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.55) 100%)',
  },
  cardBadges: { position: 'absolute', top: 8, left: 8, display: 'flex', gap: 4, flexWrap: 'wrap' },
  cardKind: {
    padding: '3px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800, color: '#0b0b10',
  },
  cardBadge: {
    padding: '3px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800,
    background: 'rgba(249,115,22,0.95)', color: '#1a0c00',
  },
  cardDistance: {
    position: 'absolute', bottom: 8, right: 8,
    display: 'inline-flex', alignItems: 'center', gap: 3,
    padding: '3px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700,
    background: 'rgba(34,211,238,0.92)', color: '#04222a',
  },
  cardBody: { padding: '10px 11px 12px' },
  cardTitle: {
    margin: 0, fontSize: 13.5, fontWeight: 800, color: '#fff', lineHeight: 1.25,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  },
  cardMeta: {
    margin: '4px 0 0', fontSize: 11.5, color: 'rgba(245,245,247,0.55)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },

  // Empty + skeleton
  gridEmpty: {
    margin: '12px 16px 4px', padding: '28px 20px', borderRadius: 16, textAlign: 'center',
    background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.12)',
  },
  gridEmptyTitle: { margin: 0, fontSize: 15, fontWeight: 800, color: '#fff' },
  gridEmptyBody: { margin: '6px 0 0', fontSize: 13, color: 'rgba(245,245,247,0.6)' },
  expandBtn: {
    marginTop: 14, padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
    background: '#f97316', color: '#1a0c00', fontSize: 13, fontWeight: 800,
  },
  skel: { width: '100%', background: 'rgba(255,255,255,0.06)' },
};
