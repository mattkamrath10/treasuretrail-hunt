import { useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Bookmark, Share2, Gavel, MapPin, ShoppingBag, Crown, Users, Calendar, Zap } from 'lucide-react';
import { TreasureChestBrand } from '../components/TreasureChestLogo';

interface FeedItem {
  id: string;
  image: string;
  title: string;
  username: string;
  avatar: string;
  category: string;
  price: string;
  likes: number;
  comments: number;
  timeAgo: string;
  isHot?: boolean;
}

const feedItems: FeedItem[] = [
  {
    id: '1',
    image: 'https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg?auto=compress&cs=tinysrgb&w=600',
    title: 'Vintage Polaroid SX-70 Camera',
    username: 'vintagehunter',
    avatar: 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=100',
    category: 'Electronics',
    price: '$45',
    likes: 234,
    comments: 18,
    timeAgo: '2h ago',
    isHot: true,
  },
  {
    id: '2',
    image: 'https://images.pexels.com/photos/1152077/pexels-photo-1152077.jpeg?auto=compress&cs=tinysrgb&w=600',
    title: 'Mid-Century Modern Teak Sideboard',
    username: 'estatefinds',
    avatar: 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=100',
    category: 'Furniture',
    price: '$180',
    likes: 512,
    comments: 42,
    timeAgo: '4h ago',
  },
  {
    id: '3',
    image: 'https://images.pexels.com/photos/1038000/pexels-photo-1038000.jpeg?auto=compress&cs=tinysrgb&w=600',
    title: 'First Edition Hemingway Collection',
    username: 'bookworm_scout',
    avatar: 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=100',
    category: 'Books',
    price: '$320',
    likes: 891,
    comments: 67,
    timeAgo: '6h ago',
    isHot: true,
  },
  {
    id: '4',
    image: 'https://images.pexels.com/photos/1191531/pexels-photo-1191531.jpeg?auto=compress&cs=tinysrgb&w=600',
    title: 'Hand-Painted Japanese Tea Set',
    username: 'thrift_queen',
    avatar: 'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=100',
    category: 'Collectibles',
    price: '$65',
    likes: 156,
    comments: 9,
    timeAgo: '8h ago',
  },
  {
    id: '5',
    image: 'https://images.pexels.com/photos/1037992/pexels-photo-1037992.jpeg?auto=compress&cs=tinysrgb&w=600',
    title: 'Antique Brass Compass - 1890s',
    username: 'treasure_map',
    avatar: 'https://images.pexels.com/photos/1043471/pexels-photo-1043471.jpeg?auto=compress&cs=tinysrgb&w=100',
    category: 'Antiques',
    price: '$275',
    likes: 723,
    comments: 31,
    timeAgo: '12h ago',
    isHot: true,
  },
];

const categories = ['All', 'Electronics', 'Furniture', 'Books', 'Collectibles', 'Antiques', 'Art', 'Jewelry'];

export default function Home() {
  const navigate = useNavigate();

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
        {feedItems.map((item, index) => (
          <article
            key={item.id}
            style={{
              ...styles.card,
              animationDelay: `${index * 80}ms`,
            }}
          >
            <div style={styles.cardImageContainer}>
              <img
                src={item.image}
                alt={item.title}
                style={styles.cardImage}
                loading="lazy"
              />
              {item.isHot && (
                <span style={styles.hotBadge}>HOT</span>
              )}
              <span style={styles.priceBadge}>{item.price}</span>
            </div>

            <div style={styles.cardContent}>
              <div style={styles.cardHeader}>
                <img
                  src={item.avatar}
                  alt={item.username}
                  style={styles.avatar}
                />
                <div style={styles.cardMeta}>
                  <span style={styles.username}>@{item.username}</span>
                  <span style={styles.timeAgo}>{item.timeAgo}</span>
                </div>
                <span style={styles.categoryTag}>{item.category}</span>
              </div>

              <h3 style={styles.cardTitle}>{item.title}</h3>

              <div style={styles.cardActions}>
                <button style={styles.actionBtn}>
                  <Heart size={18} />
                  <span>{item.likes}</span>
                </button>
                <button style={styles.actionBtn}>
                  <MessageCircle size={18} />
                  <span>{item.comments}</span>
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
