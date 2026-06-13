import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Calendar, MapPin, Search, Sparkles, Package, Flag, EllipsisVertical, Eye, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { CommunityPost, MarketplaceListing } from '../lib/supabase';
import { fetchMyEvents, deleteEvent, type EventRow } from '../lib/events';
import { flashToast } from '../lib/toast';
import ConfirmDialog from './ui/ConfirmDialog';
import { fetchMyWantedItems, WANTED_CATEGORY_LABEL, type WantedItemRow } from '../lib/wanted';
import { ImageWithFade } from './ui/ImageWithFade';
import { MediaFallback } from './ui/MediaFallback';
import { toThumbUrl } from '../lib/imageCompress';
import ReportButton from './moderation/ReportButton';
import type { ReportContentType } from '../lib/reports';
import { useAuth } from '../context/AuthContext';

const LOG = '[USER_SHOWCASE]';

/**
 * Discover-style horizontal carousels scoped to a single user, shown on
 * the owner Profile + PublicProfile pages. Renders three of Discover's
 * four rails: Finds, Events, and Wanted Items.
 *
 * "Finds" deliberately merges BOTH community_posts AND marketplace_listings
 * because the profile header's "Finds" stat sums both. The old grid only
 * read community_posts, so a user with one post and many listings appeared
 * to have a single find. Merging the two fixes that mismatch.
 */

type FindItem = {
  key: string;
  id: string;
  kind: 'find' | 'listing';
  title: string;
  image_url: string | null;
  created_at: string;
  estimated_value?: number | null;
  price?: number | null;
};

export default function UserShowcase({ userId, isSelf }: { userId: string; isSelf?: boolean }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Reporting is only meaningful for content you don't own and only when
  // signed in (the report sheet requires an authenticated reporter).
  const canReport = !isSelf && !!user;
  const [finds, setFinds] = useState<FindItem[] | null>(null);
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [wanted, setWanted] = useState<WantedItemRow[] | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setFinds(null);
    setEvents(null);
    setWanted(null);

    Promise.allSettled([
      supabase
        .from('community_posts')
        .select('id, caption, image_url, estimated_value, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('marketplace_listings')
        .select('id, title, image_url, price, created_at')
        .eq('seller_id', userId)
        .order('created_at', { ascending: false })
        .limit(40),
      fetchMyEvents(userId),
      fetchMyWantedItems(userId),
    ]).then(([posts, listings, evs, wants]) => {
      if (cancelled) return;

      const merged: FindItem[] = [];
      if (posts.status === 'rejected') {
        console.warn(LOG, 'community_posts fetch failed', posts.reason);
      } else if (posts.value.error) {
        console.warn(LOG, 'community_posts query error', posts.value.error);
      } else {
        for (const r of (posts.value.data ?? []) as Partial<CommunityPost>[]) {
          merged.push({
            key: `find-${r.id}`,
            id: String(r.id),
            kind: 'find',
            title: (r.caption ?? '').trim() || 'Untitled find',
            image_url: r.image_url ?? null,
            created_at: r.created_at ?? '',
            estimated_value: r.estimated_value ?? null,
          });
        }
      }
      if (listings.status === 'rejected') {
        console.warn(LOG, 'marketplace_listings fetch failed', listings.reason);
      } else if (listings.value.error) {
        console.warn(LOG, 'marketplace_listings query error', listings.value.error);
      } else {
        for (const r of (listings.value.data ?? []) as Partial<MarketplaceListing>[]) {
          merged.push({
            key: `listing-${r.id}`,
            id: String(r.id),
            kind: 'listing',
            title: (r.title ?? '').trim() || 'Untitled listing',
            image_url: r.image_url ?? null,
            created_at: r.created_at ?? '',
            price: r.price ?? null,
          });
        }
      }
      merged.sort((a, b) => (b.created_at > a.created_at ? 1 : b.created_at < a.created_at ? -1 : 0));
      setFinds(merged);

      if (evs.status === 'fulfilled') {
        setEvents(evs.value.filter((e) => e.status === 'published' && !e.is_hidden));
      } else {
        console.warn(LOG, 'events fetch failed', evs.reason);
        setEvents([]);
      }

      if (wants.status === 'fulfilled') {
        setWanted(wants.value.filter((w) => w.status === 'open' && !w.is_hidden));
      } else {
        console.warn(LOG, 'wanted fetch failed', wants.reason);
        setWanted([]);
      }
    });

    return () => { cancelled = true; };
  }, [userId]);

  const loading = finds === null || events === null || wanted === null;
  const isEmpty = !loading && !finds!.length && !events!.length && !wanted!.length;

  if (loading) {
    return (
      <div style={s.loading}>
        <div style={s.spinner} />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div style={s.empty}>
        <Package size={28} style={{ color: 'var(--color-neutral-300)', marginBottom: 8 }} />
        <p style={s.emptyTitle}>{isSelf ? "You haven't posted anything yet" : 'Nothing posted yet'}</p>
        <p style={s.emptySub}>Finds, events, and wanted items will appear here.</p>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      {finds!.length > 0 && (
        <Rail title="Finds" subtitle="Treasures & listings" accent="#8b5cf6">
          {finds!.map((f) => (
            <FindCard
              key={f.key}
              item={f}
              onClick={() => navigate(f.kind === 'find' ? `/find/${f.id}` : `/listing/${f.id}`)}
              canReport={canReport}
              ownerId={userId}
            />
          ))}
        </Rail>
      )}

      {events!.length > 0 && (
        <Rail title="Events" subtitle="Hosted shows & sales" accent="#f59e0b">
          {events!.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              onClick={() => navigate(`/event/${e.id}`)}
              canReport={canReport}
              ownerId={userId}
              isSelf={!!isSelf}
              onDeleted={(deletedId) => setEvents((prev) => (prev ?? []).filter((ev) => ev.id !== deletedId))}
            />
          ))}
        </Rail>
      )}

      {wanted!.length > 0 && (
        <Rail title="Wanted Items" subtitle="Treasures they're searching for" accent="#10b981">
          {wanted!.map((w) => (
            <WantedCard key={w.id} item={w} onClick={() => navigate(`/wanted/${w.id}`)} />
          ))}
        </Rail>
      )}
    </div>
  );
}

/* ---------- Rail (horizontal scroll row) ---------- */

function Rail({ title, subtitle, accent, children }: {
  title: string;
  subtitle?: string;
  accent: string;
  children: React.ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  // Desktop ergonomics: vertical wheel over the row scrolls it horizontally.
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
    <section style={s.rail}>
      <div style={s.railHead}>
        <h3 style={s.railTitle}>
          <span style={{ ...s.railDot, background: accent }} />
          {title}
          <ChevronRight size={14} style={{ color: 'var(--color-neutral-300)' }} />
        </h3>
        {subtitle && <p style={s.railSub}>{subtitle}</p>}
      </div>
      <div ref={rowRef} style={s.row} className="tt-hscroll">
        {children}
      </div>
    </section>
  );
}

/* ---------- Cards (Discover dark-card visual language) ---------- */

function FindCard({ item, onClick, canReport, ownerId }: { item: FindItem; onClick: () => void; canReport?: boolean; ownerId: string }) {
  return (
    <article style={s.cardMd} onClick={onClick} role="button" tabIndex={0} aria-label={`Open ${item.title}`}>
      <div style={s.cardImgMd}>
        <ImageWithFade
          src={toThumbUrl(item.image_url)}
          fallbackSrc={item.image_url}
          alt={item.title}
          style={s.img}
          fallback={<MediaFallback kind="find" seed={item.id} label={item.title} />}
        />
        <div style={s.cardOverlay} />
        {canReport && (
          <CardReportButton
            contentType={item.kind === 'listing' ? 'listing' : 'find'}
            contentId={item.id}
            ownerId={ownerId}
          />
        )}
        <div style={s.cardBadgeRow}>
          {item.kind === 'listing' ? (
            item.price != null && (
              <span style={{ ...s.badge, background: 'rgba(245, 158, 11, 0.95)' }}>
                ${Math.round(item.price)}
              </span>
            )
          ) : (
            item.estimated_value != null && (
              <span style={{ ...s.badge, background: 'rgba(139, 92, 246, 0.95)' }}>
                <Sparkles size={10} /> ${Math.round(item.estimated_value)}
              </span>
            )
          )}
        </div>
      </div>
      <div style={s.cardBody}>
        <h4 style={s.cardTitleSm}>{item.title}</h4>
      </div>
    </article>
  );
}

function EventCard({ event, onClick, canReport, ownerId, isSelf, onDeleted }: {
  event: EventRow;
  onClick: () => void;
  canReport?: boolean;
  ownerId: string;
  isSelf?: boolean;
  onDeleted?: (id: string) => void;
}) {
  const navigate = useNavigate();
  const where = [event.city, event.region].filter(Boolean).join(', ') || event.address || 'Event';
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const doDelete = async () => {
    setDeleting(true);
    try {
      await deleteEvent(event.id);
      setConfirmDelete(false);
      onDeleted?.(event.id);
      flashToast('Event deleted', 'success');
    } catch (e: any) {
      flashToast(`Couldn't delete event: ${e?.message ?? 'unknown error'}`, 'error', 4000);
      setDeleting(false);
    }
  };

  return (
    <article style={s.cardLg} onClick={onClick} role="button" tabIndex={0} aria-label={`Open ${event.title}`}>
      <div style={s.cardImgLg}>
        <ImageWithFade
          src={event.cover_thumb_url ?? toThumbUrl(event.cover_image_url)}
          fallbackSrc={event.cover_image_url}
          alt={event.title}
          style={s.img}
          fallback={<MediaFallback kind="event" seed={event.id} label={event.title} />}
        />
        <div style={s.cardOverlay} />
        {canReport && (
          <CardReportButton contentType="event" contentId={event.id} ownerId={ownerId} />
        )}
        {isSelf && (
          <div
            style={s.menuWrap}
            role="presentation"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              style={s.menuBtn}
              aria-label="Event options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <EllipsisVertical size={15} />
            </button>
            {menuOpen && (
              <>
                <div style={s.menuBackdrop} onClick={() => setMenuOpen(false)} role="presentation" />
                <div style={s.menu} role="menu">
                  <button type="button" style={s.menuItem} role="menuitem"
                    onClick={() => { setMenuOpen(false); navigate(`/event/${event.id}`); }}>
                    <Eye size={14} /> View
                  </button>
                  <button type="button" style={s.menuItem} role="menuitem"
                    onClick={() => { setMenuOpen(false); navigate(`/seller/event/${event.id}`); }}>
                    <Pencil size={14} /> Edit
                  </button>
                  <button type="button" style={{ ...s.menuItem, ...s.menuItemDanger }} role="menuitem"
                    onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}>
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        <div style={s.cardBadgeRow}>
          <span style={{ ...s.badge, background: 'rgba(245, 158, 11, 0.95)' }}>
            <Calendar size={10} /> {formatShort(event.starts_at)}
          </span>
        </div>
      </div>
      <div style={s.cardBody}>
        <h4 style={s.cardTitle}>{event.title}</h4>
        <p style={s.cardMeta}>
          <MapPin size={11} style={{ marginRight: 3, verticalAlign: '-2px' }} />{where}
        </p>
      </div>

      {confirmDelete && (
        <div role="presentation" onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog
            title="Delete Event?"
            message="This action cannot be undone and will permanently remove this event and all associated featured items."
            confirmLabel="Delete Event"
            busy={deleting}
            onConfirm={doDelete}
            onCancel={() => setConfirmDelete(false)}
          />
        </div>
      )}
    </article>
  );
}

function WantedCard({ item, onClick }: { item: WantedItemRow; onClick: () => void }) {
  const where = [item.city, item.region].filter(Boolean).join(', ');
  return (
    <article style={s.cardMd} onClick={onClick} role="button" tabIndex={0} aria-label={`Open wanted: ${item.title}`}>
      <div style={s.cardImgMd}>
        <ImageWithFade
          src={item.thumb_url ?? toThumbUrl(item.image_url)}
          fallbackSrc={item.image_url}
          alt={item.title}
          style={s.img}
          fallback={<MediaFallback kind="wanted" seed={item.id} label={item.title} />}
        />
        <div style={s.cardOverlay} />
        <div style={s.cardBadgeRow}>
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
        <h4 style={s.cardTitleSm}>{item.title}</h4>
        {where && (
          <p style={s.cardMeta}>
            <MapPin size={11} style={{ marginRight: 3, verticalAlign: '-2px' }} />{where}
          </p>
        )}
      </div>
    </article>
  );
}

/**
 * Small flag affordance overlaid on a card image so users can report
 * inappropriate content straight from the profile without opening the
 * detail page. The wrapper stops click propagation so neither the trigger
 * nor the report sheet's clicks bubble up and trigger card navigation.
 */
function CardReportButton({ contentType, contentId, ownerId }: {
  contentType: ReportContentType;
  contentId: string;
  ownerId: string;
}) {
  return (
    <div
      style={s.reportWrap}
      role="presentation"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <ReportButton contentType={contentType} contentId={contentId} reportedUserId={ownerId}>
        <button type="button" style={s.reportBtn} aria-label="Report this content">
          <Flag size={12} />
        </button>
      </ReportButton>
    </div>
  );
}

function formatShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

/* ---------- styles ---------- */

const s: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' },
  rail: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  railHead: { display: 'flex', flexDirection: 'column', gap: 2 },
  railTitle: {
    margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 800,
    color: 'var(--color-neutral-900)',
    display: 'inline-flex', alignItems: 'center', gap: 8,
  },
  railDot: { width: 8, height: 8, borderRadius: 4, display: 'inline-block' },
  railSub: { margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },
  row: {
    display: 'flex',
    flexWrap: 'nowrap',
    gap: 12,
    overflowX: 'auto',
    overflowY: 'hidden',
    paddingBottom: 4,
    scrollSnapType: 'x mandatory',
    WebkitOverflowScrolling: 'touch',
    overscrollBehaviorX: 'contain',
    touchAction: 'pan-x pan-y',
  },
  cardLg: {
    flex: '0 0 auto',
    width: 220,
    scrollSnapAlign: 'start',
    cursor: 'pointer',
    background: '#15151a',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardImgLg: { position: 'relative', width: '100%', aspectRatio: '4 / 3', overflow: 'hidden', background: '#15151a' },
  cardMd: {
    flex: '0 0 auto',
    width: 150,
    scrollSnapAlign: 'start',
    cursor: 'pointer',
    background: '#15151a',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardImgMd: { position: 'relative', width: '100%', aspectRatio: '1 / 1', overflow: 'hidden', background: '#15151a' },
  img: { width: '100%', height: '100%', objectFit: 'cover' },
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
  menuWrap: { position: 'absolute', top: 8, left: 8, zIndex: 4 },
  menuBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, padding: 0,
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.55)',
    border: '1px solid rgba(255,255,255,0.18)',
    color: '#fff', cursor: 'pointer',
    backdropFilter: 'blur(2px)',
  },
  menuBackdrop: {
    position: 'fixed', inset: 0, zIndex: 4,
  },
  menu: {
    position: 'absolute', top: 34, left: 0, zIndex: 5,
    minWidth: 132,
    background: 'var(--color-neutral-0, #fff)',
    borderRadius: 'var(--radius-md, 8px)',
    border: '1px solid var(--color-neutral-200, #e5e7eb)',
    boxShadow: 'var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.18))',
    overflow: 'hidden',
    padding: 4,
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  menuItem: {
    display: 'flex', alignItems: 'center', gap: 8,
    width: '100%', padding: '8px 10px',
    background: 'transparent', border: 'none', cursor: 'pointer',
    borderRadius: 'var(--radius-sm, 6px)',
    fontSize: 13, fontWeight: 600, textAlign: 'left',
    color: 'var(--color-neutral-800, #1f2937)',
  },
  menuItemDanger: { color: 'var(--color-error-600, #dc2626)' },
  reportWrap: { position: 'absolute', top: 8, right: 8, zIndex: 3 },
  reportBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, padding: 0,
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.55)',
    border: '1px solid rgba(255,255,255,0.18)',
    color: '#fff', cursor: 'pointer',
    backdropFilter: 'blur(2px)',
  },
  cardBody: { padding: '10px 12px 12px' },
  cardTitle: {
    margin: 0, fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.3,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  },
  cardTitleSm: {
    margin: 0, fontSize: 12, fontWeight: 700, color: '#fff', lineHeight: 1.3,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  },
  cardMeta: { margin: '6px 0 0', fontSize: 11, color: 'rgba(245,245,247,0.6)', lineHeight: 1.3 },
  loading: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 'var(--space-8) var(--space-4)',
  },
  spinner: {
    width: 24, height: 24, borderRadius: '50%',
    border: '3px solid var(--color-neutral-200)',
    borderTopColor: 'var(--color-primary-500)',
    animation: 'spin 0.8s linear infinite',
  },
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: 'var(--space-8) var(--space-4)', textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-neutral-700)', margin: 0,
  },
  emptySub: {
    fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)', margin: 0,
  },
};
