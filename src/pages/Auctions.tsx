import { useState, useEffect } from 'react';
import {
  ArrowLeft, ExternalLink, Radio, Gavel, Tag, MapPin,
  Users, Package, Truck, Plus, X, Clock, ChevronDown,
  Loader, Home,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useGuestAction } from '../components/GuestGate';
import { supabase } from '../lib/supabase';
import LocationFields, { isValidGeneralLocation, type LocationValue } from '../components/listing/LocationFields';
import PickupTypeChips from '../components/listing/PickupTypeChips';
import MarketplaceFoundSelect from '../components/listing/MarketplaceFoundSelect';
import ScoutToggles from '../components/listing/ScoutToggles';
import SafetyReminder from '../components/listing/SafetyReminder';
import LogisticsBlock from '../components/listing/LogisticsBlock';
import ReportListingButton from '../components/listing/ReportListingButton';

type HubView = 'feed' | 'detail' | 'submit';

interface ExternalListing {
  id: string;
  user_id: string;
  platform: string;
  platform_label: string;
  listing_type: string;
  title: string;
  description: string;
  image_url: string | null;
  external_url: string;
  price_display: string;
  category: string;
  condition: string;
  ships_available: boolean;
  local_pickup: boolean;
  ends_at: string | null;
  location: string;
  scout_needed: boolean;
  status: string;
  created_at: string;
  profiles?: { username: string | null; scout_verified: boolean };
}

const PLATFORMS = [
  { id: 'whatnot',    label: 'Whatnot',         color: '#FF6B35', bg: '#FFF3EE' },
  { id: 'poshmark',   label: 'Poshmark',         color: '#C13584', bg: '#FCF0F7' },
  { id: 'ebay',       label: 'eBay',             color: '#0064D2', bg: '#EBF3FF' },
  { id: 'hibid',      label: 'HiBid',            color: '#1A5276', bg: '#EBF5FB' },
  { id: 'maxsold',    label: 'MaxSold',          color: '#148F77', bg: '#E8F8F5' },
  { id: 'estatesales',label: 'EstateSales.net',  color: '#8B4513', bg: '#FDF3E7' },
  { id: 'facebook',   label: 'FB Marketplace',   color: '#1877F2', bg: '#EBF3FF' },
  { id: 'other',      label: 'Other',            color: '#6B7280', bg: '#F3F4F6' },
];

const TYPE_CHIPS = [
  { id: 'all',         label: 'All' },
  { id: 'live_stream', label: 'Live Streams' },
  { id: 'auction',     label: 'Auctions' },
  { id: 'fixed',       label: 'Fixed Price' },
  { id: 'estate',      label: 'Estate Sales' },
];

const EXTRA_CHIPS = [
  { id: 'local',    label: 'Local Pickup' },
  { id: 'ships',    label: 'Ships Available' },
  { id: 'scout',    label: 'Scout Needed' },
];

const CATEGORIES = ['All', 'Fashion', 'Collectibles', 'Electronics', 'Furniture', 'Jewelry', 'Art', 'Watches', 'Books'];

const CONDITIONS = ['Like New', 'Excellent', 'Good', 'Fair', 'For Parts'];

function getPlatform(id: string) {
  return PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[PLATFORMS.length - 1];
}

function getTypeLabel(type: string) {
  const map: Record<string, string> = {
    live_stream: 'Live Stream',
    auction: 'Auction',
    fixed: 'Fixed Price',
    estate: 'Estate Sale',
  };
  return map[type] ?? type;
}

function getTypeIcon(type: string, size = 12) {
  if (type === 'live_stream') return <Radio size={size} />;
  if (type === 'auction') return <Gavel size={size} />;
  if (type === 'estate') return <Home size={size} />;
  return <Tag size={size} />;
}

function timeUntil(iso: string | null): string | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'Ended';
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}m left`;
  if (h < 24) return `${h}h left`;
  return `${Math.floor(h / 24)}d left`;
}

export default function Auctions({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<HubView>('feed');
  const [selected, setSelected] = useState<ExternalListing | null>(null);

  if (view === 'detail' && selected) {
    return (
      <ListingDetail
        listing={selected}
        onBack={() => setView('feed')}
        onListingUpdate={(updated) => setSelected(updated)}
      />
    );
  }

  return (
    <>
      <HubFeed
        onBack={onBack}
        onOpen={(item) => { setSelected(item); setView('detail'); }}
        onSubmit={() => setView('submit')}
      />
      {view === 'submit' && (
        <SubmitSheet onClose={() => setView('feed')} onSuccess={() => setView('feed')} />
      )}
    </>
  );
}

function HubFeed({
  onBack,
  onOpen,
  onSubmit,
}: {
  onBack: () => void;
  onOpen: (item: ExternalListing) => void;
  onSubmit: () => void;
}) {
  const { requireAuth } = useGuestAction();

  const [listings, setListings] = useState<ExternalListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [extraFilter, setExtraFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('All');

  useEffect(() => {
    supabase
      .from('external_listings')
      .select('*, profiles(username, scout_verified)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(60)
      .then(({ data }) => {
        if (data) setListings(data as ExternalListing[]);
        setLoading(false);
      });
  }, []);

  const filtered = listings.filter((l) => {
    if (typeFilter !== 'all' && l.listing_type !== typeFilter) return false;
    if (categoryFilter !== 'All' && l.category.toLowerCase() !== categoryFilter.toLowerCase()) return false;
    if (extraFilter === 'local' && !l.local_pickup) return false;
    if (extraFilter === 'ships' && !l.ships_available) return false;
    if (extraFilter === 'scout' && !l.scout_needed) return false;
    return true;
  });

  const liveCount = listings.filter((l) => l.listing_type === 'live_stream').length;

  return (
    <div style={st.container}>
      <header style={st.header}>
        <div style={st.headerRow}>
          <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
          <div>
            <h1 style={st.title}>Marketplace Hub</h1>
            <p style={st.subtitle}>External listings, live streams & auctions</p>
          </div>
          <button onClick={() => requireAuth(onSubmit)} style={st.addBtn}>
            <Plus size={16} style={{ color: 'var(--color-neutral-0)' }} />
          </button>
        </div>
      </header>

      {liveCount > 0 && (
        <div style={st.liveBanner}>
          <span style={st.liveDot} />
          <span style={st.liveText}>{liveCount} live stream{liveCount > 1 ? 's' : ''} active now</span>
        </div>
      )}

      <div style={st.filtersWrap}>
        <div style={st.filterRow}>
          {TYPE_CHIPS.map((chip) => (
            <button
              key={chip.id}
              onClick={() => setTypeFilter(chip.id)}
              style={{ ...st.chip, ...(typeFilter === chip.id ? st.chipActive : {}) }}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div style={st.filterRow}>
          {EXTRA_CHIPS.map((chip) => (
            <button
              key={chip.id}
              onClick={() => setExtraFilter(extraFilter === chip.id ? null : chip.id)}
              style={{ ...st.chip, ...(extraFilter === chip.id ? st.chipActiveAlt : {}) }}
            >
              {chip.label}
            </button>
          ))}
          {CATEGORIES.filter((c) => c !== 'All').map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(categoryFilter === cat ? 'All' : cat)}
              style={{ ...st.chip, ...(categoryFilter === cat ? st.chipActiveAlt : {}) }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div style={st.feed}>
        {loading && (
          <div style={st.centered}>
            <Loader size={24} style={{ color: 'var(--color-neutral-300)', animation: 'spin 0.8s linear infinite' }} />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={st.emptyWrap}>
            <Gavel size={40} style={{ color: 'var(--color-neutral-200)', marginBottom: '12px' }} />
            <p style={st.emptyTitle}>No listings yet</p>
            <p style={st.emptyBody}>
              {listings.length === 0
                ? 'Be the first to share an external auction, live stream, or listing from Whatnot, eBay, Poshmark, and more.'
                : 'No listings match your current filters.'}
            </p>
            {listings.length === 0 && (
              <button onClick={() => requireAuth(onSubmit)} style={st.emptyBtn}>
                <Plus size={14} /> Share a Listing
              </button>
            )}
          </div>
        )}

        {filtered.map((item, i) => (
          <ExternalListingCard
            key={item.id}
            listing={item}
            delay={i * 60}
            onOpen={() => onOpen(item)}
          />
        ))}
      </div>
    </div>
  );
}

function ExternalListingCard({
  listing,
  delay,
  onOpen,
}: {
  listing: ExternalListing;
  delay: number;
  onOpen: () => void;
}) {
  const plat = getPlatform(listing.platform);
  const displayLabel = listing.platform === 'other' && listing.platform_label
    ? listing.platform_label
    : plat.label;
  const timer = timeUntil(listing.ends_at);
  const isLive = listing.listing_type === 'live_stream';

  return (
    <article
      style={{ ...st.card, animationDelay: `${delay}ms` }}
      onClick={onOpen}
    >
      {listing.image_url ? (
        <div style={st.cardImgWrap}>
          <img src={listing.image_url} alt={listing.title} style={st.cardImg} loading="lazy" />
          {isLive && <span style={st.livePill}><Radio size={9} /> LIVE</span>}
        </div>
      ) : (
        <div style={{ ...st.cardImgWrap, ...st.cardImgPlaceholder }}>
          {getTypeIcon(listing.listing_type, 28)}
          {isLive && <span style={st.livePill}><Radio size={9} /> LIVE</span>}
        </div>
      )}

      <div style={st.cardBody}>
        <div style={st.cardTopRow}>
          <span style={{ ...st.platformBadge, color: plat.color, backgroundColor: plat.bg }}>
            {displayLabel}
          </span>
          <span style={st.typeBadge}>{getTypeIcon(listing.listing_type, 10)} {getTypeLabel(listing.listing_type)}</span>
        </div>

        <h3 style={st.cardTitle}>{listing.title}</h3>

        <div style={st.cardMeta}>
          {listing.price_display && (
            <span style={st.priceTag}>{listing.price_display}</span>
          )}
          {listing.location && (
            <span style={st.metaItem}><MapPin size={10} /> {listing.location}</span>
          )}
          {timer && (
            <span style={{ ...st.metaItem, color: timer === 'Ended' ? 'var(--color-error-500)' : 'var(--color-neutral-500)' }}>
              <Clock size={10} /> {timer}
            </span>
          )}
        </div>

        <div style={st.cardFooter}>
          <div style={st.cardBadges}>
            {listing.ships_available && (
              <span style={st.shippingBadge}><Truck size={9} /> Ships</span>
            )}
            {listing.local_pickup && (
              <span style={st.pickupBadge}><Package size={9} /> Pickup</span>
            )}
            {listing.scout_needed && (
              <span style={st.scoutBadge}><Users size={9} /> Scout Needed</span>
            )}
          </div>
          <span style={st.cardBy}>@{listing.profiles?.username ?? 'hunter'}</span>
        </div>
      </div>
    </article>
  );
}

function ListingDetail({
  listing,
  onBack,
  onListingUpdate,
}: {
  listing: ExternalListing;
  onBack: () => void;
  onListingUpdate: (l: ExternalListing) => void;
}) {
  const { user } = useAuth();
  const [scoutLoading, setScoutLoading] = useState(false);
  const [offerSent, setOfferSent] = useState(false);

  const plat = getPlatform(listing.platform);
  const displayLabel = listing.platform === 'other' && listing.platform_label
    ? listing.platform_label
    : plat.label;
  const timer = timeUntil(listing.ends_at);
  const isAuctionType = listing.listing_type === 'live_stream' || listing.listing_type === 'auction';

  const openListing = () => window.open(listing.external_url, '_blank', 'noopener,noreferrer');

  const handleScoutNeeded = async () => {
    if (!user) return;
    setScoutLoading(true);
    const { data } = await supabase
      .from('external_listings')
      .update({ scout_needed: true })
      .eq('id', listing.id)
      .select()
      .maybeSingle();
    setScoutLoading(false);
    if (data) onListingUpdate(data as ExternalListing);
  };

  const handleOfferScout = () => {
    setOfferSent(true);
  };

  return (
    <div style={st.container}>
      <header style={st.stepHeader}>
        <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
        <span style={st.stepTitle}>Listing Detail</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={st.detailScroll}>
        {listing.image_url ? (
          <div style={st.detailImgWrap}>
            <img src={listing.image_url} alt={listing.title} style={st.detailImg} />
            {listing.listing_type === 'live_stream' && (
              <span style={st.detailLivePill}><Radio size={11} /> LIVE NOW</span>
            )}
          </div>
        ) : (
          <div style={st.detailImgPlaceholder}>
            {getTypeIcon(listing.listing_type, 48)}
          </div>
        )}

        <div style={st.detailBody}>
          <div style={st.detailTopRow}>
            <span style={{ ...st.platformBadgeLg, color: plat.color, backgroundColor: plat.bg }}>
              {displayLabel}
            </span>
            <span style={st.typeBadgeLg}>
              {getTypeIcon(listing.listing_type, 12)} {getTypeLabel(listing.listing_type)}
            </span>
          </div>

          <h2 style={st.detailTitle}>{listing.title}</h2>

          {listing.price_display && (
            <p style={st.detailPrice}>{listing.price_display}</p>
          )}

          <div style={st.detailInfoRow}>
            {listing.location && (
              <span style={st.detailInfoItem}><MapPin size={12} /> {listing.location}</span>
            )}
            {timer && (
              <span style={{
                ...st.detailInfoItem,
                color: timer === 'Ended' ? 'var(--color-error-600)' : 'var(--color-neutral-600)',
                fontWeight: 'var(--font-weight-semibold)',
              }}>
                <Clock size={12} /> {timer}
              </span>
            )}
            {listing.ends_at && !timer?.includes('Ended') && (
              <span style={st.detailInfoItem}>
                Ends {new Date(listing.ends_at).toLocaleDateString()}
              </span>
            )}
          </div>

          {listing.description && (
            <p style={st.detailDesc}>{listing.description}</p>
          )}

          <div style={st.detailBadgeRow}>
            {listing.condition && listing.condition !== 'good' && (
              <span style={st.condBadge}>{listing.condition}</span>
            )}
            {listing.category && listing.category !== 'other' && (
              <span style={st.catBadgeDetail}>{listing.category}</span>
            )}
            {listing.ships_available && (
              <span style={st.shippingBadge}><Truck size={10} /> Ships Nationwide</span>
            )}
            {listing.local_pickup && (
              <span style={st.pickupBadge}><Package size={10} /> Local Pickup</span>
            )}
          </div>

          <div style={st.detailBy}>
            <span style={st.detailByText}>Shared by @{listing.profiles?.username ?? 'hunter'}</span>
            {listing.profiles?.scout_verified && (
              <span style={st.verifiedBadge}>Verified Scout</span>
            )}
          </div>

          <div style={st.actionBlock}>
            <button onClick={openListing} style={st.primaryActionBtn}>
              <ExternalLink size={16} />
              Open Original Listing
            </button>

            {isAuctionType && (
              <button onClick={openListing} style={st.watchBtn}>
                {listing.listing_type === 'live_stream' ? <Radio size={15} /> : <Gavel size={15} />}
                {listing.listing_type === 'live_stream' ? 'Watch Live Stream' : 'Watch Auction'}
              </button>
            )}
          </div>

          <div style={{ marginTop: 'var(--space-3)' }}>
            <LogisticsBlock
              generalLocation={(listing as ExternalListing & Record<string, unknown>).general_location as string || listing.location}
              marketplaceFound={(listing as ExternalListing & Record<string, unknown>).marketplace_found as string}
              pickupType={(listing as ExternalListing & Record<string, unknown>).pickup_type as string[]}
              shippingAvailable={listing.ships_available}
              scoutNeeded={listing.scout_needed}
              scoutsAvailable={(listing as ExternalListing & Record<string, unknown>).scouts_available as boolean}
              meetupNotes={(listing as ExternalListing & Record<string, unknown>).meetup_notes as string}
              hasPrivateAddress={Boolean((listing as ExternalListing & Record<string, unknown>).exact_address_private)}
              addressRevealPolicy={(listing as ExternalListing & Record<string, unknown>).address_reveal_policy as string}
            />
          </div>

          <SafetyReminder variant="detail" />

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
            <ReportListingButton table="external_listings" listingId={listing.id} />
          </div>

          <div style={st.scoutBlock}>
            <h3 style={st.scoutBlockTitle}>Scout Coordination</h3>
            <p style={st.scoutBlockDesc}>
              Need someone local to inspect, bid in-person, or pick up this item?
            </p>
            <div style={st.scoutBtnRow}>
              {!listing.scout_needed ? (
                <button
                  onClick={handleScoutNeeded}
                  disabled={scoutLoading}
                  style={st.needScoutBtn}
                >
                  {scoutLoading
                    ? <Loader size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                    : <Users size={14} />}
                  I Need a Scout
                </button>
              ) : (
                <span style={st.scoutNeededPill}>
                  <Users size={12} /> Scout Requested
                </span>
              )}

              {!offerSent ? (
                <button onClick={handleOfferScout} style={st.offerScoutBtn}>
                  <Users size={14} />
                  Offer Scout Services
                </button>
              ) : (
                <span style={st.offerSentPill}>Scout offer sent!</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SubmitSheet({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { user } = useAuth();
  const [step, setStep] = useState<'platform' | 'details' | 'meta'>('platform');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    platform: '',
    platform_label: '',
    listing_type: 'auction',
    external_url: '',
    title: '',
    description: '',
    image_url: '',
    price_display: '',
    category: 'other',
    condition: 'Good',
    ships_available: false,
    local_pickup: false,
    ends_at: '',
    location: '',
    scout_needed: false,
    general_location: '',
    exact_address_private: '',
    address_reveal_policy: 'on_contact' as 'on_contact' | 'on_appointment' | 'on_purchase' | 'never',
    pickup_type: [] as string[],
    scouts_available: false,
    meetup_notes: '',
    marketplace_key: '',
    marketplace_custom: '',
  });

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const canProceedStep1 = form.platform !== '' && form.external_url.trim() !== '' && form.listing_type !== '';
  const canProceedStep2 = form.title.trim() !== '';

  const handleSubmit = async () => {
    if (!user) return;
    setSaving(true);
    setError('');
    if (!isValidGeneralLocation(form.general_location)) {
      setError('Add a general location — ZIP or "City, ST" — so buyers can filter.');
      setSaving(false);
      return;
    }
    if (form.marketplace_key === 'other' && !form.marketplace_custom.trim()) {
      setError('Please enter the marketplace name, or pick a different option.');
      setSaving(false);
      return;
    }
    const marketplaceValue = form.marketplace_key === 'other' && form.marketplace_custom.trim()
      ? `custom:${form.marketplace_custom.trim()}`
      : form.marketplace_key || null;
    const { error: err } = await supabase.from('external_listings').insert({
      user_id: user.id,
      platform: form.platform,
      platform_label: form.platform_label,
      listing_type: form.listing_type,
      external_url: form.external_url.trim(),
      title: form.title.trim(),
      description: form.description.trim(),
      image_url: form.image_url.trim() || null,
      price_display: form.price_display.trim(),
      category: form.category,
      condition: form.condition,
      ships_available: form.ships_available || form.pickup_type.includes('shipping_available') || form.pickup_type.includes('nationwide_shipping'),
      local_pickup: form.local_pickup || form.pickup_type.includes('local_pickup'),
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      location: form.general_location || form.location.trim(),
      scout_needed: form.scout_needed,
      status: 'active',
      general_location: form.general_location,
      exact_address_private: form.exact_address_private.trim() || null,
      address_reveal_policy: form.address_reveal_policy,
      pickup_type: form.pickup_type,
      scouts_available: form.scouts_available,
      meetup_notes: form.meetup_notes.trim() || null,
      marketplace_found: marketplaceValue,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSuccess();
  };

  return (
    <div style={sh.overlay} onClick={onClose}>
      <div style={sh.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={sh.handle} />

        <div style={sh.sheetHeader}>
          <span style={sh.sheetTitle}>Share a Listing</span>
          <button onClick={onClose} style={sh.closeBtn}><X size={18} /></button>
        </div>

        <div style={sh.steps}>
          {(['platform', 'details', 'meta'] as const).map((s, i) => (
            <div key={s} style={sh.stepItem}>
              <div style={{
                ...sh.stepDot,
                ...(step === s ? sh.stepDotActive : {}),
                ...((['platform', 'details', 'meta'].indexOf(step) > i) ? sh.stepDotDone : {}),
              }} />
              <span style={{ ...sh.stepLabel, ...(step === s ? sh.stepLabelActive : {}) }}>
                {['Platform', 'Details', 'Info'][i]}
              </span>
            </div>
          ))}
        </div>

        <div style={sh.body}>
          {step === 'platform' && (
            <div style={sh.section}>
              <label style={sh.label}>Platform *</label>
              <div style={sh.platformGrid}>
                {PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => set('platform', p.id)}
                    style={{
                      ...sh.platformBtn,
                      borderColor: form.platform === p.id ? p.color : 'var(--color-neutral-200)',
                      backgroundColor: form.platform === p.id ? p.bg : 'var(--color-neutral-0)',
                    }}
                  >
                    <span style={{ ...sh.platformBtnLabel, color: form.platform === p.id ? p.color : 'var(--color-neutral-700)' }}>
                      {p.label}
                    </span>
                  </button>
                ))}
              </div>
              {form.platform === 'other' && (
                <input
                  placeholder="Platform name (e.g. Craigslist)"
                  value={form.platform_label}
                  onChange={(e) => set('platform_label', e.target.value)}
                  style={sh.input}
                />
              )}

              <label style={{ ...sh.label, marginTop: '16px' }}>Listing Type *</label>
              <div style={sh.typeRow}>
                {[
                  { id: 'live_stream', label: 'Live Stream', icon: <Radio size={14} /> },
                  { id: 'auction',     label: 'Auction',     icon: <Gavel size={14} /> },
                  { id: 'fixed',       label: 'Fixed Price', icon: <Tag size={14} /> },
                  { id: 'estate',      label: 'Estate Sale', icon: <Home size={14} /> },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => set('listing_type', t.id)}
                    style={{
                      ...sh.typeBtn,
                      ...(form.listing_type === t.id ? sh.typeBtnActive : {}),
                    }}
                  >
                    {t.icon}
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>

              <label style={{ ...sh.label, marginTop: '16px' }}>Listing URL *</label>
              <input
                type="url"
                placeholder="https://whatnot.com/stream/..."
                value={form.external_url}
                onChange={(e) => set('external_url', e.target.value)}
                style={sh.input}
                inputMode="url"
              />
            </div>
          )}

          {step === 'details' && (
            <div style={sh.section}>
              <label style={sh.label}>Title *</label>
              <input
                placeholder="What are you listing?"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                style={sh.input}
                maxLength={120}
              />

              <label style={{ ...sh.label, marginTop: '12px' }}>Description</label>
              <textarea
                placeholder="Add any useful details — condition, lot contents, etc."
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                style={sh.textarea}
                rows={3}
              />

              <label style={{ ...sh.label, marginTop: '12px' }}>Price / Starting Bid</label>
              <input
                placeholder="e.g. $25, Starting at $100, Make Offer"
                value={form.price_display}
                onChange={(e) => set('price_display', e.target.value)}
                style={sh.input}
              />

              <label style={{ ...sh.label, marginTop: '12px' }}>Image URL (optional)</label>
              <input
                type="url"
                placeholder="https://..."
                value={form.image_url}
                onChange={(e) => set('image_url', e.target.value)}
                style={sh.input}
                inputMode="url"
              />
            </div>
          )}

          {step === 'meta' && (
            <div style={sh.section}>
              <label style={sh.label}>Category</label>
              <div style={sh.selectWrap}>
                <select
                  value={form.category}
                  onChange={(e) => set('category', e.target.value)}
                  style={sh.select}
                >
                  {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                    <option key={c} value={c.toLowerCase()}>{c}</option>
                  ))}
                  <option value="other">Other</option>
                </select>
                <ChevronDown size={14} style={sh.selectIcon} />
              </div>

              <label style={{ ...sh.label, marginTop: '12px' }}>Condition</label>
              <div style={sh.selectWrap}>
                <select
                  value={form.condition}
                  onChange={(e) => set('condition', e.target.value)}
                  style={sh.select}
                >
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <ChevronDown size={14} style={sh.selectIcon} />
              </div>

              <label style={{ ...sh.label, marginTop: '12px' }}>Ends At (optional)</label>
              <input
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => set('ends_at', e.target.value)}
                style={sh.input}
              />

              <div style={{ marginTop: 12 }}>
                <LocationFields
                  value={{
                    general_location: form.general_location,
                    exact_address_private: form.exact_address_private,
                    address_reveal_policy: form.address_reveal_policy,
                  }}
                  onChange={(v: LocationValue) => {
                    set('general_location', v.general_location);
                    set('exact_address_private', v.exact_address_private);
                    set('address_reveal_policy', v.address_reveal_policy);
                    set('location', v.general_location);
                  }}
                />
              </div>

              <div style={{ marginTop: 12 }}>
                <MarketplaceFoundSelect
                  value={form.marketplace_key}
                  customValue={form.marketplace_custom}
                  onChange={(key, custom) => { set('marketplace_key', key); set('marketplace_custom', custom); }}
                  label="Source / Marketplace (optional)"
                />
              </div>

              <div style={{ marginTop: 12 }}>
                <PickupTypeChips
                  value={form.pickup_type}
                  onChange={(next) => {
                    set('pickup_type', next);
                    set('ships_available', next.includes('shipping_available') || next.includes('nationwide_shipping'));
                    set('local_pickup', next.includes('local_pickup'));
                  }}
                />
              </div>

              <div style={{ marginTop: 12 }}>
                <ScoutToggles
                  scoutNeeded={form.scout_needed}
                  scoutsAvailable={form.scouts_available}
                  onChange={(v) => { set('scout_needed', v.scout_needed); set('scouts_available', v.scouts_available); }}
                />
              </div>

              <label style={{ ...sh.label, marginTop: '12px' }}>Meetup Notes (optional)</label>
              <textarea
                placeholder="Pickup logistics, best times, parking…"
                value={form.meetup_notes}
                onChange={(e) => set('meetup_notes', e.target.value)}
                style={sh.textarea}
                rows={2}
              />

              <div style={{ marginTop: 12 }}>
                <SafetyReminder />
              </div>

              {error && <p style={sh.errorText}>{error}</p>}
            </div>
          )}
        </div>

        <div style={sh.footer}>
          {step !== 'platform' && (
            <button
              onClick={() => setStep(step === 'meta' ? 'details' : 'platform')}
              style={sh.backStepBtn}
            >
              Back
            </button>
          )}
          {step === 'platform' && (
            <button
              onClick={() => setStep('details')}
              disabled={!canProceedStep1}
              style={{ ...sh.nextBtn, ...(canProceedStep1 ? {} : sh.nextBtnDisabled) }}
            >
              Next
            </button>
          )}
          {step === 'details' && (
            <button
              onClick={() => setStep('meta')}
              disabled={!canProceedStep2}
              style={{ ...sh.nextBtn, ...(canProceedStep2 ? {} : sh.nextBtnDisabled) }}
            >
              Next
            </button>
          )}
          {step === 'meta' && (
            <button
              onClick={handleSubmit}
              disabled={saving}
              style={sh.submitBtn}
            >
              {saving ? <Loader size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : null}
              Share Listing
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: 'var(--color-neutral-0)',
  },
  header: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-3)',
  },
  backBtn: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-100)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    flex: 1,
  },
  subtitle: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
    marginTop: '1px',
  },
  addBtn: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-600)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  liveBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: 'var(--color-error-50)',
    borderBottom: '1px solid var(--color-error-100)',
    flexShrink: 0,
  },
  liveDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-error-500)',
    animation: 'pulse 1.5s ease-in-out infinite',
    flexShrink: 0,
  },
  liveText: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-error-700)',
  },
  filtersWrap: {
    flexShrink: 0,
    borderBottom: '1px solid var(--color-neutral-100)',
    backgroundColor: 'var(--color-neutral-0)',
  },
  filterRow: {
    display: 'flex',
    gap: '6px',
    padding: '8px 16px',
    overflowX: 'auto',
  },
  chip: {
    padding: '5px 12px',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    whiteSpace: 'nowrap',
    backgroundColor: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-600)',
    flexShrink: 0,
    border: '1px solid transparent',
  },
  chipActive: {
    backgroundColor: 'var(--color-neutral-900)',
    color: 'var(--color-neutral-0)',
  },
  chipActiveAlt: {
    backgroundColor: 'var(--color-primary-50)',
    color: 'var(--color-primary-700)',
    border: '1px solid var(--color-primary-200)',
  },
  feed: {
    flex: 1,
    overflow: 'auto',
    padding: '12px 16px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  centered: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '48px 0',
  },
  emptyWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: '48px 24px',
  },
  emptyTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-700)',
    marginBottom: '8px',
  },
  emptyBody: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-400)',
    lineHeight: '1.55',
    marginBottom: '20px',
    maxWidth: '300px',
  },
  emptyBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 20px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-600)',
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
  },

  // Card
  card: {
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--color-neutral-100)',
    overflow: 'hidden',
    backgroundColor: 'var(--color-neutral-0)',
    boxShadow: 'var(--shadow-sm)',
    cursor: 'pointer',
    animation: 'slideUp 0.35s ease forwards',
    opacity: 0,
    animationFillMode: 'forwards',
  },
  cardImgWrap: {
    position: 'relative',
    width: '100%',
    aspectRatio: '16/9',
    overflow: 'hidden',
    backgroundColor: 'var(--color-neutral-100)',
  },
  cardImgPlaceholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-neutral-300)',
  },
  cardImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  livePill: {
    position: 'absolute',
    top: '8px',
    left: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-error-500)',
    color: 'white',
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    letterSpacing: '0.5px',
  },
  cardBody: {
    padding: '12px',
  },
  cardTopRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '6px',
  },
  platformBadge: {
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
  },
  typeBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    padding: '2px 7px',
    borderRadius: 'var(--radius-full)',
    fontSize: '10px',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-600)',
  },
  cardTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
    marginBottom: '6px',
    lineHeight: '1.35',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  cardMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '8px',
  },
  priceTag: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-700)',
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardBadges: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
  },
  shippingBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    padding: '2px 7px',
    borderRadius: 'var(--radius-full)',
    fontSize: '10px',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-success-50)',
    color: 'var(--color-success-700)',
  },
  pickupBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    padding: '2px 7px',
    borderRadius: 'var(--radius-full)',
    fontSize: '10px',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-warning-50)',
    color: 'var(--color-warning-700)',
  },
  scoutBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    padding: '2px 7px',
    borderRadius: 'var(--radius-full)',
    fontSize: '10px',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-primary-50)',
    color: 'var(--color-primary-700)',
  },
  cardBy: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },

  // Detail
  stepHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4)',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  stepTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },
  detailScroll: {
    flex: 1,
    overflow: 'auto',
    paddingBottom: '32px',
  },
  detailImgWrap: {
    position: 'relative',
    width: '100%',
    aspectRatio: '4/3',
    overflow: 'hidden',
    backgroundColor: 'var(--color-neutral-100)',
  },
  detailImgPlaceholder: {
    width: '100%',
    aspectRatio: '4/3',
    backgroundColor: 'var(--color-neutral-100)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-neutral-300)',
  },
  detailImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  detailLivePill: {
    position: 'absolute',
    top: '12px',
    left: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '5px 12px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-error-500)',
    color: 'white',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    letterSpacing: '0.5px',
  },
  detailBody: {
    padding: '16px',
  },
  detailTopRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '10px',
  },
  platformBadgeLg: {
    padding: '4px 12px',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
  },
  typeBadgeLg: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 10px',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-600)',
  },
  detailTitle: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    marginBottom: '6px',
    lineHeight: '1.3',
  },
  detailPrice: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-700)',
    marginBottom: '8px',
  },
  detailInfoRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '12px',
  },
  detailInfoItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-600)',
  },
  detailDesc: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-600)',
    lineHeight: '1.6',
    marginBottom: '14px',
  },
  detailBadgeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginBottom: '12px',
  },
  condBadge: {
    padding: '3px 10px',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-700)',
  },
  catBadgeDetail: {
    padding: '3px 10px',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-accent-50)',
    color: 'var(--color-accent-700)',
  },
  detailBy: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '20px',
    paddingBottom: '16px',
    borderBottom: '1px solid var(--color-neutral-100)',
  },
  detailByText: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  verifiedBadge: {
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    backgroundColor: 'var(--color-success-50)',
    color: 'var(--color-success-700)',
  },
  actionBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '24px',
  },
  primaryActionBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '14px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-primary-600)',
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
    width: '100%',
  },
  watchBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-error-50)',
    color: 'var(--color-error-700)',
    border: '1px solid var(--color-error-200)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    width: '100%',
  },
  scoutBlock: {
    backgroundColor: 'var(--color-primary-50)',
    border: '1px solid var(--color-primary-100)',
    borderRadius: 'var(--radius-lg)',
    padding: '16px',
  },
  scoutBlockTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-900)',
    marginBottom: '4px',
  },
  scoutBlockDesc: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-primary-700)',
    marginBottom: '14px',
    lineHeight: '1.5',
  },
  scoutBtnRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  needScoutBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 16px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-primary-600)',
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    flex: 1,
    justifyContent: 'center',
  },
  scoutNeededPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '10px 16px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-success-50)',
    color: 'var(--color-success-700)',
    border: '1px solid var(--color-success-200)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    flex: 1,
    justifyContent: 'center',
  },
  offerScoutBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 16px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-0)',
    color: 'var(--color-primary-700)',
    border: '1px solid var(--color-primary-300)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    flex: 1,
    justifyContent: 'center',
  },
  offerSentPill: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '10px 16px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-success-50)',
    color: 'var(--color-success-700)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    flex: 1,
  },
};

const sh: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'flex-end',
  },
  sheet: {
    width: '100%',
    maxHeight: '92vh',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: '20px 20px 0 0',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    animation: 'slideUp 0.3s ease',
  },
  handle: {
    width: '36px',
    height: '4px',
    borderRadius: '2px',
    backgroundColor: 'var(--color-neutral-200)',
    margin: '10px auto 0',
    flexShrink: 0,
  },
  sheetHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px 12px',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  sheetTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  closeBtn: {
    width: '30px',
    height: '30px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-100)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  steps: {
    display: 'flex',
    gap: '0',
    padding: '12px 20px',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  stepItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flex: 1,
  },
  stepDot: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-neutral-200)',
    flexShrink: 0,
  },
  stepDotActive: {
    backgroundColor: 'var(--color-primary-600)',
  },
  stepDotDone: {
    backgroundColor: 'var(--color-success-500)',
  },
  stepLabel: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },
  stepLabelActive: {
    color: 'var(--color-primary-700)',
    fontWeight: 'var(--font-weight-semibold)',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 20px',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
  },
  label: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-700)',
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  platformGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
    marginBottom: '4px',
  },
  platformBtn: {
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--color-neutral-200)',
    textAlign: 'left',
    cursor: 'pointer',
  },
  platformBtnLabel: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
  },
  typeRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
    marginBottom: '4px',
  },
  typeBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-700)',
    cursor: 'pointer',
  },
  typeBtnActive: {
    borderColor: 'var(--color-primary-500)',
    backgroundColor: 'var(--color-primary-50)',
    color: 'var(--color-primary-700)',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-900)',
    backgroundColor: 'var(--color-neutral-0)',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-900)',
    backgroundColor: 'var(--color-neutral-0)',
    resize: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  selectWrap: {
    position: 'relative',
  },
  select: {
    width: '100%',
    padding: '10px 32px 10px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-900)',
    backgroundColor: 'var(--color-neutral-0)',
    appearance: 'none',
    boxSizing: 'border-box',
  },
  selectIcon: {
    position: 'absolute',
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--color-neutral-400)',
    pointerEvents: 'none',
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '14px',
  },
  toggleLabel: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-700)',
    fontWeight: 'var(--font-weight-medium)',
  },
  toggle: {
    width: '44px',
    height: '24px',
    borderRadius: '12px',
    backgroundColor: 'var(--color-neutral-200)',
    position: 'relative',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  toggleOn: {
    backgroundColor: 'var(--color-primary-500)',
  },
  toggleThumb: {
    position: 'absolute',
    top: '2px',
    left: '2px',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: 'white',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
    transition: 'left 0.2s',
  },
  toggleThumbOn: {
    left: '22px',
  },
  errorText: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-error-600)',
    marginTop: '10px',
  },
  footer: {
    display: 'flex',
    gap: '10px',
    padding: '14px 20px',
    borderTop: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  backStepBtn: {
    padding: '12px 20px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-700)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
  },
  nextBtn: {
    flex: 1,
    padding: '12px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-primary-600)',
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
  },
  nextBtnDisabled: {
    backgroundColor: 'var(--color-neutral-200)',
    color: 'var(--color-neutral-400)',
  },
  submitBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-primary-600)',
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
  },
};
