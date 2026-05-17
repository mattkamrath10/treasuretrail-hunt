import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Bookmark, Share2, Gavel, MapPin, ShoppingBag, Crown, Users, Calendar, Zap } from 'lucide-react';
import { TreasureChestBrand } from '../components/TreasureChestLogo';
import { fetchCommunityPosts } from '../lib/database';
import type { CommunityPost } from '../lib/supabase';

const categories = ['All', 'Electronics', 'Furniture', 'Books', 'Collectibles', 'Antiques', 'Art', 'Jewelry'];

export default function Home() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCommunityPosts()
      .then(setPosts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <TreasureChestBrand />
        <div style={styles.headerActions}>
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
        {categories.map((cat, i) => (
          <button
            key={cat}
            style={{
              ...styles.categoryChip,
              ...(i === 0 ? styles.categoryChipActive : {}),
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

        {posts.map((post, index) => (
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
    </div>
  );
}

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
