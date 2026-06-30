import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Navigation, Loader2, Store, Pencil, X,
  ExternalLink, Phone, Globe, Clock, BadgeCheck, Star, Share2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  fetchBusiness, fetchBusinessFeaturedItems,
  BUSINESS_CATEGORY_META, BUSINESS_AVAILABILITY_META,
  type BusinessRow, type BusinessFeaturedItem,
} from '../lib/businesses';
import { FoundingPartnerBadge } from '../components/ui/FoundingPartnerBadge';
import { setFoundingPartner } from '../lib/foundingPartner';
import { MediaFallback } from '../components/ui/MediaFallback';
import { PageScroll } from '../components/ui/PageScroll';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { EmptyState } from '../components/ui/EmptyState';
import { flashToast } from '../lib/toast';
import { publicWebUrl } from '../lib/apiBase';

const LOG = '[BUSINESS_DETAIL]';

/**
 * Public business detail page (/business/:id).
 *
 * Mirrors EventDetail's structure (local header inside PageScroll, branded
 * image fallbacks, directions / contact CTAs) but for a brick-and-mortar
 * treasure-hunting location: logo + photo gallery, address, phone, website,
 * Facebook, hours, and verified / featured trust badges.
 */

// Prepend https:// to a bare URL ("facebook.com/...") so the link works.
function toHref(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export default function BusinessDetail({ onBack }: { onBack: () => void }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  const [biz, setBiz] = useState<BusinessRow | null>(null);
  const [fpBusy, setFpBusy] = useState(false);
  const [items, setItems] = useState<BusinessFeaturedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [itemIdx, setItemIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setNotFound(false);
    setBiz(null);

    console.log(LOG, 'load', { id });
    // Featured items degrade independently — a transient fetch failure must not
    // take down the whole business page (table-missing already returns []).
    Promise.all([
      fetchBusiness(id),
      fetchBusinessFeaturedItems(id).catch((e) => {
        console.warn(LOG, 'featured items load failed (non-fatal)', e);
        return [] as BusinessFeaturedItem[];
      }),
    ])
      .then(([b, fItems]) => {
        if (cancelled) return;
        if (!b) { setNotFound(true); setLoading(false); return; }
        setBiz(b);
        setItems(fItems);
        setLoading(false);
      })
      .catch((e: any) => {
        if (cancelled) return;
        console.error(LOG, 'load:error', e);
        setErr(e?.message ?? 'Failed to load business');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  const onToggleFoundingPartner = async () => {
    if (!biz || fpBusy) return;
    const grant = !biz.founding_partner;
    setFpBusy(true);
    try {
      await setFoundingPartner({ kind: 'business', id: biz.id, action: grant ? 'grant' : 'revoke' });
      setBiz((b) => (b ? { ...b, founding_partner: grant } : b));
      flashToast(grant ? 'Founding Partner granted' : 'Founding Partner removed');
    } catch (e: any) {
      flashToast(e?.message ?? 'Could not update Founding Partner.');
    } finally {
      setFpBusy(false);
    }
  };

  const onShare = async () => {
    if (!biz) return;
    // Share the BARE URL — no title/text prefix. When a message contains
    // only a link, iMessage/Messenger/WhatsApp collapse it into a single
    // rich preview card (the server injects the business's name + logo as
    // OG tags on /business/:id). Prepending the name forced those apps to
    // also show the long raw URL as text, which looked terrible. URL-only
    // = clean card, exactly like sharing any other legitimate site.
    const url = publicWebUrl(`/business/${biz.id}`);
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    if (nav && typeof nav.share === 'function') {
      try {
        await nav.share({ url });
        return;
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        // fall through to clipboard
      }
    }
    if (nav?.clipboard?.writeText) {
      try {
        await nav.clipboard.writeText(url);
        flashToast('Link copied');
        return;
      } catch {
        /* fall through to prompt */
      }
    }
    window.prompt('Copy this link to share:', url);
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

  if (notFound || (!biz && !err)) {
    return (
      <PageScroll style={s.container}>
        <Header onBack={onBack} />
        <EmptyState
          icon={Store}
          title="Business not found"
          body="This business may have been removed or isn't published yet."
          action={<button onClick={() => navigate('/map')} style={s.primaryBtn}>Open the map</button>}
        />
      </PageScroll>
    );
  }

  if (err || !biz) {
    return (
      <PageScroll style={s.container}>
        <Header onBack={onBack} />
        <div style={s.errorBanner}>{err ?? 'Failed to load business'}</div>
      </PageScroll>
    );
  }

  const isOwner = user?.id === biz.owner_id;
  const meta = BUSINESS_CATEGORY_META[biz.category];
  const fullAddress = [biz.address, biz.city, biz.region].filter(Boolean).join(', ');
  const hasLocation = fullAddress.length > 0;
  const websiteHref = toHref(biz.website);
  const facebookHref = toHref(biz.facebook_url);
  const coverPhoto = biz.photos[0]?.url || biz.logo_url || null;
  const coverThumb = biz.photos[0]?.thumb_url || biz.logo_thumb_url || null;

  const onDirections = () => {
    const q = encodeURIComponent(fullAddress);
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <PageScroll style={s.container}>
      <Header onBack={onBack} />

      {isOwner && biz.status !== 'published' && (
        <div style={s.statusBanner}>
          This business is <strong>{biz.status}</strong>. Only you can see it until it's published.
        </div>
      )}

      {/* Cover — first photo, then logo, then branded fallback. */}
      <div style={s.cover}>
        <ImageWithFade
          src={coverThumb || coverPhoto || undefined}
          fallbackSrc={coverPhoto}
          alt={biz.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          fallback={<MediaFallback kind="listing" seed={biz.id} label={biz.name} />}
        />
        {biz.logo_url && (
          <div style={s.logoBadge}>
            <ImageWithFade
              src={biz.logo_thumb_url || biz.logo_url || undefined}
              fallbackSrc={biz.logo_url}
              alt={`${biz.name} logo`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              fallback={<MediaFallback kind="listing" seed={biz.id} label={biz.name} compact />}
            />
          </div>
        )}
      </div>

      {/* Title + meta block */}
      <section style={s.section}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '4px 8px', borderRadius: 999,
            background: meta.color, color: '#fff', fontSize: 11, fontWeight: 700,
          }}>
            {meta.label}
          </span>
          {biz.verified && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 8px', borderRadius: 999,
              background: '#dcfce7', color: '#166534', fontSize: 11, fontWeight: 700,
            }}>
              <BadgeCheck size={12} /> Verified
            </span>
          )}
          {biz.featured && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 8px', borderRadius: 999,
              background: '#fef3c7', color: '#92400e', fontSize: 11, fontWeight: 700,
            }}>
              <Star size={12} /> Featured
            </span>
          )}
          {biz.founding_partner && <FoundingPartnerBadge />}
          {isAdmin && (
            <button
              onClick={onToggleFoundingPartner}
              disabled={fpBusy}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 8px', borderRadius: 999, cursor: 'pointer',
                border: '1px dashed #4f46e5', background: 'transparent',
                color: '#4f46e5', fontSize: 11, fontWeight: 700,
                opacity: fpBusy ? 0.6 : 1,
              }}
            >
              {biz.founding_partner ? 'Remove Founding Partner' : 'Make Founding Partner'}
            </button>
          )}
        </div>
        <h1 style={s.title}>{biz.name}</h1>

        {hasLocation && (
          <div style={s.metaRow}>
            <MapPin size={14} style={{ color: 'var(--color-neutral-500)' }} />
            <span>{fullAddress}</span>
          </div>
        )}
        {biz.phone && (
          <div style={s.metaRow}>
            <Phone size={14} style={{ color: 'var(--color-neutral-500)' }} />
            <span>{biz.phone}</span>
          </div>
        )}

        {/* Primary CTAs */}
        <div style={s.ctaRow}>
          {hasLocation && (
            <button onClick={onDirections} style={s.primaryBtnLg}>
              <Navigation size={14} /> Directions
            </button>
          )}
          {biz.phone && (
            <a href={`tel:${biz.phone.replace(/[^0-9+]/g, '')}`} style={s.ghostBtnLg}>
              <Phone size={14} /> Call
            </a>
          )}
          {websiteHref && (
            <a href={websiteHref} target="_blank" rel="noopener noreferrer" style={s.ghostBtnLg}>
              <Globe size={14} /> Website
            </a>
          )}
          {facebookHref && (
            <a href={facebookHref} target="_blank" rel="noopener noreferrer" style={s.ghostBtnLg}>
              <ExternalLink size={14} /> Facebook
            </a>
          )}
          <button onClick={onShare} style={s.ghostBtnLg} aria-label="Share business">
            <Share2 size={14} /> Share
          </button>
          {isOwner && (
            <button onClick={() => navigate(`/business/${biz.id}/edit`)} style={s.ghostBtnLg}>
              <Pencil size={14} /> Edit
            </button>
          )}
        </div>
      </section>

      {/* Description */}
      {biz.description?.trim() && (
        <section style={s.section}>
          <h3 style={s.sectionTitle}>About</h3>
          <p style={s.description}>{biz.description}</p>
        </section>
      )}

      {/* Featured items */}
      {items.length > 0 && (
        <section style={s.section}>
          <h3 style={s.sectionTitle}>Featured items</h3>
          <div style={s.itemGrid}>
            {items.map((it, idx) => (
              <button key={it.id} onClick={() => setItemIdx(idx)} style={s.featuredTile}>
                <div style={{ ...s.itemThumb, ...(it.availability !== 'available' ? { opacity: 0.6 } : {}) }}>
                  <ImageWithFade
                    src={it.thumb_url || it.image_url || undefined}
                    fallbackSrc={it.image_url}
                    alt={it.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    fallback={<MediaFallback kind="listing" seed={it.id} label={it.title?.slice(0, 14) || 'ITEM'} compact />}
                  />
                  {it.availability !== 'available' && (
                    <span style={s.availBadge}>{BUSINESS_AVAILABILITY_META[it.availability].label}</span>
                  )}
                </div>
                <div style={s.itemBody}>
                  <div style={s.itemTitle}>{it.title}</div>
                  {it.category && <div style={s.itemCat}>{it.category}</div>}
                  {it.price != null && <div style={s.itemPrice}>${Number(it.price).toFixed(2)}</div>}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Hours */}
      {biz.hours?.trim() && (
        <section style={s.section}>
          <h3 style={s.sectionTitle}><Clock size={15} style={{ verticalAlign: '-2px' }} /> Hours</h3>
          <p style={s.hours}>{biz.hours}</p>
        </section>
      )}

      {/* Photos gallery */}
      {biz.photos.length > 0 && (
        <section style={s.section}>
          <h3 style={s.sectionTitle}>Photos</h3>
          <div style={s.itemGrid}>
            {biz.photos.map((p, idx) => (
              <button key={p.url} onClick={() => setLightboxIdx(idx)} style={s.itemTile}>
                <div style={s.itemThumb}>
                  <ImageWithFade
                    src={p.thumb_url || p.url || undefined}
                    fallbackSrc={p.url}
                    alt={`${biz.name} photo ${idx + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    fallback={<MediaFallback kind="listing" seed={p.url} compact />}
                  />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Lightbox */}
      {lightboxIdx != null && biz.photos[lightboxIdx] && (
        <Lightbox photo={biz.photos[lightboxIdx]} alt={biz.name} onClose={() => setLightboxIdx(null)} />
      )}

      {/* Featured-item detail */}
      {itemIdx != null && items[itemIdx] && (
        <FeaturedItemModal item={items[itemIdx]} onClose={() => setItemIdx(null)} />
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
      <h1 style={s.headerTitle}>Business</h1>
    </header>
  );
}

/* --------------- Lightbox --------------- */

function Lightbox({ photo, alt, onClose }: { photo: { url: string }; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={s.lightboxOverlay} onClick={onClose}>
      <button style={s.lightboxClose} onClick={onClose} aria-label="Close"><X size={22} /></button>
      <div onClick={(e) => e.stopPropagation()} style={s.lightboxImgWrap}>
        <ImageWithFade
          src={photo.url}
          alt={alt}
          eager
          style={s.lightboxImg}
          fallback={<MediaFallback kind="listing" seed={photo.url} label={alt} />}
        />
      </div>
    </div>
  );
}

/* --------------- Featured item modal --------------- */

function FeaturedItemModal({ item, onClose }: { item: BusinessFeaturedItem; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const availMeta = BUSINESS_AVAILABILITY_META[item.availability];

  return (
    <div style={s.lightboxOverlay} onClick={onClose}>
      <button style={s.lightboxClose} onClick={onClose} aria-label="Close"><X size={22} /></button>
      <div onClick={(e) => e.stopPropagation()} style={s.itemModalCard}>
        {(item.image_url || item.thumb_url) && (
          <div style={s.itemModalImgWrap}>
            <ImageWithFade
              src={item.image_url || item.thumb_url || undefined}
              alt={item.title}
              eager
              style={s.itemModalImg}
              fallback={<MediaFallback kind="listing" seed={item.id} label={item.title} />}
            />
          </div>
        )}
        <div style={s.itemModalBody}>
          <div style={s.itemModalTopRow}>
            <h3 style={s.itemModalTitle}>{item.title}</h3>
            {item.price != null && <span style={s.itemModalPrice}>${Number(item.price).toFixed(2)}</span>}
          </div>
          <div style={s.itemModalMeta}>
            {item.category && <span style={s.itemModalChip}>{item.category}</span>}
            <span style={{ ...s.itemModalChip, ...(item.availability !== 'available' ? s.itemModalChipMuted : {}) }}>
              {availMeta.label}
            </span>
          </div>
          {item.description?.trim() && <p style={s.itemModalDesc}>{item.description}</p>}
        </div>
      </div>
    </div>
  );
}

/* --------------- styles --------------- */

const s: Record<string, React.CSSProperties> = {
  container: { background: 'var(--color-bg, #fff)', minHeight: '100%' },
  header: {
    position: 'sticky', top: 0, zIndex: 10,
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '12px 14px',
    background: 'var(--color-bg, #fff)',
    borderBottom: '1px solid var(--color-neutral-200, #e5e7eb)',
  },
  iconBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 38, height: 38, borderRadius: 10, border: 'none',
    background: 'transparent', cursor: 'pointer',
  },
  headerTitle: { fontSize: 17, fontWeight: 700, margin: 0 },
  loadingWrap: { display: 'flex', justifyContent: 'center', padding: '48px 0' },
  errorBanner: {
    margin: 16, padding: 12, borderRadius: 10,
    background: '#fef2f2', color: '#991b1b', fontSize: 14,
  },
  statusBanner: {
    margin: '12px 16px 0', padding: '10px 12px', borderRadius: 10,
    background: '#fffbeb', color: '#92400e', fontSize: 13,
  },
  cover: {
    position: 'relative', width: '100%', aspectRatio: '16 / 9',
    background: '#0a0a0a', overflow: 'hidden',
  },
  logoBadge: {
    position: 'absolute', left: 16, bottom: -24,
    width: 72, height: 72, borderRadius: 16, overflow: 'hidden',
    border: '3px solid var(--color-bg, #fff)', background: '#fff',
    boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
  },
  section: { padding: '16px' },
  sectionTitle: { fontSize: 15, fontWeight: 700, margin: '0 0 8px' },
  title: { fontSize: 22, fontWeight: 800, margin: '4px 0 10px', lineHeight: 1.2 },
  metaRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 14, color: 'var(--color-neutral-700, #374151)', margin: '4px 0',
  },
  description: { fontSize: 14, lineHeight: 1.6, color: 'var(--color-neutral-700, #374151)', whiteSpace: 'pre-wrap', margin: 0 },
  hours: { fontSize: 14, lineHeight: 1.6, color: 'var(--color-neutral-700, #374151)', whiteSpace: 'pre-wrap', margin: 0 },
  ctaRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  primaryBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 10, border: 'none',
    background: 'var(--color-primary-600, #2563eb)', color: '#fff',
    fontWeight: 700, fontSize: 13, cursor: 'pointer',
  },
  primaryBtnLg: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '10px 16px', borderRadius: 12, border: 'none',
    background: 'var(--color-primary-600, #2563eb)', color: '#fff',
    fontWeight: 700, fontSize: 14, cursor: 'pointer', textDecoration: 'none',
  },
  ghostBtnLg: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '10px 16px', borderRadius: 12,
    border: '1px solid var(--color-neutral-300, #d1d5db)',
    background: 'var(--color-bg, #fff)', color: 'var(--color-neutral-800, #1f2937)',
    fontWeight: 700, fontSize: 14, cursor: 'pointer', textDecoration: 'none',
  },
  itemGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8,
  },
  itemTile: {
    display: 'block', padding: 0, border: 'none', background: 'transparent',
    cursor: 'pointer', borderRadius: 12, overflow: 'hidden',
  },
  itemThumb: {
    position: 'relative', width: '100%', aspectRatio: '1 / 1',
    background: '#f3f4f6', overflow: 'hidden', borderRadius: 12,
  },
  featuredTile: {
    display: 'block', padding: 0, textAlign: 'left',
    border: '1px solid var(--color-neutral-200, #e5e7eb)', background: 'var(--color-bg, #fff)',
    cursor: 'pointer', borderRadius: 12, overflow: 'hidden',
  },
  availBadge: {
    position: 'absolute', left: 6, top: 6,
    padding: '2px 7px', borderRadius: 999,
    background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 10, fontWeight: 700,
  },
  itemBody: { padding: '8px 8px 10px' },
  itemTitle: { fontSize: 13, fontWeight: 700, lineHeight: 1.25, color: 'var(--color-neutral-900, #111827)' },
  itemCat: { fontSize: 11, color: 'var(--color-neutral-500)', marginTop: 2 },
  itemPrice: { fontSize: 12, fontWeight: 700, color: 'var(--color-primary-600, #2563eb)', marginTop: 2 },
  itemModalCard: {
    width: 'min(94vw, 460px)', maxHeight: '88vh', overflowY: 'auto',
    background: 'var(--color-bg, #fff)', borderRadius: 16, overflow: 'hidden',
  },
  itemModalImgWrap: {
    width: '100%', aspectRatio: '4 / 3', background: '#0a0a0a',
    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  itemModalImg: { width: '100%', height: '100%', objectFit: 'contain' },
  itemModalBody: { padding: 16 },
  itemModalTopRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  itemModalTitle: { fontSize: 18, fontWeight: 800, margin: 0, lineHeight: 1.25 },
  itemModalPrice: { fontSize: 16, fontWeight: 800, color: 'var(--color-primary-600, #2563eb)', whiteSpace: 'nowrap' },
  itemModalMeta: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  itemModalChip: {
    padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
    background: 'var(--color-neutral-100, #f3f4f6)', color: 'var(--color-neutral-700, #374151)',
  },
  itemModalChipMuted: { background: '#fef3c7', color: '#92400e' },
  itemModalDesc: {
    fontSize: 14, lineHeight: 1.6, color: 'var(--color-neutral-700, #374151)',
    whiteSpace: 'pre-wrap', margin: '12px 0 0',
  },
  lightboxOverlay: {
    position: 'fixed', inset: 0, zIndex: 100,
    background: 'rgba(0,0,0,0.92)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  lightboxClose: {
    position: 'absolute', top: 16, right: 16,
    width: 40, height: 40, borderRadius: 999, border: 'none',
    background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  lightboxImgWrap: {
    maxWidth: '94vw', maxHeight: '88vh', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  },
  lightboxImg: { maxWidth: '94vw', maxHeight: '88vh', objectFit: 'contain', borderRadius: 8 },
};
