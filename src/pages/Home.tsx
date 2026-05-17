import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Bookmark, Share2, Gavel, MapPin, ShoppingBag, Crown, Users, Calendar, Zap, HelpCircle, X, Camera, Brain, Radar, Trophy, TrendingUp, ChevronRight } from 'lucide-react';
import { TreasureChestBrand } from '../components/TreasureChestLogo';
import { fetchCommunityPosts } from '../lib/database';
import type { CommunityPost } from '../lib/supabase';

const categories = ['All', 'Electronics', 'Furniture', 'Books', 'Collectibles', 'Antiques', 'Art', 'Jewelry'];

export default function Home() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');

  useEffect(() => {
    fetchCommunityPosts()
      .then(setPosts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filteredPosts = activeCategory === 'All'
    ? posts
    : posts.filter((p) => (p.category ?? '').toLowerCase() === activeCategory.toLowerCase());

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <TreasureChestBrand />
        <div style={styles.headerActions}>
          <button onClick={() => setShowInfo(true)} style={styles.infoBtn} aria-label="How TreasureTrail Works">
            <HelpCircle size={15} style={{ color: 'var(--color-neutral-500)' }} />
          </button>
          <button onClick={() => navigate('/pro')} style={styles.proBtn}>
            <Crown size={12} style={{ color: 'var(--color-primary-700)' }} />
            <span style={styles.proBtnText}>Pro</span>
          </button>
          <button onClick={() => navigate('/live')} style={styles.liveBtn}>
            <Zap size={14} style={{ color: 'var(--color-error-500)' }} />
          </button>
          <button onClick={() => navigate('/community')} style={styles.communityBtn}>
            <Users size={14} style={{ color: 'var(--color-secondary-600)' }} />
          </button>
          <button onClick={() => navigate('/marketplace')} style={styles.marketBtn}>
            <ShoppingBag size={14} style={{ color: 'var(--color-accent-600)' }} />
          </button>
          <button onClick={() => navigate('/events')} style={styles.eventsBtn}>
            <Calendar size={14} style={{ color: 'var(--color-success-600)' }} />
          </button>
          <button onClick={() => navigate('/scout-map')} style={styles.mapBtn}>
            <MapPin size={16} style={{ color: 'var(--color-secondary-600)' }} />
          </button>
          <button onClick={() => navigate('/auctions')} style={styles.auctionBtn}>
            <Gavel size={16} style={{ color: 'var(--color-primary-600)' }} />
          </button>
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

      <div style={styles.feed}>
        {loading && (
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>Loading finds...</p>
          </div>
        )}

        {!loading && posts.length === 0 && (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>No finds yet</p>
            <p style={styles.emptyText}>Be the first to share a treasure find!</p>
            <button onClick={() => navigate('/community')} style={styles.emptyBtn}>
              Share a Find
            </button>
          </div>
        )}

        {!loading && posts.length > 0 && filteredPosts.length === 0 && (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>No {activeCategory} finds yet</p>
            <p style={styles.emptyText}>Be the first to share a {activeCategory.toLowerCase()} treasure!</p>
            <button onClick={() => navigate('/community')} style={styles.emptyBtn}>
              Share a Find
            </button>
          </div>
        )}

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
    title: 'Rare Radar',
    desc: 'Set up searches for specific items. Get alerted when matching finds appear in your area.',
  },
  {
    icon: Users,
    color: 'var(--color-success-600)',
    bg: 'var(--color-success-50)',
    title: 'Community Scouting',
    desc: 'Connect with fellow hunters, share finds, and hire local scouts to check items for you.',
  },
  {
    icon: Gavel,
    color: 'var(--color-warning-600)',
    bg: 'var(--color-warning-50)',
    title: 'Auctions & Marketplace',
    desc: 'List items for auction or fixed-price sale directly within the community.',
  },
  {
    icon: Trophy,
    color: 'var(--color-error-500)',
    bg: 'var(--color-error-50)',
    title: 'Reputation & Achievements',
    desc: 'Build your hunter profile, earn badges, and climb the leaderboard as you flip and find.',
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
};
