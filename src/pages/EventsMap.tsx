import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { MapPin, Search, LocateFixed, X, ChevronRight, ChevronDown, Navigation, Repeat, Store, Plus } from 'lucide-react';
import {
  fetchPublishedEvents,
  type EventRow,
  type EventCategory,
} from '../lib/events';
import {
  fetchPublishedBusinesses,
  fetchBusinessFeaturedItems,
  BUSINESS_CATEGORY_META,
  BUSINESS_CATEGORIES,
  type BusinessRow,
  type BusinessCategory,
  type BusinessFeaturedItem,
} from '../lib/businesses';
import { describeRecurrence } from '../lib/recurrence';
import {
  geocodeLocation,
  haversineMiles,
  type GeoPoint,
} from '../lib/geocode';
import { isIOS } from '../lib/platform';
import { getSavedLocation } from '../lib/userLocation';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { MediaFallback } from '../components/ui/MediaFallback';

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

/** Storefront pin (rounded marker w/ shop glyph) so businesses read as
 *  distinct from teardrop event pins even at a glance. */
function businessPinIcon(color: string): L.DivIcon {
  const html = `
    <div style="position:relative;width:32px;height:40px;transform:translate(-50%,-100%);">
      <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 40C16 40 31 26 31 15A15 15 0 1 0 1 15C1 26 16 40 16 40Z" fill="${color}"/>
        <rect x="6.5" y="9" width="19" height="13" rx="2.5" fill="#ffffff"/>
        <path d="M6.5 11.5L8.5 7h15l2 4.5z" fill="#ffffff"/>
        <rect x="13" y="15" width="6" height="7" rx="1" fill="${color}"/>
      </svg>
    </div>`;
  return L.divIcon({
    html,
    className: 'tt-business-pin',
    iconSize: [32, 40],
    iconAnchor: [16, 40],
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

/** Business cluster bubble — tinted teal so it reads apart from the amber
 *  event clusters when both layers are on. */
function businessClusterIcon(count: number): L.DivIcon {
  const size = count < 10 ? 38 : count < 100 ? 46 : 54;
  const html = `
    <div style="
      width:${size}px;height:${size}px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      background:rgba(13,148,136,0.92);color:#fff;font-weight:800;
      font-size:${count < 100 ? 14 : 13}px;
      border:3px solid rgba(255,255,255,0.95);
      box-shadow:0 4px 12px rgba(13,148,136,0.45);
    ">${count}</div>`;
  return L.divIcon({
    html,
    className: 'tt-business-cluster',
    iconSize: [size, size],
  });
}

function coordDirectionsUrl(lat: number, lng: number): string {
  const dest = `${lat},${lng}`;
  if (isIOS()) {
    return `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

function directionsUrl(e: EventRow): string {
  return coordDirectionsUrl(e.lat as number, e.lng as number);
}

function eventLocationLabel(e: EventRow): string {
  return [e.address, e.city, e.region].filter(Boolean).join(', ') || 'Location on map';
}

function businessCategoryMeta(c: BusinessCategory | null | undefined) {
  return BUSINESS_CATEGORY_META[(c ?? 'antique_store') as BusinessCategory] ?? BUSINESS_CATEGORY_META.antique_store;
}

function businessLocationLabel(b: BusinessRow): string {
  return [b.address, b.city, b.region].filter(Boolean).join(', ') || 'Location on map';
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
  const businessClusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const didFitRef = useRef(false);

  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [businesses, setBusinesses] = useState<BusinessRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Layer toggles + per-category business filter.
  const [showEvents, setShowEvents] = useState(true);
  const [showBusinesses, setShowBusinesses] = useState(true);
  // Single-select business-type filter. 'all' shows every category (default).
  const [businessCat, setBusinessCat] = useState<BusinessCategory | 'all'>('all');

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
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [businessItems, setBusinessItems] = useState<BusinessFeaturedItem[]>([]);

  /* ----- Load published events + businesses once ----- */
  useEffect(() => {
    let cancelled = false;
    fetchPublishedEvents({ limit: 200 })
      .then((rows) => { if (!cancelled) setEvents(rows); })
      .catch((e: any) => { if (!cancelled) { setEvents([]); setLoadError(e?.message ?? 'Failed to load events'); } });
    fetchPublishedBusinesses()
      .then((rows) => { if (!cancelled) setBusinesses(rows); })
      .catch(() => { if (!cancelled) setBusinesses([]); });
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

  /* ----- Businesses that can appear on the map (have coordinates) ----- */
  const mappableBusinesses = useMemo(
    () => (businesses ?? []).filter((b) => b.lat != null && b.lng != null),
    [businesses],
  );

  /* ----- Apply category + radius filters to businesses ----- */
  const visibleBusinesses = useMemo(() => {
    let rows = businessCat === 'all'
      ? mappableBusinesses
      : mappableBusinesses.filter((b) => ((b.category ?? 'antique_store') as BusinessCategory) === businessCat);
    if (center && radiusMiles !== 'any') {
      rows = rows.filter((b) => haversineMiles(center, { lat: b.lat as number, lng: b.lng as number }) <= radiusMiles);
    }
    return rows;
  }, [mappableBusinesses, businessCat, center, radiusMiles]);

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

    const businessCluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      iconCreateFunction: (c) => businessClusterIcon(c.getChildCount()),
    });
    map.addLayer(businessCluster);

    mapRef.current = map;
    clusterRef.current = cluster;
    businessClusterRef.current = businessCluster;

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
      businessClusterRef.current = null;
    };
  }, []);

  /* ----- (Re)build event markers whenever the visible set / toggle changes ----- */
  useEffect(() => {
    const cluster = clusterRef.current;
    const map = mapRef.current;
    if (!cluster || !map) return;

    cluster.clearLayers();
    const markers: L.Marker[] = [];
    if (showEvents) {
      for (const e of visible) {
        const m = L.marker([e.lat as number, e.lng as number], {
          icon: pinIcon(categoryMeta(e.category).color),
          title: e.title,
        });
        m.on('click', () => { setSelectedBusinessId(null); setSelectedId(e.id); });
        markers.push(m);
      }
    }
    cluster.addLayers(markers);

    // Fit to all markers on first load (before any search recenters the map).
    if (!didFitRef.current && !center && markers.length > 0) {
      didFitRef.current = true;
      map.fitBounds(cluster.getBounds().pad(0.2), { maxZoom: 11 });
    }
  }, [visible, center, showEvents]);

  /* ----- (Re)build business markers whenever the visible set / toggle changes ----- */
  useEffect(() => {
    const cluster = businessClusterRef.current;
    const map = mapRef.current;
    if (!cluster || !map) return;

    cluster.clearLayers();
    const markers: L.Marker[] = [];
    if (showBusinesses) {
      for (const b of visibleBusinesses) {
        const m = L.marker([b.lat as number, b.lng as number], {
          icon: businessPinIcon(businessCategoryMeta(b.category).color),
          title: b.name,
        });
        m.on('click', () => { setSelectedId(null); setSelectedBusinessId(b.id); });
        markers.push(m);
      }
    }
    cluster.addLayers(markers);
  }, [visibleBusinesses, showBusinesses]);

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
  useEffect(() => {
    if (!selectedBusinessId) { setBusinessItems([]); return; }
    let cancelled = false;
    setBusinessItems([]);
    fetchBusinessFeaturedItems(selectedBusinessId)
      .then((rows) => { if (!cancelled) setBusinessItems(rows); })
      .catch(() => { if (!cancelled) setBusinessItems([]); });
    return () => { cancelled = true; };
  }, [selectedBusinessId]);

  const selectedBusiness = selectedBusinessId
    ? visibleBusinesses.find((b) => b.id === selectedBusinessId) ?? null
    : null;

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
          <span style={s.title}>Treasure Map</span>
          <button onClick={() => navigate('/business/new')} style={s.addBtn} aria-label="Add a business">
            <Plus size={15} /> Business
          </button>
        </div>

        {/* Layer toggles */}
        <div style={s.layerRow}>
          <button
            onClick={() => setShowEvents((v) => !v)}
            style={{ ...s.layerChip, ...(showEvents ? s.layerChipActiveEvent : {}) }}
            aria-pressed={showEvents}
          >
            <MapPin size={14} />
            Events
            <span style={s.layerCount}>{events == null ? '…' : showEvents ? visible.length : 0}</span>
          </button>
          <button
            onClick={() => setShowBusinesses((v) => !v)}
            style={{ ...s.layerChip, ...(showBusinesses ? s.layerChipActiveBiz : {}) }}
            aria-pressed={showBusinesses}
          >
            <Store size={14} />
            Businesses
            <span style={s.layerCount}>{businesses == null ? '…' : showBusinesses ? visibleBusinesses.length : 0}</span>
          </button>
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

        {showBusinesses && (
          <div style={s.bizFilterRow}>
            <span
              style={{ ...s.catChipDot, background: businessCat === 'all' ? 'var(--color-neutral-400)' : BUSINESS_CATEGORY_META[businessCat].color }}
            />
            <select
              value={businessCat}
              onChange={(e) => setBusinessCat(e.target.value as BusinessCategory | 'all')}
              style={s.bizSelect}
              aria-label="Filter by business type"
            >
              <option value="all">All Business Types</option>
              {BUSINESS_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{BUSINESS_CATEGORY_META[cat].label}</option>
              ))}
            </select>
            <ChevronDown size={16} style={s.bizSelectChevron} />
          </div>
        )}

        {statusMsg && <div style={s.status}>{statusMsg}</div>}
        {!center && radiusMiles !== 'any' && events != null && (
          <div style={s.hint}>Search a location or tap the locator to filter by distance.</div>
        )}
      </div>

      {/* Map */}
      <div style={s.mapWrap}>
        <div ref={mapElRef} style={s.map} />

        {(() => {
          if (loadError) {
            return <div style={s.overlayMsg}>Couldn't load events. {loadError}</div>;
          }
          if (events == null || businesses == null) return null;

          const eventsShown = showEvents ? visible.length : 0;
          const bizShown = showBusinesses ? visibleBusinesses.length : 0;
          if (eventsShown > 0 || bizShown > 0) return null;

          // Nothing is on the map — tailor the message to what's toggled on and
          // whether the underlying datasets are empty vs. filtered out.
          if (!showEvents && !showBusinesses) {
            return <div style={s.overlayMsg}>Turn on Events or Businesses to see pins.</div>;
          }
          const noEventData = !showBusinesses && mappable.length === 0;
          const noBizData = !showEvents && mappableBusinesses.length === 0;
          if (noEventData) {
            return <div style={s.overlayMsg}>No in-person events have a map location yet.</div>;
          }
          if (noBizData) {
            return <div style={s.overlayMsg}>No businesses have been added to the map yet.</div>;
          }
          return <div style={s.overlayMsg}>Nothing within this distance. Try a wider radius or adjust filters.</div>;
        })()}

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

        {/* Selected business card */}
        {selectedBusiness && (
          <div style={s.card}>
            <button onClick={() => setSelectedBusinessId(null)} style={s.cardClose} aria-label="Close">
              <X size={16} />
            </button>
            <div style={s.cardBody}>
              <ImageWithFade
                src={(selectedBusiness.logo_thumb_url || selectedBusiness.logo_url) as string | null}
                alt=""
                eager
                style={s.cardImg}
                containerStyle={s.cardImg}
                fallback={<MediaFallback kind="listing" seed={selectedBusiness.id} label={selectedBusiness.name} compact />}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={s.cardCat}>
                  <span style={{ ...s.catDot, background: businessCategoryMeta(selectedBusiness.category).color }} />
                  {businessCategoryMeta(selectedBusiness.category).label}
                </div>
                <div style={s.cardTitle}>{selectedBusiness.name}</div>
                <div style={s.cardMeta}>{businessLocationLabel(selectedBusiness)}</div>
              </div>
            </div>
            {businessItems.length > 0 && (
              <div style={s.itemPreviewRow}>
                {businessItems.slice(0, 4).map((it) => (
                  <div key={it.id} style={s.itemPreviewThumb}>
                    <ImageWithFade
                      src={(it.thumb_url || it.image_url) as string | null}
                      alt={it.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      containerStyle={{ width: '100%', height: '100%' }}
                      fallback={<MediaFallback kind="listing" seed={it.id} label={it.title?.slice(0, 10) || 'ITEM'} compact />}
                    />
                    {it.availability !== 'available' && <span style={s.itemPreviewDim} />}
                  </div>
                ))}
                {businessItems.length > 4 && (
                  <div style={{ ...s.itemPreviewThumb, ...s.itemPreviewMore }}>+{businessItems.length - 4}</div>
                )}
              </div>
            )}
            <div style={s.cardActions}>
              <button onClick={() => navigate(`/business/${selectedBusiness.id}`)} style={s.detailsBtn}>
                View Details <ChevronRight size={15} />
              </button>
              <a
                href={coordDirectionsUrl(selectedBusiness.lat as number, selectedBusiness.lng as number)}
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
  addBtn: {
    marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4,
    border: '1px solid var(--color-primary-500)', background: 'var(--color-primary-500)',
    color: '#fff', fontSize: 'var(--font-size-xs)', fontWeight: 700,
    padding: '6px 12px', borderRadius: 'var(--radius-full)', cursor: 'pointer',
  },
  layerRow: { display: 'flex', gap: 8 },
  layerChip: {
    flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    border: '1px solid var(--color-neutral-200)', background: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-500)', fontSize: 'var(--font-size-sm)', fontWeight: 700,
    padding: '8px 12px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
  },
  layerChipActiveEvent: {
    background: 'rgba(217,119,6,0.10)', borderColor: 'var(--color-primary-500)',
    color: 'var(--color-primary-700, #b45309)',
  },
  layerChipActiveBiz: {
    background: 'rgba(13,148,136,0.10)', borderColor: '#0d9488', color: '#0f766e',
  },
  layerCount: {
    fontSize: 'var(--font-size-xs)', fontWeight: 800,
    background: 'rgba(0,0,0,0.06)', padding: '1px 7px', borderRadius: 'var(--radius-full)',
  },
  bizFilterRow: {
    position: 'relative', display: 'flex', alignItems: 'center', gap: 8,
    border: '1px solid var(--color-neutral-200)', background: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-md)', padding: '0 10px', height: 42,
  },
  bizSelect: {
    flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none',
    appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
    fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-neutral-900)',
    cursor: 'pointer', paddingRight: 18,
  },
  bizSelectChevron: { color: 'var(--color-neutral-400)', flexShrink: 0, pointerEvents: 'none' },
  catChipDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
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
  itemPreviewRow: { display: 'flex', gap: 6, marginTop: 'var(--space-3)' },
  itemPreviewThumb: {
    position: 'relative', width: 52, height: 52, borderRadius: 'var(--radius-md)',
    overflow: 'hidden', background: '#f3f4f6', flexShrink: 0,
  },
  itemPreviewDim: {
    position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.5)',
  },
  itemPreviewMore: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 700, color: 'var(--color-neutral-600, #4b5563)',
    background: 'var(--color-neutral-100, #f3f4f6)',
  },
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
