import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { MapPin, Search, LocateFixed, X, ChevronRight, Navigation, Repeat } from 'lucide-react';
import {
  fetchPublishedEvents,
  type EventRow,
  type EventCategory,
} from '../lib/events';
import { describeRecurrence } from '../lib/recurrence';
import {
  geocodeLocation,
  haversineMiles,
  type GeoPoint,
} from '../lib/geocode';
import { isIOS } from '../lib/platform';
import { getSavedLocation } from '../lib/userLocation';

/* --------------------------------------------------------------------------
 * Interactive Event Map.
 *
 * A full-screen Leaflet map of in-person events. Online/livestream events are
 * excluded (they have no physical location). Pins are colored by category and
 * clustered when zoomed out. A ZIP / "City, State" search box and a "use my
 * location" button recenter the map; a radius selector (default 75 mi) limits
 * which events show. Tapping a pin opens a card with View Details + Directions.
 *
 * Leaflet is driven imperatively (no react-leaflet) to stay simple under React
 * 19 and to avoid the default-marker-icon asset issue — every marker is a
 * custom div icon, so no image assets are referenced.
 * ------------------------------------------------------------------------ */

const DEFAULT_RADIUS_MILES = 75;
const RADIUS_OPTIONS: Array<{ value: number | 'any'; label: string }> = [
  { value: 10, label: '10 mi' },
  { value: 25, label: '25 mi' },
  { value: 50, label: '50 mi' },
  { value: 75, label: '75 mi' },
  { value: 100, label: '100 mi' },
  { value: 150, label: '150 mi' },
  { value: 250, label: '250 mi' },
  { value: 'any', label: 'Any distance' },
];

// Geographic center of the contiguous US — the fallback view before the user
// searches a location or shares their position.
const US_CENTER: GeoPoint = { lat: 39.5, lng: -98.35 };

const CATEGORY_META: Record<EventCategory, { label: string; color: string }> = {
  estate_sale:       { label: 'Estate Sale',       color: '#8b5cf6' },
  yard_sale:         { label: 'Yard Sale',         color: '#10b981' },
  flea_market:       { label: 'Flea Market',       color: '#f59e0b' },
  auction:           { label: 'Auction',           color: '#ef4444' },
  pop_up:            { label: 'Pop-Up',            color: '#ec4899' },
  collectibles_show: { label: 'Collectibles Show', color: '#3b82f6' },
  other:             { label: 'Event',             color: '#6b7280' },
};

function categoryMeta(c: EventCategory | null | undefined) {
  return CATEGORY_META[(c ?? 'other') as EventCategory] ?? CATEGORY_META.other;
}

/** Teardrop pin as an inline-SVG div icon, tinted by category color. */
function pinIcon(color: string): L.DivIcon {
  const html = `
    <div style="position:relative;width:30px;height:38px;transform:translate(-50%,-100%);">
      <svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 13 21.5 14.1 22.4a1.4 1.4 0 0 0 1.8 0C17 36.5 30 25.5 30 15 30 6.7 23.3 0 15 0z" fill="${color}"/>
        <circle cx="15" cy="14.5" r="6" fill="#ffffff"/>
      </svg>
    </div>`;
  return L.divIcon({
    html,
    className: 'tt-event-pin',
    iconSize: [30, 38],
    iconAnchor: [15, 38],
  });
}

/** Branded cluster bubble showing the contained marker count. */
function clusterIcon(count: number): L.DivIcon {
  const size = count < 10 ? 38 : count < 100 ? 46 : 54;
  const html = `
    <div style="
      width:${size}px;height:${size}px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      background:rgba(217,119,6,0.92);color:#fff;font-weight:800;
      font-size:${count < 100 ? 14 : 13}px;
      border:3px solid rgba(255,255,255,0.95);
      box-shadow:0 4px 12px rgba(217,119,6,0.45);
    ">${count}</div>`;
  return L.divIcon({
    html,
    className: 'tt-event-cluster',
    iconSize: [size, size],
  });
}

function directionsUrl(e: EventRow): string {
  const dest = `${e.lat},${e.lng}`;
  if (isIOS()) {
    return `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

function eventLocationLabel(e: EventRow): string {
  return [e.address, e.city, e.region].filter(Boolean).join(', ') || 'Location on map';
}

function formatWhen(starts_at: string): string {
  const d = new Date(starts_at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function EventsMap() {
  const navigate = useNavigate();

  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const didFitRef = useRef(false);

  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  // Default the map center to the user's saved location (set on Discover or in
  // Settings) so the map opens on their area and shows nearby events first.
  const [center, setCenter] = useState<GeoPoint | null>(() => {
    const saved = getSavedLocation();
    return saved ? { lat: saved.lat, lng: saved.lng } : null;
  });
  const [geoStatus, setGeoStatus] = useState<'idle' | 'searching' | 'ok' | 'not_found' | 'error'>('idle');
  const [radiusMiles, setRadiusMiles] = useState<number | 'any'>(DEFAULT_RADIUS_MILES);
  const [locating, setLocating] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  /* ----- Load published events once ----- */
  useEffect(() => {
    let cancelled = false;
    fetchPublishedEvents({ limit: 200 })
      .then((rows) => { if (!cancelled) setEvents(rows); })
      .catch((e: any) => { if (!cancelled) { setEvents([]); setLoadError(e?.message ?? 'Failed to load events'); } });
    return () => { cancelled = true; };
  }, []);

  /* ----- Debounced geocoding of the location search box ----- */
  useEffect(() => {
    const q = query.trim();
    if (!q) { if (geoStatus !== 'idle') setGeoStatus('idle'); return; }
    const ctrl = new AbortController();
    setGeoStatus('searching');
    const t = setTimeout(() => {
      geocodeLocation(q, ctrl.signal)
        .then((r) => {
          if (r.ok) { setCenter(r.point); setGeoStatus('ok'); }
          else { setGeoStatus(r.reason); }
        })
        .catch((e: any) => { if (e?.name !== 'AbortError') setGeoStatus('error'); });
    }, 600);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- Events that can appear on the map (in-person + has coordinates) ----- */
  const mappable = useMemo(
    () => (events ?? []).filter((e) => e.event_kind !== 'online' && e.lat != null && e.lng != null),
    [events],
  );

  /* ----- Apply the radius filter when a center is chosen ----- */
  const visible = useMemo(() => {
    if (!center || radiusMiles === 'any') return mappable;
    return mappable.filter((e) => haversineMiles(center, { lat: e.lat as number, lng: e.lng as number }) <= radiusMiles);
  }, [mappable, center, radiusMiles]);

  /* ----- Create the Leaflet map once ----- */
  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;
    const map = L.map(mapElRef.current, {
      center: [US_CENTER.lat, US_CENTER.lng],
      zoom: 4,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      iconCreateFunction: (c) => clusterIcon(c.getChildCount()),
    });
    map.addLayer(cluster);

    mapRef.current = map;
    clusterRef.current = cluster;

    // The page mounts inside a flex container; Leaflet may measure 0 height
    // until the layout settles, so force a re-measure on the next frame.
    setTimeout(() => map.invalidateSize(), 0);
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
  }, []);

  /* ----- (Re)build markers whenever the visible set changes ----- */
  useEffect(() => {
    const cluster = clusterRef.current;
    const map = mapRef.current;
    if (!cluster || !map) return;

    cluster.clearLayers();
    const markers: L.Marker[] = [];
    for (const e of visible) {
      const m = L.marker([e.lat as number, e.lng as number], {
        icon: pinIcon(categoryMeta(e.category).color),
        title: e.title,
      });
      m.on('click', () => setSelectedId(e.id));
      markers.push(m);
    }
    cluster.addLayers(markers);

    // Fit to all markers on first load (before any search recenters the map).
    if (!didFitRef.current && !center && markers.length > 0) {
      didFitRef.current = true;
      map.fitBounds(cluster.getBounds().pad(0.2), { maxZoom: 11 });
    }
  }, [visible, center]);

  /* ----- Recenter when the search center changes ----- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    const zoom =
      radiusMiles === 'any' ? 7
      : radiusMiles >= 250 ? 6
      : radiusMiles >= 150 ? 7
      : radiusMiles >= 100 ? 8
      : radiusMiles >= 75 ? 8
      : radiusMiles >= 50 ? 9
      : radiusMiles >= 25 ? 10
      : 11;
    map.setView([center.lat, center.lng], zoom, { animate: true });
  }, [center, radiusMiles]);

  function useMyLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoStatus('error');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setQuery('');
        setGeoStatus('ok');
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => { setLocating(false); setGeoStatus('error'); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  }

  const selected = selectedId ? visible.find((e) => e.id === selectedId) ?? null : null;

  const statusMsg = (() => {
    if (geoStatus === 'searching') return 'Finding that location…';
    if (geoStatus === 'not_found') return "Couldn't find that place. Try a ZIP or \"City, State\".";
    if (geoStatus === 'error') return locating ? "Couldn't get your location." : 'Location lookup failed. Try again.';
    return null;
  })();

  return (
    <div style={s.page}>
      {/* Header / controls */}
      <div style={s.header}>
        <div style={s.titleRow}>
          <MapPin size={20} style={{ color: 'var(--color-primary-600)' }} />
          <span style={s.title}>Event Map</span>
          <span style={s.count}>
            {events == null ? '…' : `${visible.length} ${visible.length === 1 ? 'event' : 'events'}`}
          </span>
        </div>

        <div style={s.searchRow}>
          <div style={s.searchBox}>
            <Search size={16} style={{ color: 'var(--color-neutral-400)', flexShrink: 0 }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ZIP or City, State"
              inputMode="text"
              style={s.input}
              aria-label="Search a location"
            />
            {query && (
              <button onClick={() => { setQuery(''); setGeoStatus('idle'); }} style={s.clearBtn} aria-label="Clear search">
                <X size={15} />
              </button>
            )}
          </div>
          <button onClick={useMyLocation} disabled={locating} style={s.locateBtn} aria-label="Use my location">
            <LocateFixed size={16} />
          </button>
        </div>

        <div style={s.radiusRow}>
          {RADIUS_OPTIONS.map((opt) => {
            const active = radiusMiles === opt.value;
            return (
              <button
                key={String(opt.value)}
                onClick={() => setRadiusMiles(opt.value)}
                style={{ ...s.radiusChip, ...(active ? s.radiusChipActive : {}) }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {statusMsg && <div style={s.status}>{statusMsg}</div>}
        {!center && radiusMiles !== 'any' && events != null && (
          <div style={s.hint}>Search a location or tap the locator to filter by distance.</div>
        )}
      </div>

      {/* Map */}
      <div style={s.mapWrap}>
        <div ref={mapElRef} style={s.map} />

        {loadError && (
          <div style={s.overlayMsg}>Couldn't load events. {loadError}</div>
        )}
        {!loadError && events != null && mappable.length === 0 && (
          <div style={s.overlayMsg}>No in-person events have a map location yet.</div>
        )}
        {!loadError && events != null && mappable.length > 0 && visible.length === 0 && (
          <div style={s.overlayMsg}>No events within this distance. Try a wider radius.</div>
        )}

        {/* Selected event card */}
        {selected && (
          <div style={s.card}>
            <button onClick={() => setSelectedId(null)} style={s.cardClose} aria-label="Close">
              <X size={16} />
            </button>
            <div style={s.cardBody}>
              {selected.cover_thumb_url || selected.cover_image_url ? (
                <img
                  src={(selected.cover_thumb_url || selected.cover_image_url) as string}
                  alt=""
                  style={s.cardImg}
                />
              ) : (
                <div style={{ ...s.cardImg, ...s.cardImgFallback }}>
                  <MapPin size={22} style={{ color: '#fff' }} />
                </div>
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={s.cardCat}>
                  <span style={{ ...s.catDot, background: categoryMeta(selected.category).color }} />
                  {categoryMeta(selected.category).label}
                </div>
                <div style={s.cardTitle}>{selected.title}</div>
                <div style={s.cardMeta}>{formatWhen(selected.starts_at)}</div>
                {describeRecurrence(selected) && (
                  <div style={s.cardRepeat}>
                    <Repeat size={12} style={{ verticalAlign: -2 }} /> {describeRecurrence(selected)}
                  </div>
                )}
                <div style={s.cardMeta}>{eventLocationLabel(selected)}</div>
              </div>
            </div>
            <div style={s.cardActions}>
              <button onClick={() => navigate(`/event/${selected.id}`)} style={s.detailsBtn}>
                View Details <ChevronRight size={15} />
              </button>
              <a
                href={directionsUrl(selected)}
                target="_blank"
                rel="noopener noreferrer"
                style={s.directionsBtn}
              >
                <Navigation size={15} /> Directions
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-neutral-0)',
  },
  header: {
    flexShrink: 0,
    padding: 'calc(env(safe-area-inset-top, 0px) + var(--space-3)) var(--space-3) var(--space-3)',
    background: 'var(--color-neutral-0)',
    borderBottom: '1px solid var(--color-neutral-100)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    zIndex: 500,
  },
  titleRow: { display: 'flex', alignItems: 'center', gap: 8 },
  title: { fontSize: 'var(--font-size-lg)', fontWeight: 800, color: 'var(--color-neutral-900)' },
  count: {
    marginLeft: 'auto', fontSize: 'var(--font-size-xs)', fontWeight: 700,
    color: 'var(--color-neutral-500)', background: 'var(--color-neutral-100)',
    padding: '3px 10px', borderRadius: 'var(--radius-full)',
  },
  searchRow: { display: 'flex', gap: 8, alignItems: 'center' },
  searchBox: {
    flex: 1, display: 'flex', alignItems: 'center', gap: 8,
    background: 'var(--color-neutral-100)', borderRadius: 'var(--radius-md)',
    padding: '0 10px', height: 42,
  },
  input: {
    flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none',
    fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-900)',
  },
  clearBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', background: 'transparent', color: 'var(--color-neutral-400)',
    cursor: 'pointer', padding: 2,
  },
  locateBtn: {
    width: 42, height: 42, flexShrink: 0, borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)', background: 'var(--color-neutral-0)',
    color: 'var(--color-primary-600)', display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', cursor: 'pointer',
  },
  radiusRow: { display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 },
  radiusChip: {
    flexShrink: 0, border: '1px solid var(--color-neutral-200)', background: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-600)', fontSize: 'var(--font-size-xs)', fontWeight: 600,
    padding: '6px 12px', borderRadius: 'var(--radius-full)', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  radiusChipActive: {
    background: 'var(--color-primary-500)', borderColor: 'var(--color-primary-500)',
    color: '#fff', fontWeight: 700,
  },
  status: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },
  hint: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-400)' },
  mapWrap: { position: 'relative', flex: 1, minHeight: 0 },
  map: { position: 'absolute', inset: 0, width: '100%', height: '100%', background: 'var(--color-neutral-100)' },
  overlayMsg: {
    position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
    maxWidth: '88%', textAlign: 'center', zIndex: 600,
    background: 'rgba(255,255,255,0.96)', borderRadius: 'var(--radius-md)',
    padding: '10px 14px', fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-700)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
  },
  card: {
    position: 'absolute', left: 12, right: 12, bottom: 12, zIndex: 1001,
    background: 'var(--color-neutral-0)', borderRadius: 'var(--radius-lg)',
    boxShadow: '0 8px 28px rgba(0,0,0,0.22)', padding: 'var(--space-3)',
    border: '1px solid var(--color-neutral-100)',
  },
  cardClose: {
    position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%',
    border: 'none', background: 'var(--color-neutral-100)', color: 'var(--color-neutral-500)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  cardBody: { display: 'flex', gap: 12, alignItems: 'flex-start', paddingRight: 28 },
  cardImg: { width: 64, height: 64, borderRadius: 'var(--radius-md)', objectFit: 'cover', flexShrink: 0 },
  cardImgFallback: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
  },
  cardCat: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-neutral-500)' },
  catDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  cardTitle: {
    fontSize: 'var(--font-size-base)', fontWeight: 800, color: 'var(--color-neutral-900)',
    margin: '2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  cardMeta: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardRepeat: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary-700, #1d4ed8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardActions: { display: 'flex', gap: 8, marginTop: 'var(--space-3)' },
  detailsBtn: {
    flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 2,
    background: 'var(--color-neutral-100)', color: 'var(--color-neutral-800)', border: 'none',
    borderRadius: 'var(--radius-md)', padding: '11px 12px', fontSize: 'var(--font-size-sm)',
    fontWeight: 700, cursor: 'pointer',
  },
  directionsBtn: {
    flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    background: 'var(--color-primary-500)', color: '#fff', border: 'none',
    borderRadius: 'var(--radius-md)', padding: '11px 12px', fontSize: 'var(--font-size-sm)',
    fontWeight: 700, cursor: 'pointer', textDecoration: 'none',
  },
};
