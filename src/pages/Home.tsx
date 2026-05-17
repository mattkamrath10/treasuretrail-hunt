import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Bookmark, Share2, Gavel, MapPin, ShoppingBag, Crown, Users, Calendar, Zap, HelpCircle, X, Camera, Brain, Radar, TrendingUp, ChevronRight, ExternalLink } from 'lucide-react';
import { TreasureChestBrand } from '../components/TreasureChestLogo';
import { fetchCommunityPosts } from '../lib/database';
import { supabase } from '../lib/supabase';
import type { CommunityPost } from '../lib/supabase';

const categories = ['All', 'Electronics', 'Furniture', 'Books', 'Collectibles', 'Antiques', 'Art', 'Jewelry', 'Fashion', 'Watches'];

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
  created_at: string;
}

const PLATFORM_COLORS: Record<string, string> = {
  whatnot: '#FF5C00', poshmark: '#C13584', ebay: '#E53238',
  hibid: '#1A3668', maxsold: '#007A74', estatesales: '#7B4F2E',
  facebook: '#1877F2', other: '#6B7280',
};

export default function Home() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [listings, setListings] = useState<ExternalListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');

  useEffect(() => {
    fetchCommunityPosts()
      .then(setPosts)
      .catch(() => {})
      .finally(() => setLoading(false));
    supabase
      .from('external_listings')
      .select('id,platform,listing_type,external_url,title,price_display,category,image_url,ends_at,scout_needed,ships_available,created_at')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => { if (data) setListings(data as ExternalListing[]); });
  }, []);

  const filteredPosts = activeCategory === 'All'
    ? posts
    : posts.filter((p) => (p.category ?? '').toLowerCase() === activeCategory.toLowerCase());

  const filteredListings = activeCategory === 'All'
    ? listings
    : listings.filter((l) => (l.category ?? '').toLowerCase() === activeCategory.toLowerCase());

  const radarListings = listings
    .filter((l) => l.listing_type === 'live_stream' || l.listing_type === 'auction')
    .slice(0, 6);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <TreasureChestBrand />
        <div style={styles.headerActions}>
          <TooltipBtn onClick={() => setShowInfo(true)} btnStyle={styles.infoBtn} label="How It Works" desc="Learn what TreasureTrail does">
            <HelpCircle size={15} style={{ color: 'var(--color-neutral-500)' }} />
          </TooltipBtn>
          <button onClick={() => navigate('/pro')} style={styles.proBtn} title="Premium Membership — Unlock all tools">
            <Crown size={12} style={{ color: 'var(--color-primary-700)' }} />
            <span style={styles.proBtnText}>Pro</span>
          </button>
          <TooltipBtn onClick={() => navigate('/live')} btnStyle={styles.liveBtn} label="Live Hub" desc="Active missions and live events">
            <Zap size={14} style={{ color: 'var(--color-error-500)' }} />
          </TooltipBtn>
          <TooltipBtn onClick={() => navigate('/community')} btnStyle={styles.communityBtn} label="Community" desc="Share finds with other hunters">
            <Users size={14} style={{ color: 'var(--color-secondary-600)' }} />
          </TooltipBtn>
          <TooltipBtn onClick={() => navigate('/marketplace')} btnStyle={styles.marketBtn} label="Marketplace" desc="Browse and list items for sale">
            <ShoppingBag size={14} style={{ color: 'var(--color-accent-600)' }} />
          </TooltipBtn>
          <TooltipBtn onClick={() => navigate('/events')} btnStyle={styles.eventsBtn} label="Events" desc="Estate sales and local events">
            <Calendar size={14} style={{ color: 'var(--color-success-600)' }} />
          </TooltipBtn>
          <TooltipBtn onClick={() => navigate('/scout-map')} btnStyle={styles.mapBtn} label="Scout Map" desc="View hunter activity near you">
            <MapPin size={16} style={{ color: 'var(--color-secondary-600)' }} />
          </TooltipBtn>
          <TooltipBtn onClick={() => navigate('/auctions')} btnStyle={styles.auctionBtn} label="Auction Radar" desc="Discover live auctions and scout opportunities">
            <Gavel size={16} style={{ color: 'var(--color-primary-600)' }} />
          </TooltipBtn>
        </div>
      </header>

      <div style={styles.categories}>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              ...styles.categoryChip,
              ...(cat === activeCategory ? styles.categoryChipActive : {}),
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Auction Radar strip */}
      {radarListings.length > 0 && (
        <div style={styles.radarSection}>
          <div style={styles.radarHeader}>
            <div style={styles.radarLiveDot} />
            <span style={styles.radarTitle}>Auction Radar</span>
            <button onClick={() => navigate('/auctions')} style={styles.radarSeeAll}>See All</button>
          </div>
          <div style={styles.radarScroll}>
            {radarListings.map((listing) => (
              <AuctionRadarCard key={listing.id} listing={listing} onClick={() => navigate('/auctions')} />
            ))}
          </div>
        </div>
      )}

      <div style={styles.feed}>
        {loading && (
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>Loading finds...</p>
          </div>
        )}

        {!loading && posts.length === 0 && listings.length === 0 && (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>No finds yet</p>
            <p style={styles.emptyText}>Be the first to share a treasure find!</p>
            <button onClick={() => navigate('/community')} style={styles.emptyBtn}>
              Share a Find
            </button>
          </div>
        )}

        {!loading && (posts.length > 0 || listings.length > 0) && filteredPosts.length === 0 && filteredListings.length === 0 && (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>No {activeCategory} finds yet</p>
            <p style={styles.emptyText}>Be the first to share a {activeCategory.toLowerCase()} treasure!</p>
            <button onClick={() => navigate('/community')} style={styles.emptyBtn}>
              Share a Find
            </button>
          </div>
        )}

        {filteredListings.map((listing, index) => (
          <ExternalListingCard key={listing.id} listing={listing} index={index} onClick={() => navigate('/auctions')} />
        ))}

        {filteredPosts.map((post, index) => (
          <article
            key={post.id}
            style={{
              ...styles.card,
              animationDelay: `${index * 80}ms`,
            }}
          >
            <div style={styles.cardImageContainer}>
              {post.image_url ? (
                <img
                  src={post.image_url}
                  alt={post.caption}
                  style={styles.cardImage}
                  loading="lazy"
                />
              ) : (
                <div style={{ ...styles.cardImage, backgroundColor: 'var(--color-neutral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bookmark size={32} style={{ color: 'var(--color-neutral-300)' }} />
                </div>
              )}
              <span style={styles.priceBadge}>{post.for_sale ? 'For Sale' : post.type}</span>
            </div>

            <div style={styles.cardContent}>
              <div style={styles.cardHeader}>
                <div style={{ ...styles.avatar, backgroundColor: 'var(--color-primary-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700, color: 'var(--color-primary-700)' }}>
                  {(post.profiles?.username || 'U').slice(0, 1).toUpperCase()}
                </div>
                <div style={styles.cardMeta}>
                  <span style={styles.username}>@{post.profiles?.username || 'hunter'}</span>
                  <span style={styles.timeAgo}>{new Date(post.created_at).toLocaleDateString()}</span>
                </div>
                <span style={styles.categoryTag}>{post.category}</span>
              </div>

              <h3 style={styles.cardTitle}>{post.caption}</h3>

              <div style={styles.cardActions}>
                <button style={styles.actionBtn}>
                  <Heart size={18} />
                  <span>{post.like_count}</span>
                </button>
                <button style={styles.actionBtn}>
                  <MessageCircle size={18} />
                  <span>{post.comment_count}</span>
                </button>
                <button style={styles.actionBtn}>
                  <Bookmark size={18} />
                </button>
                <button style={styles.actionBtn}>
                  <Share2 size={18} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {showInfo && <InfoPanel onClose={() => setShowInfo(false)} />}
    </div>
  );
}

const FEATURES = [
  {
    icon: Camera,
    color: 'var(--color-primary-600)',
    bg: 'var(--color-primary-50)',
    title: 'Flash Finds',
    desc: 'Photograph any item at a sale or thrift store and instantly log it to your collection.',
  },
  {
    icon: Brain,
    color: 'var(--color-secondary-600)',
    bg: 'var(--color-secondary-50)',
    title: 'AI Value Estimation',
    desc: 'Get instant AI-powered assessments of rarity, resale potential, and pricing guidance.',
  },
  {
    icon: Radar,
    color: 'var(--color-accent-600)',
    bg: 'var(--color-accent-50)',
    title: 'RARE Radar',
    desc: 'Set up searches for specific items. Get alerted when matching finds appear in your area.',
  },
  {
    icon: Gavel,
    color: 'var(--color-warning-600)',
    bg: 'var(--color-warning-50)',
    title: 'Auction Radar',
    desc: 'Discover live Whatnot streams, HiBid auctions, Poshmark listings, and estate sales in one feed.',
  },
  {
    icon: Users,
    color: 'var(--color-success-600)',
    bg: 'var(--color-success-50)',
    title: 'Scout Network',
    desc: 'Hire local scouts to inspect or pick up items for you, or offer your own scout services.',
  },
  {
    icon: ShoppingBag,
    color: 'var(--color-error-500)',
    bg: 'var(--color-error-50)',
    title: 'Marketplace',
    desc: 'List items for fixed-price sale and browse community listings across all categories.',
  },
];

const COMPARISONS = [
  {
    feature: 'Discovery-focused',
    tt: 'Built around the thrill of finding — sales, estates, thrift stores.',
    others: 'Listing-first: you already know what you want.',
  },
  {
    feature: 'Live treasure hunting',
    tt: 'Scan, log, and share finds in real time while you\'re out hunting.',
    others: 'No in-the-field tools. You list after the fact.',
  },
  {
    feature: 'AI valuation',
    tt: 'Instant AI estimates help you decide on the spot.',
    others: 'Manual research required outside the platform.',
  },
  {
    feature: 'Community scouts',
    tt: 'Hire local hunters to inspect or pick up items for you.',
    others: 'No scouting network. You\'re on your own.',
  },
  {
    feature: 'Flip culture',
    tt: 'Built for resellers, pickers, and collectors who love the hunt.',
    others: 'General buying and selling — no focus on the flip.',
  },
];

function InfoPanel({ onClose }: { onClose: () => void }) {
  return (
    <div style={panelStyles.overlay} onClick={onClose}>
      <div style={panelStyles.sheet} onClick={(e) => e.stopPropagation()}>
        {/* Handle */}
        <div style={panelStyles.handle} />

        {/* Header */}
        <div style={panelStyles.header}>
          <div>
            <h2 style={panelStyles.title}>How TreasureTrail Works</h2>
            <p style={panelStyles.subtitle}>The app built for real-world treasure hunters</p>
          </div>
          <button onClick={onClose} style={panelStyles.closeBtn}>
            <X size={18} style={{ color: 'var(--color-neutral-500)' }} />
          </button>
        </div>

        <div style={panelStyles.body}>
          {/* What is it */}
          <div style={panelStyles.introBanner}>
            <p style={panelStyles.introText}>
              TreasureTrail is a live treasure hunting platform — part community, part marketplace, part AI tool — designed for people who love finding, flipping, and collecting real-world items.
            </p>
          </div>

          {/* Features */}
          <h3 style={panelStyles.sectionTitle}>What you can do</h3>
          <div style={panelStyles.featureList}>
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} style={panelStyles.featureRow}>
                  <div style={{ ...panelStyles.featureIcon, backgroundColor: f.bg }}>
                    <Icon size={18} style={{ color: f.color }} />
                  </div>
                  <div style={panelStyles.featureText}>
                    <span style={panelStyles.featureTitle}>{f.title}</span>
                    <span style={panelStyles.featureDesc}>{f.desc}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Comparison */}
          <h3 style={{ ...panelStyles.sectionTitle, marginTop: '24px' }}>TreasureTrail vs eBay / Facebook Marketplace</h3>
          <div style={panelStyles.comparisonCard}>
            <div style={panelStyles.comparisonHeader}>
              <span style={panelStyles.compColLabel}>Feature</span>
              <span style={{ ...panelStyles.compColLabel, color: 'var(--color-primary-700)' }}>TreasureTrail</span>
              <span style={{ ...panelStyles.compColLabel, color: 'var(--color-neutral-400)' }}>eBay / FB</span>
            </div>
            {COMPARISONS.map((row, i) => (
              <div key={row.feature} style={{ ...panelStyles.compRow, ...(i % 2 === 0 ? panelStyles.compRowAlt : {}) }}>
                <div style={panelStyles.compFeature}>
                  <ChevronRight size={12} style={{ color: 'var(--color-primary-400)', flexShrink: 0 }} />
                  <span style={panelStyles.compFeatureLabel}>{row.feature}</span>
                </div>
                <span style={panelStyles.compTT}>{row.tt}</span>
                <span style={panelStyles.compOther}>{row.others}</span>
              </div>
            ))}
          </div>

          {/* Tagline */}
          <div style={panelStyles.tagline}>
            <TrendingUp size={16} style={{ color: 'var(--color-primary-500)' }} />
            <p style={panelStyles.taglineText}>Not just a marketplace — a hunting ground.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const panelStyles: Record<string, React.CSSProperties> = {
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
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '16px 20px 12px',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  title: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    marginBottom: '2px',
  },
  subtitle: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
  },
  closeBtn: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-100)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body: {
    flex: 1,
    overflow: 'auto',
    padding: '16px 20px 32px',
  },
  introBanner: {
    backgroundColor: 'var(--color-primary-50)',
    border: '1px solid var(--color-primary-100)',
    borderRadius: 'var(--radius-md)',
    padding: '12px 14px',
    marginBottom: '20px',
  },
  introText: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-700)',
    lineHeight: '1.55',
  },
  sectionTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-500)',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    marginBottom: '12px',
  },
  featureList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  featureRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  featureIcon: {
    width: '38px',
    height: '38px',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
    paddingTop: '2px',
  },
  featureTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },
  featureDesc: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
    lineHeight: '1.45',
  },
  comparisonCard: {
    border: '1px solid var(--color-neutral-150)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
  },
  comparisonHeader: {
    display: 'grid',
    gridTemplateColumns: '1fr 1.4fr 1.4fr',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: 'var(--color-neutral-50)',
    borderBottom: '1px solid var(--color-neutral-100)',
  },
  compColLabel: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--color-neutral-500)',
  },
  compRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1.4fr 1.4fr',
    gap: '8px',
    padding: '10px 12px',
    borderBottom: '1px solid var(--color-neutral-100)',
    alignItems: 'start',
  },
  compRowAlt: {
    backgroundColor: 'var(--color-neutral-50)',
  },
  compFeature: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '4px',
    paddingTop: '1px',
  },
  compFeatureLabel: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-700)',
    lineHeight: '1.4',
  },
  compTT: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-primary-700)',
    lineHeight: '1.4',
  },
  compOther: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
    lineHeight: '1.4',
  },
  tagline: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    marginTop: '20px',
    padding: '12px',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary-50), var(--color-accent-50))',
    border: '1px solid var(--color-primary-100)',
  },
  taglineText: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-primary-700)',
    fontStyle: 'italic',
  },
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-700)',
    marginBottom: '4px',
  },
  emptyText: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-400)',
    marginBottom: '16px',
  },
  emptyBtn: {
    padding: '10px 20px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-600)',
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    cursor: 'pointer',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4) var(--space-4)',
    height: 'var(--header-height)',
    backgroundColor: 'var(--color-neutral-0)',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  headerActions: {
    display: 'flex',
    gap: 'var(--space-3)',
    alignItems: 'center',
  },
  infoBtn: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-100)',
    border: '1px solid var(--color-neutral-200)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBtn: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-error-50)',
    border: '1px solid var(--color-error-200)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  communityBtn: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-secondary-50)',
    border: '1px solid var(--color-secondary-200)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventsBtn: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-success-50)',
    border: '1px solid var(--color-success-200)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  marketBtn: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-50)',
    border: '1px solid var(--color-accent-200)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapBtn: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-secondary-50)',
    border: '1px solid var(--color-secondary-200)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  proBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    padding: 'var(--space-1) var(--space-2)',
    borderRadius: 'var(--radius-full)',
    background: 'linear-gradient(135deg, var(--color-primary-50), var(--color-accent-50))',
    border: '1px solid var(--color-primary-200)',
  },
  proBtnText: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-700)',
  },
  auctionBtn: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-50)',
    border: '1px solid var(--color-primary-200)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categories: {
    display: 'flex',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    overflowX: 'auto',
    flexShrink: 0,
    backgroundColor: 'var(--color-neutral-0)',
  },
  categoryChip: {
    padding: 'var(--space-2) var(--space-4)',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    whiteSpace: 'nowrap',
    backgroundColor: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-600)',
    transition: 'all var(--transition-fast)',
    border: '1px solid transparent',
  },
  categoryChipActive: {
    backgroundColor: 'var(--color-primary-50)',
    color: 'var(--color-primary-700)',
    border: '1px solid var(--color-primary-200)',
  },
  feed: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-3)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    paddingBottom: 'var(--space-4)',
  },
  card: {
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow-md)',
    animation: 'slideUp 0.4s ease forwards',
    opacity: 0,
    animationFillMode: 'forwards',
  },
  cardImageContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: '4/3',
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  hotBadge: {
    position: 'absolute',
    top: 'var(--space-3)',
    left: 'var(--space-3)',
    padding: '3px var(--space-2)',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--color-error-500)',
    color: 'white',
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    letterSpacing: '0.5px',
  },
  priceBadge: {
    position: 'absolute',
    bottom: 'var(--space-3)',
    right: 'var(--space-3)',
    padding: 'var(--space-1) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    color: 'white',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    backdropFilter: 'blur(4px)',
  },
  cardContent: {
    padding: 'var(--space-3) var(--space-4) var(--space-4)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-2)',
  },
  avatar: {
    width: '28px',
    height: '28px',
    borderRadius: 'var(--radius-full)',
    objectFit: 'cover',
  },
  cardMeta: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  },
  username: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
  },
  timeAgo: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },
  categoryTag: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    padding: '2px var(--space-2)',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--color-secondary-50)',
    color: 'var(--color-secondary-700)',
  },
  cardTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
    marginBottom: 'var(--space-3)',
    lineHeight: 'var(--line-height-tight)',
  },
  cardActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
  },
  actionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    color: 'var(--color-neutral-500)',
    fontSize: 'var(--font-size-sm)',
    transition: 'color var(--transition-fast)',
  },
  radarSection: {
    borderBottom: '1px solid var(--color-neutral-100)',
    backgroundColor: 'var(--color-neutral-0)',
    flexShrink: 0,
  },
  radarHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: '10px var(--space-4) 6px',
  },
  radarLiveDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-error-500)',
    boxShadow: '0 0 0 2px var(--color-error-100)',
    flexShrink: 0,
  },
  radarTitle: {
    flex: 1,
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-800)',
  },
  radarSeeAll: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-primary-600)',
  },
  radarScroll: {
    display: 'flex',
    gap: 'var(--space-3)',
    padding: '0 var(--space-4) 12px',
    overflowX: 'auto',
    scrollbarWidth: 'none',
  },
};

function TooltipBtn({ onClick, btnStyle, label, desc, children }: {
  onClick: () => void;
  btnStyle: React.CSSProperties;
  label: string;
  desc: string;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => { onClick(); setVisible(false); }}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        onTouchStart={() => {
          if (timerRef.current) clearTimeout(timerRef.current);
          setVisible(true);
          timerRef.current = setTimeout(() => setVisible(false), 2000);
        }}
        style={btnStyle}
        aria-label={label}
      >
        {children}
      </button>
      {visible && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 7px)',
          right: 0,
          backgroundColor: 'rgba(15,15,15,0.92)',
          color: '#fff',
          borderRadius: '9px',
          padding: '8px 10px',
          width: '148px',
          zIndex: 500,
          pointerEvents: 'none',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}>
          <p style={{ fontSize: '11px', fontWeight: 700, marginBottom: '3px', lineHeight: 1.2 }}>{label}</p>
          <p style={{ fontSize: '10px', opacity: 0.75, lineHeight: 1.35 }}>{desc}</p>
          <div style={{ position: 'absolute', bottom: -4, right: 14, width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid rgba(15,15,15,0.92)' }} />
        </div>
      )}
    </div>
  );
}

function AuctionRadarCard({ listing, onClick }: { listing: ExternalListing; onClick: () => void }) {
  const color = PLATFORM_COLORS[listing.platform] ?? PLATFORM_COLORS.other;
  const platformLabel = listing.platform.charAt(0).toUpperCase() + listing.platform.slice(1);
  return (
    <button onClick={onClick} style={{
      flexShrink: 0,
      width: '120px',
      borderRadius: '10px',
      border: '1px solid var(--color-neutral-100)',
      backgroundColor: 'var(--color-neutral-0)',
      overflow: 'hidden',
      textAlign: 'left',
    }}>
      <div style={{ width: '100%', height: '72px', backgroundColor: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
        {listing.image_url ? (
          <img src={listing.image_url} alt={listing.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <Gavel size={22} style={{ color }} />
        )}
        {listing.listing_type === 'live_stream' && (
          <span style={{ position: 'absolute', top: 4, left: 4, backgroundColor: 'var(--color-error-500)', color: '#fff', fontSize: '9px', fontWeight: 700, padding: '2px 5px', borderRadius: '4px' }}>LIVE</span>
        )}
      </div>
      <div style={{ padding: '6px 7px 7px' }}>
        <span style={{ display: 'inline-block', fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', backgroundColor: `${color}18`, color, marginBottom: '3px' }}>{platformLabel}</span>
        <p style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-neutral-800)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{listing.title}</p>
        {listing.price_display && <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-success-700)', marginTop: '2px', display: 'block' }}>{listing.price_display}</span>}
      </div>
    </button>
  );
}

function ExternalListingCard({ listing, index, onClick }: { listing: ExternalListing; index: number; onClick: () => void }) {
  const color = PLATFORM_COLORS[listing.platform] ?? PLATFORM_COLORS.other;
  const platformLabel = listing.platform.charAt(0).toUpperCase() + listing.platform.slice(1);
  return (
    <article style={{ ...styles.card, animation: `fadeIn 0.3s ease ${index * 0.05}s both` }}>
      <div style={styles.cardHeader}>
        <div style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-full)', backgroundColor: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Gavel size={13} style={{ color }} />
        </div>
        <div style={styles.cardMeta}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)' }}>{platformLabel}</span>
            <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', backgroundColor: `${color}18`, color }}>
              {listing.listing_type === 'live_stream' ? 'LIVE' : listing.listing_type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </span>
          </div>
          {listing.category && (
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-400)' }}>{listing.category}</span>
          )}
        </div>
        {listing.price_display && (
          <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-success-700)' }}>{listing.price_display}</span>
        )}
      </div>

      <p style={styles.cardTitle}>{listing.title}</p>

      {listing.image_url && (
        <div style={styles.cardImage}>
          <img src={listing.image_url} alt={listing.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}

      <div style={{ ...styles.cardActions, paddingTop: 'var(--space-2)' }}>
        {listing.scout_needed && (
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-warning-700)', backgroundColor: 'var(--color-warning-50)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>Scout Needed</span>
        )}
        {listing.ships_available && (
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-success-700)', backgroundColor: 'var(--color-success-50)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>Ships</span>
        )}
        <button onClick={onClick} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-primary-600)', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>
          <ExternalLink size={12} />
          View
        </button>
      </div>
    </article>
  );
}
