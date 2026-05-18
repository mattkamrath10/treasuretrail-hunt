import { useState, useEffect } from 'react';
import {
  ArrowLeft, Gavel, Plus, X, Clock, ExternalLink,
  Upload, ToggleLeft, ToggleRight, ChevronDown, Calendar,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

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
  ends_at: string | null;
  scout_needed: boolean;
  ships_available: boolean;
  status: string;
  created_at: string;
}

type TypeFilter = 'all' | 'auctions' | 'estate' | 'yard' | 'storage';

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'auctions', label: 'Auctions' },
  { key: 'estate', label: 'Estate Sales' },
  { key: 'yard', label: 'Yard Sales' },
  { key: 'storage', label: 'Storage Lockers' },
];

const PLATFORM_TABS = [
  { key: 'poshmark', label: 'Poshmark', color: '#C13584', bg: '#FDF0F8' },
  { key: 'whatnot', label: 'Whatnot', color: '#FF5C00', bg: '#FFF3EE' },
  { key: 'ebay', label: 'eBay', color: '#E53238', bg: '#FEF0F0' },
  { key: 'facebook', label: 'Facebook', color: '#1877F2', bg: '#EFF5FE' },
];

const PLATFORM_COLORS: Record<string, string> = {
  whatnot: '#FF5C00', poshmark: '#C13584', ebay: '#E53238',
  hibid: '#1A3668', maxsold: '#007A74', estatesales: '#7B4F2E',
  facebook: '#1877F2', other: '#6B7280',
};

const LISTING_TYPE_LABELS: Record<string, string> = {
  live_stream: 'Live Stream', auction: 'Auction', estate_sale: 'Estate Sale',
  yard_sale: 'Yard Sale', flea_market: 'Flea Market',
  storage_auction: 'Storage Auction', fixed_price: 'For Sale',
};

// ─── Filter logic ─────────────────────────────────────────────────────────────

function applyFilters(
  listings: ExternalListing[],
  typeFilter: TypeFilter,
  platformFilter: string | null,
): ExternalListing[] {
  let result = listings;

  if (platformFilter) {
    result = result.filter((l) => l.platform === platformFilter);
  }

  switch (typeFilter) {
    case 'auctions': result = result.filter((l) => l.listing_type === 'auction' || l.listing_type === 'live_stream'); break;
    case 'estate':   result = result.filter((l) => l.listing_type === 'estate_sale'); break;
    case 'yard':     result = result.filter((l) => l.listing_type === 'yard_sale'); break;
    case 'storage':  result = result.filter((l) => l.listing_type === 'storage_auction'); break;
    default: break;
  }

  return result;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LiveHub({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const [listings, setListings] = useState<ExternalListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);
  const [showAddPlatform, setShowAddPlatform] = useState(false);
  const [showUploadEvent, setShowUploadEvent] = useState(false);

  const fetchListings = () => {
    setLoading(true);
    supabase
      .from('external_listings')
      .select('id,platform,listing_type,external_url,title,price_display,category,image_url,ends_at,scout_needed,ships_available,status,created_at')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(60)
      .then(({ data }) => {
        if (data) setListings(data as ExternalListing[]);
        setLoading(false);
      });
  };

  useEffect(() => { fetchListings(); }, []);

  const togglePlatform = (key: string) => {
    setPlatformFilter((prev) => (prev === key ? null : key));
  };

  const filtered = applyFilters(listings, typeFilter, platformFilter);
  const liveCount = listings.filter((l) => l.listing_type === 'live_stream').length;

  return (
    <div style={st.container}>

      {/* ── Header ── */}
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
        <div style={st.headerCenter}>
          <span style={st.headerTitle}>Live Events</span>
          {liveCount > 0 && (
            <span style={st.liveChip}>
              <span style={st.liveDot} />
              {liveCount} LIVE
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAddPlatform(true)}
          style={st.addBtn}
          aria-label="Add platform"
          title="Add Marketplace"
        >
          <Plus size={17} style={{ color: 'var(--color-primary-600)' }} />
        </button>
      </header>

      {/* ── Subtitle ── */}
      <div style={st.subtitle}>
        <span style={st.subtitleText}>
          Track live auctions, reseller platforms, estate sales, and sourcing opportunities.
        </span>
      </div>

      {/* ── Platform quick-tabs ── */}
      <div style={st.platformTabs}>
        {PLATFORM_TABS.map((p) => {
          const isActive = platformFilter === p.key;
          return (
            <button
              key={p.key}
              onClick={() => togglePlatform(p.key)}
              style={{
                ...st.platformTab,
                backgroundColor: isActive ? p.bg : 'var(--color-neutral-50)',
                border: `1.5px solid ${isActive ? p.color : 'var(--color-neutral-100)'}`,
              }}
            >
              <span style={{ ...st.platformTabDot, backgroundColor: p.color }} />
              <span style={{ ...st.platformTabLabel, color: isActive ? p.color : 'var(--color-neutral-700)' }}>
                {p.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Filter chips ── */}
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

      {/* ── Upload Event action bar ── */}
      <div style={st.uploadBar}>
        <span style={st.uploadBarText}>Have an auction or sale to share?</span>
        <button onClick={() => setShowUploadEvent(true)} style={st.uploadBarBtn}>
          <Upload size={12} />
          Upload Event
        </button>
      </div>

      {/* ── Feed ── */}
      <div style={st.feed}>
        {loading && (
          <div style={st.emptyState}>
            <p style={st.emptyText}>Loading sourcing events...</p>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={st.emptyState}>
            <Gavel size={36} style={{ color: 'var(--color-neutral-200)', marginBottom: '14px' }} />
            <p style={st.emptyTitle}>No live sourcing events yet</p>
            <p style={st.emptyText}>
              Be the first to upload an auction, estate sale, yard sale, or marketplace listing.
            </p>
            <button onClick={() => setShowUploadEvent(true)} style={st.emptyBtn}>
              <Upload size={13} />
              Upload an Event
            </button>
          </div>
        )}

        {!loading && filtered.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>

      {/* ── Modals ── */}
      {showAddPlatform && (
        <AddPlatformModal
          userId={user?.id}
          onClose={() => setShowAddPlatform(false)}
          onSuccess={() => setShowAddPlatform(false)}
        />
      )}
      {showUploadEvent && (
        <UploadEventModal
          userId={user?.id}
          onClose={() => setShowUploadEvent(false)}
          onSuccess={() => { setShowUploadEvent(false); fetchListings(); }}
        />
      )}
    </div>
  );
}

// ─── Listing card ─────────────────────────────────────────────────────────────

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
    if (hours >= 1)  return `Ends in ${hours}h ${mins}m`;
    return `Ends in ${mins}m`;
  })();

  return (
    <div style={st.card}>
      {listing.image_url && (
        <div style={st.cardImgWrap}>
          <img src={listing.image_url} alt={listing.title} style={st.cardImg} />
          {isLive && (
            <span style={st.liveBadge}>
              <span style={st.liveBadgeDot} />LIVE
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
            <span style={st.metaItem}><Clock size={10} />{timeInfo}</span>
          )}
          {listing.scout_needed && <span style={st.scoutTag}>Scout Needed</span>}
          {listing.ships_available && <span style={st.shipsTag}>Ships</span>}
        </div>
        <div style={st.cardActions}>
          <a href={listing.external_url} target="_blank" rel="noopener noreferrer" style={st.viewBtn}>
            <ExternalLink size={12} />View Listing
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Add Platform modal ───────────────────────────────────────────────────────

interface PlatformForm {
  platform_name: string;
  website_url: string;
  description: string;
  platform_type: string;
  shipping_supported: boolean;
  scout_friendly: boolean;
  logo_url: string;
}

function AddPlatformModal({ userId, onClose, onSuccess }: { userId?: string; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState<PlatformForm>({
    platform_name: '', website_url: '', description: '',
    platform_type: 'marketplace', shipping_supported: false,
    scout_friendly: false, logo_url: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof PlatformForm, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.platform_name.trim()) { setError('Platform name is required.'); return; }
    setError('');
    setSaving(true);
    const { error: err } = await supabase.from('platform_submissions').insert({
      platform_name: form.platform_name.trim(),
      website_url: form.website_url.trim() || null,
      description: form.description.trim() || null,
      platform_type: form.platform_type,
      shipping_supported: form.shipping_supported,
      scout_friendly: form.scout_friendly,
      logo_url: form.logo_url.trim() || null,
      submitted_by: userId ?? null,
    });
    setSaving(false);
    if (err) { setError('Failed to submit. Please try again.'); return; }
    onSuccess();
  };

  return (
    <div style={mo.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={mo.sheet}>
        <div style={mo.handle} />
        <div style={mo.header}>
          <span style={mo.title}>Add Marketplace</span>
          <button onClick={onClose} style={mo.closeBtn}><X size={18} /></button>
        </div>
        <div style={mo.body}>
          <label style={mo.label}>Platform Name <span style={mo.req}>*</span></label>
          <input style={mo.input} placeholder="e.g. HiBid, MaxSold, OfferUp…" value={form.platform_name} onChange={(e) => set('platform_name', e.target.value)} />

          <label style={mo.label}>Website URL</label>
          <input style={mo.input} placeholder="https://…" type="url" value={form.website_url} onChange={(e) => set('website_url', e.target.value)} />

          <label style={mo.label}>Description</label>
          <textarea style={{ ...mo.input, height: '72px', resize: 'none' }} placeholder="What kind of listings does this platform have?" value={form.description} onChange={(e) => set('description', e.target.value)} />

          <label style={mo.label}>Platform Type</label>
          <div style={mo.selectWrap}>
            <select style={mo.select} value={form.platform_type} onChange={(e) => set('platform_type', e.target.value)}>
              <option value="marketplace">Marketplace</option>
              <option value="auction">Auction</option>
              <option value="live_selling">Live Selling</option>
              <option value="estate_sales">Estate Sales</option>
              <option value="storage_auctions">Storage Auctions</option>
              <option value="local_classifieds">Local Classifieds</option>
            </select>
            <ChevronDown size={13} style={mo.selectIcon} />
          </div>

          <label style={mo.label}>Logo / Image URL (optional)</label>
          <input style={mo.input} placeholder="https://…" value={form.logo_url} onChange={(e) => set('logo_url', e.target.value)} />

          <div style={mo.toggleRow}>
            <div style={mo.toggleItem}>
              <span style={mo.toggleLabel}>Shipping Supported</span>
              <button onClick={() => set('shipping_supported', !form.shipping_supported)} style={mo.toggleBtn}>
                {form.shipping_supported
                  ? <ToggleRight size={28} style={{ color: 'var(--color-success-500)' }} />
                  : <ToggleLeft size={28} style={{ color: 'var(--color-neutral-300)' }} />}
              </button>
            </div>
            <div style={mo.toggleItem}>
              <span style={mo.toggleLabel}>Scout Friendly</span>
              <button onClick={() => set('scout_friendly', !form.scout_friendly)} style={mo.toggleBtn}>
                {form.scout_friendly
                  ? <ToggleRight size={28} style={{ color: 'var(--color-warning-500)' }} />
                  : <ToggleLeft size={28} style={{ color: 'var(--color-neutral-300)' }} />}
              </button>
            </div>
          </div>

          {error && <p style={mo.errorText}>{error}</p>}
          <button onClick={handleSubmit} disabled={saving} style={{ ...mo.submitBtn, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Submitting…' : 'Submit Marketplace'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Upload Event modal ───────────────────────────────────────────────────────

interface EventForm {
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

function UploadEventModal({ userId, onClose, onSuccess }: { userId?: string; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState<EventForm>({
    title: '', platform: 'other', listing_type: 'auction',
    external_url: '', price_display: '', category: '',
    image_url: '', ends_at: '', scout_needed: false, ships_available: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof EventForm, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!form.external_url.trim()) { setError('External URL is required.'); return; }
    setError('');
    setSaving(true);
    const { error: err } = await supabase.from('external_listings').insert({
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
    });
    setSaving(false);
    if (err) { setError('Failed to submit. Please try again.'); return; }
    onSuccess();
  };

  return (
    <div style={mo.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={mo.sheet}>
        <div style={mo.handle} />
        <div style={mo.header}>
          <span style={mo.title}>Upload Event</span>
          <button onClick={onClose} style={mo.closeBtn}><X size={18} /></button>
        </div>
        <div style={mo.body}>
          <label style={mo.label}>Title <span style={mo.req}>*</span></label>
          <input style={mo.input} placeholder="e.g. HiBid Estate Auction — Chicago" value={form.title} onChange={(e) => set('title', e.target.value)} />

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

          <label style={mo.label}><Calendar size={11} style={{ marginRight: '4px' }} />End Date / Time</label>
          <input style={mo.input} type="datetime-local" value={form.ends_at} onChange={(e) => set('ends_at', e.target.value)} />

          <label style={mo.label}>Image URL</label>
          <input style={mo.input} placeholder="https://…" value={form.image_url} onChange={(e) => set('image_url', e.target.value)} />

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
            {saving ? 'Submitting…' : 'Submit Event'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st: Record<string, React.CSSProperties> = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--color-neutral-0)' },

  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-neutral-100)', flexShrink: 0 },
  backBtn: { width: '36px', height: '36px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-neutral-600)' },
  headerCenter: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  headerTitle: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  liveChip: { display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-error-50)', border: '1px solid var(--color-error-200)' },
  liveDot: { width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--color-error-500)', animation: 'pulse 2s infinite', flexShrink: 0 },
  addBtn: { width: '36px', height: '36px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-primary-50)', border: '1px solid var(--color-primary-200)' },

  subtitle: { padding: '8px var(--space-4) 0', flexShrink: 0 },
  subtitleText: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)', lineHeight: 1.4 },

  platformTabs: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-4)', flexShrink: 0 },
  platformTab: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', padding: '9px var(--space-2)', borderRadius: 'var(--radius-md)', transition: 'background 0.15s, border-color 0.15s' },
  platformTabDot: { width: '10px', height: '10px', borderRadius: '50%' },
  platformTabLabel: { fontSize: '10px', fontWeight: 700, textAlign: 'center' as const },

  filterRow: { display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-4)', overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0, borderTop: '1px solid var(--color-neutral-50)' },
  chip: { flexShrink: 0, padding: '5px 12px', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-600)', backgroundColor: 'var(--color-neutral-100)', border: '1px solid transparent' },
  chipActive: { backgroundColor: 'var(--color-primary-600)', color: 'var(--color-neutral-0)', border: '1px solid var(--color-primary-600)' },

  uploadBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px var(--space-4)', backgroundColor: 'var(--color-neutral-50)', borderTop: '1px solid var(--color-neutral-100)', borderBottom: '1px solid var(--color-neutral-100)', flexShrink: 0 },
  uploadBarText: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },
  uploadBarBtn: { display: 'flex', alignItems: 'center', gap: '5px', fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary-600)', padding: '5px 12px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-primary-50)', border: '1px solid var(--color-primary-200)' },

  feed: { flex: 1, overflowY: 'auto', padding: 'var(--space-3) var(--space-4)' },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center' },
  emptyTitle: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-700)', marginBottom: '6px' },
  emptyText: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-400)', marginBottom: '20px', lineHeight: 1.5 },
  emptyBtn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-primary-600)', color: 'var(--color-neutral-0)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)' },

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
  errorText: { fontSize: 'var(--font-size-xs)', color: 'var(--color-error-600)', marginTop: 'var(--space-2)', padding: '8px 12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-error-50)' },
  submitBtn: { width: '100%', padding: '13px', borderRadius: 'var(--radius-full)', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))', color: '#fff', fontSize: 'var(--font-size-sm)', fontWeight: 700, marginTop: 'var(--space-4)', cursor: 'pointer', transition: 'opacity 0.2s' },
};
