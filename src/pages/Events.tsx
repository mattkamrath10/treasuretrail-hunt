import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Calendar, Store, Plus, Bookmark, BookmarkCheck, Search,
  Radio, ExternalLink,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  fetchPublishedEvents, PLATFORM_META, isLiveNow, isStartingSoon,
  type EventRow, type EventCategory,
} from '../lib/events';
import { isEventSaved, saveEvent, unsaveEvent } from '../lib/eventSaves';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { toThumbUrl } from '../lib/imageCompress';
import { SkeletonList } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';
import { BecomeHostCard } from '../components/BecomeHostCard';
import { HostEventCTA } from '../components/HostEventCTA';

/**
 * Local Events feed — the primary real-events surface. Replaces the older
 * gamified hub (missions / squads / leaderboards) following the Phase 1
 * pivot to a professional marketplace + event-discovery platform.
 */

type FilterId = 'all' | 'local' | 'online' | 'live' | 'soon';

const KIND_FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all',    label: 'All' },
  { id: 'local',  label: 'Local' },
  { id: 'online', label: 'Online live' },
  { id: 'live',   label: 'Live now' },
  { id: 'soon',   label: 'Starting soon' },
];

const CATEGORY_LABEL: Record<EventCategory, string> = {
  estate_sale:        'Estate Sale',
  yard_sale:          'Yard Sale',
  flea_market:        'Flea Market',
  auction:            'Auction',
  pop_up:             'Pop-up',
  collectibles_show:  'Collectibles Show',
  other:              'Event',
};

export default function Events({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isHolder = profile?.account_type === 'holder';

  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>('all');
  const [query, setQuery] = useState('');
  // Tick once a minute so Live Now / Starting Soon flips state on its own
  // without a refresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    fetchPublishedEvents({ limit: 100 })
      .then((rows) => { if (!cancelled) setEvents(rows); })
      .catch((e: any) => { if (!cancelled) { setEvents([]); setLoadError(e?.message ?? 'Failed to load events'); } });
    return () => { cancelled = true; };
  }, []);

  const now = Date.now();
  const filtered = (events ?? []).filter((e) => {
    if (filter === 'local'  && e.event_kind !== 'local')  return false;
    if (filter === 'online' && e.event_kind !== 'online') return false;
    if (filter === 'live'   && !isLiveNow(e, now))        return false;
    if (filter === 'soon'   && !isStartingSoon(e, now))   return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      if (!(e.title.toLowerCase().includes(q)
            || (e.city ?? '').toLowerCase().includes(q)
            || (e.address ?? '').toLowerCase().includes(q)
            || (e.seller_handle ?? '').toLowerCase().includes(q))) return false;
    }
    return true;
  });

  return (
    <div style={s.container}>
      <header style={s.header}>
        <button onClick={onBack} style={s.iconBtn} aria-label="Back">
          <ArrowLeft size={20} style={{ color: 'var(--color-neutral-700)' }} />
        </button>
        <div style={s.headerTitleWrap}>
          <h1 style={s.headerTitle}>Local Events</h1>
          <p style={s.headerSubtitle}>Estate sales, flea markets &amp; auctions near you</p>
        </div>
        {isHolder && (
          <button onClick={() => navigate('/seller')} style={s.hostBtn} aria-label="Host dashboard">
            <Store size={16} />
            <span>Dashboard</span>
          </button>
        )}
      </header>

      <HostEventCTA variant="events" />
      <BecomeHostCard surface="home" />

      <div style={s.searchRow}>
        <Search size={16} style={{ color: 'var(--color-neutral-400)' }} />
        <input
          type="search"
          placeholder="Search by title or city"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={s.searchInput}
        />
      </div>

      <div style={s.filterRow}>
        {KIND_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              ...s.filterChip,
              ...(filter === f.id ? s.filterChipActive : {}),
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loadError && (
        <div style={s.errorBanner}>{loadError}</div>
      )}

      <div style={s.feed}>
        {events === null ? (
          <SkeletonList count={3} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title={events.length === 0 ? 'No events yet' : 'No events match'}
            body={
              events.length === 0
                ? (isHolder
                    ? 'Be the first to publish a local event.'
                    : 'Check back soon — hosts are adding events all the time.')
                : 'Try a different filter or search term.'
            }
            action={
              isHolder ? (
                <button onClick={() => navigate('/seller')} style={s.fab as any}>
                  Create event
                </button>
              ) : undefined
            }
          />
        ) : (
          filtered.map((e) => <EventCard key={e.id} event={e} />)
        )}
      </div>

      {isHolder && filtered.length > 0 && (
        <button onClick={() => navigate('/seller')} style={s.fab} aria-label="Create event">
          <Plus size={20} style={{ color: '#fff' }} />
        </button>
      )}
    </div>
  );
}

function EventCard({ event }: { event: EventRow }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) { setSaved(false); return; }
    isEventSaved(user.id, event.id)
      .then((v) => { if (!cancelled) setSaved(v); })
      .catch(() => { if (!cancelled) setSaved(false); });
    return () => { cancelled = true; };
  }, [user, event.id]);

  const toggleSave = async (ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (!user || pending) return;
    setPending(true);
    try {
      if (saved) { await unsaveEvent(user.id, event.id); setSaved(false); }
      else       { await saveEvent(user.id, event.id);   setSaved(true);  }
    } catch (e) {
      console.error('[EVENT_SAVE]', e);
    } finally {
      setPending(false);
    }
  };

  const dateLabel = formatEventDate(event.starts_at, event.ends_at);
  const isOnline = event.event_kind === 'online';
  const platformMeta = isOnline && event.platform ? PLATFORM_META[event.platform] : null;
  const locationLabel = isOnline
    ? (event.seller_handle
        ? `${event.seller_handle.startsWith('@') ? event.seller_handle : '@' + event.seller_handle}${platformMeta ? ' · ' + platformMeta.label : ''}`
        : (platformMeta?.label ?? 'Online live show'))
    : ([event.city, event.region].filter(Boolean).join(', ') || event.address || '');
  const live = isLiveNow(event);
  const soon = !live && isStartingSoon(event);

  return (
    <article
      style={s.card}
      onClick={() => navigate(`/event/${event.id}`)}
      role="button"
      tabIndex={0}
    >
      <div style={s.cardImg}>
        <ImageWithFade
          src={toThumbUrl(event.cover_thumb_url || event.cover_image_url)}
          fallbackSrc={event.cover_image_url}
          alt={event.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          fallback={
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-neutral-100)' }}>
              <Calendar size={32} style={{ color: 'var(--color-neutral-300)' }} />
            </div>
          }
        />
        <button
          onClick={toggleSave}
          style={s.saveBtn}
          aria-label={saved ? 'Unsave event' : 'Save event'}
          disabled={!user}
        >
          {saved
            ? <BookmarkCheck size={16} style={{ color: 'var(--color-primary-600)' }} />
            : <Bookmark      size={16} style={{ color: 'var(--color-neutral-700)' }} />}
        </button>
      </div>
      <div style={s.cardBody}>
        <div style={{ ...s.cardBadges, flexWrap: 'wrap' }}>
          {platformMeta ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 999,
              background: platformMeta.color, color: '#fff',
              fontSize: 10, fontWeight: 700,
            }}>
              <Radio size={10} /> {platformMeta.label}
            </span>
          ) : (
            <Badge variant="category">{CATEGORY_LABEL[event.category] ?? 'Event'}</Badge>
          )}
          {live && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 999,
              background: '#dc2626', color: '#fff',
              fontSize: 10, fontWeight: 700,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />
              LIVE
            </span>
          )}
          {soon && (
            <span style={{
              padding: '2px 8px', borderRadius: 999,
              background: '#fef3c7', color: '#92400e',
              fontSize: 10, fontWeight: 700,
            }}>
              Soon
            </span>
          )}
        </div>
        <h3 style={s.cardTitle}>{event.title}</h3>
        <div style={s.cardMeta}>
          <Calendar size={12} style={{ color: 'var(--color-neutral-500)' }} />
          <span>{dateLabel}</span>
        </div>
        {locationLabel && (
          <div style={s.cardMeta}>
            {isOnline
              ? <ExternalLink size={12} style={{ color: 'var(--color-neutral-500)' }} />
              : <MapPin       size={12} style={{ color: 'var(--color-neutral-500)' }} />}
            <span>{locationLabel}</span>
          </div>
        )}
      </div>
    </article>
  );
}

function formatEventDate(startsAt: string, endsAt: string | null) {
  try {
    const start = new Date(startsAt);
    const dateFmt: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
    const timeFmt: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
    const datePart = start.toLocaleDateString(undefined, dateFmt);
    const timePart = start.toLocaleTimeString(undefined, timeFmt);
    if (endsAt) {
      const end = new Date(endsAt);
      const sameDay = end.toDateString() === start.toDateString();
      if (sameDay) {
        return `${datePart} · ${timePart}–${end.toLocaleTimeString(undefined, timeFmt)}`;
      }
    }
    return `${datePart} · ${timePart}`;
  } catch {
    return startsAt;
  }
}

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column',
    height: '100%', overflowY: 'auto',
    backgroundColor: 'var(--color-neutral-50)',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderBottom: '1px solid var(--color-neutral-100)',
    position: 'sticky', top: 0, zIndex: 10,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', cursor: 'pointer',
  },
  headerTitleWrap: { flex: 1, minWidth: 0 },
  headerTitle: {
    margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 700,
    color: 'var(--color-neutral-900)',
  },
  headerSubtitle: {
    margin: 0, fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  hostBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    background: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-700)',
    fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer',
  },
  searchRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    margin: 'var(--space-3) var(--space-4) var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    background: 'var(--color-neutral-0)',
    border: '1px solid var(--color-neutral-200)',
    borderRadius: 'var(--radius-md)',
  },
  searchInput: {
    flex: 1, border: 'none', outline: 'none',
    fontSize: 'var(--font-size-sm)',
    backgroundColor: 'transparent', color: 'var(--color-neutral-900)',
  },
  filterRow: {
    display: 'flex', gap: 6, overflowX: 'auto',
    padding: '0 var(--space-4) var(--space-3)',
    scrollbarWidth: 'none',
  },
  filterChip: {
    flexShrink: 0,
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--color-neutral-200)',
    background: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-700)',
    fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  filterChipActive: {
    background: 'var(--color-primary-600, #d97706)',
    color: '#fff',
    borderColor: 'transparent',
  },
  errorBanner: {
    margin: '0 var(--space-4) var(--space-3)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-error-50, #fef2f2)',
    border: '1px solid var(--color-error-200, #fecaca)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-error-700, #b91c1c)',
    fontSize: 'var(--font-size-sm)',
  },
  feed: {
    display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
    padding: '0 var(--space-4) var(--space-6)',
  },
  card: {
    display: 'flex', flexDirection: 'column',
    background: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    border: '1px solid var(--color-neutral-100)',
    cursor: 'pointer',
  },
  cardImg: {
    position: 'relative',
    width: '100%', aspectRatio: '16 / 10',
    backgroundColor: 'var(--color-neutral-100)',
  },
  saveBtn: {
    position: 'absolute', top: 8, right: 8,
    width: 32, height: 32, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.92)', border: 'none',
    cursor: 'pointer',
  },
  cardBody: {
    display: 'flex', flexDirection: 'column', gap: 6,
    padding: 'var(--space-3) var(--space-4)',
  },
  cardBadges: { display: 'flex', gap: 6 },
  cardTitle: {
    margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 700,
    color: 'var(--color-neutral-900)',
  },
  cardMeta: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-600)',
  },
  fab: {
    position: 'fixed', bottom: 80, right: 20,
    width: 52, height: 52, borderRadius: '50%',
    background: 'var(--color-primary-600, #d97706)',
    border: 'none', cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
};
