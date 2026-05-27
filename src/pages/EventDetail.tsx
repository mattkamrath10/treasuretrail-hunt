import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Calendar, MapPin, Share2, Bookmark, BookmarkCheck,
  Navigation, Loader2, Store, Pencil, X, ExternalLink,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  fetchEvent, fetchEventFeaturedItems,
  type EventRow, type EventFeaturedItem, type EventCategory,
} from '../lib/events';
import { trackEventView, trackEventClick } from '../lib/eventAnalytics';
import { isEventSaved, saveEvent, unsaveEvent } from '../lib/eventSaves';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { toThumbUrl } from '../lib/imageCompress';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { flashToast } from '../lib/toast';

/**
 * Public event detail page (/event/:id).
 *
 * Shows everything a seeker needs to decide whether to attend an event:
 * cover, title, when/where, description, featured-items gallery, and host
 * card. Wires CTA buttons (directions / featured / contact / share) to
 * `trackEventClick` and records a single deduped view via
 * `trackEventView` on mount.
 *
 * Tracking is best-effort — analytics RPC failures must never block the
 * render or interrupt the user.
 */

const CATEGORY_LABEL: Record<EventCategory, string> = {
  estate_sale:        'Estate Sale',
  yard_sale:          'Yard Sale',
  flea_market:        'Flea Market',
  auction:            'Auction',
  pop_up:             'Pop-up',
  collectibles_show:  'Collectibles Show',
  other:              'Event',
};

interface HolderInfo {
  id: string;
  username: string | null;
  business_name: string | null;
  business_bio: string | null;
  business_logo_url: string | null;
  avatar_url: string | null;
}

export default function EventDetail({ onBack }: { onBack: () => void }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [event,  setEvent]  = useState<EventRow | null>(null);
  const [items,  setItems]  = useState<EventFeaturedItem[]>([]);
  const [holder, setHolder] = useState<HolderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [saved, setSaved]     = useState<boolean | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  // Track view once per mount + per event-id. We don't want hot reloads
  // or saved-state changes to re-fire the RPC.
  const viewedFor = useRef<string | null>(null);

  // Load event + items, then holder profile (separate so a missing
  // holder row doesn't blank the page).
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setNotFound(false);
    // Reset dependent state on id change so a failed holder lookup
    // can't leave a previous event's host card on screen.
    setEvent(null);
    setItems([]);
    setHolder(null);

    Promise.all([fetchEvent(id), fetchEventFeaturedItems(id)])
      .then(async ([e, its]) => {
        if (cancelled) return;
        if (!e) { setNotFound(true); setLoading(false); return; }
        setEvent(e);
        setItems(its);

        // Fire view-tracking once per event-id load.
        if (viewedFor.current !== e.id) {
          viewedFor.current = e.id;
          trackEventView(e.id).catch(() => { /* best-effort */ });
        }

        // Holder lookup — RLS on profiles should permit public read of
        // basic fields. If it doesn't (or row missing), we silently hide
        // the host card rather than fail the page.
        const { data: h } = await supabase
          .from('profiles')
          .select('id, username, business_name, business_bio, business_logo_url, avatar_url')
          .eq('id', e.holder_id)
          .maybeSingle();
        if (!cancelled && h) setHolder(h as HolderInfo);

        setLoading(false);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setErr(e?.message ?? 'Failed to load event');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  // Saved-state — independent of main load.
  useEffect(() => {
    if (!user || !id) { setSaved(false); return; }
    let cancelled = false;
    isEventSaved(user.id, id)
      .then((v) => { if (!cancelled) setSaved(v); })
      .catch(() => { if (!cancelled) setSaved(false); });
    return () => { cancelled = true; };
  }, [user, id]);

  const onToggleSave = async () => {
    if (!user || !event || saveBusy) return;
    setSaveBusy(true);
    try {
      if (saved) { await unsaveEvent(user.id, event.id); setSaved(false); }
      else       { await saveEvent(user.id, event.id);   setSaved(true);  }
    } catch (e) {
      console.error('[EVENT_SAVE]', e);
    } finally {
      setSaveBusy(false);
    }
  };

  const onShare = async () => {
    if (!event) return;
    trackEventClick(event.id, 'share').catch(() => {});
    const url = window.location.href;
    // Three-tier fallback so the button always does *something*:
    //   1. Native share sheet (mobile)
    //   2. Async clipboard API (modern browsers, secure context)
    //   3. Legacy execCommand('copy') via hidden textarea
    //   4. Final manual-copy prompt
    try {
      if (navigator.share) {
        await navigator.share({ title: event.title, text: event.title, url });
        return;
      }
    } catch {
      // User cancelled native share — don't fall through to clipboard.
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        flashToast('Link copied');
        return;
      }
    } catch {
      // Fall through to legacy path.
    }
    if (legacyCopy(url)) {
      flashToast('Link copied');
      return;
    }
    // Final fallback — at least surface the URL so the user can copy it.
    window.prompt('Copy this link to share:', url);
  };

  const onDirections = () => {
    if (!event) return;
    trackEventClick(event.id, 'directions').catch(() => {});
    const q = encodeURIComponent(
      [event.address, event.city, event.region].filter(Boolean).join(', ')
    );
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, '_blank', 'noopener,noreferrer');
  };

  const onContactHost = () => {
    if (!event || !holder?.username) return;
    trackEventClick(event.id, 'contact').catch(() => {});
    navigate(`/u/${holder.username}`);
  };

  const onOpenItem = (idx: number) => {
    if (!event) return;
    trackEventClick(event.id, 'featured_item').catch(() => {});
    setLightboxIdx(idx);
  };

  /* --------------- render --------------- */

  if (loading) {
    return (
      <div style={s.container}>
        <Header onBack={onBack} />
        <div style={s.loadingWrap}><Loader2 size={22} className="spin" /></div>
      </div>
    );
  }

  if (notFound || (!event && !err)) {
    return (
      <div style={s.container}>
        <Header onBack={onBack} />
        <EmptyState
          icon={Calendar}
          title="Event not found"
          body="This event may have been removed or isn't published yet."
          action={<button onClick={() => navigate('/events')} style={s.primaryBtn}>Browse events</button>}
        />
      </div>
    );
  }

  if (err || !event) {
    return (
      <div style={s.container}>
        <Header onBack={onBack} />
        <div style={s.errorBanner}>{err ?? 'Failed to load event'}</div>
      </div>
    );
  }

  const isOwner = user?.id === event.holder_id;
  const dateLabel = formatEventDate(event.starts_at, event.ends_at);
  const fullAddress = [event.address, event.city, event.region].filter(Boolean).join(', ');
  const hasLocation = fullAddress.length > 0;
  const hasContactTarget = !!holder?.username;

  return (
    <div style={s.container}>
      <Header onBack={onBack} />

      {/* Status banner for draft/cancelled — only the owner sees this; the
          public can't reach a draft via RLS, but we still guard. */}
      {isOwner && event.status !== 'published' && (
        <div style={s.statusBanner}>
          This event is <strong>{event.status}</strong>. Only you can see it until it's published.
        </div>
      )}

      {/* Cover */}
      <div style={s.cover}>
        <ImageWithFade
          src={toThumbUrl(event.cover_thumb_url || event.cover_image_url) ?? undefined}
          fallbackSrc={event.cover_image_url}
          alt={event.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          fallback={
            <div style={s.coverFallback}>
              <Calendar size={36} style={{ color: 'var(--color-neutral-300)' }} />
            </div>
          }
        />
      </div>

      {/* Title + meta block */}
      <section style={s.section}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <Badge variant="category">{CATEGORY_LABEL[event.category]}</Badge>
        </div>
        <h1 style={s.title}>{event.title}</h1>

        <div style={s.metaRow}>
          <Calendar size={14} style={{ color: 'var(--color-neutral-500)' }} />
          <span>{dateLabel}</span>
        </div>
        {hasLocation && (
          <div style={s.metaRow}>
            <MapPin size={14} style={{ color: 'var(--color-neutral-500)' }} />
            <span>{fullAddress}</span>
          </div>
        )}

        {/* Primary CTAs */}
        <div style={s.ctaRow}>
          {hasLocation && (
            <button onClick={onDirections} style={s.primaryBtnLg}>
              <Navigation size={14} /> Directions
            </button>
          )}
          <button
            onClick={onToggleSave}
            disabled={!user || saveBusy}
            style={{ ...s.ghostBtnLg, ...(saved ? s.savedBtn : {}) }}
            aria-label={saved ? 'Unsave event' : 'Save event'}
          >
            {saved
              ? <><BookmarkCheck size={14} /> Saved</>
              : <><Bookmark      size={14} /> Save</>}
          </button>
          <button onClick={onShare} style={s.ghostBtnLg} aria-label="Share event">
            <Share2 size={14} /> Share
          </button>
          {isOwner && (
            <button onClick={() => navigate(`/seller/event/${event.id}`)} style={s.ghostBtnLg}>
              <Pencil size={14} /> Edit
            </button>
          )}
        </div>
      </section>

      {/* Description */}
      {event.description?.trim() && (
        <section style={s.section}>
          <h3 style={s.sectionTitle}>About this event</h3>
          <p style={s.description}>{event.description}</p>
        </section>
      )}

      {/* Featured items */}
      {items.length > 0 && (
        <section style={s.section}>
          <h3 style={s.sectionTitle}>Featured items</h3>
          <div style={s.itemGrid}>
            {items.map((it, idx) => (
              <button
                key={it.id}
                onClick={() => onOpenItem(idx)}
                style={s.itemTile}
              >
                <div style={s.itemThumb}>
                  {it.thumb_url || it.image_url ? (
                    <ImageWithFade
                      src={toThumbUrl(it.thumb_url || it.image_url) ?? undefined}
                      fallbackSrc={it.image_url}
                      alt={it.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <Calendar size={20} style={{ color: 'var(--color-neutral-300)' }} />
                  )}
                </div>
                <div style={s.itemBody}>
                  <div style={s.itemTitle}>{it.title}</div>
                  {it.price != null && (
                    <div style={s.itemPrice}>${Number(it.price).toFixed(2)}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Host card */}
      {holder && (
        <section style={s.section}>
          <h3 style={s.sectionTitle}>Hosted by</h3>
          <div style={s.hostCard}>
            <div style={s.hostLogo}>
              {holder.business_logo_url || holder.avatar_url ? (
                <ImageWithFade
                  src={toThumbUrl(holder.business_logo_url || holder.avatar_url) ?? undefined}
                  fallbackSrc={holder.business_logo_url || holder.avatar_url}
                  alt={holder.business_name ?? 'Host'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <Store size={20} style={{ color: 'var(--color-neutral-400)' }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={s.hostName}>
                {holder.business_name || holder.username || 'Host'}
              </div>
              {holder.business_bio && (
                <p style={s.hostBio}>{holder.business_bio}</p>
              )}
            </div>
            {hasContactTarget && !isOwner && (
              <button onClick={onContactHost} style={s.primaryBtn}>
                <ExternalLink size={12} /> View
              </button>
            )}
          </div>
        </section>
      )}

      {/* Lightbox */}
      {lightboxIdx != null && items[lightboxIdx] && (
        <Lightbox item={items[lightboxIdx]} onClose={() => setLightboxIdx(null)} />
      )}
    </div>
  );
}

/* --------------- Header --------------- */

function Header({ onBack }: { onBack: () => void }) {
  return (
    <header style={s.header}>
      <button onClick={onBack} style={s.iconBtn} aria-label="Back">
        <ArrowLeft size={20} style={{ color: 'var(--color-neutral-700)' }} />
      </button>
      <h1 style={s.headerTitle}>Event</h1>
    </header>
  );
}

/* --------------- Lightbox --------------- */

function Lightbox({ item, onClose }: { item: EventFeaturedItem; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={s.lightboxBackdrop} onClick={onClose} role="dialog" aria-modal="true">
      <button onClick={onClose} style={s.lightboxClose} aria-label="Close">
        <X size={18} />
      </button>
      <div style={s.lightboxBody} onClick={(e) => e.stopPropagation()}>
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.title}
            style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 8 }}
          />
        ) : (
          <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-neutral-100)', borderRadius: 8 }}>
            <Calendar size={40} style={{ color: 'var(--color-neutral-300)' }} />
          </div>
        )}
        <div style={{ marginTop: 12, textAlign: 'center', color: '#fff' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{item.title}</div>
          {item.price != null && (
            <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4 }}>
              ${Number(item.price).toFixed(2)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------- Helpers --------------- */

function formatEventDate(startsAt: string, endsAt: string | null) {
  try {
    const start = new Date(startsAt);
    const dateFmt: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };
    const timeFmt: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
    const datePart = start.toLocaleDateString(undefined, dateFmt);
    const timePart = start.toLocaleTimeString(undefined, timeFmt);
    if (endsAt) {
      const end = new Date(endsAt);
      const sameDay = end.toDateString() === start.toDateString();
      if (sameDay) {
        return `${datePart} · ${timePart} – ${end.toLocaleTimeString(undefined, timeFmt)}`;
      }
      return `${datePart} ${timePart} – ${end.toLocaleDateString(undefined, dateFmt)} ${end.toLocaleTimeString(undefined, timeFmt)}`;
    }
    return `${datePart} · ${timePart}`;
  } catch {
    return startsAt;
  }
}

/** Legacy clipboard path for browsers without the async Clipboard API. */
function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/* --------------- Styles --------------- */

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column',
    height: '100%', overflowY: 'auto',
    backgroundColor: 'var(--color-neutral-50)',
    paddingBottom: 'var(--space-6)',
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
  headerTitle: {
    margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 700,
    color: 'var(--color-neutral-900)',
  },
  loadingWrap: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 'var(--space-6)',
  },
  errorBanner: {
    margin: 'var(--space-3) var(--space-4) 0',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-error-50, #fef2f2)',
    border: '1px solid var(--color-error-200, #fecaca)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-error-700, #b91c1c)',
    fontSize: 'var(--font-size-sm)',
  },
  statusBanner: {
    margin: 'var(--space-3) var(--space-4) 0',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-warning-50, #fffbeb)',
    border: '1px solid var(--color-warning-200, #fde68a)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-warning-700, #b45309)',
    fontSize: 'var(--font-size-sm)',
  },

  cover: {
    position: 'relative',
    width: '100%', aspectRatio: '16 / 9',
    backgroundColor: 'var(--color-neutral-100)',
  },
  coverFallback: {
    width: '100%', height: '100%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'var(--color-neutral-100)',
  },

  section: {
    margin: 'var(--space-3) var(--space-4) 0',
    padding: 'var(--space-4)',
    background: 'var(--color-neutral-0)',
    border: '1px solid var(--color-neutral-100)',
    borderRadius: 'var(--radius-md)',
  },
  sectionTitle: {
    margin: '0 0 var(--space-2)',
    fontSize: 'var(--font-size-base)', fontWeight: 700,
    color: 'var(--color-neutral-900)',
  },

  title: {
    margin: '0 0 var(--space-2)',
    fontSize: 'var(--font-size-xl)', fontWeight: 800,
    color: 'var(--color-neutral-900)',
    lineHeight: 1.25,
  },
  metaRow: {
    display: 'flex', alignItems: 'center', gap: 6,
    marginTop: 4,
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-700)',
  },
  description: {
    margin: 0,
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-700)',
    whiteSpace: 'pre-wrap',
    lineHeight: 1.55,
  },

  ctaRow: {
    display: 'flex', flexWrap: 'wrap', gap: 8,
    marginTop: 'var(--space-3)',
  },
  primaryBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '6px 10px', borderRadius: 6,
    border: 'none', cursor: 'pointer',
    background: 'var(--color-primary-600, #d97706)',
    color: '#fff',
    fontSize: 12, fontWeight: 700,
  },
  primaryBtnLg: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: 'none', cursor: 'pointer',
    background: 'var(--color-primary-600, #d97706)',
    color: '#fff',
    fontSize: 'var(--font-size-sm)', fontWeight: 700,
  },
  ghostBtnLg: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    background: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-700)',
    fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer',
  },
  savedBtn: {
    borderColor: 'var(--color-primary-600, #d97706)',
    color: 'var(--color-primary-600, #d97706)',
    background: 'var(--color-primary-50, #fffbeb)',
  },

  itemGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: 'var(--space-2)',
  },
  itemTile: {
    display: 'flex', flexDirection: 'column',
    border: '1px solid var(--color-neutral-100)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    backgroundColor: 'var(--color-neutral-0)',
    cursor: 'pointer',
    padding: 0,
    textAlign: 'left',
  },
  itemThumb: {
    width: '100%', aspectRatio: '1 / 1',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'var(--color-neutral-100)',
  },
  itemBody: { padding: '6px 8px' },
  itemTitle: {
    fontSize: 12, fontWeight: 600,
    color: 'var(--color-neutral-900)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  itemPrice: {
    fontSize: 11, color: 'var(--color-neutral-600)', marginTop: 2,
  },

  hostCard: {
    display: 'flex', alignItems: 'center', gap: 12,
  },
  hostLogo: {
    width: 44, height: 44, borderRadius: '50%',
    overflow: 'hidden', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'var(--color-neutral-100)',
  },
  hostName: {
    fontSize: 'var(--font-size-sm)', fontWeight: 700,
    color: 'var(--color-neutral-900)',
  },
  hostBio: {
    margin: '4px 0 0',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-600)',
    lineHeight: 1.4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },

  lightboxBackdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.85)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 24,
  },
  lightboxClose: {
    position: 'fixed', top: 16, right: 16,
    width: 36, height: 36, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.15)', border: 'none',
    color: '#fff', cursor: 'pointer',
  },
  lightboxBody: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    maxWidth: 720,
  },
};
