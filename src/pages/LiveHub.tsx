import { useState, useEffect } from 'react';
import {
  ArrowLeft, Gavel, Home, MapPin, Plus, X, Clock, ExternalLink,
  Upload, ToggleLeft, ToggleRight, ChevronDown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

interface ExternalListing {
  id: string;
  platform: string;
  listing_type: string;
  external_url: string;
  title: string;
  price_display: string | null;
  category: string | null;
  image_url: string | null;
  ends_at: string | null;
  scout_needed: boolean;
  ships_available: boolean;
  status: string;
  created_at: string;
}

type FilterKey = 'all' | 'auctions' | 'estate' | 'yard' | 'whatnot' | 'poshmark' | 'flea' | 'storage';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'auctions', label: 'Auctions' },
  { key: 'estate', label: 'Estate Sales' },
  { key: 'yard', label: 'Yard Sales' },
  { key: 'whatnot', label: 'Whatnot' },
  { key: 'poshmark', label: 'Poshmark' },
  { key: 'flea', label: 'Flea Markets' },
  { key: 'storage', label: 'Storage' },
];

const PLATFORM_COLORS: Record<string, string> = {
  whatnot: '#FF5C00',
  poshmark: '#C13584',
  ebay: '#E53238',
  hibid: '#1A3668',
  maxsold: '#007A74',
  estatesales: '#7B4F2E',
  facebook: '#1877F2',
  other: '#6B7280',
};

const LISTING_TYPE_LABELS: Record<string, string> = {
  live_stream: 'Live Stream',
  auction: 'Auction',
  estate_sale: 'Estate Sale',
  yard_sale: 'Yard Sale',
  flea_market: 'Flea Market',
  storage_auction: 'Storage Auction',
  fixed_price: 'For Sale',
};

function applyFilter(listings: ExternalListing[], filter: FilterKey): ExternalListing[] {
  switch (filter) {
    case 'auctions': return listings.filter((l) => l.listing_type === 'auction' || l.listing_type === 'live_stream');
    case 'estate': return listings.filter((l) => l.listing_type === 'estate_sale');
    case 'yard': return listings.filter((l) => l.listing_type === 'yard_sale');
    case 'whatnot': return listings.filter((l) => l.platform === 'whatnot');
    case 'poshmark': return listings.filter((l) => l.platform === 'poshmark');
    case 'flea': return listings.filter((l) => l.listing_type === 'flea_market');
    case 'storage': return listings.filter((l) => l.listing_type === 'storage_auction');
    default: return listings;
  }
}

export default function LiveHub({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const [listings, setListings] = useState<ExternalListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [showUpload, setShowUpload] = useState(false);

  const fetchListings = () => {
    setLoading(true);
    supabase
      .from('external_listings')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setListings(data as ExternalListing[]);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchListings();
  }, []);

  const filtered = applyFilter(listings, filter);
  const liveCount = listings.filter((l) => l.listing_type === 'live_stream').length;

  return (
    <div style={st.container}>
      {/* Header */}
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
        <div style={st.headerCenter}>
          <span style={st.headerTitle}>Auction Radar</span>
          {liveCount > 0 && (
            <span style={st.liveChip}>
              <span style={st.liveDot} />
              {liveCount} LIVE
            </span>
          )}
        </div>
        <button onClick={() => setShowUpload(true)} style={st.uploadBtn} aria-label="Upload event">
          <Plus size={18} style={{ color: 'var(--color-primary-600)' }} />
        </button>
      </header>

      {/* Subtitle */}
      <div style={st.subtitle}>
        <span style={st.subtitleText}>Discover auctions, estate sales, yard sales, and live sourcing opportunities.</span>
      </div>

      {/* Quick nav */}
      <div style={st.quickNav}>
        <button onClick={() => setFilter('auctions')} style={{ ...st.qnBtn, ...(filter === 'auctions' ? st.qnBtnActive : {}) }}>
          <div style={{ ...st.qnIcon, backgroundColor: filter === 'auctions' ? 'var(--color-primary-100)' : 'var(--color-primary-50)' }}>
            <Gavel size={18} style={{ color: 'var(--color-primary-600)' }} />
          </div>
          <span style={st.qnLabel}>Auctions</span>
          <span style={st.qnSub}>Live &amp; upcoming</span>
        </button>
        <button onClick={() => setFilter('estate')} style={{ ...st.qnBtn, ...(filter === 'estate' ? st.qnBtnActive : {}) }}>
          <div style={{ ...st.qnIcon, backgroundColor: filter === 'estate' ? 'var(--color-accent-100)' : 'var(--color-accent-50)' }}>
            <Home size={18} style={{ color: 'var(--color-accent-600)' }} />
          </div>
          <span style={st.qnLabel}>Estate Sales</span>
          <span style={st.qnSub}>Liquidation events</span>
        </button>
        <button onClick={() => setFilter('yard')} style={{ ...st.qnBtn, ...(filter === 'yard' ? st.qnBtnActive : {}) }}>
          <div style={{ ...st.qnIcon, backgroundColor: filter === 'yard' ? 'var(--color-success-100)' : 'var(--color-success-50)' }}>
            <MapPin size={18} style={{ color: 'var(--color-success-600)' }} />
          </div>
          <span style={st.qnLabel}>Yard Sales</span>
          <span style={st.qnSub}>Local &amp; nearby</span>
        </button>
        <button onClick={() => setShowUpload(true)} style={st.qnBtn}>
          <div style={{ ...st.qnIcon, backgroundColor: 'var(--color-secondary-50)' }}>
            <Upload size={18} style={{ color: 'var(--color-secondary-600)' }} />
          </div>
          <span style={st.qnLabel}>Upload</span>
          <span style={st.qnSub}>Add an event</span>
        </button>
      </div>

      {/* Filter chips */}
      <div style={st.filterRow}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{ ...st.chip, ...(filter === f.key ? st.chipActive : {}) }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      <div style={st.feed}>
        {loading && (
          <div style={st.emptyState}>
            <p style={st.emptyText}>Loading sourcing events...</p>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={st.emptyState}>
            <Gavel size={36} style={{ color: 'var(--color-neutral-200)', marginBottom: '12px' }} />
            <p style={st.emptyTitle}>No live sourcing events yet</p>
            <p style={st.emptyText}>Be the first to upload an auction, estate sale, or yard sale.</p>
            <button onClick={() => setShowUpload(true)} style={st.emptyBtn}>
              <Plus size={14} />
              Upload an Event
            </button>
          </div>
        )}

        {!loading && filtered.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          userId={user?.id}
          onClose={() => setShowUpload(false)}
          onSuccess={() => { setShowUpload(false); fetchListings(); }}
        />
      )}
    </div>
  );
}

function ListingCard({ listing }: { listing: ExternalListing }) {
  const color = PLATFORM_COLORS[listing.platform] ?? PLATFORM_COLORS.other;
  const platformLabel = listing.platform.charAt(0).toUpperCase() + listing.platform.slice(1);
  const typeLabel = LISTING_TYPE_LABELS[listing.listing_type] ?? listing.listing_type;
  const isLive = listing.listing_type === 'live_stream';

  const timeInfo = (() => {
    if (!listing.ends_at) return null;
    const diff = new Date(listing.ends_at).getTime() - Date.now();
    if (diff <= 0) return 'Ended';
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (hours >= 24) return `Ends in ${Math.floor(hours / 24)}d ${hours % 24}h`;
    if (hours >= 1) return `Ends in ${hours}h ${mins}m`;
    return `Ends in ${mins}m`;
  })();

  return (
    <div style={st.card}>
      {listing.image_url && (
        <div style={st.cardImgWrap}>
          <img src={listing.image_url} alt={listing.title} style={st.cardImg} />
          {isLive && (
            <span style={st.liveBadge}>
              <span style={st.liveBadgeDot} />
              LIVE
            </span>
          )}
        </div>
      )}

      <div style={st.cardBody}>
        <div style={st.cardTop}>
          <span style={{ ...st.platformBadge, backgroundColor: `${color}18`, color }}>
            {platformLabel}
          </span>
          <span style={st.typeBadge}>{typeLabel}</span>
          {listing.price_display && (
            <span style={st.price}>{listing.price_display}</span>
          )}
        </div>

        <p style={st.cardTitle}>{listing.title}</p>

        {listing.category && (
          <span style={st.categoryTag}>{listing.category}</span>
        )}

        <div style={st.cardMeta}>
          {timeInfo && (
            <span style={st.metaItem}>
              <Clock size={10} />
              {timeInfo}
            </span>
          )}
          {listing.scout_needed && (
            <span style={st.scoutTag}>Scout Needed</span>
          )}
          {listing.ships_available && (
            <span style={st.shipsTag}>Ships</span>
          )}
        </div>

        <div style={st.cardActions}>
          <a
            href={listing.external_url}
            target="_blank"
            rel="noopener noreferrer"
            style={st.viewBtn}
          >
            <ExternalLink size={12} />
            View Listing
          </a>
        </div>
      </div>
    </div>
  );
}

interface UploadForm {
  title: string;
  platform: string;
  listing_type: string;
  external_url: string;
  price_display: string;
  category: string;
  image_url: string;
  ends_at: string;
  scout_needed: boolean;
  ships_available: boolean;
}

function UploadModal({ userId, onClose, onSuccess }: { userId?: string; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState<UploadForm>({
    title: '',
    platform: 'other',
    listing_type: 'auction',
    external_url: '',
    price_display: '',
    category: '',
    image_url: '',
    ends_at: '',
    scout_needed: false,
    ships_available: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field: keyof UploadForm, value: string | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!form.external_url.trim()) { setError('External URL is required.'); return; }
    setError('');
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      platform: form.platform,
      listing_type: form.listing_type,
      external_url: form.external_url.trim(),
      price_display: form.price_display.trim() || null,
      category: form.category.trim() || null,
      image_url: form.image_url.trim() || null,
      ends_at: form.ends_at || null,
      scout_needed: form.scout_needed,
      ships_available: form.ships_available,
      status: 'active',
      submitted_by: userId ?? null,
    };
    const { error: err } = await supabase.from('external_listings').insert(payload);
    setSaving(false);
    if (err) { setError('Failed to submit. Please try again.'); return; }
    onSuccess();
  };

  return (
    <div style={mo.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={mo.sheet}>
        <div style={mo.handle} />
        <div style={mo.header}>
          <span style={mo.title}>Upload an Event</span>
          <button onClick={onClose} style={mo.closeBtn}><X size={18} /></button>
        </div>

        <div style={mo.body}>
          {/* Title */}
          <label style={mo.label}>Title <span style={mo.req}>*</span></label>
          <input
            style={mo.input}
            placeholder="e.g. HiBid Estate Auction — Chicago"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
          />

          {/* Platform + Type row */}
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
              <label style={mo.label}>Type</label>
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

          {/* External URL */}
          <label style={mo.label}>External URL <span style={mo.req}>*</span></label>
          <input
            style={mo.input}
            placeholder="https://..."
            value={form.external_url}
            onChange={(e) => set('external_url', e.target.value)}
            type="url"
          />

          {/* Price + Category row */}
          <div style={mo.row}>
            <div style={{ flex: 1 }}>
              <label style={mo.label}>Starting Price</label>
              <input
                style={mo.input}
                placeholder="e.g. $25 or Free"
                value={form.price_display}
                onChange={(e) => set('price_display', e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={mo.label}>Category</label>
              <input
                style={mo.input}
                placeholder="e.g. Antiques"
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
              />
            </div>
          </div>

          {/* End date */}
          <label style={mo.label}>End Date / Time</label>
          <input
            style={mo.input}
            type="datetime-local"
            value={form.ends_at}
            onChange={(e) => set('ends_at', e.target.value)}
          />

          {/* Image URL */}
          <label style={mo.label}>Image URL</label>
          <input
            style={mo.input}
            placeholder="https://..."
            value={form.image_url}
            onChange={(e) => set('image_url', e.target.value)}
          />

          {/* Toggles */}
          <div style={mo.toggleRow}>
            <div style={mo.toggleItem}>
              <span style={mo.toggleLabel}>Shipping Available</span>
              <button onClick={() => set('ships_available', !form.ships_available)} style={mo.toggleBtn}>
                {form.ships_available
                  ? <ToggleRight size={28} style={{ color: 'var(--color-success-500)' }} />
                  : <ToggleLeft size={28} style={{ color: 'var(--color-neutral-300)' }} />}
              </button>
            </div>
            <div style={mo.toggleItem}>
              <span style={mo.toggleLabel}>Scout Needed</span>
              <button onClick={() => set('scout_needed', !form.scout_needed)} style={mo.toggleBtn}>
                {form.scout_needed
                  ? <ToggleRight size={28} style={{ color: 'var(--color-warning-500)' }} />
                  : <ToggleLeft size={28} style={{ color: 'var(--color-neutral-300)' }} />}
              </button>
            </div>
          </div>

          {error && <p style={mo.errorText}>{error}</p>}

          <button onClick={handleSubmit} disabled={saving} style={{ ...mo.submitBtn, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Submitting...' : 'Submit Event'}
          </button>
        </div>
      </div>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--color-neutral-0)' },

  // Header
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-neutral-100)', flexShrink: 0 },
  backBtn: { width: '36px', height: '36px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-neutral-600)' },
  headerCenter: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  headerTitle: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  liveChip: { display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-error-50)', border: '1px solid var(--color-error-200)' },
  liveDot: { width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--color-error-500)', animation: 'pulse 2s infinite', flexShrink: 0 },
  uploadBtn: { width: '36px', height: '36px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-primary-50)', border: '1px solid var(--color-primary-200)' },

  // Subtitle
  subtitle: { padding: '8px var(--space-4) 0', flexShrink: 0 },
  subtitleText: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)', lineHeight: 1.4 },

  // Quick nav
  quickNav: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-neutral-100)', flexShrink: 0 },
  qnBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: 'var(--space-2) var(--space-1)', borderRadius: 'var(--radius-md)', border: '1px solid transparent', transition: 'border-color 0.15s' },
  qnBtnActive: { border: '1px solid var(--color-primary-200)', backgroundColor: 'var(--color-primary-50)' },
  qnIcon: { width: '40px', height: '40px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  qnLabel: { fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-800)', textAlign: 'center' as const },
  qnSub: { fontSize: '9px', color: 'var(--color-neutral-400)', textAlign: 'center' as const, lineHeight: 1.2 },

  // Filter chips
  filterRow: { display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-4)', overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0, borderBottom: '1px solid var(--color-neutral-50)' },
  chip: { flexShrink: 0, padding: '5px 12px', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-600)', backgroundColor: 'var(--color-neutral-100)', border: '1px solid transparent' },
  chipActive: { backgroundColor: 'var(--color-primary-600)', color: 'var(--color-neutral-0)', border: '1px solid var(--color-primary-600)' },

  // Feed
  feed: { flex: 1, overflowY: 'auto', padding: 'var(--space-3) var(--space-4)' },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '56px 24px', textAlign: 'center' },
  emptyTitle: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-700)', marginBottom: '6px' },
  emptyText: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-400)', marginBottom: '20px', lineHeight: 1.5 },
  emptyBtn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-primary-600)', color: 'var(--color-neutral-0)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)' },

  // Listing card
  card: { borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-neutral-100)', overflow: 'hidden', marginBottom: 'var(--space-3)', backgroundColor: 'var(--color-neutral-0)' },
  cardImgWrap: { position: 'relative', height: '160px', backgroundColor: 'var(--color-neutral-50)' },
  cardImg: { width: '100%', height: '100%', objectFit: 'cover' },
  liveBadge: { position: 'absolute', top: '10px', left: '10px', display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-error-500)', color: '#fff', fontSize: '10px', fontWeight: 700 },
  liveBadgeDot: { width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#fff', animation: 'pulse 1.5s infinite' },
  cardBody: { padding: 'var(--space-3)' },
  cardTop: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', flexWrap: 'wrap' as const },
  platformBadge: { fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px' },
  typeBadge: { fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px', backgroundColor: 'var(--color-neutral-100)', color: 'var(--color-neutral-600)' },
  price: { marginLeft: 'auto', fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-success-700)' },
  cardTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-900)', lineHeight: 1.4, marginBottom: 'var(--space-2)' },
  categoryTag: { display: 'inline-block', fontSize: '10px', color: 'var(--color-secondary-700)', backgroundColor: 'var(--color-secondary-50)', padding: '2px 7px', borderRadius: '4px', marginBottom: 'var(--space-2)' },
  cardMeta: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', flexWrap: 'wrap' as const },
  metaItem: { display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: 'var(--color-neutral-500)' },
  scoutTag: { fontSize: '10px', fontWeight: 600, color: 'var(--color-warning-700)', backgroundColor: 'var(--color-warning-50)', padding: '2px 7px', borderRadius: '4px' },
  shipsTag: { fontSize: '10px', fontWeight: 600, color: 'var(--color-success-700)', backgroundColor: 'var(--color-success-50)', padding: '2px 7px', borderRadius: '4px' },
  cardActions: { display: 'flex', justifyContent: 'flex-end' },
  viewBtn: { display: 'flex', alignItems: 'center', gap: '5px', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-primary-600)', padding: '6px 12px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-primary-50)', textDecoration: 'none' },
};

const mo: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.48)', zIndex: 1000, display: 'flex', alignItems: 'flex-end' },
  sheet: { width: '100%', maxHeight: '92vh', backgroundColor: 'var(--color-neutral-0)', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  handle: { width: '36px', height: '4px', borderRadius: '2px', backgroundColor: 'var(--color-neutral-200)', margin: '10px auto 0', flexShrink: 0 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px var(--space-4)', borderBottom: '1px solid var(--color-neutral-100)', flexShrink: 0 },
  title: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  closeBtn: { width: '32px', height: '32px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-neutral-500)' },
  body: { flex: 1, overflowY: 'auto', padding: 'var(--space-4)' },
  label: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-600)', marginBottom: '5px', marginTop: 'var(--space-3)' },
  req: { color: 'var(--color-error-500)', marginLeft: '2px' },
  input: { width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-200)', fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-900)', backgroundColor: 'var(--color-neutral-0)', boxSizing: 'border-box' as const },
  row: { display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-3)' },
  selectWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  select: { width: '100%', padding: '9px 28px 9px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-200)', fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-900)', backgroundColor: 'var(--color-neutral-0)', appearance: 'none', boxSizing: 'border-box' as const },
  selectIcon: { position: 'absolute', right: '8px', color: 'var(--color-neutral-400)', pointerEvents: 'none' },
  toggleRow: { display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-4)' },
  toggleItem: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-neutral-50)', border: '1px solid var(--color-neutral-100)' },
  toggleLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-700)' },
  toggleBtn: { background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 0 },
  errorText: { fontSize: 'var(--font-size-xs)', color: 'var(--color-error-600)', marginTop: 'var(--space-2)', padding: '8px 12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-error-50)' },
  submitBtn: { width: '100%', padding: '13px', borderRadius: 'var(--radius-full)', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))', color: '#fff', fontSize: 'var(--font-size-sm)', fontWeight: 700, marginTop: 'var(--space-4)', cursor: 'pointer', transition: 'opacity 0.2s' },
};
