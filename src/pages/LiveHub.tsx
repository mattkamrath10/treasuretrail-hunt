import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Gavel, X, Clock, ExternalLink,
  Upload, ToggleLeft, ToggleRight, ChevronDown,
  Search, SlidersHorizontal, MapPin, Calendar,
  Truck, Package, ChevronRight,
  Zap, Bell, BellOff, Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useLiveFeed } from '../hooks/useLiveFeed';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { MediaFallback, type FallbackPlatform } from '../components/ui/MediaFallback';
import LocationFields, { isValidGeneralLocation, type LocationValue } from '../components/listing/LocationFields';
import { HostEventCTA } from '../components/HostEventCTA';
import PickupTypeChips from '../components/listing/PickupTypeChips';
import MarketplaceFoundSelect from '../components/listing/MarketplaceFoundSelect';
import SafetyReminder from '../components/listing/SafetyReminder';
import LogisticsBlock from '../components/listing/LogisticsBlock';
import ReportListingButton from '../components/listing/ReportListingButton';
import { GuestOverlay } from '../components/GuestGate';
import { PageScroll } from '../components/ui/PageScroll';
import { fetchMyEvents, fetchPublishedEvents } from '../lib/events';
import type { EventRow } from '../lib/events';
import { startBoostPurchase } from '../lib/payments';
import { isBoosted, boostExpiresInLabel } from '../lib/boost';
import { isProUser } from '../lib/entitlements';
import { BoostedBadge } from '../components/ui/BoostedBadge';
import { monetizationHidden } from '../lib/platform';
import { flashToast } from '../lib/toast';
import { setPendingIntent } from '../lib/pendingIntent';
import {
  effectiveStartMs, deriveStatus, statusBadges, formatScheduleRange,
  formatStartCountdown, formatEndCountdown, durationMs, formatDuration,
  eventComparator, type EventSortKey,
} from '../lib/eventSchedule';
import { isReminderOn, toggleLocalReminder } from '../lib/localReminders';
import { maybeNotifyGoLive } from '../lib/notifications';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExternalListing {
  id: string;
  platform: string;
  listing_type: string;
  external_url: string;
  title: string;
  price_display: string | null;
  category: string | null;
  image_url: string | null;
  start_at: string | null;
  ends_at: string | null;
  ships_available: boolean;
  status: string;
  created_at: string;
  /** True iff the source row carries an active boost. Only 'event' rows
   * set this today; external/other sources leave it undefined. */
  boosted?: boolean;
  // 'event' rows are hosted events mapped in from the `events` table (see
  // eventToListing). They open the in-app /event/:id detail page instead of
  // the external-link modal. Absent/'external' = a real external_listings row.
  source?: 'event' | 'external';
}

/**
 * Hosted events live in the `events` table and power Discover. Live Events
 * historically queried only `external_listings`, so hosted estate sales,
 * yard sales, and auctions never surfaced here — even when boosted. Map each
 * published event into the shared listing shape so it flows through the same
 * type filters, date filters, sort, and cards as external listings.
 *
 * `listing_type` mirrors the event `category` so the type tabs (Estate Sales,
 * Auctions, Yard Sales) match. Local events carry no external URL — clicking
 * routes to the in-app /event/:id page (handled where the card is rendered).
 */
// Event platform keys (whatnot/poshmark_live/posh_party/ebay_live/other) don't
// all match LiveHub's PLATFORM_COLORS / label keys. Normalize to the existing
// keys so online events get correct branding instead of a gray "Poshmark_live".
const EVENT_PLATFORM_KEY: Record<string, string> = {
  whatnot: 'whatnot',
  poshmark_live: 'poshmark',
  posh_party: 'poshmark',
  ebay_live: 'ebay',
  other: 'other',
};

function eventToListing(e: EventRow): ExternalListing {
  return {
    id: e.id,
    source: 'event',
    platform: e.event_kind === 'online'
      ? (EVENT_PLATFORM_KEY[e.platform ?? 'other'] ?? 'other')
      : 'local',
    listing_type: e.category,
    external_url: e.livestream_url ?? '',
    title: e.title,
    price_display: null,
    category: e.show_category ?? null,
    // Pass the raw stored thumb straight through — never re-derive via
    // toThumbUrl (that double-processes already-thumb URLs into 404s).
    image_url: e.cover_thumb_url ?? e.cover_image_url,
    start_at: e.starts_at,
    ends_at: e.ends_at,
    ships_available: false,
    status: 'active',
    created_at: e.created_at,
    boosted: isBoosted(e),
  };
}

type TypeFilter = 'all' | 'auctions' | 'estate' | 'yard' | 'storage';
type DateFilter = 'all' | 'today' | 'tomorrow' | 'this_weekend' | 'next_weekend' | 'this_week' | 'next_week' | 'this_month' | 'custom';
type SortKey = EventSortKey;

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'auctions', label: 'Auctions' },
  { key: 'estate', label: 'Estate Sales' },
  { key: 'yard', label: 'Yard Sales' },
  { key: 'storage', label: 'Storage Lockers' },
];

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'all', label: 'Any Time' },
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'this_weekend', label: 'This Weekend' },
  { key: 'next_weekend', label: 'Next Weekend' },
  { key: 'this_week', label: 'This Week' },
  { key: 'next_week', label: 'Next Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'custom', label: 'Custom Date' },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'live_now', label: 'Live Now' },
  { key: 'starting_soonest', label: 'Starting Soonest' },
  { key: 'ending_soon', label: 'Ending Soon' },
  { key: 'newest', label: 'Newly Added' },
];

const PLATFORM_TABS = [
  { key: 'poshmark', label: 'Poshmark', color: '#C13584', bg: '#FDF0F8', url: 'https://poshmark.com/shows' },
  { key: 'whatnot',  label: 'Whatnot',  color: '#FF5C00', bg: '#FFF3EE', url: 'https://www.whatnot.com/browse' },
  { key: 'ebay',     label: 'eBay',     color: '#E53238', bg: '#FEF0F0', url: 'https://www.ebay.com/ebaylive' },
  { key: 'facebook', label: 'Facebook', color: '#1877F2', bg: '#EFF5FE', url: 'https://www.facebook.com/marketplace' },
];

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const PLATFORM_COLORS: Record<string, string> = {
  whatnot: '#FF5C00', poshmark: '#C13584', ebay: '#E53238',
  hibid: '#1A3668', maxsold: '#007A74', estatesales: '#7B4F2E',
  facebook: '#1877F2', local: '#0F766E', other: '#6B7280',
};

const LISTING_TYPE_LABELS: Record<string, string> = {
  live_stream: 'Live Stream', auction: 'Auction', estate_sale: 'Estate Sale',
  yard_sale: 'Yard Sale', flea_market: 'Flea Market',
  storage_auction: 'Storage Auction', fixed_price: 'For Sale',
  pop_up: 'Pop-up', collectibles_show: 'Collectibles Show',
};

// ─── Filter / sort logic ──────────────────────────────────────────────────────

function getDateRange(filter: DateFilter): { start: Date; end: Date } | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (filter) {
    case 'today': {
      const end = new Date(today); end.setDate(end.getDate() + 1);
      return { start: today, end };
    }
    case 'tomorrow': {
      const start = new Date(today); start.setDate(start.getDate() + 1);
      const end = new Date(start); end.setDate(end.getDate() + 1);
      return { start, end };
    }
    case 'this_weekend': {
      const dow = today.getDay();
      const toSat = dow === 0 ? -1 : (6 - dow);
      const sat = new Date(today); sat.setDate(today.getDate() + toSat);
      const mon = new Date(sat); mon.setDate(sat.getDate() + 2);
      return { start: sat, end: mon };
    }
    case 'next_weekend': {
      const dow = today.getDay();
      const toSat = dow === 0 ? 6 : (13 - dow);
      const sat = new Date(today); sat.setDate(today.getDate() + toSat);
      const mon = new Date(sat); mon.setDate(sat.getDate() + 2);
      return { start: sat, end: mon };
    }
    case 'this_week': {
      const end = new Date(today); end.setDate(today.getDate() + 7);
      return { start: today, end };
    }
    case 'next_week': {
      const start = new Date(today); start.setDate(today.getDate() + 7);
      const end = new Date(start); end.setDate(start.getDate() + 7);
      return { start, end };
    }
    case 'this_month': {
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      return { start: today, end };
    }
    default: return null;
  }
}

function applyAll(
  listings: ExternalListing[],
  opts: {
    typeFilter: TypeFilter;
    searchQuery: string;
    locationQuery: string;
    dateFilter: DateFilter;
    customDate: string;
    sortBy: SortKey;
  },
): ExternalListing[] {
  let result = [...listings];

  // Type chip filter
  switch (opts.typeFilter) {
    case 'auctions':     result = result.filter((l) => l.listing_type === 'auction' || l.listing_type === 'live_stream'); break;
    case 'estate':       result = result.filter((l) => l.listing_type === 'estate_sale'); break;
    case 'yard':         result = result.filter((l) => l.listing_type === 'yard_sale'); break;
    case 'storage':      result = result.filter((l) => l.listing_type === 'storage_auction'); break;
    default: break;
  }

  // Search
  const q = opts.searchQuery.trim().toLowerCase();
  if (q) {
    result = result.filter((l) =>
      l.title.toLowerCase().includes(q) ||
      (l.category ?? '').toLowerCase().includes(q) ||
      l.platform.toLowerCase().includes(q) ||
      (LISTING_TYPE_LABELS[l.listing_type] ?? '').toLowerCase().includes(q),
    );
  }

  // Location search (against title + category text)
  const loc = opts.locationQuery.trim().toLowerCase();
  if (loc) {
    result = result.filter((l) =>
      l.title.toLowerCase().includes(loc) ||
      (l.category ?? '').toLowerCase().includes(loc),
    );
  }

  // Date filter — keyed on start_at (falling back to created_at) so we filter
  // by when the event actually happens, not when it was uploaded.
  if (opts.dateFilter !== 'all' && opts.dateFilter !== 'custom') {
    const range = getDateRange(opts.dateFilter);
    if (range) {
      result = result.filter((l) => {
        const s = effectiveStartMs(l);
        if (s == null) return false;
        return s >= range.start.getTime() && s < range.end.getTime();
      });
    }
  } else if (opts.dateFilter === 'custom' && opts.customDate) {
    const target = new Date(opts.customDate);
    const next = new Date(target); next.setDate(next.getDate() + 1);
    result = result.filter((l) => {
      const s = effectiveStartMs(l);
      if (s == null) return false;
      return s >= target.getTime() && s < next.getTime();
    });
  }

  // Sort — all event sort modes route through the shared comparator which is
  // status-aware (Live > Ending Soon > Upcoming > Open-ended > Ended).
  result.sort(eventComparator(opts.sortBy));

  return result;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LiveHub({ onBack }: { onBack: () => void }) {
  const { user, isGuest, exitGuestMode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [listings, setListings] = useState<ExternalListing[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery,    setSearchQuery]    = useState('');
  const [typeFilter,     setTypeFilter]     = useState<TypeFilter>('all');
  const [dateFilter,     setDateFilter]     = useState<DateFilter>('all');
  const [customDate,     setCustomDate]     = useState('');
  const [sortBy,         setSortBy]         = useState<SortKey>('live_now');
  const [locationQuery,  setLocationQuery]  = useState('');

  // UI state
  const [showFilters,      setShowFilters]      = useState(false);
  const [showUploadEvent,  setShowUploadEvent]  = useState(false);
  const [showBoost,        setShowBoost]        = useState(false);
  const [selectedListing,  setSelectedListing]  = useState<ExternalListing | null>(null);
  const [uploadBanner,     setUploadBanner]     = useState(false);

  useEffect(() => {
    if (!uploadBanner) return;
    const t = setTimeout(() => setUploadBanner(false), 3000);
    return () => clearTimeout(t);
  }, [uploadBanner]);

  // Resume a post-auth "Boost Event" intent: AppShell routes here with
  // state.openBoost=true after a logged-out/guest user signs in. Open the
  // picker once, then scrub the flag from history so a back/refresh doesn't
  // re-trigger it.
  useEffect(() => {
    // Event boosts are temporarily hidden for App Store review — never
    // auto-open the boost picker, even if a stale intent points here.
    if (monetizationHidden()) return;
    const state = location.state as { openBoost?: boolean } | null;
    if (state?.openBoost && user) {
      setShowBoost(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, user, navigate]);

  const fetchListings = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    // Live Events is the union of two datasets:
    //   1. external_listings — user-added links to off-platform sales/shows.
    //   2. events — hosted events (estate/yard/auction…) that also power
    //      Discover. Without these, a hosted (even boosted) estate sale shows
    //      in Discover but is invisible here. Mapped via eventToListing.
    // Fetched concurrently. SELECT * tolerates missing optional columns
    // (e.g. start_at before its migration) instead of failing the query.
    const [extRes, evRes] = await Promise.allSettled([
      supabase
        .from('external_listings')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(100),
      fetchPublishedEvents({ limit: 100 }),
    ]);

    // external_listings is the primary feed — a hard failure must propagate
    // so useLiveFeed's overlap guard / backoff engages on the next tick.
    if (extRes.status === 'rejected') {
      setLoading(false);
      const msg = extRes.reason?.message ?? String(extRes.reason);
      console.error('[SUPABASE_QUERY_FAIL] table=external_listings source=LiveHub.fetchListings', extRes.reason);
      throw new Error(`LiveHub.fetchListings failed: ${msg}`);
    }
    const { data, error } = extRes.value;
    if (error) {
      console.error('[SUPABASE_QUERY_FAIL] table=external_listings source=LiveHub.fetchListings', error);
      setLoading(false);
      throw new Error(`LiveHub.fetchListings failed: ${error.message}`);
    }

    // Hosted events are supplementary — if their fetch fails, log it and keep
    // the external feed visible rather than blanking the whole page.
    let eventRows: ExternalListing[] = [];
    if (evRes.status === 'fulfilled') {
      eventRows = evRes.value.map(eventToListing);
      maybeNotifyGoLive(evRes.value);
    } else {
      console.warn('[LiveHub] published events fetch failed; showing external listings only', evRes.reason);
    }

    const serverRows = [...((data as ExternalListing[]) ?? []), ...eventRows];
    // Preserve any optimistically-prepended rows that haven't shown up in the
    // refetch yet (read-after-write replica lag, etc.).
    setListings((prev) => {
      const serverIds = new Set(serverRows.map((r) => r.id));
      const missing = prev.filter((p) => !serverIds.has(p.id));
      return [...missing, ...serverRows];
    });
    setLoading(false);
  };

  useEffect(() => {
    // The throw inside fetchListings is intentional so useLiveFeed's
    // backoff engages on subsequent ticks. Here we just need to avoid
    // an unhandled rejection on the initial mount — the error is
    // already logged via [SUPABASE_QUERY_FAIL] inside fetchListings.
    fetchListings().catch(() => {});
  }, []);

  // Live refresh — silently re-poll every 10s so new uploads from other
  // users appear without a manual refresh. Filters/sort/scroll preserved.
  useLiveFeed(() => fetchListings({ silent: true }), !loading);

  const filtered = useMemo(
    () => applyAll(listings, { typeFilter, searchQuery, locationQuery, dateFilter, customDate, sortBy }),
    [listings, typeFilter, searchQuery, locationQuery, dateFilter, customDate, sortBy],
  );

  const liveCount = listings.filter((l) => deriveStatus(l) === 'live').length;
  const activeFilterCount = [
    dateFilter !== 'all', locationQuery.trim() !== '', sortBy !== 'live_now',
  ].filter(Boolean).length;

  return (
    <PageScroll style={st.container}>
      {isGuest && (
        <GuestOverlay
          title="Live Events are for members"
          subtitle="Sign up to browse live events and post your own"
        />
      )}

      {/* ── Header ── */}
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
        <div style={st.headerCenter}>
          <span style={st.headerTitle}>Live Events</span>
          {liveCount > 0 && (
            <span style={st.liveChip}><span style={st.liveDot} />{liveCount} LIVE</span>
          )}
        </div>
        <div style={{ width: '36px' }} />
      </header>

      <HostEventCTA variant="live" />

      {/* ── Search bar ── */}
      <div style={st.searchRow}>
        <div style={st.searchBox}>
          <Search size={14} style={{ color: 'var(--color-neutral-400)', flexShrink: 0 }} />
          <input
            style={st.searchInput}
            placeholder="Search auctions, estate sales, yard sales, platforms…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={st.searchClear}>
              <X size={13} style={{ color: 'var(--color-neutral-400)' }} />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(true)}
          style={{ ...st.filterToggle, ...(activeFilterCount > 0 ? st.filterToggleActive : {}) }}
        >
          <SlidersHorizontal size={15} />
          {activeFilterCount > 0 && <span style={st.filterBadge}>{activeFilterCount}</span>}
        </button>
      </div>

      {/* ── Platform external link tabs ── */}
      <div style={st.platformTabs}>
        {PLATFORM_TABS.map((p) => (
          <a
            key={p.key}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...st.platformTab, backgroundColor: p.bg, border: `1.5px solid ${p.color}33` }}
          >
            <ExternalLink size={11} style={{ position: 'absolute', top: '6px', right: '6px', color: `${p.color}99` }} />
            <span style={{ ...st.platformTabDot, backgroundColor: p.color }} />
            <span style={{ ...st.platformTabLabel, color: p.color }}>{p.label}</span>
          </a>
        ))}
      </div>

      {/* ── Type filter chips ── */}
      <div style={st.filterRow}>
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setTypeFilter(f.key)}
            style={{ ...st.chip, ...(typeFilter === f.key ? st.chipActive : {}) }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Primary action buttons ──
          Upload Event is the highest-emphasis CTA and stays pinned at the top
          (it lives in the non-scrolling region, never gets pushed off-screen
          as the feed fills up). */}
      <div style={st.actionArea}>
        <button onClick={() => setShowUploadEvent(true)} style={st.actionBtnPrimary}>
          <Upload size={16} style={{ color: '#fff' }} />
          <span style={st.actionBtnLabel}>Upload Event</span>
        </button>
        {/* Event boosts (a paid promotion) are temporarily removed from the
            iOS build for App Store review. */}
        {!monetizationHidden() && (
          <div style={st.actionRow}>
            <button
              onClick={() => {
                if (!user) {
                  // `/login` is not a route — it's a conditional screen in
                  // App.tsx gated on `!user && !isGuest`. A guest is still
                  // "logged out" but isGuest=true keeps AppShell mounted, so
                  // navigate('/login') would just fall through to Discover.
                  // Stash the intent, drop guest mode, and bounce to '/' so
                  // App re-evaluates and renders Login. AppShell's resume hook
                  // reopens this boost flow once the user signs in.
                  setPendingIntent({ kind: 'boost_event' });
                  if (isGuest) exitGuestMode();
                  navigate('/');
                  return;
                }
                setShowBoost(true);
              }}
              style={st.actionBtnBoost}
            >
              <Zap size={14} style={{ color: '#1a1208' }} />
              <span style={st.actionBtnBoostLabel}>Boost Event</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Success banner after upload ── */}
      {uploadBanner && (
        <div style={st.successBanner} role="status" aria-live="polite">
          Event uploaded successfully — it's now live in the feed.
        </div>
      )}

      {/* ── Results count ── */}
      {!loading && (
        <div style={st.resultsBar}>
          <span style={st.resultsText}>
            {filtered.length} {filtered.length === 1 ? 'event' : 'events'}
            {searchQuery && ` matching "${searchQuery}"`}
          </span>
          {sortBy !== 'live_now' && (
            <span style={st.sortLabel}>
              {SORT_OPTIONS.find((s) => s.key === sortBy)?.label}
            </span>
          )}
        </div>
      )}

      {/* ── Feed ── */}
      <div style={st.feed}>
        {loading && (
          <div style={st.emptyState}>
            <p style={st.emptyText}>Loading sourcing events…</p>
          </div>
        )}

        {/* Empty state — only when the entire feed is empty. Once any events
            exist we never show this (filter no-matches is communicated by the
            results counter above). The sticky Upload Event CTA at the top
            always remains the primary action. */}
        {!loading && listings.length === 0 && (
          <div style={st.emptyState}>
            <Gavel size={36} style={{ color: 'var(--color-neutral-200)', marginBottom: '14px' }} />
            <p style={st.emptyTitle}>No events yet</p>
            <p style={st.emptyText}>
              Be the first to upload an auction, estate sale, yard sale, or marketplace listing.
            </p>
            <button onClick={() => setShowUploadEvent(true)} style={st.emptyBtn}>
              <Upload size={13} />Upload an Event
            </button>
          </div>
        )}

        {!loading && listings.length > 0 && filtered.length === 0 && (
          <div style={st.emptyState}>
            <p style={st.emptyText}>
              {searchQuery
                ? `No results for "${searchQuery}". Try a different search or clear your filters.`
                : 'No events match your current filters.'}
            </p>
          </div>
        )}

        {!loading && filtered.map((listing) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            onClick={() => {
              // Hosted events have a real in-app detail page; external
              // listings only have the bottom-sheet modal + outbound link.
              if (listing.source === 'event') navigate(`/event/${listing.id}`);
              else setSelectedListing(listing);
            }}
          />
        ))}
      </div>

      {/* ── Modals ── */}
      {selectedListing && (
        <EventDetailModal
          listing={selectedListing}
          onClose={() => setSelectedListing(null)}
        />
      )}
      {showFilters && (
        <FilterDrawer
          dateFilter={dateFilter} setDateFilter={setDateFilter}
          customDate={customDate} setCustomDate={setCustomDate}
          sortBy={sortBy} setSortBy={setSortBy}
          locationQuery={locationQuery} setLocationQuery={setLocationQuery}
          onClose={() => setShowFilters(false)}
          onReset={() => { setDateFilter('all'); setCustomDate(''); setSortBy('live_now'); setLocationQuery(''); }}
        />
      )}
      {showUploadEvent && (
        <UploadEventModal
          userId={user?.id}
          onClose={() => setShowUploadEvent(false)}
          onSuccess={(created) => {
            setShowUploadEvent(false);
            // Optimistically prepend so the new event shows up instantly,
            // even before the refetch round-trips. De-dupe by id when the
            // refetch lands.
            if (created) {
              setListings((prev) => {
                if (prev.some((l) => l.id === created.id)) return prev;
                return [created, ...prev];
              });
            }
            // Reset filters/sort so an active filter can't hide the new event.
            setTypeFilter('all');
            setSearchQuery('');
            setDateFilter('all');
            setCustomDate('');
            setSortBy('live_now');
            setLocationQuery('');
            // Background reconciliation with the server — silent so the
            // optimistic prepend stays visible during the round-trip.
            fetchListings({ silent: true });
            // Retrigger banner timer on rapid successive uploads.
            setUploadBanner(false);
            setTimeout(() => setUploadBanner(true), 0);
          }}
        />
      )}
      {showBoost && user && (
        <BoostPickerModal
          userId={user.id}
          onClose={() => setShowBoost(false)}
        />
      )}
    </PageScroll>
  );
}

// ─── Listing card ─────────────────────────────────────────────────────────────

function ListingCard({ listing, onClick }: { listing: ExternalListing; onClick: () => void }) {
  // Track image load failures so we can swap to the branded fallback
  // block instead of leaving an empty gray void (see ARCHITECTURE §5).
  const color = PLATFORM_COLORS[listing.platform] ?? PLATFORM_COLORS.other;
  const platformLabel = listing.platform.charAt(0).toUpperCase() + listing.platform.slice(1);
  const typeLabel = LISTING_TYPE_LABELS[listing.listing_type] ?? listing.listing_type;

  const badges = statusBadges(listing);
  const liveBadge = badges.find((b) => b.label === 'LIVE NOW');
  const scheduleText = formatScheduleRange(listing);
  const startCountdown = formatStartCountdown(listing);
  const endCountdown = formatEndCountdown(listing);
  const status = deriveStatus(listing);
  const countdownText = status === 'upcoming' ? startCountdown : (status === 'live' || status === 'ending_soon' ? endCountdown : null);

  return (
    <button onClick={onClick} style={st.card}>
      <div style={st.cardImgWrap}>
        <ImageWithFade
          src={listing.image_url}
          alt={listing.title}
          fallback={
            <MediaFallback
              kind={listing.listing_type === 'auction' ? 'auction' : 'live'}
              platform={listing.platform as FallbackPlatform}
              seed={listing.id}
              label={platformLabel}
            />
          }
        />
        {liveBadge && (
          <span style={st.liveBadge}><span style={st.liveBadgeDot} />LIVE</span>
        )}
        {listing.boosted && (
          <BoostedBadge style={{ position: 'absolute', top: 8, right: 8 }} />
        )}
      </div>
      <div style={st.cardBody}>
        <div style={st.cardTop}>
          <span style={{ ...st.platformBadge, backgroundColor: `${color}18`, color }}>{platformLabel}</span>
          <span style={st.typeBadge}>{typeLabel}</span>
          {listing.price_display && <span style={st.price}>{listing.price_display}</span>}
        </div>

        <p style={st.cardTitle}>{listing.title}</p>

        {/* Status badges (Live / Ends Soon / Starts Soon / Today / Multi-day / Ended) */}
        {badges.length > 0 && (
          <div style={st.badgeRow}>
            {badges.map((b) => (
              <span key={b.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', backgroundColor: b.bg, color: b.fg }}>
                {b.pulse && <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#fff', animation: 'pulse 1.5s infinite' }} />}
                {b.label}
              </span>
            ))}
          </div>
        )}

        {/* Schedule range + countdown */}
        {(scheduleText || countdownText) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' as const, marginBottom: '6px', fontSize: '11px', color: 'var(--color-neutral-600)' }}>
            {scheduleText && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Calendar size={10} style={{ color: 'var(--color-primary-500)' }} />{scheduleText}
              </span>
            )}
            {countdownText && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: status === 'live' || status === 'ending_soon' ? 'var(--color-error-600)' : 'var(--color-primary-600)', fontWeight: 600 }}>
                <Clock size={10} />{countdownText}
              </span>
            )}
          </div>
        )}

        {listing.category && <span style={st.categoryTag}>{listing.category}</span>}

        {/* Logistics badges */}
        <div style={st.badgeRow}>
          {listing.ships_available ? (
            <span style={st.badgeShips}><Truck size={9} />Ships</span>
          ) : (
            <span style={st.badgeLocal}><Package size={9} />Local Pickup</span>
          )}
        </div>

        <div style={st.cardFooter}>
          <span style={st.viewHint}>Tap to view details <ChevronRight size={11} /></span>
        </div>
      </div>
    </button>
  );
}

// ─── Event detail modal ───────────────────────────────────────────────────────

function EventDetailModal({ listing, onClose }: {
  listing: ExternalListing;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const color = PLATFORM_COLORS[listing.platform] ?? PLATFORM_COLORS.other;
  const platformLabel = listing.platform.charAt(0).toUpperCase() + listing.platform.slice(1);
  const typeLabel = LISTING_TYPE_LABELS[listing.listing_type] ?? listing.listing_type;

  const badges = statusBadges(listing);
  const liveBadge = badges.find((b) => b.label === 'LIVE NOW');
  const scheduleText = formatScheduleRange(listing);
  const startCountdown = formatStartCountdown(listing);
  const endCountdown = formatEndCountdown(listing);
  const dur = durationMs(listing);
  const startMs = effectiveStartMs(listing);
  const canRemind = Boolean(startMs && startMs > Date.now() && user?.id);

  const [reminderOn, setReminderOn] = useState<boolean>(() => isReminderOn(listing.id));
  const handleToggleReminder = () => {
    if (!startMs) return;
    const on = toggleLocalReminder({
      eventId: listing.id,
      title: listing.title,
      startsAtISO: new Date(startMs).toISOString(),
      remindBeforeMinutes: 60,
    });
    setReminderOn(on);
  };

  return (
    <div style={mo.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={mo.sheet}>
        <div style={mo.handle} />
        <div style={mo.header}>
          <span style={mo.title}>Event Details</span>
          <button onClick={onClose} style={mo.closeBtn}><X size={18} /></button>
        </div>
        <div data-scroll-lock-allow style={mo.body}>
          {/* Image — always render so missing/broken URLs show branded fallback */}
          <div style={{ width: '100%', height: '180px', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: 'var(--space-3)', position: 'relative' }}>
            <ImageWithFade
              src={listing.image_url}
              alt={listing.title}
              fallback={
                <MediaFallback
                  kind={listing.listing_type === 'auction' ? 'auction' : 'live'}
                  platform={listing.platform as FallbackPlatform}
                  seed={listing.id}
                  label={platformLabel}
                />
              }
            />
            {liveBadge && <span style={st.liveBadge}><span style={st.liveBadgeDot} />LIVE</span>}
          </div>

          {/* Platform + type */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', flexWrap: 'wrap' as const }}>
            <span style={{ ...st.platformBadge, backgroundColor: `${color}18`, color }}>{platformLabel}</span>
            <span style={st.typeBadge}>{typeLabel}</span>
            {listing.price_display && <span style={st.price}>{listing.price_display}</span>}
          </div>

          {/* Title */}
          <p style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-neutral-900)', lineHeight: 1.4, marginBottom: 'var(--space-2)' }}>
            {listing.title}
          </p>

          {/* Category */}
          {listing.category && (
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)', marginBottom: 'var(--space-3)' }}>
              Category: {listing.category}
            </p>
          )}

          {/* Status badges */}
          {badges.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const, marginBottom: 'var(--space-3)' }}>
              {badges.map((b) => (
                <span key={b.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '4px', backgroundColor: b.bg, color: b.fg }}>
                  {b.pulse && <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#fff', animation: 'pulse 1.5s infinite' }} />}
                  {b.label}
                </span>
              ))}
            </div>
          )}

          {/* Schedule block */}
          {(scheduleText || startCountdown || endCountdown || dur != null) && (
            <div style={{ marginBottom: 'var(--space-4)', padding: '12px 14px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-neutral-50)', border: '1px solid var(--color-neutral-100)' }}>
              {scheduleText && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-neutral-800)', marginBottom: '6px' }}>
                  <Calendar size={13} style={{ color: 'var(--color-primary-500)' }} />
                  <span>{scheduleText}</span>
                </div>
              )}
              {startCountdown && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-xs)', color: 'var(--color-primary-700)', fontWeight: 600 }}>
                  <Clock size={11} />{startCountdown}
                </div>
              )}
              {endCountdown && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-xs)', color: endCountdown === 'Ended' ? 'var(--color-neutral-500)' : 'var(--color-error-600)', fontWeight: 600, marginTop: startCountdown ? 3 : 0 }}>
                  <Clock size={11} />{endCountdown}
                </div>
              )}
              {dur != null && (
                <div style={{ fontSize: '11px', color: 'var(--color-neutral-500)', marginTop: 4 }}>
                  Duration: {formatDuration(dur)}
                </div>
              )}
            </div>
          )}

          {/* Remind me */}
          {canRemind && (
            <button
              onClick={handleToggleReminder}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', minHeight: 44, padding: '11px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: reminderOn ? 'var(--color-warning-50)' : 'var(--color-neutral-100)',
                border: `1.5px solid ${reminderOn ? 'var(--color-warning-400)' : 'var(--color-neutral-200)'}`,
                fontSize: 'var(--font-size-sm)', fontWeight: 700,
                color: reminderOn ? 'var(--color-warning-700)' : 'var(--color-neutral-700)',
                marginBottom: 'var(--space-3)', cursor: 'pointer',
              }}
            >
              {reminderOn ? <Bell size={14} /> : <BellOff size={14} />}
              {reminderOn ? 'Reminder On (1 hour before)' : 'Remind me 1 hour before'}
            </button>
          )}

          {/* Logistics badges */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' as const, marginBottom: 'var(--space-4)' }}>
            {listing.ships_available
              ? <span style={st.badgeShips}><Truck size={10} />Shipping Available</span>
              : <span style={st.badgeLocal}><Package size={10} />Local Pickup Only</span>}
          </div>

          <div style={{ marginBottom: 'var(--space-3)' }}>
            <LogisticsBlock
              generalLocation={(listing as ExternalListing & Record<string, unknown>).general_location as string}
              marketplaceFound={(listing as ExternalListing & Record<string, unknown>).marketplace_found as string}
              pickupType={(listing as ExternalListing & Record<string, unknown>).pickup_type as string[]}
              shippingAvailable={listing.ships_available}
              meetupNotes={(listing as ExternalListing & Record<string, unknown>).meetup_notes as string}
              hasPrivateAddress={Boolean((listing as ExternalListing & Record<string, unknown>).exact_address_private)}
              addressRevealPolicy={(listing as ExternalListing & Record<string, unknown>).address_reveal_policy as string}
            />
          </div>

          <SafetyReminder variant="inline" />

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <ReportListingButton table="external_listings" listingId={listing.id} />
          </div>

          {/* View external listing — guard against missing/invalid URLs
              so we never open about:blank or a junk scheme. Whatnot
              listings fall back to the platform browse page. */}
          {(() => {
            const safeUrl = isValidHttpUrl(listing.external_url || '')
              ? listing.external_url
              : (PLATFORM_TABS.find((t) => t.key === listing.platform)?.url ?? null);
            if (!safeUrl) {
              return (
                <div style={{ ...det.viewBtn, opacity: 0.55, cursor: 'not-allowed' }} aria-disabled="true">
                  <ExternalLink size={14} />
                  <span>Link unavailable</span>
                </div>
              );
            }
            const isFallback = safeUrl !== listing.external_url;
            return (
              <a href={safeUrl} target="_blank" rel="noopener noreferrer" style={det.viewBtn}>
                <ExternalLink size={14} />
                <span>{isFallback ? `Visit ${platformLabel}` : 'View Full Listing'}</span>
              </a>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ─── Filter drawer ────────────────────────────────────────────────────────────

function FilterDrawer({ dateFilter, setDateFilter, customDate, setCustomDate, sortBy, setSortBy, locationQuery, setLocationQuery, onClose, onReset }: {
  dateFilter: DateFilter; setDateFilter: (v: DateFilter) => void;
  customDate: string; setCustomDate: (v: string) => void;
  sortBy: SortKey; setSortBy: (v: SortKey) => void;
  locationQuery: string; setLocationQuery: (v: string) => void;
  onClose: () => void; onReset: () => void;
}) {
  return (
    <div style={mo.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={mo.sheet}>
        <div style={mo.handle} />
        <div style={mo.header}>
          <span style={mo.title}>Filters &amp; Sort</span>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            <button onClick={onReset} style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-primary-600)' }}>Reset</button>
            <button onClick={onClose} style={mo.closeBtn}><X size={18} /></button>
          </div>
        </div>
        <div data-scroll-lock-allow style={mo.body}>

          {/* Date filter */}
          <p style={fd.sectionTitle}>Date</p>
          <div style={fd.chipGrid}>
            {DATE_FILTERS.map((d) => (
              <button
                key={d.key}
                onClick={() => setDateFilter(d.key)}
                style={{ ...fd.chip, ...(dateFilter === d.key ? fd.chipActive : {}) }}
              >
                {d.label}
              </button>
            ))}
          </div>
          {dateFilter === 'custom' && (
            <input
              style={{ ...mo.input, marginTop: 'var(--space-2)' }}
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
            />
          )}

          {/* Sort */}
          <p style={{ ...fd.sectionTitle, marginTop: 'var(--space-4)' }}>Sort By</p>
          <div style={fd.chipGrid}>
            {SORT_OPTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSortBy(s.key)}
                style={{ ...fd.chip, ...(sortBy === s.key ? fd.chipActive : {}) }}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Location search */}
          <p style={{ ...fd.sectionTitle, marginTop: 'var(--space-4)' }}>Location</p>
          <div style={st.searchBox}>
            <MapPin size={14} style={{ color: 'var(--color-neutral-400)', flexShrink: 0 }} />
            <input
              style={st.searchInput}
              placeholder="City, state, or ZIP (searches titles)"
              value={locationQuery}
              onChange={(e) => setLocationQuery(e.target.value)}
            />
            {locationQuery && (
              <button onClick={() => setLocationQuery('')} style={st.searchClear}>
                <X size={13} style={{ color: 'var(--color-neutral-400)' }} />
              </button>
            )}
          </div>
          <p style={{ fontSize: '10px', color: 'var(--color-neutral-400)', marginTop: '5px', lineHeight: 1.4 }}>
            Searches within event titles and categories. Include location when uploading events for best results.
          </p>

          <button onClick={onClose} style={{ ...mo.submitBtn, marginTop: 'var(--space-5)' }}>
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Upload Event modal ───────────────────────────────────────────────────────

interface EventForm {
  title: string; platform: string; listing_type: string; external_url: string;
  price_display: string; category: string; image_url: string;
  start_date: string; start_time: string;
  end_date: string;   end_time: string;
  same_day: boolean; multi_day: boolean; no_end_time: boolean;
  ships_available: boolean;
}

function UploadEventModal({ userId, onClose, onSuccess }: { userId?: string; onClose: () => void; onSuccess: (created?: ExternalListing) => void }) {
  const [form, setForm] = useState<EventForm>({
    title: '', platform: 'other', listing_type: 'auction', external_url: '',
    price_display: '', category: '', image_url: '',
    start_date: '', start_time: '', end_date: '', end_time: '',
    same_day: true, multi_day: false, no_end_time: false,
    ships_available: false,
  });
  const [loc, setLoc] = useState<LocationValue>({
    general_location: '', exact_address_private: '', address_reveal_policy: 'on_contact',
  });
  const [pickupType, setPickupType] = useState<string[]>([]);
  const [meetupNotes, setMeetupNotes] = useState('');
  const [marketplaceKey, setMarketplaceKey] = useState('');
  const [marketplaceCustom, setMarketplaceCustom] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');
  const set = (k: keyof EventForm, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  // Toggle helpers — Same-Day / Multi-Day / No End Time are mutually exclusive
  // in spirit. Same-Day auto-mirrors end_date to start_date as the user types.
  const setSameDay = (v: boolean) => setForm((f) => ({
    ...f, same_day: v,
    multi_day: v ? false : f.multi_day,
    no_end_time: v ? false : f.no_end_time,
    end_date: v ? f.start_date : f.end_date,
  }));
  const setMultiDay = (v: boolean) => setForm((f) => ({
    ...f, multi_day: v,
    same_day: v ? false : f.same_day,
    no_end_time: v ? false : f.no_end_time,
  }));
  const setNoEndTime = (v: boolean) => setForm((f) => ({
    ...f, no_end_time: v,
    same_day: v ? false : f.same_day,
    multi_day: v ? false : f.multi_day,
    end_date: v ? '' : f.end_date,
    end_time: v ? '' : f.end_time,
  }));

  // Keep end_date synced to start_date when Same-Day is on.
  const setStartDate = (v: string) => setForm((f) => ({
    ...f, start_date: v,
    end_date: f.same_day ? v : f.end_date,
  }));

  function buildIso(date: string, time: string): string | null {
    if (!date) return null;
    const t = time || '00:00';
    const local = new Date(`${date}T${t}`);
    return Number.isNaN(local.getTime()) ? null : local.toISOString();
  }

  const handleSubmit = async () => {
    setError(''); setSuccess('');

    if (!userId) {
      setError('Please sign in to upload events. Guest mode is read-only.');
      return;
    }
    if (!form.title.trim())                      { setError('Title is required.'); return; }
    if (!form.external_url.trim())               { setError('External URL is required.'); return; }
    if (!isValidHttpUrl(form.external_url.trim())) {
      setError('Please enter a valid http or https URL (e.g. https://www.ebay.com/…).');
      return;
    }
    if (form.image_url.trim() && !isValidHttpUrl(form.image_url.trim())) {
      setError('Image URL must be a valid http or https link.');
      return;
    }
    if (!isValidGeneralLocation(loc.general_location)) {
      setError('Add a general location — ZIP or "City, ST" — so attendees can filter.');
      return;
    }
    if (marketplaceKey === 'other' && !marketplaceCustom.trim()) {
      setError('Please enter the marketplace name, or pick a different option.');
      return;
    }

    // Schedule validation
    if (!form.start_date) {
      setError('Start date is required.'); return;
    }
    const startIso = buildIso(form.start_date, form.start_time);
    if (!startIso) { setError('Please enter a valid start date and time.'); return; }
    let endIso: string | null = null;
    if (!form.no_end_time) {
      if (!form.end_date) { setError('End date is required (or turn on "No End Time").'); return; }
      endIso = buildIso(form.end_date, form.end_time);
      if (!endIso) { setError('Please enter a valid end date and time.'); return; }
      if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
        setError('End must be after the start time.'); return;
      }
    }

    setSaving(true);

    // Defensive: re-verify the session is still valid right before the
    // insert. On mobile we have seen cases where the cached userId prop
    // outlives the actual Supabase JWT (token refresh failed silently
    // in the background, app was backgrounded for a long time, etc.).
    // If we hit RLS with a stale/missing session the row never makes it
    // into the table — and the user thinks it worked because we never
    // surfaced the error loudly enough. Catching it here lets us show
    // a precise, actionable message.
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    const liveSession = sessionData?.session;
    if (sessionErr || !liveSession || liveSession.user.id !== userId) {
      setSaving(false);
      console.error('[UPLOAD_EVENT] session check failed', {
        hasSession: !!liveSession, sessionErr, userId,
        sessionUserId: liveSession?.user.id,
      });
      setError('Your sign-in has expired. Please sign out and back in, then try uploading again.');
      return;
    }

    const marketplaceValue = marketplaceKey === 'other' && marketplaceCustom.trim()
      ? `custom:${marketplaceCustom.trim()}`
      : marketplaceKey || null;
    const shipping = form.ships_available || pickupType.includes('shipping_available') || pickupType.includes('nationwide_shipping');
    // Return the inserted row so the parent can optimistically render it
    // before (or in addition to) the refetch completing.
    const payload = {
      user_id: userId,
      title: form.title.trim(),
      platform: form.platform,
      listing_type: form.listing_type,
      external_url: form.external_url.trim(),
      price_display: form.price_display.trim() || '',
      category: form.category.trim() || 'other',
      image_url: form.image_url.trim() || null,
      start_at: startIso,
      ends_at: endIso,
      ships_available: shipping,
      local_pickup: pickupType.includes('local_pickup') || !shipping,
      status: 'active',
      location: loc.general_location,
      general_location: loc.general_location,
      exact_address_private: loc.exact_address_private.trim() || null,
      address_reveal_policy: loc.address_reveal_policy,
      pickup_type: pickupType,
      meetup_notes: meetupNotes.trim() || null,
      marketplace_found: marketplaceValue,
    };
    const { data: inserted, error: err } = await supabase
      .from('external_listings')
      .insert(payload)
      .select('*')
      .single();
    if (err) {
      setSaving(false);
      console.error('[UPLOAD_EVENT] insert failed', { err, payload });
      const msg = err.message?.includes('row-level security')
        ? 'You do not have permission to submit events. Please sign in again.'
        : err.message || 'Failed to submit. Please try again.';
      setError(msg);
      // Mobile users can scroll past an inline red banner without seeing
      // it. A native alert is impossible to miss — it's the difference
      // between "I uploaded an event and it didn't show up" (thinking it
      // worked) and "the app told me exactly why it failed".
      try { window.alert(`Event upload failed:\n\n${msg}`); } catch {}
      return;
    }
    if (!inserted) {
      setSaving(false);
      console.error('[UPLOAD_EVENT] insert returned no row', { payload });
      const msg = 'Upload may not have completed. Please refresh and check the feed.';
      setError(msg);
      try { window.alert(msg); } catch {}
      return;
    }

    // Post-insert verification: re-read the row we just wrote, by id,
    // to confirm it really landed (and is visible to us). If this read
    // comes back empty, something silently dropped the write — surface
    // it loudly instead of letting the success toast lie.
    const insertedRow = inserted as ExternalListing;
    const { data: verify, error: vErr } = await supabase
      .from('external_listings')
      .select('id,status')
      .eq('id', insertedRow.id)
      .maybeSingle();
    setSaving(false);
    if (vErr || !verify) {
      console.error('[UPLOAD_EVENT] post-insert verify failed', { vErr, insertedId: insertedRow.id });
      const msg = 'Event saved but could not be read back. It may not appear in the feed. Please refresh and check.';
      setError(msg);
      try { window.alert(msg); } catch {}
      return;
    }

    setSuccess('Event uploaded successfully.');
    setTimeout(() => onSuccess(insertedRow), 900);
  };

  return (
    <div style={mo.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={mo.sheet}>
        <div style={mo.handle} />
        <div style={mo.header}>
          <span style={mo.title}>Upload Event</span>
          <button onClick={onClose} style={mo.closeBtn}><X size={18} /></button>
        </div>
        <div data-scroll-lock-allow style={mo.body}>
          <label style={mo.label}>Title <span style={mo.req}>*</span></label>
          <input style={mo.input} placeholder="e.g. Estate Sale — Phoenix, AZ" value={form.title} onChange={(e) => set('title', e.target.value)} />
          <div style={mo.row}>
            <div style={{ flex: 1 }}>
              <label style={mo.label}>Platform</label>
              <div style={mo.selectWrap}>
                <select style={mo.select} value={form.platform} onChange={(e) => set('platform', e.target.value)}>
                  <option value="whatnot">Whatnot</option>
                  <option value="poshmark">Poshmark</option>
                  <option value="ebay">eBay</option>
                  <option value="hibid">HiBid</option>
                  <option value="maxsold">MaxSold</option>
                  <option value="estatesales">EstateSales.net</option>
                  <option value="facebook">Facebook</option>
                  <option value="other">Other</option>
                </select>
                <ChevronDown size={13} style={mo.selectIcon} />
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={mo.label}>Event Type</label>
              <div style={mo.selectWrap}>
                <select style={mo.select} value={form.listing_type} onChange={(e) => set('listing_type', e.target.value)}>
                  <option value="auction">Auction</option>
                  <option value="live_stream">Live Stream</option>
                  <option value="estate_sale">Estate Sale</option>
                  <option value="yard_sale">Yard Sale</option>
                  <option value="flea_market">Flea Market</option>
                  <option value="storage_auction">Storage Auction</option>
                  <option value="fixed_price">For Sale</option>
                </select>
                <ChevronDown size={13} style={mo.selectIcon} />
              </div>
            </div>
          </div>
          <label style={mo.label}>External URL <span style={mo.req}>*</span></label>
          <input style={mo.input} placeholder="https://…" type="url" value={form.external_url} onChange={(e) => set('external_url', e.target.value)} />
          <div style={mo.row}>
            <div style={{ flex: 1 }}>
              <label style={mo.label}>Starting Price</label>
              <input style={mo.input} placeholder="e.g. $25 or Free" value={form.price_display} onChange={(e) => set('price_display', e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={mo.label}>Category</label>
              <input style={mo.input} placeholder="e.g. Antiques" value={form.category} onChange={(e) => set('category', e.target.value)} />
            </div>
          </div>
          {/* ── Event Start ── */}
          <p style={{ ...mo.label, marginTop: 'var(--space-4)', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.06em', color: 'var(--color-neutral-500)' }}>Event Start <span style={mo.req}>*</span></p>
          <div style={mo.row}>
            <div style={{ flex: 1 }}>
              <label style={mo.label}>Start Date</label>
              <input style={{ ...mo.input, minHeight: 44 }} type="date" value={form.start_date} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={mo.label}>Start Time</label>
              <input style={{ ...mo.input, minHeight: 44 }} type="time" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} />
            </div>
          </div>

          {/* Schedule toggles */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginTop: 'var(--space-3)' }}>
            {([
              { key: 'same_day' as const,    label: 'Same-Day Event',   on: form.same_day,    setter: setSameDay },
              { key: 'multi_day' as const,   label: 'Multi-Day Event',  on: form.multi_day,   setter: setMultiDay },
              { key: 'no_end_time' as const, label: 'No End Time',      on: form.no_end_time, setter: setNoEndTime },
            ]).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => t.setter(!t.on)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  minHeight: 44, padding: '8px 14px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: t.on ? 'var(--color-primary-50)' : 'var(--color-neutral-100)',
                  border: `1.5px solid ${t.on ? 'var(--color-primary-400)' : 'var(--color-neutral-200)'}`,
                  fontSize: 'var(--font-size-xs)', fontWeight: 600,
                  color: t.on ? 'var(--color-primary-700)' : 'var(--color-neutral-600)',
                  cursor: 'pointer',
                }}
              >
                {t.on ? <ToggleRight size={16} style={{ color: 'var(--color-primary-500)' }} /> : <ToggleLeft size={16} style={{ color: 'var(--color-neutral-400)' }} />}
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Event End ── */}
          {!form.no_end_time && (
            <>
              <p style={{ ...mo.label, marginTop: 'var(--space-4)', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.06em', color: 'var(--color-neutral-500)' }}>Event End <span style={mo.req}>*</span></p>
              <div style={mo.row}>
                <div style={{ flex: 1 }}>
                  <label style={mo.label}>End Date</label>
                  <input
                    style={{ ...mo.input, minHeight: 44, opacity: form.same_day ? 0.6 : 1 }}
                    type="date"
                    value={form.end_date}
                    onChange={(e) => set('end_date', e.target.value)}
                    disabled={form.same_day}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={mo.label}>End Time</label>
                  <input style={{ ...mo.input, minHeight: 44 }} type="time" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} />
                </div>
              </div>
              {form.same_day && (
                <p style={{ fontSize: '10px', color: 'var(--color-neutral-400)', marginTop: 4 }}>End date auto-matches the start date.</p>
              )}
            </>
          )}

          <label style={mo.label}>Image URL</label>
          <input style={mo.input} placeholder="https://…" value={form.image_url} onChange={(e) => set('image_url', e.target.value)} />

          <div style={{ marginTop: 12 }}>
            <LocationFields value={loc} onChange={setLoc} />
          </div>

          <div style={{ marginTop: 12 }}>
            <MarketplaceFoundSelect
              value={marketplaceKey}
              customValue={marketplaceCustom}
              onChange={(key, custom) => { setMarketplaceKey(key); setMarketplaceCustom(custom); }}
              label="Marketplace / Source (optional)"
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <PickupTypeChips value={pickupType} onChange={setPickupType} />
          </div>

          <label style={{ ...mo.label, marginTop: 12 }}>Meetup Notes (optional)</label>
          <textarea
            style={{ ...mo.input, minHeight: 60, fontFamily: 'inherit' as const, resize: 'vertical' as const }}
            placeholder="Parking, gate codes, best times…"
            value={meetupNotes}
            onChange={(e) => setMeetupNotes(e.target.value)}
            rows={2}
          />

          <div style={{ marginTop: 12 }}>
            <SafetyReminder />
          </div>

          {error && <p style={mo.errorText}>{error}</p>}
          {success && <p style={mo.successText}>{success}</p>}
          <button onClick={handleSubmit} disabled={saving || !!success} style={{ ...mo.submitBtn, opacity: saving || success ? 0.7 : 1 }}>
            {success ? 'Submitted' : saving ? 'Submitting…' : 'Submit Event'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Boost picker modal ───────────────────────────────────────────────────────
// Lets the user pick one of their hosted events and run the mocked $3 / 72h
// boost from Phase 1. Payments are MOCKED via lib/payments.ts; Stripe is a
// Phase 2 swap behind startBoostPurchase. Routing-to-login is handled by the
// caller — this modal is only mounted when a user session exists.
function BoostPickerModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { profile } = useAuth();
  const isPro = isProUser(profile);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setErr('');
    try {
      const rows = await fetchMyEvents(userId);
      setEvents(rows);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not load your events.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, [userId]);

  const handleBoost = async (event: EventRow) => {
    if (isBoosted(event)) return;
    setBusyId(event.id);
    const res = await startBoostPurchase({ targetKind: 'event', targetId: event.id });
    setBusyId(null);
    if (!res.ok) {
      flashToast(
        res.comingSoon ? 'Boost checkout is coming soon.' : `Boost failed: ${res.error}`,
        'info',
      );
      return;
    }
    flashToast('Boost active for 72 hours.', 'success');
    await reload();
  };

  return (
    <div style={mo.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={mo.sheet}>
        <div style={mo.handle} />
        <div style={mo.header}>
          <span style={mo.title}>Boost an Event</span>
          <button onClick={onClose} style={mo.closeBtn}><X size={18} /></button>
        </div>
        <div data-scroll-lock-allow style={mo.body}>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 'var(--space-4)', paddingLeft: 18 }}>
            <li style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-700)', lineHeight: 1.5 }}>Boost for 72h</li>
            <li style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-700)', lineHeight: 1.5 }}>Appear higher in Discover/Live feeds</li>
            <li style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-700)', lineHeight: 1.5 }}>Increase visibility to nearby buyers</li>
          </ul>

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '24px 0', color: 'var(--color-neutral-500)' }}>
              <Loader2 size={16} className="spin" />
              <span style={{ fontSize: 'var(--font-size-sm)' }}>Loading your events…</span>
            </div>
          )}

          {!loading && err && (
            <p style={mo.errorText}>{err}</p>
          )}

          {!loading && !err && events.length === 0 && (
            <div style={{ padding: '24px 0', textAlign: 'center' as const }}>
              <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-neutral-700)', marginBottom: 6 }}>You don't host any events yet.</p>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)', lineHeight: 1.5 }}>
                Publish an event from your seller dashboard, then come back to boost it.
              </p>
            </div>
          )}

          {!loading && !err && events.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {events.map((ev) => {
                const active = isBoosted(ev);
                const remaining = boostExpiresInLabel(ev);
                const busy = busyId === ev.id;
                return (
                  <div
                    key={ev.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                      padding: '12px var(--space-3)', borderRadius: 'var(--radius-lg)',
                      backgroundColor: 'var(--color-neutral-0)',
                      border: '1px solid var(--color-neutral-150)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-neutral-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.title || 'Untitled event'}
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--color-neutral-500)', marginTop: 2 }}>
                        {ev.city || ev.region || 'Location TBD'}
                      </p>
                    </div>
                    {active ? (
                      <span style={boostPicker.activePill}>
                        <Zap size={11} style={{ color: '#fbbf24' }} /> Boosted{remaining ? ` · ${remaining}` : ''}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleBoost(ev)}
                        disabled={busy}
                        style={{ ...boostPicker.boostBtn, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}
                      >
                        {busy ? <Loader2 size={13} className="spin" /> : <Zap size={13} />}
                        {isPro ? 'Boost Event — Included with Pro' : 'Boost — $3 / 72h'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const boostPicker: Record<string, React.CSSProperties> = {
  boostBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '9px 14px', minHeight: 40, borderRadius: 999,
    background: 'linear-gradient(135deg, #fbbf24, #f59e0b 55%, #d97706)',
    color: '#1a1208', border: '1px solid rgba(251,191,36,0.55)',
    fontSize: 12, fontWeight: 800, flexShrink: 0,
    boxShadow: '0 4px 12px rgba(251, 191, 36, 0.25)',
  },
  activePill: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '7px 11px', borderRadius: 999,
    background: 'rgba(251, 191, 36, 0.12)',
    border: '1px solid rgba(251, 191, 36, 0.35)',
    color: '#b45309', fontSize: 11, fontWeight: 700, flexShrink: 0,
  },
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const st: Record<string, React.CSSProperties> = {
  container: { backgroundColor: 'var(--color-neutral-0)' },

  header: { position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-4)', paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--space-3))', borderBottom: '1px solid var(--color-neutral-100)', backgroundColor: 'var(--color-neutral-0)', flexShrink: 0 },
  backBtn: { width: '36px', height: '36px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-neutral-600)' },
  headerCenter: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  headerTitle: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  liveChip: { display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-error-50)', border: '1px solid var(--color-error-200)', fontSize: '10px', fontWeight: 700, color: 'var(--color-error-700)' },
  liveDot: { width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--color-error-500)', animation: 'pulse 2s infinite', flexShrink: 0 },

  searchRow: { display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-4)', borderBottom: '1px solid var(--color-neutral-100)', flexShrink: 0 },
  searchBox: { flex: 1, display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-neutral-50)', border: '1px solid var(--color-neutral-150)' },
  searchInput: { flex: 1, fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-900)', backgroundColor: 'transparent', border: 'none', outline: 'none', minWidth: 0 },
  searchClear: { display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  filterToggle: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', width: '40px', height: '40px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-neutral-100)', color: 'var(--color-neutral-600)', flexShrink: 0, position: 'relative' },
  filterToggleActive: { backgroundColor: 'var(--color-primary-50)', border: '1.5px solid var(--color-primary-300)', color: 'var(--color-primary-600)' },
  filterBadge: { position: 'absolute', top: '-4px', right: '-4px', width: '16px', height: '16px', borderRadius: '50%', backgroundColor: 'var(--color-primary-500)', color: '#fff', fontSize: '9px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' },

  platformTabs: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-4)', flexShrink: 0 },
  platformTab: { position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '10px var(--space-1) 8px', borderRadius: 'var(--radius-md)', transition: 'transform 0.12s ease, box-shadow 0.12s ease', cursor: 'pointer', textDecoration: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' },
  platformTabDot: { width: '9px', height: '9px', borderRadius: '50%' },
  platformTabLabel: { fontSize: '10px', fontWeight: 700, textAlign: 'center' as const },

  filterRow: { display: 'flex', gap: '6px', padding: '6px var(--space-4)', overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0, borderTop: '1px solid var(--color-neutral-50)' },
  chip: { flexShrink: 0, padding: '5px 11px', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-600)', backgroundColor: 'var(--color-neutral-100)', border: '1px solid transparent' },
  chipActive: { backgroundColor: 'var(--color-primary-600)', color: 'var(--color-neutral-0)', border: '1px solid var(--color-primary-600)' },

  actionArea: { display: 'flex', flexDirection: 'column' as const, gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--color-neutral-100)', borderBottom: '1px solid var(--color-neutral-100)', flexShrink: 0 },
  actionBtnPrimary: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', minHeight: 48, padding: '13px', borderRadius: 'var(--radius-full)', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))', cursor: 'pointer', boxShadow: '0 2px 8px rgba(255, 107, 53, 0.25)' },
  actionBtnLabel: { fontSize: 'var(--font-size-base)', fontWeight: 700, color: '#fff', letterSpacing: '0.01em' },
  actionRow: { display: 'flex', gap: 'var(--space-2)' },
  actionBtnBoost: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minHeight: 44, padding: '10px 12px', borderRadius: 'var(--radius-full)', background: 'linear-gradient(135deg, #fbbf24, #f59e0b 55%, #d97706)', border: '1.5px solid rgba(251,191,36,0.55)', cursor: 'pointer', boxShadow: '0 4px 12px rgba(251, 191, 36, 0.25)' },
  actionBtnBoostLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 800, color: '#1a1208' },

  resultsBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px var(--space-4)', flexShrink: 0 },
  resultsText: { fontSize: '11px', color: 'var(--color-neutral-400)' },
  sortLabel: { fontSize: '11px', color: 'var(--color-primary-600)', fontWeight: 600 },

  feed: { padding: 'var(--space-2) var(--space-4) var(--space-4)' },
  successBanner: { flexShrink: 0, margin: '8px 16px 0', padding: '10px 14px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-success-50, #ecfdf5)', color: 'var(--color-success-700, #047857)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', border: '1px solid var(--color-success-200, #a7f3d0)' },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center' },
  emptyTitle: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-700)', marginBottom: '6px' },
  emptyText: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-400)', marginBottom: '20px', lineHeight: 1.5 },
  emptyBtn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-primary-600)', color: 'var(--color-neutral-0)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)' },

  card: { width: '100%', textAlign: 'left', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-neutral-100)', overflow: 'hidden', marginBottom: 'var(--space-3)', backgroundColor: 'var(--color-neutral-0)' },
  cardImgWrap: { position: 'relative', height: '150px', backgroundColor: 'var(--color-neutral-50)' },
  cardImg: { width: '100%', height: '100%', objectFit: 'cover' },
  cardImgFallback: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  cardImgFallbackLogo: { width: 'auto', height: '56px', maxWidth: '70%', objectFit: 'contain' },
  cardImgFallbackLabel: { fontSize: 'var(--font-size-lg)', fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase' as const },
  liveBadge: { position: 'absolute', top: '10px', left: '10px', display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-error-500)', color: '#fff', fontSize: '10px', fontWeight: 700 },
  liveBadgeDot: { width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#fff', animation: 'pulse 1.5s infinite' },
  cardBody: { padding: '10px var(--space-3) var(--space-3)' },
  cardTop: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '7px', flexWrap: 'wrap' as const },
  platformBadge: { fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px' },
  typeBadge: { fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px', backgroundColor: 'var(--color-neutral-100)', color: 'var(--color-neutral-600)' },
  price: { marginLeft: 'auto', fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-success-700)' },
  cardTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-900)', lineHeight: 1.4, marginBottom: '6px' },
  categoryTag: { display: 'inline-block', fontSize: '10px', color: 'var(--color-secondary-700)', backgroundColor: 'var(--color-secondary-50)', padding: '2px 7px', borderRadius: '4px', marginBottom: '7px' },
  badgeRow: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' as const, marginBottom: '6px' },
  badgeShips: { display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 600, color: 'var(--color-success-700)', backgroundColor: 'var(--color-success-50)', padding: '2px 7px', borderRadius: '4px' },
  badgeLocal: { display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 600, color: 'var(--color-neutral-600)', backgroundColor: 'var(--color-neutral-100)', padding: '2px 7px', borderRadius: '4px' },
  badgeTimer: { display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: 'var(--color-error-600)', fontWeight: 600 },
  cardFooter: { display: 'flex', justifyContent: 'flex-end' },
  viewHint: { display: 'flex', alignItems: 'center', fontSize: '10px', color: 'var(--color-primary-500)', fontWeight: 600 },
};

const det: Record<string, React.CSSProperties> = {
  viewBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '12px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-neutral-100)', fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-neutral-800)', textDecoration: 'none' },
};

const fd: Record<string, React.CSSProperties> = {
  sectionTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-800)', marginBottom: 'var(--space-2)' },
  chipGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: 'var(--space-2)' },
  chip: { padding: '6px 14px', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-neutral-600)', backgroundColor: 'var(--color-neutral-100)', border: '1px solid transparent' },
  chipActive: { backgroundColor: 'var(--color-primary-600)', color: '#fff', border: '1px solid var(--color-primary-600)' },
};

const mo: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.48)', zIndex: 1000, display: 'flex', alignItems: 'flex-end' },
  sheet: { width: '100%', maxHeight: '92vh', backgroundColor: 'var(--color-neutral-0)', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  handle: { width: '36px', height: '4px', borderRadius: '2px', backgroundColor: 'var(--color-neutral-200)', margin: '10px auto 0', flexShrink: 0 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px var(--space-4)', borderBottom: '1px solid var(--color-neutral-100)', flexShrink: 0 },
  title: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  closeBtn: { width: '32px', height: '32px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-neutral-500)' },
  body: { flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: 'var(--space-4)' },
  label: { display: 'flex', alignItems: 'center', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-600)', marginBottom: '5px', marginTop: 'var(--space-3)' },
  req: { color: 'var(--color-error-500)', marginLeft: '2px' },
  input: { width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-200)', fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-900)', backgroundColor: 'var(--color-neutral-0)', boxSizing: 'border-box' as const },
  row: { display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-3)' },
  selectWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  select: { width: '100%', padding: '9px 28px 9px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-200)', fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-900)', backgroundColor: 'var(--color-neutral-0)', appearance: 'none', boxSizing: 'border-box' as const },
  selectIcon: { position: 'absolute', right: '8px', color: 'var(--color-neutral-400)', pointerEvents: 'none' },
  toggleRow: { display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' },
  toggleItem: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-neutral-50)', border: '1px solid var(--color-neutral-100)' },
  toggleLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-700)' },
  toggleBtn: { background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 0 },
  errorText: { fontSize: 'var(--font-size-xs)', color: 'var(--color-error-600)', marginTop: 'var(--space-3)', padding: '10px 12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-error-50)', border: '1px solid var(--color-error-200)', lineHeight: 1.4 },
  successText: { fontSize: 'var(--font-size-xs)', color: 'var(--color-success-700)', marginTop: 'var(--space-3)', padding: '10px 12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-success-50)', border: '1px solid var(--color-success-200)', lineHeight: 1.4, fontWeight: 600 },
  submitBtn: { width: '100%', padding: '13px', borderRadius: 'var(--radius-full)', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))', color: '#fff', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.2s' },
};
