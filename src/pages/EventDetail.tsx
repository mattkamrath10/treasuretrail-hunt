import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Calendar, MapPin, Share2, Bookmark, BookmarkCheck,
  Navigation, Loader2, Store, Pencil, X, ExternalLink, Radio, Flag, Repeat,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  fetchEvent, fetchEventFeaturedItems,
  PLATFORM_META, SHOW_CATEGORY_LABELS, isLiveNow, isStartingSoon,
  isExpiredLive, resolveExternalEventUrl,
  type EventRow, type EventFeaturedItem, type EventCategory,
} from '../lib/events';
import { applyNextOccurrence, describeRecurrence } from '../lib/recurrence';
import { WhatnotIcon } from '../components/ui/WhatnotIcon';
import { MediaFallback, AvatarFallback } from '../components/ui/MediaFallback';
import { PageScroll } from '../components/ui/PageScroll';
import { trackEventView, trackEventClick } from '../lib/eventAnalytics';
import { isProUser } from '../lib/entitlements';
import { trackAnalyticsEvent } from '../lib/analytics';
import { isEventSaved, saveEvent, unsaveEvent } from '../lib/eventSaves';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { toThumbUrl } from '../lib/imageCompress';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { flashToast } from '../lib/toast';
import { shareWithImage } from '../lib/shareWithImage';
import { publicWebUrl } from '../lib/apiBase';
import { Zap } from 'lucide-react';
import { isBoosted, boostExpiresInLabel } from '../lib/boost';
import { startBoostPurchase, startProBoost } from '../lib/payments';
import { monetizationHidden } from '../lib/platform';
import ReportButton from '../components/moderation/ReportButton';
import BlockUserButton from '../components/moderation/BlockUserButton';

const LOG = '[EVENT_DETAIL]';

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

    console.log(LOG, 'load', { id });
    Promise.all([fetchEvent(id), fetchEventFeaturedItems(id)])
      .then(async ([e, its]) => {
        if (cancelled) return;
        console.log(LOG, 'load:result', {
          event: e ? { id: e.id, status: e.status, holder_id: e.holder_id } : null,
          itemCount: its.length,
          items: its.map((i) => ({ id: i.id, title: i.title, hasImage: !!i.image_url })),
        });
        if (!e) { setNotFound(true); setLoading(false); return; }
        setEvent(e);
        setItems(its);

        // Fire view-tracking once per event-id load. Two parallel
        // streams: the legacy `event_analytics` table (per-event count
        // RPC) and the Phase-1 thin firehose `analytics_events`. Both
        // are best-effort — analytics failures must never block render.
        if (viewedFor.current !== e.id) {
          viewedFor.current = e.id;
          trackEventView(e.id).catch(() => { /* best-effort */ });
          trackAnalyticsEvent({ kind: 'view', targetKind: 'event', targetId: e.id })
            .catch(() => { /* best-effort */ });
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
        console.error(LOG, 'load:error', e);
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
    // Canonical URL — always use origin + /event/:id so a share from a
    // deep-linked tab still produces a sharable URL (window.location.href
    // can include hash/query state that breaks the link unfurl).
    const url = publicWebUrl(`/event/${event.id}`);
    // Share URL-only (no image File). The server now injects per-event OG
    // tags at /event/:id, so iMessage/WhatsApp unfurl a SINGLE rich preview
    // card from the link. Passing an image File here produced TWO previews
    // (the attached photo + the unfurled URL card) in iMessage.
    const result = await shareWithImage({
      url,
      title: event.title,
      text: event.title,
      imageUrl: null,
    });
    if (result.kind === 'copied') flashToast('Link copied');
    else if (result.kind === 'unsupported') window.prompt('Copy this link to share:', url);
    else if (result.kind === 'error') {
      // Fall back through legacy copy → manual prompt.
      if (legacyCopy(url)) flashToast('Link copied');
      else window.prompt('Copy this link to share:', url);
    }
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
      <PageScroll style={s.container}>
        <Header onBack={onBack} />
        <div style={s.loadingWrap}><Loader2 size={22} className="spin" /></div>
      </PageScroll>
    );
  }

  if (notFound || (!event && !err)) {
    return (
      <PageScroll style={s.container}>
        <Header onBack={onBack} />
        <EmptyState
          icon={Calendar}
          title="Event not found"
          body="This event may have been removed or isn't published yet."
          action={<button onClick={() => navigate('/events')} style={s.primaryBtn}>Browse events</button>}
        />
      </PageScroll>
    );
  }

  if (err || !event) {
    return (
      <PageScroll style={s.container}>
        <Header onBack={onBack} />
        <div style={s.errorBanner}>{err ?? 'Failed to load event'}</div>
      </PageScroll>
    );
  }

  const isOwner = user?.id === event.holder_id;
  // EventDetail fetches the raw anchor row; for recurring events show the next
  // upcoming occurrence's date and a human description of the repeat rule.
  const nextEvent = applyNextOccurrence(event);
  const recurrenceLabel = describeRecurrence(event);
  const dateLabel = formatEventDate(nextEvent.starts_at, nextEvent.ends_at);
  const isOnline = event.event_kind === 'online';
  const fullAddress = isOnline ? '' : [event.address, event.city, event.region].filter(Boolean).join(', ');
  const hasLocation = fullAddress.length > 0;
  const hasContactTarget = !!holder?.username;
  const platformMeta = isOnline && event.platform ? PLATFORM_META[event.platform] : null;
  const isWhatnot = event.platform === 'whatnot';
  // Time-based status must reflect the NEXT occurrence for recurring events,
  // not the original anchor (which may be long past).
  const live = isLiveNow(nextEvent);
  const expired = isExpiredLive(nextEvent);
  const soon = !live && isStartingSoon(nextEvent);

  // Optional external event page. Show the button whenever a non-empty
  // value exists. A value missing its protocol (e.g. "facebook.com/...")
  // gets "https://" prepended so the link still works.
  const rawEventUrl = event.event_url?.trim() ?? '';
  const eventUrlHref = rawEventUrl
    ? /^https?:\/\//i.test(rawEventUrl) ? rawEventUrl : `https://${rawEventUrl}`
    : null;

  // Join Live Show — opens external URL in a new tab. If the show
  // window has closed we send users to the seller's storefront instead
  // of the dead livestream URL so they never land on Whatnot's "show
  // ended" page. rel attrs prevent window.opener + referrer leakage.
  const onJoinLiveShow = () => {
    const url = resolveExternalEventUrl(event);
    if (!url) return;
    trackEventClick(event.id, 'livestream').catch(() => {});
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Hero image slideshow: the cover photo first, then each featured-item image.
  // Gives sparse events a richer top-of-page gallery without a separate upload.
  const gallery: GalleryImage[] = [];
  if (event.cover_image_url || event.cover_thumb_url) {
    gallery.push({
      thumb: event.cover_thumb_url || toThumbUrl(event.cover_image_url) || undefined,
      full: event.cover_image_url,
      alt: event.title,
    });
  }
  for (const it of items) {
    if (it.image_url || it.thumb_url) {
      gallery.push({
        thumb: toThumbUrl(it.thumb_url || it.image_url) ?? undefined,
        full: it.image_url,
        alt: it.title,
      });
    }
  }

  return (
    <PageScroll style={s.container}>
      <Header onBack={onBack} />

      {/* Status banner for draft/cancelled — only the owner sees this; the
          public can't reach a draft via RLS, but we still guard. */}
      {isOwner && event.status !== 'published' && (
        <div style={s.statusBanner}>
          This event is <strong>{event.status}</strong>. Only you can see it until it's published.
        </div>
      )}

      {/* Hero image slideshow — cover photo + each featured item. Branded
          fallback (Whatnot tile / warm gradient) so this slot is never an
          empty gray box on image-less events. */}
      <EventGallery
        images={gallery}
        fallback={
          isWhatnot ? (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#0a0a0a',
            }}>
              <WhatnotIcon size={96} style={{ borderRadius: 22 }} />
            </div>
          ) : (
            <MediaFallback
              kind={isOnline ? 'live' : 'event'}
              seed={event.id}
              label={event.title}
            />
          )
        }
      />

      {/* Title + badges + meta block */}
      <section style={s.section}>
        <h1 style={s.title}>{event.title}</h1>
        <div style={{ display: 'flex', gap: 6, margin: '8px 0', flexWrap: 'wrap' }}>
          {platformMeta ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 8px', borderRadius: 999,
              background: platformMeta.color, color: isWhatnot ? '#000' : '#fff',
              fontSize: 11, fontWeight: 700,
            }}>
              {isWhatnot ? <WhatnotIcon size={12} /> : <Radio size={11} />} {platformMeta.label}
            </span>
          ) : (
            <Badge variant="category">{CATEGORY_LABEL[event.category]}</Badge>
          )}
          {live && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 8px', borderRadius: 999,
              background: '#dc2626', color: '#fff',
              fontSize: 11, fontWeight: 700,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
              LIVE NOW
            </span>
          )}
          {expired && (
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '4px 8px', borderRadius: 999,
              background: 'rgba(0,0,0,0.7)', color: '#fff',
              fontSize: 11, fontWeight: 700,
            }}>
              Recently Live
            </span>
          )}
          {soon && (
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '4px 8px', borderRadius: 999,
              background: '#fef3c7', color: '#92400e',
              fontSize: 11, fontWeight: 700,
            }}>
              Starting soon
            </span>
          )}
          {isOnline && event.show_category && (
            <Badge variant="category">{SHOW_CATEGORY_LABELS[event.show_category]}</Badge>
          )}
        </div>

        <div style={s.metaRow}>
          <Calendar size={14} style={{ color: 'var(--color-neutral-500)' }} />
          <span>{recurrenceLabel ? `Next: ${dateLabel}` : dateLabel}</span>
        </div>
        {recurrenceLabel && (
          <div style={s.metaRow}>
            <Repeat size={14} style={{ color: 'var(--color-primary-700, #1d4ed8)' }} />
            <span style={{ fontWeight: 700, color: 'var(--color-primary-700, #1d4ed8)' }}>{recurrenceLabel}</span>
          </div>
        )}
        {hasLocation && (
          <div style={s.metaRow}>
            <MapPin size={14} style={{ color: 'var(--color-neutral-500)' }} />
            <span>{fullAddress}</span>
          </div>
        )}
        {isOnline && event.seller_handle && (
          <div style={s.metaRow}>
            <Store size={14} style={{ color: 'var(--color-neutral-500)' }} />
            <span>{event.seller_handle.startsWith('@') ? event.seller_handle : `@${event.seller_handle}`} on {platformMeta?.label}</span>
          </div>
        )}

        {/* Primary CTAs */}
        <div style={s.ctaRow}>
          {/* "Open on <platform>" uses livestream_url and, once the show
              window passes, falls back to the platform's generic storefront
              (e.g. whatnot.com home) — the wrong place. When the event also
              has an event_url we already render the reliable "Visit Event
              Page" button below, so suppress this redundant CTA and only
              keep it for pure livestream events that have no event page. */}
          {isOnline && event.livestream_url && !eventUrlHref && (
            <button
              onClick={onJoinLiveShow}
              style={{ ...s.primaryBtnLg, background: platformMeta?.color, color: isWhatnot ? '#000' : '#fff' }}
            >
              {isWhatnot ? <WhatnotIcon size={14} /> : <ExternalLink size={14} />}{' '}
              {live
                ? 'Join Live Show'
                : expired
                  ? `Visit ${platformMeta?.label ?? 'storefront'}`
                  : `Open on ${platformMeta?.label ?? 'platform'}`}
            </button>
          )}
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
          {!isOwner && (
            <ReportButton contentType="event" contentId={event.id} reportedUserId={event.holder_id}>
              <button style={s.ghostBtnLg} type="button" aria-label="Report event">
                <Flag size={14} /> Report
              </button>
            </ReportButton>
          )}
          {!isOwner && event.holder_id && (
            <BlockUserButton targetUserId={event.holder_id} targetName="host" variant="pill" />
          )}
        </div>

        {/* Event URL CTA — sits directly below the Directions / Save / Share
            row. Rendered whenever event_url has a value. Opens the external
            page (Facebook, Whatnot, HiBid, estate-sale sites…) in a new tab. */}
        {eventUrlHref && (
          <a
            href={eventUrlHref}
            target="_blank"
            rel="noopener noreferrer"
            style={s.eventUrlBtn}
          >
            <ExternalLink size={14} /> Visit Event Page
          </a>
        )}

        {/* Owner-only Boost CTA. We render either the live status (if a
            boost is already active) or a single primary CTA that runs the
            mocked $1.99/72h purchase flow. After a successful boost we
            re-fetch the event so the badge + status update in place. */}
        {isOwner && <OwnerBoostRow event={event} onApplied={async () => {
          const fresh = await fetchEvent(event.id);
          if (fresh) setEvent(fresh);
        }} />}
      </section>

      {/* Description */}
      {event.description?.trim() && (
        <section style={s.section}>
          <h3 style={s.sectionTitle}>About this event</h3>
          <p style={s.description}>{event.description}</p>
        </section>
      )}

      {/* Featured items — always render the section so an empty state is
          visible. Hiding the header entirely makes "where did my items
          go?" impossible to diagnose. */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>Featured items</h3>
        {items.length === 0 ? (
          <p style={s.emptyHint}>
            {isOwner
              ? 'No featured items yet. Add some from the edit page so buyers can preview what\'s for sale.'
              : 'The host hasn\'t added featured items yet.'}
          </p>
        ) : (
          <div style={s.itemGrid}>
            {items.map((it, idx) => (
              <button
                key={it.id}
                onClick={() => onOpenItem(idx)}
                style={s.itemTile}
              >
                <div style={s.itemThumb}>
                  <ImageWithFade
                    src={toThumbUrl(it.thumb_url || it.image_url) ?? undefined}
                    fallbackSrc={it.image_url}
                    alt={it.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    fallback={
                      <MediaFallback kind="find" seed={it.id} label={it.title?.slice(0, 14) || 'ITEM'} compact />
                    }
                  />
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
        )}
      </section>

      {/* Host card */}
      {holder && (
        <section style={s.section}>
          <h3 style={s.sectionTitle}>Hosted by</h3>
          <div style={s.hostCard}>
            <div style={s.hostLogo}>
              <ImageWithFade
                src={toThumbUrl(holder.business_logo_url || holder.avatar_url) ?? undefined}
                fallbackSrc={holder.business_logo_url || holder.avatar_url}
                alt={holder.business_name ?? 'Host'}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                fallback={
                  <AvatarFallback
                    name={holder.business_name || holder.username || 'Host'}
                    seed={holder.id || holder.username || 'host'}
                    style={{ borderRadius: 0 }}
                  />
                }
              />
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
    </PageScroll>
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

/* --------------- Hero gallery --------------- */

interface GalleryImage {
  thumb: string | undefined;
  full: string | null;
  alt: string;
}

function EventGallery({ images, fallback }: { images: GalleryImage[]; fallback: React.ReactNode }) {
  const [active, setActive] = useState(0);

  // No images at all → single branded fallback tile (Whatnot / gradient).
  if (images.length === 0) {
    return <div style={s.cover}>{fallback}</div>;
  }

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== active) setActive(idx);
  };

  // One image → no scroller / dots needed.
  if (images.length === 1) {
    return (
      <div style={s.cover}>
        <ImageWithFade
          src={images[0].thumb}
          fallbackSrc={images[0].full ?? undefined}
          alt={images[0].alt}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          fallback={fallback}
        />
      </div>
    );
  }

  return (
    <div style={s.galleryWrap}>
      <div className="tt-hscroll" style={s.galleryScroll} onScroll={onScroll}>
        {images.map((img, i) => (
          <div key={i} style={s.gallerySlide}>
            <ImageWithFade
              src={img.thumb}
              fallbackSrc={img.full ?? undefined}
              alt={img.alt}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              fallback={fallback}
            />
          </div>
        ))}
      </div>
      <div style={s.galleryDots}>
        {images.map((_, i) => (
          <span key={i} style={{ ...s.galleryDot, ...(i === active ? s.galleryDotActive : null) }} />
        ))}
      </div>
    </div>
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
        <div style={{ width: 'min(80vw, 480px)', aspectRatio: '1 / 1', borderRadius: 8, overflow: 'hidden' }}>
          <ImageWithFade
            src={item.image_url}
            alt={item.title}
            eager
            style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
            fallback={<MediaFallback kind="find" seed={item.id} label={item.title?.slice(0, 14) || 'ITEM'} />}
          />
        </div>
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
    backgroundColor: 'var(--color-neutral-50)',
    paddingBottom: 'var(--space-6)',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--space-4))',
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

  galleryWrap: { position: 'relative', width: '100%' },
  galleryScroll: {
    display: 'flex', flexWrap: 'nowrap',
    overflowX: 'auto', scrollSnapType: 'x mandatory',
    width: '100%',
  },
  gallerySlide: {
    position: 'relative', flex: '0 0 100%', width: '100%',
    aspectRatio: '16 / 9', scrollSnapAlign: 'start',
    backgroundColor: 'var(--color-neutral-100)',
  },
  galleryDots: {
    position: 'absolute', left: 0, right: 0, bottom: 8,
    display: 'flex', justifyContent: 'center', gap: 6,
    pointerEvents: 'none',
  },
  galleryDot: {
    width: 6, height: 6, borderRadius: 999,
    background: 'rgba(255,255,255,0.55)',
    boxShadow: '0 0 2px rgba(0,0,0,0.4)',
  },
  galleryDotActive: { background: '#fff', width: 18 },

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
  emptyHint: {
    margin: 0,
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    fontStyle: 'italic',
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
  eventUrlBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    width: '100%', marginTop: 'var(--space-3)',
    padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)',
    border: 'none', cursor: 'pointer', textDecoration: 'none',
    background: 'var(--color-primary-600, #d97706)',
    color: '#fff',
    fontSize: 'var(--font-size-sm)', fontWeight: 700,
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

/**
 * Owner-only Boost row rendered on the event detail page. Two states:
 *  - Already boosted → muted status pill with remaining hours.
 *  - Not boosted    → primary CTA running the mocked $1.99 / 72h purchase.
 *
 * Payments are MOCKED in Phase 1 (see src/lib/payments.ts). Stripe is a
 * Phase 2 swap behind `startBoostPurchase`.
 */
function OwnerBoostRow({ event, onApplied }: { event: EventRow; onApplied: () => Promise<void> | void }) {
  const { profile } = useAuth();
  const isPro = isProUser(profile);
  const [busy, setBusy] = useState(false);
  const active = isBoosted(event);
  const remaining = boostExpiresInLabel(event);

  // Temporarily hidden for App Store review — remove the entire boost row
  // (CTA and the "Boosted" status pill) from the iOS build.
  if (monetizationHidden()) return null;

  const onBoost = async () => {
    setBusy(true);
    // Pro includes unlimited boosts — redeem the included boost (no charge)
    // rather than opening the paid Apple purchase sheet.
    const res = isPro
      ? await startProBoost({ targetKind: 'event', targetId: event.id })
      : await startBoostPurchase({ targetKind: 'event', targetId: event.id });
    setBusy(false);
    if (!res.ok) {
      flashToast(
        res.comingSoon ? 'Boost checkout is coming soon.' : `Boost failed: ${res.error}`,
        'info',
      );
      return;
    }
    flashToast(
      isPro ? 'Boost active for 72 hours — included with Pro.' : 'Boost active for 72 hours.',
      'success',
    );
    await onApplied();
  };

  return (
    <div style={ownerBoostStyles.row}>
      {active ? (
        <span style={ownerBoostStyles.activePill}>
          <Zap size={12} style={{ color: '#fbbf24' }} /> Boosted{remaining ? ` · ${remaining} left` : ''}
        </span>
      ) : (
        <button
          type="button"
          onClick={onBoost}
          disabled={busy}
          style={{ ...ownerBoostStyles.boostBtn, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}
        >
          {busy ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
          {isPro ? 'Boost Event — Included with Pro' : 'Boost — $1.99 / 72h'}
        </button>
      )}
    </div>
  );
}

const ownerBoostStyles = {
  row: {
    display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
    gap: 8, marginTop: 10, flexWrap: 'wrap' as const,
  },
  boostBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '10px 16px', minHeight: 40, borderRadius: 999,
    background: 'linear-gradient(135deg, #fbbf24, #f59e0b 55%, #d97706)',
    color: '#1a1208', border: '1px solid rgba(251,191,36,0.55)',
    fontSize: 13, fontWeight: 800,
    boxShadow: '0 6px 18px rgba(251, 191, 36, 0.28)',
  },
  activePill: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 12px', borderRadius: 999,
    background: 'rgba(251, 191, 36, 0.12)',
    border: '1px solid rgba(251, 191, 36, 0.35)',
    color: '#fbbf24', fontSize: 12, fontWeight: 700,
  },
};
