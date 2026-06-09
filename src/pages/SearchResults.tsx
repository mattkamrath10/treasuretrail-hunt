import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Search as SearchIcon, Bell, Globe, ShoppingBag, ExternalLink, ClipboardList, MapPin } from 'lucide-react';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { MediaFallback, type FallbackKind } from '../components/ui/MediaFallback';
import { ensureUiKeyframes } from '../components/ui/keyframes';
import { runSearch } from '../lib/search/searchService';
import { googleSearchUrl, googleShoppingUrl } from '../lib/search/googleFallback';
import { geocodeLocation, type GeoPoint } from '../lib/geocode';
import type { SearchOutcome, SearchResultItem, SearchResultKind } from '../lib/search/types';
import { useAuth } from '../context/AuthContext';
import { createSavedSearch } from '../lib/savedSearches';
import { setPendingIntent } from '../lib/pendingIntent';
import { flashToast } from '../lib/toast';
import WantedWizard from '../components/wanted/WantedWizard';

function fallbackKind(kind: SearchResultKind): FallbackKind {
  switch (kind) {
    case 'flash_find':
      return 'find';
    case 'business':
      return 'listing';
    case 'estate_sale':
      return 'estate_sale';
    case 'yard_sale':
      return 'yard_sale';
    case 'auction':
      return 'auction';
    case 'listing':
    case 'external':
    default:
      return 'listing';
  }
}

// Travel radius options for the search location control. 'any' = no limit.
const RADIUS_OPTS: { key: string; label: string }[] = [
  { key: '10', label: 'Within 10 mi' },
  { key: '25', label: 'Within 25 mi' },
  { key: '50', label: 'Within 50 mi' },
  { key: '100', label: 'Within 100 mi' },
  { key: 'any', label: 'Anywhere' },
];

const LOC_KEY = 'tt_search_loc';
const ORIGIN_KEY = 'tt_search_origin';
const RADIUS_KEY = 'tt_search_radius';
const DEFAULT_RADIUS = '25';

// Only accept a radius key the control actually offers; a corrupted localStorage
// value would otherwise yield NaN and silently break the "Near You" bucket.
function readRadiusKey(): string {
  const stored = localStorage.getItem(RADIUS_KEY);
  return stored && RADIUS_OPTS.some((o) => o.key === stored) ? stored : DEFAULT_RADIUS;
}

function readOrigin(): GeoPoint | null {
  try {
    const raw = localStorage.getItem(ORIGIN_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return Number.isFinite(p?.lat) && Number.isFinite(p?.lng) ? { lat: p.lat, lng: p.lng } : null;
  } catch {
    return null;
  }
}

function distanceLabel(miles: number | null | undefined): string | null {
  if (typeof miles !== 'number' || !Number.isFinite(miles)) return null;
  if (miles < 0.1) return 'Less than 1 mi away';
  const rounded = miles < 10 ? Math.round(miles * 10) / 10 : Math.round(miles);
  return `${rounded} mi away`;
}

function priceLabel(price: SearchResultItem['price']): string | null {
  if (price === null || price === undefined || price === '') return null;
  if (typeof price === 'number') {
    if (!Number.isFinite(price) || price <= 0) return null;
    return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
  const s = String(price).trim();
  if (!s) return null;
  return s.startsWith('$') ? s : `$${s}`;
}

export default function SearchResults() {
  ensureUiKeyframes();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { user, isGuest, exitGuestMode } = useAuth();
  const query = (params.get('q') ?? '').trim();

  const [input, setInput] = useState(query);
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [notified, setNotified] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const resumedRef = useRef(false);

  // Local-First Search: the searcher's location + travel radius, persisted so
  // it's remembered across sessions. `origin` drives distance sectioning.
  const [locInput, setLocInput] = useState(() => localStorage.getItem(LOC_KEY) ?? '');
  const [origin, setOrigin] = useState<GeoPoint | null>(readOrigin);
  const [radiusKey, setRadiusKey] = useState(readRadiusKey);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'notfound'>('idle');

  const radiusMiles = radiusKey === 'any' ? null : Number(radiusKey);
  const originLat = origin?.lat ?? null;
  const originLng = origin?.lng ?? null;

  // Resume a guest's "Create Wanted Request" after they sign in: AppShell
  // routes them back here with state.openWizard once authenticated.
  useEffect(() => {
    const st = location.state as { openWizard?: boolean } | null;
    if (st?.openWizard && user && query && !resumedRef.current) {
      resumedRef.current = true;
      setWizardOpen(true);
      // Clear the flag so a back/refresh doesn't reopen the wizard.
      navigate(location.pathname + location.search, { replace: true, state: {} });
    }
  }, [location, user, query, navigate]);

  useEffect(() => {
    setInput(query);
  }, [query]);

  useEffect(() => {
    if (!query) {
      setOutcome({ term: '', source: null, label: null, items: [], sections: [] });
      setLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setNotified(false);
    const opts = {
      signal: controller.signal,
      origin: originLat != null && originLng != null ? { lat: originLat, lng: originLng } : null,
      radiusMiles,
    };
    runSearch(query, opts)
      .then((res) => {
        if (!cancelled) setOutcome(res);
      })
      .catch(() => {
        if (!cancelled) setOutcome({ term: query, source: null, label: null, items: [], sections: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [query, originLat, originLng, radiusMiles]);

  const submit = (term: string) => {
    const q = term.trim();
    if (!q) return;
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  // Geocode the typed location into an origin used for distance sectioning.
  // Empty input clears the location (search falls back to nationwide).
  async function resolveLocation() {
    const raw = locInput.trim();
    if (!raw) {
      setOrigin(null);
      setGeoStatus('idle');
      localStorage.removeItem(LOC_KEY);
      localStorage.removeItem(ORIGIN_KEY);
      return;
    }
    setGeoStatus('loading');
    try {
      const res = await geocodeLocation(raw);
      if (res.ok) {
        setOrigin(res.point);
        setGeoStatus('idle');
        localStorage.setItem(LOC_KEY, raw);
        localStorage.setItem(ORIGIN_KEY, JSON.stringify(res.point));
      } else {
        setOrigin(null);
        setGeoStatus('notfound');
        localStorage.removeItem(ORIGIN_KEY);
      }
    } catch {
      setGeoStatus('notfound');
    }
  }

  function changeRadius(key: string) {
    setRadiusKey(key);
    localStorage.setItem(RADIUS_KEY, key);
  }

  async function handleNotify() {
    if (!query) return;
    if (isGuest || !user) {
      flashToast('Sign in to get notified when this is listed', 'info');
      return;
    }
    const { error } = await createSavedSearch(user.id, { keywords: query, name: query });
    if (error) {
      flashToast('Could not set up your alert', 'error');
      return;
    }
    setNotified(true);
    flashToast('We will notify you when a match is listed', 'success');
  }

  function handleCreateWanted() {
    if (!query) return;
    if (isGuest || !user) {
      // Stash the intent and bounce to auth. Leaving /search lets App.tsx's
      // gate render Login; AppShell resumes the wizard once signed in.
      setPendingIntent({ kind: 'create_wanted', term: query });
      if (isGuest) exitGuestMode();
      navigate('/');
      return;
    }
    setWizardOpen(true);
  }

  const items = outcome?.items ?? [];
  const sections = outcome?.sections ?? [];
  const hasResults = items.length > 0;

  const headerSubtitle = useMemo(() => {
    if (!query) return 'Type to search the marketplace';
    if (loading) return 'Searching…';
    if (hasResults) return `${items.length} result${items.length === 1 ? '' : 's'}`;
    return 'No results';
  }, [query, loading, hasResults, items.length]);

  return (
    <div style={s.container}>
      <header style={s.header}>
        <button onClick={() => navigate(-1)} style={s.iconBtn} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={s.title}>Search</h1>
          <p style={s.subtitle}>{headerSubtitle}</p>
        </div>
      </header>

      <div style={s.searchWrap}>
        <SearchIcon size={16} style={{ color: 'var(--color-neutral-400)' }} />
        <input
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoFocus={!query}
          placeholder="Search the marketplace…"
          style={s.searchInput}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit(input);
          }}
        />
        {input.trim() && (
          <button onClick={() => submit(input)} style={s.goBtn}>
            Search
          </button>
        )}
      </div>

      <div style={s.locWrap}>
        <MapPin size={15} style={{ color: 'var(--color-neutral-400)', flexShrink: 0 }} />
        <input
          type="text"
          inputMode="text"
          placeholder="ZIP or City, State — find it nearby"
          style={s.locInput}
          value={locInput}
          onChange={(e) => setLocInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') resolveLocation(); }}
          onBlur={resolveLocation}
        />
        <select
          style={s.radiusSelect}
          value={radiusKey}
          onChange={(e) => changeRadius(e.target.value)}
          aria-label="Search radius"
        >
          {RADIUS_OPTS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>
      {geoStatus === 'loading' && <div style={s.locHint}>Finding that location…</div>}
      {geoStatus === 'notfound' && (
        <div style={s.locHintWarn}>Couldn’t find that location — showing all results.</div>
      )}
      {origin && geoStatus === 'idle' && locInput.trim() && (
        <div style={s.locHint}>📍 Nearby results first{radiusMiles ? ` (within ${radiusMiles} mi)` : ''}</div>
      )}

      <div style={s.scroll}>
        {loading && (
          <div style={s.center}>
            <div style={s.spinner} aria-label="Searching" />
            <span style={s.muted}>Searching TreasureTrail…</span>
          </div>
        )}

        {!loading && hasResults && (
          <>
            {sections.map((sec) => (
              <div key={sec.key} style={s.section}>
                <div style={s.sourceLabel}>{sec.label}</div>
                <div style={s.grid}>
                  {sec.items.map((item) => (
                    <ResultCard key={`${item.source}:${item.id}`} item={item} onOpen={navigate} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {!loading && !hasResults && query && (
          <div style={s.empty}>
            <div style={s.emptyIcon}>
              <SearchIcon size={28} style={{ color: 'var(--color-neutral-400)' }} />
            </div>
            <h2 style={s.emptyTitle}>No results found on TreasureTrail Marketplace.</h2>
            <p style={s.emptyText}>
              We could not find “{query}” yet. Get notified when it is listed, or search the web.
            </p>

            <div style={s.actions}>
              <button onClick={handleNotify} disabled={notified} style={{ ...s.primaryBtn, ...(notified ? s.primaryBtnDone : {}) }}>
                <Bell size={16} />
                {notified ? 'Alert is on' : 'Notify Me When Listed'}
              </button>

              <button onClick={handleCreateWanted} style={s.createBtn}>
                <ClipboardList size={16} />
                Create Wanted Request
              </button>

              <a href={googleSearchUrl(query)} target="_blank" rel="noopener noreferrer" style={s.secondaryBtn}>
                <Globe size={16} />
                Search Google
              </a>

              <a href={googleShoppingUrl(query)} target="_blank" rel="noopener noreferrer" style={s.secondaryBtn}>
                <ShoppingBag size={16} />
                Search Google Shopping
              </a>
            </div>
          </div>
        )}

        {!loading && !query && (
          <div style={s.empty}>
            <div style={s.emptyIcon}>
              <SearchIcon size={28} style={{ color: 'var(--color-neutral-400)' }} />
            </div>
            <p style={s.emptyText}>Search listings, auctions, estate &amp; yard sales, flash finds and more.</p>
          </div>
        )}
      </div>

      {wizardOpen && user && (
        <WantedWizard
          initialTerm={query}
          userId={user.id}
          onClose={() => setWizardOpen(false)}
          onCreated={(id) => { setWizardOpen(false); navigate(`/wanted/${id}`); }}
        />
      )}
    </div>
  );
}

function ResultCard({ item, onOpen }: { item: SearchResultItem; onOpen: (to: string) => void }) {
  const price = priceLabel(item.price);
  const dist = distanceLabel(item.distanceMiles);
  const isExternal = !!item.externalUrl;

  const inner = (
    <>
      <div style={s.cardImageWrap}>
        <ImageWithFade
          src={item.imageUrl ?? undefined}
          alt={item.title}
          style={s.cardImage}
          fallback={<MediaFallback kind={fallbackKind(item.kind)} category={item.category} seed={item.id} />}
        />
        {isExternal && (
          <span style={s.externalBadge}>
            <ExternalLink size={11} /> {item.subtitle || 'External'}
          </span>
        )}
      </div>
      <div style={s.cardBody}>
        <span style={s.cardTitle}>{item.title}</span>
        {price ? (
          <span style={s.cardPrice}>{price}</span>
        ) : item.subtitle && !isExternal ? (
          <span style={s.cardSub}>{item.subtitle}</span>
        ) : null}
        {dist && (
          <span style={s.cardDistance}>
            <MapPin size={10} /> {dist}
          </span>
        )}
      </div>
    </>
  );

  if (isExternal) {
    return (
      <a href={item.externalUrl!} target="_blank" rel="noopener noreferrer" style={s.card}>
        {inner}
      </a>
    );
  }
  return (
    <button onClick={() => item.route && onOpen(item.route)} style={s.card}>
      {inner}
    </button>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: 'var(--color-neutral-50)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: 'max(env(safe-area-inset-top), 12px) 14px 10px',
    backgroundColor: 'var(--color-surface, #fff)',
    borderBottom: '1px solid var(--color-neutral-200)',
  },
  iconBtn: {
    minWidth: 40,
    minHeight: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    color: 'var(--color-neutral-700)',
    cursor: 'pointer',
  },
  title: { fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--color-neutral-900)' },
  subtitle: { fontSize: 12, margin: 0, color: 'var(--color-neutral-500)' },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    margin: '12px 14px 4px',
    padding: '10px 12px',
    backgroundColor: 'var(--color-surface, #fff)',
    border: '1px solid var(--color-neutral-200)',
    borderRadius: 'var(--radius-lg, 14px)',
  },
  searchInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: 15,
    background: 'transparent',
    color: 'var(--color-neutral-900)',
  },
  goBtn: {
    border: 'none',
    background: 'var(--color-primary-600)',
    color: '#fff',
    fontWeight: 600,
    fontSize: 13,
    padding: '7px 12px',
    borderRadius: 'var(--radius-md, 10px)',
    cursor: 'pointer',
  },
  scroll: { flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '8px 14px 100px' },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '48px 0' },
  spinner: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    border: '3px solid var(--color-neutral-200)',
    borderTopColor: 'var(--color-primary-600)',
    animation: 'ttSpin 0.8s linear infinite',
  },
  muted: { fontSize: 13, color: 'var(--color-neutral-500)' },
  section: { marginBottom: 18 },
  sourceLabel: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: 'var(--color-neutral-500)',
    margin: '8px 2px 12px',
  },
  locWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    margin: '6px 14px 0',
    padding: '8px 12px',
    backgroundColor: 'var(--color-surface, #fff)',
    border: '1px solid var(--color-neutral-200)',
    borderRadius: 'var(--radius-lg, 14px)',
  },
  locInput: {
    flex: 1,
    minWidth: 0,
    border: 'none',
    outline: 'none',
    fontSize: 14,
    background: 'transparent',
    color: 'var(--color-neutral-900)',
  },
  radiusSelect: {
    flexShrink: 0,
    border: '1px solid var(--color-neutral-200)',
    borderRadius: 'var(--radius-md, 10px)',
    background: 'var(--color-neutral-50)',
    color: 'var(--color-neutral-700)',
    fontSize: 12.5,
    fontWeight: 600,
    padding: '6px 6px',
    cursor: 'pointer',
  },
  locHint: { fontSize: 12, color: 'var(--color-neutral-500)', margin: '6px 16px 0' },
  locHintWarn: { fontSize: 12, color: '#b45309', margin: '6px 16px 0' },
  cardDistance: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    fontSize: 11.5,
    fontWeight: 600,
    color: 'var(--color-primary-600)',
    marginTop: 1,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 12,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'left',
    padding: 0,
    border: '1px solid var(--color-neutral-200)',
    borderRadius: 'var(--radius-lg, 14px)',
    overflow: 'hidden',
    backgroundColor: 'var(--color-surface, #fff)',
    cursor: 'pointer',
    textDecoration: 'none',
    color: 'inherit',
  },
  cardImageWrap: { position: 'relative', width: '100%', aspectRatio: '1 / 1', backgroundColor: 'var(--color-neutral-100)' },
  cardImage: { width: '100%', height: '100%', objectFit: 'cover' },
  externalBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    fontSize: 10,
    fontWeight: 700,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.65)',
    padding: '3px 6px',
    borderRadius: 6,
    textTransform: 'capitalize',
  },
  cardBody: { display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 10px 10px' },
  cardTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-neutral-900)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
  cardPrice: { fontSize: 13, fontWeight: 700, color: 'var(--color-primary-600)' },
  cardSub: { fontSize: 12, color: 'var(--color-neutral-500)' },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '40px 16px' },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    backgroundColor: 'var(--color-neutral-100)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 16, fontWeight: 700, color: 'var(--color-neutral-900)', margin: '0 0 6px' },
  emptyText: { fontSize: 13.5, color: 'var(--color-neutral-500)', margin: '0 0 20px', maxWidth: 320, lineHeight: 1.5 },
  actions: { display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 320 },
  primaryBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '13px 16px',
    border: 'none',
    borderRadius: 'var(--radius-lg, 14px)',
    backgroundColor: 'var(--color-primary-600)',
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
  },
  primaryBtnDone: { backgroundColor: 'var(--color-neutral-400)', cursor: 'default' },
  createBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '13px 16px',
    border: '1px solid var(--color-primary-600)',
    borderRadius: 'var(--radius-lg, 14px)',
    backgroundColor: 'var(--color-primary-50, #eef2ff)',
    color: 'var(--color-primary-700, var(--color-primary-600))',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
  },
  secondaryBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '13px 16px',
    border: '1px solid var(--color-neutral-300)',
    borderRadius: 'var(--radius-lg, 14px)',
    backgroundColor: 'var(--color-surface, #fff)',
    color: 'var(--color-neutral-800)',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    textDecoration: 'none',
  },
};
