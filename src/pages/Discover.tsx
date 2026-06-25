import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlobalSearch } from '../lib/search/useGlobalSearch';
import { Search, MapPin, Navigation, Users, X } from 'lucide-react';
import { fetchPublishedEvents, fetchProHolderIds, fetchFeaturedItemsForEvents, type EventRow, type EventFeaturedItem } from '../lib/events';
import { fetchPublishedBusinesses, type BusinessRow } from '../lib/businesses';
import { fetchOpenWantedItems, type WantedItemRow } from '../lib/wanted';
import { fetchCommunityPosts } from '../lib/database';
import type { CommunityPost } from '../lib/supabase';
import { geocodeCached } from '../lib/geocode';
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
  buildRemoteBoostedSlides,
  composeSlideshow,
  buildCategoryRows,
  type FeaturedFilter,
  type FeaturedSlide,
} from '../lib/discoverFeatured';

const LOG = '[DISCOVER]';

// Default radius (miles) for location filtering. Expands in steps when empty.
const NEAR_RADIUS_DEFAULT = 40;

// Slides shown in the rotating hero. The grid below shows the full set.
const SLIDESHOW_CAP = 8;
// Hero positions reserved for boosted content from anywhere (Decision 2) so
// paid/Pro promotion is seen even outside the viewer's local radius.
const SLIDESHOW_REMOTE_RESERVE = 3;
// How often the per-event collectible rotation advances (Decision 4) — a
// 10-item event shows different collectibles across visits rather than the same
// one forever.
const SLIDESHOW_ROTATE_MS = 30 * 60 * 1000;

const FILTERS: { key: FeaturedFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'event', label: 'Events' },
  { key: 'find', label: 'Flash Finds' },
  { key: 'business', label: 'Businesses' },
  { key: 'wanted', label: 'Wanted' },
];

// Remember the last-selected chip across visits (spec: persisted locally).
const FILTER_STORE_KEY = 'tt_discover_filter';
const FILTER_KEYS = FILTERS.map((f) => f.key);

function readSavedFilter(): FeaturedFilter {
  try {
    const v = localStorage.getItem(FILTER_STORE_KEY);
    if (v && (FILTER_KEYS as string[]).includes(v)) return v as FeaturedFilter;
  } catch { /* ignore */ }
  return 'all';
}

export default function Discover() {
  const navigate = useNavigate();
  const goSearch = useGlobalSearch();
  const { profile } = useAuth();

  const [events, setEvents] = useState<EventRow[]>([]);
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [wanted, setWanted] = useState<WantedItemRow[]>([]);
  const [finds, setFinds] = useState<CommunityPost[]>([]);
  const [eventItems, setEventItems] = useState<EventFeaturedItem[]>([]);
  const [findCoords, setFindCoords] = useState<Map<string, { lat: number; lng: number }>>(new Map());
  const [proHolders, setProHolders] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FeaturedFilter>(readSavedFilter);
  const savedLocation = useSavedLocation();
  const [nearRadius, setNearRadius] = useState(NEAR_RADIUS_DEFAULT);

  // Persist the chip selection so it's remembered on the next visit.
  useEffect(() => {
    try { localStorage.setItem(FILTER_STORE_KEY, filter); } catch { /* ignore */ }
  }, [filter]);

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

      // Surface collectibles uploaded inside events (Hot Wheels, cards, etc.)
      // as their own Discover slides. Best-effort — returns [] on error.
      if (evs.length) {
        const items = await fetchFeaturedItemsForEvents(evs.map((x) => x.id));
        if (!cancelled) setEventItems(items);
      }

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

  // Community finds have no coordinate columns, so geocode their free-text
  // location at read time (cached) to let them be distance-filtered like the
  // other content types. Runs after finds load and doesn't block the hero.
  useEffect(() => {
    if (!finds.length) return;
    let cancelled = false;
    (async () => {
      const next = new Map<string, { lat: number; lng: number }>();
      for (const p of finds) {
        const loc = (p.location ?? '').trim();
        if (!loc) continue;
        const pt = await geocodeCached(loc);
        if (cancelled) return;
        if (pt) next.set(p.id, pt);
      }
      if (!cancelled) setFindCoords(next);
    })();
    return () => { cancelled = true; };
  }, [finds]);

  // Full ranked set across all kinds (location + search applied). Kind chips
  // filter this without re-ranking.
  const base = useMemo(
    () => buildFeaturedSlides({
      events, businesses, wanted, finds, eventItems, proHolders, findCoords,
      location: savedLocation ? { lat: savedLocation.lat, lng: savedLocation.lng } : null,
      radiusMi: nearRadius,
      query,
      filter: 'all',
    }),
    [events, businesses, wanted, finds, eventItems, proHolders, findCoords, savedLocation, nearRadius, query],
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

  // Boosted content from OUTSIDE the local radius (Decision 2). Empty when no
  // location is set. A few of these are mixed into the hero so a boosted
  // out-of-area seller (e.g. Boise) is still seen from California — the grid
  // below stays strictly local.
  const remoteBoosted = useMemo(
    () => buildRemoteBoostedSlides({
      events, businesses, wanted, finds, eventItems, proHolders, findCoords,
      location: savedLocation ? { lat: savedLocation.lat, lng: savedLocation.lng } : null,
      radiusMi: nearRadius,
      query,
      filter: 'all',
    }),
    [events, businesses, wanted, finds, eventItems, proHolders, findCoords, savedLocation, nearRadius, query],
  );

  // Rotation seed advances over time so multi-collectible events show different
  // items across visits (Decision 4). Computed once per mount.
  const rotation = useMemo(() => Math.floor(Date.now() / SLIDESHOW_ROTATE_MS), []);

  // Hero slideshow: majority local + a few reserved out-of-radius boosts, with
  // each event capped + collectibles rotated and no two adjacent slides from
  // the same event (Decision 2 + 4).
  const heroSlides = useMemo(() => {
    const localF = filter === 'all' ? base : base.filter((sl) => sl.kind === filter);
    const remoteF = filter === 'all' ? remoteBoosted : remoteBoosted.filter((sl) => sl.kind === filter);
    return composeSlideshow(localF, remoteF, {
      cap: SLIDESHOW_CAP,
      reserveRemote: SLIDESHOW_REMOTE_RESERVE,
      perGroupMax: 2,
      rotation,
    });
  }, [base, remoteBoosted, filter, rotation]);

  // Themed sub-rows for the selected category (Auctions, Estate Sales, Hot
  // Wheels…). Built from the full ranked set so boosted items stay on top of
  // each row; empty rows are omitted by buildCategoryRows.
  const categoryRows = useMemo(
    () => buildCategoryRows(base, filter),
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
              <Users size={16} style={{ color: 'var(--tt-text)' }} />
            </button>
            <NotificationBell />
          </div>
        </div>
        <div style={s.searchRow}>
          <Search size={15} style={{ color: 'var(--tt-text-dim)', flexShrink: 0 }} />
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

      <section style={s.introHead}>
        <h2 style={s.introTitle}>What are you looking for today?</h2>
        <p style={s.introSub}>Browse events, Flash Finds, businesses, and more.</p>
      </section>

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
        <button style={{ ...s.chip, ...s.chipDisabled }} disabled aria-disabled="true" title="Seller profiles are coming soon">
          Sellers
          <span style={s.chipSoon}>Soon</span>
        </button>
      </div>

      <LocationControl radius={nearRadius} />

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

      {loaded ? (
        <FeaturedSlideshow
          slides={heroSlides}
          filterKey={filterKey}
          onOpen={(to) => navigate(to)}
        />
      ) : (
        <SlideshowSkeleton />
      )}

      {loaded && categoryRows.length > 0 && (
        <div style={s.rowsWrap}>
          {categoryRows.map((row) => (
            <CategoryRowStrip
              key={row.key}
              title={row.title}
              slides={row.slides}
              onOpen={(to) => navigate(to)}
            />
          ))}
        </div>
      )}

      <div style={{ padding: '8px 0 4px' }}>
        <HostEventCTA variant="home" />
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
          <MapPin size={13} style={{ color: 'var(--tt-accent)' }} />
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
        <MapPin size={15} style={{ color: 'var(--tt-text-dim)', flexShrink: 0 }} />
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

/* ---------- Category row (horizontal themed strip) ---------- */

function CategoryRowStrip({
  title, slides, onOpen,
}: { title: string; slides: FeaturedSlide[]; onOpen: (to: string) => void }) {
  return (
    <section style={s.row}>
      <h3 style={s.rowTitle}>{title}</h3>
      <div className="tt-hscroll" style={s.rowScroll}>
        {slides.map((sl) => (
          <button key={sl.id} style={s.rowCard} onClick={() => onOpen(sl.to)} aria-label={`Open ${sl.title}`}>
            <div style={s.rowCardImg}>
              <ImageWithFade
                src={sl.image}
                fallbackSrc={sl.imageFull}
                alt={sl.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                fallback={
                  <MediaFallback
                    kind={sl.fallbackKind}
                    category={sl.fallbackCategory ?? undefined}
                    seed={sl.id}
                  />
                }
              />
              {sl.badge && <span style={s.rowCardBadge}>{sl.badge}</span>}
            </div>
            <div style={s.rowCardBody}>
              <div style={s.rowCardTitle}>{sl.title}</div>
              <div style={s.rowCardMeta}>{sl.subtitle}</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function SlideshowSkeleton() {
  return (
    <div style={{ padding: '0 16px' }}>
      <div style={{ ...s.skel, aspectRatio: '16 / 10', maxHeight: 320, borderRadius: 18 }} />
    </div>
  );
}

/* ---------- styles (light theme via --tt-* tokens) ---------- */

const s: Record<string, CSSProperties> = {
  page: {
    overflowX: 'hidden',
    WebkitOverflowScrolling: 'touch',
    background: 'radial-gradient(900px 500px at 50% -10%, var(--tt-accent-soft), transparent 60%), var(--tt-bg)',
    color: 'var(--tt-text)',
    paddingBottom: 16,
  },
  header: {
    position: 'sticky', top: 0, zIndex: 20,
    padding: '12px 16px 10px',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
    background: 'var(--tt-header-bg)',
    backdropFilter: 'blur(10px)',
    borderBottom: '1px solid var(--tt-border)',
  },
  brandRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { display: 'flex', alignItems: 'center', gap: 8 },
  followingBtn: {
    position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 40, minHeight: 40, width: 40, height: 40,
    border: '1px solid var(--tt-border)', backgroundColor: 'var(--tt-surface-2)',
    borderRadius: 999, cursor: 'pointer', padding: 0,
  },
  brandWord: {
    fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em',
    background: 'var(--tt-accent-gradient)',
    WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
  },
  searchRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    marginTop: 10, padding: '10px 12px',
    background: 'var(--tt-surface-2)',
    border: '1px solid var(--tt-border)',
    borderRadius: 12,
  },
  searchInput: {
    flex: 1, minWidth: 0,
    background: 'transparent', border: 'none', outline: 'none',
    color: 'var(--tt-text)', fontSize: 14,
  },
  clearSearch: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 24, height: 24, borderRadius: 999, flexShrink: 0,
    border: 'none', background: 'var(--tt-surface-3)', color: 'var(--tt-text)', cursor: 'pointer', padding: 0,
  },
  introHead: { padding: '16px 16px 4px' },
  introTitle: { margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--tt-text)', letterSpacing: '-0.01em' },
  introSub: { margin: '4px 0 0', fontSize: 13, color: 'var(--tt-text-muted)' },

  featuredHead: { padding: '18px 16px 10px' },
  featuredTitle: { margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--tt-text)', letterSpacing: '-0.01em' },
  featuredSub: { margin: '3px 0 0', fontSize: 12, color: 'var(--tt-text-muted)' },

  // Location control
  locBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    margin: '0 16px 12px',
  },
  locPill: {
    display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0,
    fontSize: 12.5, fontWeight: 700, color: 'var(--tt-text)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  locRadius: { color: 'var(--tt-text-muted)', fontWeight: 600 },
  locChange: {
    flexShrink: 0, padding: '6px 12px', borderRadius: 999,
    background: 'var(--tt-surface-2)', border: '1px solid var(--tt-border)',
    color: 'var(--tt-accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
  },
  locEditor: {
    margin: '0 16px 12px', padding: 12, borderRadius: 14,
    background: 'var(--tt-surface)', border: '1px solid var(--tt-border)',
  },
  locInputRow: { display: 'flex', alignItems: 'center', gap: 8 },
  locInput: {
    flex: 1, minWidth: 0, padding: '9px 10px', borderRadius: 10,
    background: 'var(--tt-surface-2)', border: '1px solid var(--tt-border)',
    color: 'var(--tt-text)', fontSize: 15, outline: 'none',
  },
  locSave: {
    flexShrink: 0, padding: '9px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
    background: 'var(--tt-accent)', color: 'var(--tt-accent-contrast)', fontSize: 13, fontWeight: 800,
  },
  locBtns: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  locGhost: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 12px', borderRadius: 10,
    background: 'var(--tt-surface-2)', border: '1px solid var(--tt-border)',
    color: 'var(--tt-text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
  },
  locErr: { margin: '8px 0 0', fontSize: 12, color: '#dc2626' },

  // Chips
  chips: {
    display: 'flex', flexWrap: 'nowrap', gap: 8,
    padding: '14px 16px 6px',
    overflowX: 'auto',
  },
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
    padding: '8px 14px', borderRadius: 999,
    background: 'var(--tt-surface-2)', border: '1px solid var(--tt-border)',
    color: 'var(--tt-text-muted)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  chipActive: {
    background: 'var(--tt-accent)', border: '1px solid var(--tt-accent)', color: 'var(--tt-accent-contrast)',
  },
  chipCount: {
    fontSize: 11, fontWeight: 800,
    padding: '1px 7px', borderRadius: 999,
    background: 'var(--tt-surface-3)', color: 'var(--tt-text-muted)',
  },
  chipCountActive: { background: 'rgba(0,0,0,0.18)', color: 'var(--tt-accent-contrast)' },
  chipDisabled: { opacity: 0.55, cursor: 'default' },
  chipSoon: {
    fontSize: 9.5, fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase',
    padding: '1px 6px', borderRadius: 999,
    background: 'var(--tt-surface-3)', color: 'var(--tt-text-muted)',
  },

  // Category rows (themed horizontal strips)
  rowsWrap: { padding: '4px 0 0' },
  row: { padding: '10px 0 2px' },
  rowTitle: {
    margin: '0 0 8px', padding: '0 16px',
    fontSize: 15, fontWeight: 800, color: 'var(--tt-text)', letterSpacing: '-0.01em',
  },
  rowScroll: {
    display: 'flex', flexWrap: 'nowrap', gap: 12,
    padding: '0 16px 4px', overflowX: 'auto',
  },
  rowCard: {
    display: 'flex', flexDirection: 'column', textAlign: 'left', flexShrink: 0,
    width: 150,
    background: 'var(--tt-surface)', border: '1px solid var(--tt-border)',
    borderRadius: 14, overflow: 'hidden', cursor: 'pointer', padding: 0,
    color: 'var(--tt-text)', WebkitTapHighlightColor: 'transparent',
  },
  rowCardImg: { position: 'relative', width: '100%', aspectRatio: '4 / 3', background: 'var(--tt-image-bg)' },
  rowCardBadge: {
    position: 'absolute', top: 6, left: 6,
    padding: '2px 7px', borderRadius: 999, fontSize: 9.5, fontWeight: 800,
    background: 'rgba(249,115,22,0.95)', color: '#1a0c00',
  },
  rowCardBody: { padding: '8px 9px 10px' },
  rowCardTitle: {
    margin: 0, fontSize: 12.5, fontWeight: 800, color: 'var(--tt-text)', lineHeight: 1.25,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  },
  rowCardMeta: {
    margin: '3px 0 0', fontSize: 11, color: 'var(--tt-text-muted)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },

  // Grid
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12,
    padding: '12px 16px 4px',
  },
  card: {
    display: 'flex', flexDirection: 'column', textAlign: 'left',
    background: 'var(--tt-surface)', border: '1px solid var(--tt-border)',
    borderRadius: 14, overflow: 'hidden', cursor: 'pointer', padding: 0,
    color: 'var(--tt-text)', WebkitTapHighlightColor: 'transparent',
  },
  cardImg: { position: 'relative', width: '100%', aspectRatio: '4 / 3', background: 'var(--tt-image-bg)' },
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
    margin: 0, fontSize: 13.5, fontWeight: 800, color: 'var(--tt-text)', lineHeight: 1.25,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  },
  cardMeta: {
    margin: '4px 0 0', fontSize: 11.5, color: 'var(--tt-text-muted)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },

  // Empty + skeleton
  gridEmpty: {
    margin: '12px 16px 4px', padding: '28px 20px', borderRadius: 16, textAlign: 'center',
    background: 'var(--tt-surface)', border: '1px dashed var(--tt-border-strong)',
  },
  gridEmptyTitle: { margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--tt-text)' },
  gridEmptyBody: { margin: '6px 0 0', fontSize: 13, color: 'var(--tt-text-muted)' },
  expandBtn: {
    marginTop: 14, padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
    background: 'var(--tt-accent)', color: 'var(--tt-accent-contrast)', fontSize: 13, fontWeight: 800,
  },
  skel: { width: '100%', background: 'var(--tt-surface-3)' },
};
