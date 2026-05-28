import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SkeletonList } from '../components/ui/Skeleton';
import { Badge } from '../components/ui/Badge';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { MediaFallback } from '../components/ui/MediaFallback';
import { toThumbUrl } from '../lib/imageCompress';
import {
  ArrowLeft, Search, Star, Shield, TrendingUp, MapPin,
  Heart, Zap, ChevronRight, Package, Truck, Users, Bookmark,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import NotificationBell from '../components/NotificationBell';
import SavedSearchesPanel from '../components/SavedSearchesPanel';
import { checkSavedSearchMatches, type SavedSearch } from '../lib/savedSearches';
import { useGuestAction } from '../components/GuestGate';
import { fetchMarketplaceListings, createMarketplaceListing } from '../lib/database';
import { useLiveFeed } from '../hooks/useLiveFeed';
import type { MarketplaceListing } from '../lib/supabase';
import LocationFields, { isValidGeneralLocation, type LocationValue } from '../components/listing/LocationFields';
import PickupTypeChips from '../components/listing/PickupTypeChips';
import MarketplaceFoundSelect from '../components/listing/MarketplaceFoundSelect';
import SafetyReminder from '../components/listing/SafetyReminder';
import LogisticsBlock from '../components/listing/LogisticsBlock';
import ReportListingButton from '../components/listing/ReportListingButton';

type MarketView = 'home' | 'detail' | 'create' | 'offer' | 'checkout' | 'dashboard' | 'confirmation';

interface Listing {
  id: string;
  image: string;
  title: string;
  price: string;
  seller: string;
  sellerRating: number;
  rarity: number;
  category: string;
  condition: string;
  verified: boolean;
  hot?: boolean;
  watchers?: number;
  timeAgo: string;
  localPickup?: boolean;
  auction?: boolean;
  general_location?: string;
  marketplace_found?: string;
  pickup_type?: string[];
  shipping_available?: boolean;
  meetup_notes?: string;
  has_private_address?: boolean;
  address_reveal_policy?: string;
}


const categories = ['All', 'Watches', 'Furniture', 'Electronics', 'Books', 'Collectibles', 'Antiques', 'Jewelry', 'Art'];

function getMarketTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function Marketplace({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<MarketView>('home');
  const [selectedItem, setSelectedItem] = useState<Listing | null>(null);
  const navigate = useNavigate();

  // [LISTING_NAV] Tapping a card now routes to the shared `/listing/:id`
  // detail page. The legacy inline `ItemDetail` / `OfferScreen` /
  // `CheckoutScreen` views remain reachable from the dashboard flow
  // until they are migrated. We still hold `selectedItem` so the offer
  // and checkout sub-views (entered from elsewhere) keep working.
  const openDetail = (item: Listing) => {
    setSelectedItem(item);
    navigate(`/listing/${item.id}`);
  };

  if (view === 'home') {
    return <MarketHome onBack={onBack} onItemClick={openDetail} onCreateListing={() => setView('create')} onDashboard={() => setView('dashboard')} />;
  }
  if (view === 'detail' && selectedItem) {
    return <ItemDetail item={selectedItem} onBack={() => setView('home')} onOffer={() => setView('offer')} onBuyNow={() => setView('checkout')} />;
  }
  if (view === 'create') {
    return <CreateListing onBack={() => setView('home')} onPreview={() => setView('home')} />;
  }
  if (view === 'offer' && selectedItem) {
    return <OfferScreen item={selectedItem} onBack={() => setView('detail')} />;
  }
  if (view === 'checkout' && selectedItem) {
    return <CheckoutScreen item={selectedItem} onBack={() => setView('detail')} onConfirm={() => setView('confirmation')} />;
  }
  if (view === 'confirmation') {
    return <OrderConfirmation onDone={() => setView('home')} />;
  }
  if (view === 'dashboard') {
    return <SellerDashboard onBack={() => setView('home')} />;
  }

  return <MarketHome onBack={onBack} onItemClick={openDetail} onCreateListing={() => setView('create')} onDashboard={() => setView('dashboard')} />;
}

function toListingShape(l: MarketplaceListing & Record<string, unknown>): Listing {
  return {
    id: l.id,
    image: l.image_url || '',
    title: l.title,
    price: `$${Number(l.price).toLocaleString()}`,
    seller: l.profiles?.username || 'seller',
    sellerRating: 4.5,
    rarity: 6.0,
    category: l.category || 'Other',
    condition: l.condition || 'Good',
    verified: l.profiles?.scout_verified || false,
    watchers: 0,
    timeAgo: getMarketTimeAgo(l.created_at),
    localPickup: l.local_pickup,
    auction: l.auction_enabled,
    general_location: (l.general_location as string) || undefined,
    marketplace_found: (l.marketplace_found as string) || undefined,
    pickup_type: (l.pickup_type as string[]) || [],
    shipping_available: (l.shipping_available as boolean) ?? undefined,
    meetup_notes: (l.meetup_notes as string) || undefined,
    has_private_address: Boolean(l.exact_address_private),
    address_reveal_policy: (l.address_reveal_policy as string) || undefined,
  };
}

function MarketHome({ onBack, onItemClick, onCreateListing, onDashboard }: {
  onBack: () => void;
  onItemClick: (item: Listing) => void;
  onCreateListing: () => void;
  onDashboard: () => void;
}) {
  const { requireAuth } = useGuestAction();
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSavedSearches, setShowSavedSearches] = useState(false);

  useEffect(() => {
    fetchMarketplaceListings(50).then((data) => {
      setListings(data.map(toListingShape));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Live refresh — silently re-pull listings every 10s. Active category,
  // search, and scroll position are all preserved since we only replace
  // the underlying data array. We deliberately do NOT .catch() here so
  // that useLiveFeed sees thrown errors and engages exponential backoff.
  useLiveFeed(
    () => fetchMarketplaceListings(50).then((data) => {
      setListings(data.map(toListingShape));
    }),
    !loading,
  );

  // Run saved-search match check in the background on mount.
  useEffect(() => {
    if (!user?.id) return;
    checkSavedSearchMatches(user.id).catch(() => {});
  }, [user?.id]);

  const runSavedSearch = (search: SavedSearch) => {
    setSearchQuery(search.keywords || '');
    if (search.categories && search.categories.length > 0) {
      setActiveCategory(search.categories[0]);
    } else {
      setActiveCategory('All');
    }
    setShowSavedSearches(false);
  };

  const filtered = listings.filter((item) => {
    if (activeCategory !== 'All' && item.category !== activeCategory) return false;
    if (activeFilter === 'Local Pickup' && !item.localPickup && !item.pickup_type?.includes('local_pickup')) return false;
    if (activeFilter === 'Shipping' && !item.shipping_available && !item.pickup_type?.includes('shipping_available') && !item.pickup_type?.includes('nationwide_shipping')) return false;
    if (activeFilter === 'Auction' && !item.auction) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const hay = `${item.title} ${item.category} ${item.seller}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const featured = filtered.slice(0, 3);
  const hotFinds = filtered.filter((l) => l.image).slice(0, 4);
  const recent = filtered;

  const filters = ['Local Pickup', 'Shipping', 'Auction'];

  const EmptyState = ({ label }: { label: string }) => (
    <div style={s.emptyState}>
      <Package size={28} style={{ color: 'var(--color-neutral-300)', marginBottom: 8 }} />
      <span style={s.emptyStateText}>{label}</span>
    </div>
  );

  return (
    <div style={s.container}>
      <header style={s.header}>
        <button onClick={onBack} style={s.backBtn}><ArrowLeft size={20} /></button>
        <h1 style={s.headerTitle}>Marketplace</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <NotificationBell />
          <button onClick={onDashboard} style={s.dashBtn} aria-label="Dashboard">
            <TrendingUp size={16} style={{ color: 'var(--color-primary-600)' }} />
          </button>
        </div>
      </header>

      <div style={s.scrollContent}>
        {/* Search */}
        <div style={s.searchWrap}>
          <Search size={16} style={{ color: 'var(--color-neutral-400)' }} />
          <input
            type="text"
            placeholder="Search finds, brands, categories..."
            style={s.searchInput}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button
            onClick={() => setShowSavedSearches(true)}
            aria-label="Saved searches"
            style={{
              minWidth: 44, minHeight: 44, width: 44, height: 44, padding: 6, marginLeft: 4,
              borderRadius: 'var(--radius-md)', border: 'none',
              backgroundColor: 'var(--color-primary-50)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Bookmark size={16} style={{ color: 'var(--color-primary-600)' }} />
          </button>
        </div>

        {/* Categories */}
        <div style={s.catScroll}>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{ ...s.catChip, ...(activeCategory === cat ? s.catChipActive : {}) }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div style={s.filterRow}>
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(activeFilter === f ? null : f)}
              style={{ ...s.filterChip, ...(activeFilter === f ? s.filterChipActive : {}) }}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 'var(--space-3)' }}>
            <SkeletonList count={3} />
          </div>
        ) : (
          <>
            {/* Featured */}
            <div style={s.section}>
              <div style={s.sectionHeader}>
                <h2 style={s.sectionTitle}>Featured Finds</h2>
                <ChevronRight size={16} style={{ color: 'var(--color-neutral-400)' }} />
              </div>
              {featured.length === 0 ? (
                <EmptyState label="No featured listings yet. Be the first to post!" />
              ) : (
                <div style={s.featuredScroll}>
                  {featured.map((item) => (
                    <button key={item.id} onClick={() => onItemClick(item)} style={s.featuredCard}>
                      <div style={s.featuredImgWrap}>
                        <ImageWithFade
                          src={toThumbUrl(item.image)}
                          fallbackSrc={item.image}
                          alt={item.title}
                          style={s.featuredImg as any}
                          fallback={
                            <MediaFallback kind="listing" category={item.category} seed={item.id} label={item.category || 'LISTING'} />
                          }
                        />
                        <div style={{ position: 'absolute', top: 8, right: 8 }}>
                          <Badge variant="category">{item.category}</Badge>
                        </div>
                      </div>
                      <div style={s.featuredInfo}>
                        <span style={s.featuredTitle}>{item.title}</span>
                        <span style={s.featuredPrice}>{item.price}</span>
                        <div style={s.sellerRow}>
                          {item.verified && <Shield size={10} style={{ color: 'var(--color-secondary-500)' }} aria-label="Verified seller" />}
                          <span style={s.sellerName}>@{item.seller}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Hot Finds */}
            {hotFinds.filter((l) => l.image).length > 0 && (
              <div style={s.section}>
                <div style={s.sectionHeader}>
                  <h2 style={s.sectionTitle}>Hot Finds</h2>
                  <span style={s.sectionBadge}><Zap size={10} /> Trending</span>
                </div>
                <div style={s.hotGrid}>
                  {hotFinds.filter((l) => l.image).slice(0, 4).map((item) => (
                    <button key={item.id} onClick={() => onItemClick(item)} style={s.hotCard}>
                      <ImageWithFade
                        src={toThumbUrl(item.image)}
                        fallbackSrc={item.image}
                        alt={item.title}
                        style={s.hotImg as any}
                        fallback={
                          <MediaFallback kind="listing" category={item.category} seed={item.id} compact />
                        }
                      />
                      <div style={s.hotOverlay}>
                        <span style={s.hotPrice}>{item.price}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Recently Posted */}
            <div style={s.section}>
              <div style={s.sectionHeader}>
                <h2 style={s.sectionTitle}>Recently Posted</h2>
              </div>
              {recent.length === 0 ? (
                <EmptyState label="No listings yet. Create one to get started!" />
              ) : (
                recent.map((item) => (
                  <button key={item.id} onClick={() => onItemClick(item)} style={s.listingRow}>
                    <div style={{ width: 64, height: 64, borderRadius: 'var(--radius-md)', overflow: 'hidden', flexShrink: 0 }}>
                      <ImageWithFade
                        src={toThumbUrl(item.image)}
                        fallbackSrc={item.image}
                        alt={item.title}
                        style={s.listingImg as any}
                        fallback={
                          <MediaFallback kind="listing" category={item.category} seed={item.id} compact />
                        }
                      />
                    </div>
                    <div style={s.listingInfo}>
                      <span style={s.listingTitle}>{item.title}</span>
                      <div style={s.listingMeta}>
                        <span style={s.listingPrice}>{item.price}</span>
                        <span style={s.listingDot} />
                        <span style={s.listingTime}>{item.timeAgo}</span>
                      </div>
                      <div style={s.listingBottom}>
                        {item.verified && <Shield size={10} style={{ color: 'var(--color-secondary-500)' }} aria-label="Verified seller" />}
                        <span style={s.listingSeller}>@{item.seller}</span>
                        {item.localPickup && <Badge variant="pickup" icon={MapPin}>Local</Badge>}
                      </div>
                    </div>
                    <Heart size={16} style={{ color: 'var(--color-neutral-300)', opacity: 0.4 }} />
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Create listing FAB */}
      <button onClick={() => requireAuth(onCreateListing)} style={s.fab}>
        <Package size={20} style={{ color: 'var(--color-neutral-0)' }} />
      </button>

      <SavedSearchesPanel
        open={showSavedSearches}
        onClose={() => setShowSavedSearches(false)}
        onRun={runSavedSearch}
        draft={{
          keywords: searchQuery,
          categories: activeCategory !== 'All' ? [activeCategory] : [],
          marketplaces: [],
          location_text: '',
        }}
      />
    </div>
  );
}

function ItemDetail({ item, onBack, onOffer, onBuyNow }: {
  item: Listing;
  onBack: () => void;
  onOffer: () => void;
  onBuyNow: () => void;
}) {
  return (
    <div style={s.container}>
      <header style={s.header}>
        <button onClick={onBack} style={s.backBtn}><ArrowLeft size={20} /></button>
        <h1 style={s.headerTitle}>Listing</h1>
        <div style={{ width: 36 }} />
      </header>

      <div style={s.scrollContent}>
        {/* Image gallery */}
        <div style={s.detailImgWrap}>
          <ImageWithFade
            src={item.image}
            alt={item.title}
            style={s.detailImg as any}
            fallback={
              <MediaFallback kind="listing" category={item.category} seed={item.id} label={item.category || 'LISTING'} />
            }
          />
          <div style={{ position: 'absolute', top: 'var(--space-3)', right: 'var(--space-3)' }}>
            <Badge variant="category" size="md">{item.rarity} Rarity</Badge>
          </div>
          {item.verified && (
            <div style={{ position: 'absolute', top: 'var(--space-3)', left: 'var(--space-3)' }}>
              <Badge variant="verified" icon={Shield} size="md">Verified</Badge>
            </div>
          )}
        </div>

        {/* Title & price */}
        <div style={s.detailBody}>
          <h2 style={s.detailTitle}>{item.title}</h2>
          <div style={s.detailPriceRow}>
            <span style={s.detailPrice}>{item.price}</span>
            <span style={s.detailCondition}>{item.condition} Condition</span>
          </div>

          {/* AI valuation */}
          <div style={s.aiValCard}>
            <Zap size={14} style={{ color: 'var(--color-primary-600)' }} />
            <div style={s.aiValInfo}>
              <span style={s.aiValLabel}>AI Valuation</span>
              <span style={s.aiValRange}>$10,800 - $14,200</span>
            </div>
            <span style={s.aiValTag}>Fair Price</span>
          </div>

          {/* Seller card */}
          <div style={s.sellerCard}>
            <div style={s.sellerCardAvatar}>
              <Users size={16} style={{ color: 'var(--color-neutral-400)' }} />
            </div>
            <div style={s.sellerCardInfo}>
              <div style={s.sellerCardNameRow}>
                <span style={s.sellerCardName}>@{item.seller}</span>
                {item.verified && <Shield size={12} style={{ color: 'var(--color-secondary-500)' }} />}
              </div>
              <div style={s.sellerCardStats}>
                <Star size={10} style={{ color: 'var(--color-primary-500)', fill: 'var(--color-primary-500)' }} />
                <span style={s.sellerCardRating}>{item.sellerRating}</span>
                <span style={s.sellerCardDot} />
                <span style={s.sellerCardSales}>Verified Seller</span>
              </div>
            </div>
            <ChevronRight size={14} style={{ color: 'var(--color-neutral-400)' }} />
          </div>

          {/* Details */}
          <div style={s.detailSection}>
            <h3 style={s.detailSectionTitle}>Item Details</h3>
            <div style={s.attrList}>
              <div style={s.attrRow}><span style={s.attrLabel}>Category</span><span style={s.attrVal}>{item.category}</span></div>
              <div style={s.attrRow}><span style={s.attrLabel}>Condition</span><span style={s.attrVal}>{item.condition}</span></div>
              <div style={s.attrRow}><span style={s.attrLabel}>Pickup</span><span style={s.attrVal}>{item.localPickup ? 'Available' : 'Shipping only'}</span></div>
              {item.auction && <div style={s.attrRow}><span style={s.attrLabel}>Listing Type</span><span style={s.attrVal}>Auction</span></div>}
            </div>
          </div>

          <div style={{ marginTop: 'var(--space-3)' }}>
            <LogisticsBlock
              generalLocation={item.general_location}
              marketplaceFound={item.marketplace_found}
              pickupType={item.pickup_type}
              shippingAvailable={item.shipping_available}
              meetupNotes={item.meetup_notes}
              hasPrivateAddress={item.has_private_address}
              addressRevealPolicy={item.address_reveal_policy}
            />
          </div>

          <SafetyReminder variant="detail" />

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-3)' }}>
            <ReportListingButton table="marketplace_listings" listingId={item.id} />
          </div>

          {/* Trust */}
          <div style={s.trustSection}>
            <div style={s.trustItem}>
              <Shield size={14} style={{ color: 'var(--color-secondary-500)' }} />
              <span style={s.trustText}>Buyer Protection</span>
            </div>
            <div style={s.trustItem}>
              <Zap size={14} style={{ color: 'var(--color-primary-500)' }} />
              <span style={s.trustText}>AI Authenticated</span>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom actions */}
      <div style={s.detailActions}>
        <button onClick={onOffer} style={s.offerBtn}>
          <span style={s.offerBtnText}>Make Offer</span>
        </button>
        <button onClick={onBuyNow} style={s.buyNowBtn}>
          <span style={s.buyNowBtnText}>Buy Now</span>
        </button>
      </div>
    </div>
  );
}

function CreateListing({ onBack, onPreview }: { onBack: () => void; onPreview: () => void }) {
  const { user } = useAuth();
  const [step, setStep] = useState<'photos' | 'details' | 'preview'>('photos');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('Antiques');
  const [condition, setCondition] = useState('Good');
  const [publishing, setPublishing] = useState(false);
  const [createError, setCreateError] = useState('');

  const [loc, setLoc] = useState<LocationValue>({
    general_location: '',
    exact_address_private: '',
    address_reveal_policy: 'on_contact',
  });
  const [pickupType, setPickupType] = useState<string[]>(['local_pickup']);
  const [marketplaceKey, setMarketplaceKey] = useState('');
  const [marketplaceCustom, setMarketplaceCustom] = useState('');
  const [meetupNotes, setMeetupNotes] = useState('');
  const [auctionEnabled, setAuctionEnabled] = useState(false);

  const handlePublish = async () => {
    if (!user) return;
    setCreateError('');
    if (!title.trim()) { setCreateError('Add a title.'); return; }
    if (!price || isNaN(parseFloat(price))) { setCreateError('Set a price.'); return; }
    if (!isValidGeneralLocation(loc.general_location)) {
      setCreateError('Add a general location — ZIP or "City, ST".');
      return;
    }
    if (marketplaceKey === 'other' && !marketplaceCustom.trim()) {
      setCreateError('Please enter the marketplace name, or pick a different option.');
      return;
    }
    setPublishing(true);
    const marketplaceValue = marketplaceKey === 'other' && marketplaceCustom.trim()
      ? `custom:${marketplaceCustom.trim()}`
      : marketplaceKey || undefined;
    const shipping =
      pickupType.includes('shipping_available') || pickupType.includes('nationwide_shipping');
    const { error } = await createMarketplaceListing({
      seller_id: user.id,
      title: title.trim(),
      price: parseFloat(price) || 0,
      category,
      condition,
      local_pickup: pickupType.includes('local_pickup'),
      auction_enabled: auctionEnabled,
      general_location: loc.general_location,
      exact_address_private: loc.exact_address_private.trim() || undefined,
      address_reveal_policy: loc.address_reveal_policy,
      pickup_type: pickupType,
      shipping_available: shipping,
      meetup_notes: meetupNotes.trim() || undefined,
      marketplace_found: marketplaceValue,
    });
    setPublishing(false);
    if (error) { setCreateError(error); return; }
    onPreview();
  };

  return (
    <div style={s.container}>
      <header style={s.header}>
        <button onClick={onBack} style={s.backBtn}><ArrowLeft size={20} /></button>
        <h1 style={s.headerTitle}>Create Listing</h1>
        <div style={{ width: 36 }} />
      </header>

      <div style={s.scrollContent}>
        {/* Step indicator */}
        <div style={s.stepRow}>
          {['Photos', 'Details', 'Preview'].map((label, i) => (
            <div key={label} style={s.stepItem}>
              <div style={{
                ...s.stepCircle,
                backgroundColor: i <= ['photos', 'details', 'preview'].indexOf(step) ? 'var(--color-primary-500)' : 'var(--color-neutral-200)',
              }}>
                <span style={s.stepNum}>{i + 1}</span>
              </div>
              <span style={s.stepLabel}>{label}</span>
            </div>
          ))}
        </div>

        {step === 'photos' && (
          <div style={s.createSection}>
            <div style={s.photoGrid}>
              <div style={s.photoSlotMain}>
                <Package size={24} style={{ color: 'var(--color-neutral-300)' }} />
                <span style={s.photoSlotText}>Add Main Photo</span>
              </div>
              <div style={s.photoSlotSmall}><span style={s.photoSlotText}>+</span></div>
              <div style={s.photoSlotSmall}><span style={s.photoSlotText}>+</span></div>
              <div style={s.photoSlotSmall}><span style={s.photoSlotText}>+</span></div>
            </div>
            <button onClick={() => setStep('details')} style={s.continueBtn}>
              <span style={s.continueBtnText}>Continue</span>
            </button>
          </div>
        )}

        {step === 'details' && (
          <div style={s.createSection}>
            {/* AI suggestion */}
            <div style={s.aiSuggest}>
              <Zap size={14} style={{ color: 'var(--color-primary-600)' }} />
              <span style={s.aiSuggestText}>AI suggests: "Vintage Brass Desk Lamp - 1960s"</span>
            </div>

            <div style={s.formGroup}>
              <label style={s.formLabel}>Title</label>
              <input type="text" placeholder="Item title" style={s.formInput} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div style={s.formGroup}>
              <label style={s.formLabel}>Price</label>
              <div style={s.priceInputWrap}>
                <span style={s.priceCurrency}>$</span>
                <input type="text" placeholder="0.00" style={s.priceInput} value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <span style={s.aiPriceHint}>AI estimate: $85 - $150</span>
            </div>

            <div style={s.formGroup}>
              <label style={s.formLabel}>Category</label>
              <div style={s.catSelectGrid}>
                {['Antiques', 'Furniture', 'Electronics', 'Watches', 'Books', 'Other'].map((c) => (
                  <button key={c} onClick={() => setCategory(c)} style={{ ...s.catSelect, ...(c === category ? s.catSelectActive : {}) }}>{c}</button>
                ))}
              </div>
            </div>

            <div style={s.formGroup}>
              <label style={s.formLabel}>Condition</label>
              <div style={s.conditionRow}>
                {['Mint', 'Excellent', 'Good', 'Fair'].map((c) => (
                  <button key={c} onClick={() => setCondition(c)} style={{ ...s.condChip, ...(c === condition ? s.condChipActive : {}) }}>{c}</button>
                ))}
              </div>
            </div>

            <div style={s.formGroup}>
              <LocationFields value={loc} onChange={setLoc} />
            </div>

            <div style={s.formGroup}>
              <MarketplaceFoundSelect
                value={marketplaceKey}
                customValue={marketplaceCustom}
                onChange={(key, custom) => { setMarketplaceKey(key); setMarketplaceCustom(custom); }}
                label="Where Did You Source It? (optional)"
              />
            </div>

            <div style={s.formGroup}>
              <PickupTypeChips value={pickupType} onChange={setPickupType} />
            </div>

            <div style={s.formGroup}>
              <label style={s.formLabel}>Meetup Notes (optional)</label>
              <textarea
                value={meetupNotes}
                onChange={(e) => setMeetupNotes(e.target.value)}
                placeholder="Best pickup times, parking, gate codes (shared after contact)…"
                style={{ ...s.formInput, minHeight: 60, fontFamily: 'inherit' as const }}
                rows={2}
              />
            </div>

            <div style={s.formGroup}>
              <label style={s.formLabel}>Enable Auction</label>
              <div style={s.toggleRow}>
                <span style={s.toggleLabel}>Accept bids for this listing</span>
                <button
                  type="button"
                  onClick={() => setAuctionEnabled((v) => !v)}
                  style={{ ...s.toggle, backgroundColor: auctionEnabled ? 'var(--color-primary-500)' : 'var(--color-neutral-200)', cursor: 'pointer', border: 'none' }}
                >
                  <div style={{ ...s.toggleKnob, transform: auctionEnabled ? 'translateX(14px)' : 'translateX(0)' }} />
                </button>
              </div>
            </div>

            <SafetyReminder />

            {createError && (
              <div style={{ color: 'var(--color-error-500)', fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-2)' }}>
                {createError}
              </div>
            )}

            <button onClick={() => setStep('preview')} style={s.continueBtn}>
              <span style={s.continueBtnText}>Preview Listing</span>
            </button>
          </div>
        )}

        {step === 'preview' && (
          <div style={s.createSection}>
            <div style={s.previewCard}>
              <div style={s.previewImgWrap}>
                <div style={s.previewImgPlaceholder}>
                  <MediaFallback kind="listing" category={category} seed={title || 'preview'} label={category || 'PREVIEW'} compact />
                </div>
              </div>
              <div style={s.previewInfo}>
                <span style={s.previewTitle}>{title}</span>
                <span style={s.previewPrice}>${price}</span>
                <span style={s.previewMeta}>{category} - {condition} condition</span>
                <div style={s.previewBadges}>
                  <span style={s.previewBadge}><MapPin size={8} /> Local Pickup</span>
                  <span style={s.previewBadge}><Truck size={8} /> Shipping</span>
                  <span style={s.previewBadge}><Shield size={8} /> Verified</span>
                </div>
              </div>
            </div>
            <button onClick={handlePublish} disabled={publishing} style={{ ...s.continueBtn, opacity: publishing ? 0.6 : 1 }}>
              <span style={s.continueBtnText}>{publishing ? 'Publishing...' : 'Publish Listing'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function OfferScreen({ item, onBack }: { item: Listing; onBack: () => void }) {
  const [offerAmount, setOfferAmount] = useState('');

  return (
    <div style={s.container}>
      <header style={s.header}>
        <button onClick={onBack} style={s.backBtn}><ArrowLeft size={20} /></button>
        <h1 style={s.headerTitle}>Make Offer</h1>
        <div style={{ width: 36 }} />
      </header>

      <div style={s.scrollContent}>
        {/* Item summary */}
        <div style={s.offerItemCard}>
          <div style={s.offerItemImg as any}>
            <ImageWithFade
              src={item.image}
              alt={item.title}
              fallback={<MediaFallback kind="listing" category={item.category} seed={item.id} compact />}
            />
          </div>
          <div style={s.offerItemInfo}>
            <span style={s.offerItemTitle}>{item.title}</span>
            <span style={s.offerItemPrice}>Listed at {item.price}</span>
          </div>
        </div>

        {/* Offer input */}
        <div style={s.offerInputSection}>
          <label style={s.formLabel}>Your Offer</label>
          <div style={s.offerInputWrap}>
            <span style={s.offerCurrency}>$</span>
            <input
              type="text"
              placeholder="Enter amount"
              style={s.offerInput}
              value={offerAmount}
              onChange={(e) => setOfferAmount(e.target.value)}
            />
          </div>
          <div style={s.suggestedOffers}>
            <span style={s.suggestedLabel}>Suggested:</span>
            <button style={s.suggestedChip} onClick={() => setOfferAmount('10000')}>$10,000</button>
            <button style={s.suggestedChip} onClick={() => setOfferAmount('11000')}>$11,000</button>
            <button style={s.suggestedChip} onClick={() => setOfferAmount('11500')}>$11,500</button>
          </div>
        </div>

        {/* Negotiation history */}
        <div style={s.detailSection}>
          <h3 style={s.detailSectionTitle}>Offer Timeline</h3>
          <div style={s.chatTimeline}>
            <div style={s.chatBubbleOther}>
              <span style={s.chatSender}>@watch_seeker offered $11,000</span>
              <span style={s.chatTime}>2h ago</span>
            </div>
            <div style={s.chatBubbleSeller}>
              <span style={s.chatSender}>Seller declined - countered $12,000</span>
              <span style={s.chatTime}>1h ago</span>
            </div>
            <div style={s.chatBubbleOther}>
              <span style={s.chatSender}>@collector_mike offered $10,500</span>
              <span style={s.chatTime}>45m ago</span>
            </div>
            <div style={s.chatBubbleSeller}>
              <span style={s.chatSender}>Seller declined</span>
              <span style={s.chatTime}>30m ago</span>
            </div>
          </div>
        </div>

        {/* Seller trust */}
        <div style={s.sellerTrustCard}>
          <Shield size={14} style={{ color: 'var(--color-secondary-500)' }} />
          <div style={s.sellerTrustInfo}>
            <span style={s.sellerTrustTitle}>Trusted Seller</span>
            <span style={s.sellerTrustDesc}>Verified seller on TreasureTrail</span>
          </div>
        </div>

        <button
          style={{ ...s.continueBtn, opacity: 0.55, cursor: 'not-allowed' }}
          disabled
          title="Offer negotiation is coming soon"
        >
          <span style={s.continueBtnText}>Submit Offer · Coming Soon</span>
        </button>
      </div>
    </div>
  );
}

function CheckoutScreen({ item, onBack, onConfirm }: { item: Listing; onBack: () => void; onConfirm: () => void }) {
  const [delivery, setDelivery] = useState<'shipping' | 'pickup'>('shipping');
  return (
    <div style={s.container}>
      <header style={s.header}>
        <button onClick={onBack} style={s.backBtn}><ArrowLeft size={20} /></button>
        <h1 style={s.headerTitle}>Checkout</h1>
        <div style={{ width: 36 }} />
      </header>

      <div style={s.scrollContent}>
        {/* Item */}
        <div style={s.checkoutItem}>
          <div style={s.checkoutImg as any}>
            <ImageWithFade
              src={item.image}
              alt={item.title}
              fallback={<MediaFallback kind="listing" category={item.category} seed={item.id} compact />}
            />
          </div>
          <div style={s.checkoutItemInfo}>
            <span style={s.checkoutItemTitle}>{item.title}</span>
            <span style={s.checkoutItemPrice}>{item.price}</span>
          </div>
        </div>

        {/* Protection */}
        <div style={s.protectionCard}>
          <Shield size={16} style={{ color: 'var(--color-secondary-500)' }} />
          <div style={s.protectionInfo}>
            <span style={s.protectionTitle}>TreasureTrail Buyer Protection</span>
            <span style={s.protectionDesc}>Full refund if item not as described</span>
          </div>
        </div>

        {/* Shipping */}
        <div style={s.detailSection}>
          <h3 style={s.detailSectionTitle}>Delivery</h3>
          <div style={s.deliveryOptions}>
            <button
              onClick={() => setDelivery('shipping')}
              style={{ ...s.deliveryOption, ...(delivery === 'shipping' ? s.deliveryOptionActive : {}) }}
            >
              <Truck size={16} style={{ color: 'var(--color-primary-600)' }} />
              <div style={s.deliveryOptionInfo}>
                <span style={s.deliveryOptionTitle}>Standard Shipping</span>
                <span style={s.deliveryOptionDetail}>5-7 days - $18</span>
              </div>
            </button>
            <button
              onClick={() => setDelivery('pickup')}
              style={{ ...s.deliveryOption, ...(delivery === 'pickup' ? s.deliveryOptionActive : {}) }}
            >
              <MapPin size={16} style={{ color: 'var(--color-neutral-500)' }} />
              <div style={s.deliveryOptionInfo}>
                <span style={s.deliveryOptionTitle}>Local Pickup</span>
                <span style={s.deliveryOptionDetail}>Free - Brooklyn, NY</span>
              </div>
            </button>
          </div>
        </div>

        {/* Payment summary */}
        <div style={s.detailSection}>
          <h3 style={s.detailSectionTitle}>Payment Summary</h3>
          <div style={s.summaryCard}>
            <div style={s.summaryRow}><span style={s.summaryLabel}>Item</span><span style={s.summaryVal}>{item.price}</span></div>
            <div style={s.summaryRow}><span style={s.summaryLabel}>Shipping</span><span style={s.summaryVal}>$18</span></div>
            <div style={s.summaryRow}><span style={s.summaryLabel}>Protection Fee</span><span style={s.summaryVal}>$2.50</span></div>
            <div style={s.summaryDivider} />
            <div style={s.summaryRow}><span style={s.summaryLabelBold}>Total</span><span style={s.summaryValBold}>$12,520.50</span></div>
          </div>
        </div>

        {/* Seller rep */}
        <div style={s.sellerCard}>
          <div style={s.sellerCardAvatar}><Users size={16} style={{ color: 'var(--color-neutral-400)' }} /></div>
          <div style={s.sellerCardInfo}>
            <span style={s.sellerCardName}>@{item.seller}</span>
            <div style={s.sellerCardStats}>
              <Star size={10} style={{ color: 'var(--color-primary-500)', fill: 'var(--color-primary-500)' }} />
              <span style={s.sellerCardRating}>{item.sellerRating}</span>
              <span style={s.sellerCardDot} />
              <span style={s.sellerCardSales}>Trusted Seller</span>
            </div>
          </div>
        </div>

        <button onClick={onConfirm} style={s.continueBtn}>
          <span style={s.continueBtnText}>Confirm Purchase</span>
        </button>
      </div>
    </div>
  );
}

function OrderConfirmation({ onDone }: { onDone: () => void }) {
  return (
    <div style={s.container}>
      <div style={s.confirmContent}>
        <div style={s.confirmIcon}>
          <Shield size={32} style={{ color: 'var(--color-success-500)' }} />
        </div>
        <h2 style={s.confirmTitle}>Order Confirmed!</h2>
        <p style={s.confirmDesc}>Your purchase is protected by TreasureTrail Buyer Protection. You'll receive tracking info shortly.</p>

        <div style={s.confirmCard}>
          <div style={s.confirmRow}><span style={s.confirmLabel}>Order #</span><span style={s.confirmVal}>TT-28491</span></div>
          <div style={s.confirmRow}><span style={s.confirmLabel}>Estimated Delivery</span><span style={s.confirmVal}>May 22-24</span></div>
          <div style={s.confirmRow}><span style={s.confirmLabel}>Protection</span><span style={s.confirmValGreen}>Active</span></div>
        </div>

        <button onClick={onDone} style={s.continueBtn}>
          <span style={s.continueBtnText}>Back to Marketplace</span>
        </button>
      </div>
    </div>
  );
}

function SellerDashboard({ onBack }: { onBack: () => void }) {
  const stats = [
    { label: 'Active Listings', value: '0' },
    { label: 'Sold Items', value: '0' },
    { label: 'Total Earned', value: '$0' },
    { label: 'Conversion', value: '0%' },
  ];

  return (
    <div style={s.container}>
      <header style={s.header}>
        <button onClick={onBack} style={s.backBtn}><ArrowLeft size={20} /></button>
        <h1 style={s.headerTitle}>Seller Dashboard</h1>
        <div style={{ width: 36 }} />
      </header>

      <div style={s.scrollContent}>
        {/* Stats grid */}
        <div style={s.dashStatsGrid}>
          {stats.map((stat) => (
            <div key={stat.label} style={s.dashStatCard}>
              <span style={s.dashStatVal}>{stat.value}</span>
              <span style={s.dashStatLbl}>{stat.label}</span>
            </div>
          ))}
        </div>

        {/* Performance */}
        <div style={s.detailSection}>
          <h3 style={s.detailSectionTitle}>Performance</h3>
          <div style={s.perfCard}>
            <div style={s.perfRow}>
              <span style={s.perfLabel}>Views (7d)</span>
              <span style={s.perfVal}>0</span>
            </div>
            <div style={s.perfRow}>
              <span style={s.perfLabel}>Watchers</span>
              <span style={s.perfVal}>0</span>
            </div>
            <div style={s.perfRow}>
              <span style={s.perfLabel}>Offers Received</span>
              <span style={s.perfVal}>0</span>
            </div>
            <div style={s.perfRow}>
              <span style={s.perfLabel}>Reputation Impact</span>
              <span style={s.perfVal}>—</span>
            </div>
          </div>
        </div>

        {/* Active listings */}
        <div style={s.detailSection}>
          <h3 style={s.detailSectionTitle}>Active Listings</h3>
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-neutral-400)', fontSize: '0.85rem' }}>
            No active listings yet.
          </div>
        </div>

        <div style={s.detailSection}>
          <h3 style={s.detailSectionTitle}>Earnings (Last 30 Days)</h3>
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-neutral-400)', fontSize: '0.85rem' }}>
            No sales yet. Earnings will appear here once you make your first sale.
          </div>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--color-neutral-0)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-neutral-100)', flexShrink: 0 },
  backBtn: { width: '36px', height: '36px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-neutral-600)' },
  headerTitle: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  dashBtn: { width: '36px', height: '36px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  scrollContent: { flex: 1, overflow: 'auto', padding: 'var(--space-4)' },

  // Search
  searchWrap: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)', border: '1px solid var(--color-neutral-100)' },
  searchInput: { flex: 1, fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-800)', border: 'none', outline: 'none', background: 'transparent' },

  // Categories
  catScroll: { display: 'flex', gap: 'var(--space-2)', overflow: 'auto', marginBottom: 'var(--space-3)', paddingBottom: 'var(--space-1)' },
  catChip: { padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', backgroundColor: 'var(--color-neutral-100)', color: 'var(--color-neutral-600)', whiteSpace: 'nowrap', flexShrink: 0 },
  catChipActive: { backgroundColor: 'var(--color-neutral-900)', color: 'var(--color-neutral-0)' },

  // Filters
  filterRow: { display: 'flex', gap: 'var(--space-2)', overflow: 'auto', marginBottom: 'var(--space-4)', paddingBottom: 'var(--space-1)' },
  filterChip: { padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-full)', fontSize: '10px', fontWeight: 'var(--font-weight-medium)', backgroundColor: 'var(--color-neutral-0)', color: 'var(--color-neutral-500)', border: '1px solid var(--color-neutral-200)', whiteSpace: 'nowrap', flexShrink: 0 },
  filterChipActive: { borderColor: 'var(--color-primary-400)', backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-700)' },

  // Empty state
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6) var(--space-4)', textAlign: 'center' },
  emptyStateText: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-400)' },

  // Sections
  section: { marginBottom: 'var(--space-5)' },
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' },
  sectionTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  sectionBadge: { display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-accent-600)', backgroundColor: 'var(--color-accent-50)', padding: '2px 8px', borderRadius: 'var(--radius-full)' },

  // Featured
  featuredScroll: { display: 'flex', gap: 'var(--space-3)', overflow: 'auto', paddingBottom: 'var(--space-2)' },
  featuredCard: { minWidth: '220px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-100)', overflow: 'hidden', flexShrink: 0, textAlign: 'left' },
  featuredImgWrap: { position: 'relative', aspectRatio: '4/3' },
  featuredImg: { width: '100%', height: '100%', objectFit: 'cover' },
  hotBadge: { position: 'absolute', top: '8px', left: '8px', display: 'flex', alignItems: 'center', gap: '2px', padding: '2px 6px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-accent-500)', color: 'var(--color-neutral-0)', fontSize: '9px', fontWeight: 'var(--font-weight-bold)' },
  rarityBadge: { position: 'absolute', top: '8px', right: '8px', padding: '2px 6px', borderRadius: 'var(--radius-full)', backgroundColor: 'rgba(0,0,0,0.7)', color: 'var(--color-primary-400)', fontSize: '10px', fontWeight: 'var(--font-weight-bold)' },
  featuredInfo: { padding: 'var(--space-3)' },
  featuredTitle: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  featuredPrice: { display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', marginBottom: '4px' },
  sellerRow: { display: 'flex', alignItems: 'center', gap: '3px' },
  sellerName: { fontSize: '10px', color: 'var(--color-neutral-500)' },
  sellerRating: { fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-700)' },

  // Hot finds
  hotGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' },
  hotCard: { position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', aspectRatio: '1' },
  hotImg: { width: '100%', height: '100%', objectFit: 'cover' },
  hotOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 'var(--space-2) var(--space-3)', background: 'linear-gradient(transparent, rgba(0,0,0,0.7))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  hotPrice: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-0)' },
  hotWatchers: { display: 'flex', alignItems: 'center', gap: '2px', fontSize: '10px', color: 'var(--color-neutral-200)' },

  // Listing row
  listingRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) 0', borderBottom: '1px solid var(--color-neutral-50)', width: '100%', textAlign: 'left' },
  listingImg: { width: '100%', height: '100%', borderRadius: 'var(--radius-sm)', objectFit: 'cover', flexShrink: 0 },
  listingInfo: { flex: 1, minWidth: 0 },
  listingTitle: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  listingMeta: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: '2px' },
  listingPrice: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  listingDot: { width: '3px', height: '3px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-neutral-300)' },
  listingTime: { fontSize: '10px', color: 'var(--color-neutral-400)' },
  listingBottom: { display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' },
  listingSeller: { fontSize: '10px', color: 'var(--color-neutral-500)' },
  pickupBadge: { display: 'flex', alignItems: 'center', gap: '2px', fontSize: '9px', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-secondary-600)', backgroundColor: 'var(--color-secondary-50)', padding: '1px 5px', borderRadius: 'var(--radius-full)' },

  // FAB
  fab: { position: 'absolute', bottom: 'var(--space-4)', right: 'var(--space-4)', width: '52px', height: '52px', borderRadius: 'var(--radius-full)', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(234, 179, 8, 0.4)' },

  // Detail
  detailImgWrap: { position: 'relative', aspectRatio: '4/3', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: 'var(--space-4)' },
  detailImg: { width: '100%', height: '100%', objectFit: 'cover' },
  detailRarity: { position: 'absolute', top: 'var(--space-3)', right: 'var(--space-3)', padding: '4px 10px', borderRadius: 'var(--radius-full)', backgroundColor: 'rgba(0,0,0,0.7)', color: 'var(--color-primary-400)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)' },
  detailVerified: { position: 'absolute', top: 'var(--space-3)', left: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '3px', padding: '4px 10px', borderRadius: 'var(--radius-full)', backgroundColor: 'rgba(0,0,0,0.7)', color: 'var(--color-secondary-400)', fontSize: '10px', fontWeight: 'var(--font-weight-bold)' },
  detailBody: {},
  detailTitle: { fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', lineHeight: 'var(--line-height-tight)', marginBottom: 'var(--space-2)' },
  detailPriceRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' },
  detailPrice: { fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  detailCondition: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-success-600)', backgroundColor: 'var(--color-success-50)', padding: '2px 8px', borderRadius: 'var(--radius-full)' },

  // AI valuation
  aiValCard: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', backgroundColor: 'var(--color-primary-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-primary-200)', marginBottom: 'var(--space-4)' },
  aiValInfo: { flex: 1 },
  aiValLabel: { display: 'block', fontSize: '10px', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-primary-600)' },
  aiValRange: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-800)' },
  aiValTag: { fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-success-700)', backgroundColor: 'var(--color-success-50)', padding: '2px 6px', borderRadius: 'var(--radius-full)' },

  // Seller card
  sellerCard: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' },
  sellerCardAvatar: { width: '36px', height: '36px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-neutral-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sellerCardInfo: { flex: 1 },
  sellerCardNameRow: { display: 'flex', alignItems: 'center', gap: '4px' },
  sellerCardName: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)' },
  sellerCardStats: { display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' },
  sellerCardRating: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-700)' },
  sellerCardDot: { width: '3px', height: '3px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-neutral-300)' },
  sellerCardSales: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },

  // Detail section
  detailSection: { marginBottom: 'var(--space-4)' },
  detailSectionTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)', marginBottom: 'var(--space-3)' },
  attrList: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  attrRow: { display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) var(--space-3)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-sm)' },
  attrLabel: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },
  attrVal: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)' },

  // Trust
  trustSection: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' },
  trustItem: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-sm)' },
  trustText: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-700)' },

  // Offers
  offerHistory: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  offerRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-sm)' },
  offerUser: { flex: 1, fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-600)' },
  offerAmt: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-800)' },
  offerStatus: { fontSize: '10px', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-error-500)' },

  // Similar
  similarScroll: { display: 'flex', gap: 'var(--space-3)', overflow: 'auto' },
  similarCard: { minWidth: '120px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--color-neutral-100)', flexShrink: 0 },
  similarImg: { width: '100%', aspectRatio: '1', objectFit: 'cover' },
  similarTitle: { display: 'block', padding: 'var(--space-2) var(--space-2) 0', fontSize: '10px', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-700)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  similarPrice: { display: 'block', padding: '0 var(--space-2) var(--space-2)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },

  // Bottom actions
  detailActions: { display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--color-neutral-100)', flexShrink: 0 },
  offerBtn: { flex: 1, padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '2px solid var(--color-neutral-900)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  offerBtnText: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-900)' },
  buyNowBtn: { flex: 1, padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  buyNowBtnText: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-0)' },

  // Create listing
  createSection: { paddingTop: 'var(--space-2)' },
  stepRow: { display: 'flex', justifyContent: 'center', gap: 'var(--space-6)', marginBottom: 'var(--space-5)' },
  stepItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' },
  stepCircle: { width: '28px', height: '28px', borderRadius: 'var(--radius-full)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-0)' },
  stepLabel: { fontSize: '10px', color: 'var(--color-neutral-500)' },
  photoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' },
  photoSlotMain: { gridColumn: '1 / -1', aspectRatio: '16/9', borderRadius: 'var(--radius-md)', border: '2px dashed var(--color-neutral-200)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' },
  photoSlotSmall: { aspectRatio: '1', borderRadius: 'var(--radius-md)', border: '2px dashed var(--color-neutral-200)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  photoSlotText: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-400)' },

  // AI suggestion
  aiSuggest: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3)', backgroundColor: 'var(--color-primary-50)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', border: '1px solid var(--color-primary-200)' },
  aiSuggestText: { fontSize: 'var(--font-size-xs)', color: 'var(--color-primary-700)', fontWeight: 'var(--font-weight-medium)' },

  // Form
  formGroup: { marginBottom: 'var(--space-4)' },
  formLabel: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-700)', marginBottom: 'var(--space-2)' },
  formInput: { width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-200)', fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-800)' },
  priceInputWrap: { display: 'flex', alignItems: 'center', border: '1px solid var(--color-neutral-200)', borderRadius: 'var(--radius-md)', overflow: 'hidden' },
  priceCurrency: { padding: 'var(--space-3)', backgroundColor: 'var(--color-neutral-50)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-600)', borderRight: '1px solid var(--color-neutral-200)' },
  priceInput: { flex: 1, padding: 'var(--space-3)', border: 'none', fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-800)' },
  aiPriceHint: { fontSize: '10px', color: 'var(--color-primary-600)', marginTop: '4px' },
  catSelectGrid: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' },
  catSelect: { padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', backgroundColor: 'var(--color-neutral-100)', color: 'var(--color-neutral-600)' },
  catSelectActive: { backgroundColor: 'var(--color-neutral-900)', color: 'var(--color-neutral-0)' },
  conditionRow: { display: 'flex', gap: 'var(--space-2)' },
  condChip: { flex: 1, padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', textAlign: 'center', backgroundColor: 'var(--color-neutral-50)', color: 'var(--color-neutral-600)', border: '1px solid var(--color-neutral-200)' },
  condChipActive: { borderColor: 'var(--color-primary-400)', backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-700)' },
  toggleList: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' },
  toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-700)' },
  toggle: { width: '28px', height: '14px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-neutral-200)', position: 'relative' },
  toggleKnob: { position: 'absolute', top: '2px', left: '2px', width: '10px', height: '10px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-neutral-0)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'transform 0.2s ease' },

  // Preview
  previewCard: { borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-100)', overflow: 'hidden', marginBottom: 'var(--space-4)' },
  previewImgWrap: { aspectRatio: '16/9' },
  previewImgPlaceholder: { width: '100%', height: '100%', backgroundColor: 'var(--color-neutral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  previewInfo: { padding: 'var(--space-4)' },
  previewTitle: { display: 'block', fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', marginBottom: '4px' },
  previewPrice: { display: 'block', fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', marginBottom: '4px' },
  previewMeta: { display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)', marginBottom: 'var(--space-3)' },
  previewBadges: { display: 'flex', gap: 'var(--space-2)' },
  previewBadge: { display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 8px', borderRadius: 'var(--radius-full)', fontSize: '10px', fontWeight: 'var(--font-weight-medium)', backgroundColor: 'var(--color-neutral-100)', color: 'var(--color-neutral-600)' },

  // Continue button
  continueBtn: { width: '100%', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(234, 179, 8, 0.3)', marginTop: 'var(--space-2)' },
  continueBtnText: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-0)' },

  // Offer screen
  offerItemCard: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' },
  offerItemImg: { width: '48px', height: '48px', borderRadius: 'var(--radius-sm)', objectFit: 'cover' },
  offerItemInfo: { flex: 1 },
  offerItemTitle: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)' },
  offerItemPrice: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },
  offerInputSection: { marginBottom: 'var(--space-4)' },
  offerInputWrap: { display: 'flex', alignItems: 'center', border: '2px solid var(--color-primary-400)', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: 'var(--space-2)' },
  offerCurrency: { padding: 'var(--space-3) var(--space-4)', backgroundColor: 'var(--color-primary-50)', fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-700)' },
  offerInput: { flex: 1, padding: 'var(--space-3)', border: 'none', fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  suggestedOffers: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  suggestedLabel: { fontSize: '10px', color: 'var(--color-neutral-400)' },
  suggestedChip: { padding: '2px 8px', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', backgroundColor: 'var(--color-neutral-100)', color: 'var(--color-neutral-700)' },

  // Chat timeline
  chatTimeline: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  chatBubbleOther: { padding: 'var(--space-3)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)', borderTopLeftRadius: '2px' },
  chatBubbleSeller: { padding: 'var(--space-3)', backgroundColor: 'var(--color-primary-50)', borderRadius: 'var(--radius-md)', borderTopRightRadius: '2px', alignSelf: 'flex-end' },
  chatSender: { display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-700)' },
  chatTime: { fontSize: '10px', color: 'var(--color-neutral-400)' },

  // Seller trust
  sellerTrustCard: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', backgroundColor: 'var(--color-secondary-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-secondary-100)', marginBottom: 'var(--space-4)' },
  sellerTrustInfo: { flex: 1 },
  sellerTrustTitle: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-secondary-700)' },
  sellerTrustDesc: { fontSize: '10px', color: 'var(--color-secondary-600)' },

  // Checkout
  checkoutItem: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' },
  checkoutImg: { width: '56px', height: '56px', borderRadius: 'var(--radius-sm)', objectFit: 'cover' },
  checkoutItemInfo: { flex: 1 },
  checkoutItemTitle: { display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)' },
  checkoutItemPrice: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  protectionCard: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', backgroundColor: 'var(--color-secondary-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-secondary-100)', marginBottom: 'var(--space-4)' },
  protectionInfo: { flex: 1 },
  protectionTitle: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-secondary-700)' },
  protectionDesc: { fontSize: '10px', color: 'var(--color-secondary-600)' },
  deliveryOptions: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  deliveryOption: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-200)', textAlign: 'left' },
  deliveryOptionActive: { borderColor: 'var(--color-primary-400)', backgroundColor: 'var(--color-primary-50)' },
  deliveryOptionInfo: { flex: 1 },
  deliveryOptionTitle: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)' },
  deliveryOptionDetail: { fontSize: '10px', color: 'var(--color-neutral-500)' },

  // Summary
  summaryCard: { padding: 'var(--space-3)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)' },
  summaryRow: { display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0' },
  summaryLabel: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-600)' },
  summaryVal: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-800)' },
  summaryDivider: { height: '1px', backgroundColor: 'var(--color-neutral-200)', margin: 'var(--space-2) 0' },
  summaryLabelBold: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  summaryValBold: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },

  // Confirmation
  confirmContent: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6)' },
  confirmIcon: { width: '64px', height: '64px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-success-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 'var(--space-4)' },
  confirmTitle: { fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', marginBottom: 'var(--space-2)' },
  confirmDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-500)', textAlign: 'center', marginBottom: 'var(--space-5)', lineHeight: 'var(--line-height-normal)' },
  confirmCard: { width: '100%', padding: 'var(--space-4)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-5)' },
  confirmRow: { display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0' },
  confirmLabel: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-500)' },
  confirmVal: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)' },
  confirmValGreen: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-success-600)' },

  // Seller dashboard
  dashStatsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' },
  dashStatCard: { padding: 'var(--space-4)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)', textAlign: 'center', border: '1px solid var(--color-neutral-100)' },
  dashStatVal: { display: 'block', fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  dashStatLbl: { fontSize: '10px', color: 'var(--color-neutral-500)' },
  perfCard: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  perfRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-sm)' },
  perfLabel: { flex: 1, fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-600)' },
  perfVal: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-800)' },
  perfValGreen: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-success-600)' },
  perfNeutral: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-400)' },
  dashListingRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) 0', borderBottom: '1px solid var(--color-neutral-50)' },
  dashListingImg: { width: '44px', height: '44px', borderRadius: 'var(--radius-sm)', objectFit: 'cover' },
  dashListingInfo: { flex: 1 },
  dashListingTitle: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)' },
  dashListingPrice: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  dashListingStats: {},
  dashListingStat: { display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: 'var(--color-neutral-400)' },
  chartMock: { padding: 'var(--space-4)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)' },
  chartBars: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '100px', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' },
  chartBar: { flex: 1, backgroundColor: 'var(--color-primary-400)', borderRadius: 'var(--radius-sm)', minHeight: '8px' },
  chartLabels: { display: 'flex', justifyContent: 'space-between' },
  chartLabel: { fontSize: '10px', color: 'var(--color-neutral-400)', textAlign: 'center', flex: 1 },
};
