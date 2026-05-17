import { useState, useEffect } from 'react';
import {
  ArrowLeft, Heart, MessageCircle, Share2, Bookmark, Star,
  MapPin, Users, TrendingUp, Plus,
  ChevronRight, Award, Search, Camera,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useGuestAction } from '../components/GuestGate';
import { fetchCommunityPosts, createCommunityPost, togglePostLike, fetchUserLikes } from '../lib/database';
import type { CommunityPost } from '../lib/supabase';

type CommunityView = 'feed' | 'create' | 'discover' | 'clubs' | 'profile' | 'stories';

interface FeedPost {
  id: string;
  user: { name: string; handle: string; rank: string; avatar: string; verified: boolean };
  type: 'find' | 'flip' | 'auction_win' | 'collection' | 'scout_story' | 'sale';
  image: string;
  caption: string;
  tags: string[];
  location?: string;
  scoutAssisted?: boolean;
  rarity?: number;
  estimatedValue?: string;
  likes: number;
  comments: number;
  shares: number;
  timeAgo: string;
  liked?: boolean;
  saved?: boolean;
}

interface CollectorClub {
  id: string;
  name: string;
  members: number;
  icon: string;
  color: string;
  description: string;
}

interface StoryUser {
  id: string;
  name: string;
  avatar: string;
  hasNew: boolean;
}

const feedPosts: FeedPost[] = [
  {
    id: '1', user: { name: 'Marcus Chen', handle: 'luxury_time', rank: 'Elite', avatar: 'MC', verified: true },
    type: 'find', image: 'https://images.pexels.com/photos/190819/pexels-photo-190819.jpeg?auto=compress&cs=tinysrgb&w=600',
    caption: 'Found this 1968 Rolex Submariner at a local estate sale. The patina on this dial is absolutely incredible. Sometimes the best finds are the ones you least expect.',
    tags: ['#vintage', '#rolex', '#estatefind'], location: 'Brooklyn, NY', scoutAssisted: true,
    rarity: 9.4, estimatedValue: '$12,500', likes: 342, comments: 48, shares: 23, timeAgo: '2h', liked: true,
  },
  {
    id: '2', user: { name: 'Sarah Kim', handle: 'thrift_queen', rank: 'Pro', avatar: 'SK', verified: true },
    type: 'flip', image: 'https://images.pexels.com/photos/1350789/pexels-photo-1350789.jpeg?auto=compress&cs=tinysrgb&w=600',
    caption: 'Bought this Eames chair for $200 at a garage sale, sold for $4,200 on marketplace. 2,000% return! The leather was in perfect condition under the slipcover.',
    tags: ['#flip', '#eames', '#profit'], location: 'Austin, TX',
    estimatedValue: '$4,200', likes: 891, comments: 126, shares: 67, timeAgo: '5h',
  },
  {
    id: '3', user: { name: 'Jake Morrison', handle: 'storage_king', rank: 'Hunter', avatar: 'JM', verified: false },
    type: 'auction_win', image: 'https://images.pexels.com/photos/3945683/pexels-photo-3945683.jpeg?auto=compress&cs=tinysrgb&w=600',
    caption: 'Won this storage unit for $475 - just found a box of vintage brass lamps worth $2,000+. Still digging through the rest!',
    tags: ['#storageauction', '#jackpot', '#brass'], location: 'Denver, CO',
    estimatedValue: '$2,000+', likes: 567, comments: 89, shares: 34, timeAgo: '8h',
  },
  {
    id: '4', user: { name: 'Elena Vasquez', handle: 'rare_books_nyc', rank: 'Elite', avatar: 'EV', verified: true },
    type: 'collection', image: 'https://images.pexels.com/photos/1038000/pexels-photo-1038000.jpeg?auto=compress&cs=tinysrgb&w=600',
    caption: 'My first edition collection is finally complete. 15 years of hunting, 47 rare books. This Hemingway is the crown jewel.',
    tags: ['#collection', '#firstEdition', '#hemingway'],
    rarity: 9.1, estimatedValue: '$28,000', likes: 1243, comments: 201, shares: 89, timeAgo: '1d', saved: true,
  },
  {
    id: '5', user: { name: 'Derrick Hall', handle: 'sneaker_scout', rank: 'Pro', avatar: 'DH', verified: true },
    type: 'scout_story', image: 'https://images.pexels.com/photos/1598505/pexels-photo-1598505.jpeg?auto=compress&cs=tinysrgb&w=600',
    caption: 'Scouted 3 pairs of deadstock Jordan 1s at a thrift in Bushwick. Client tipped $200 on top of the fee. Love this community.',
    tags: ['#scoutstory', '#jordan1', '#deadstock'], location: 'Brooklyn, NY', scoutAssisted: true,
    estimatedValue: '$3,600', likes: 723, comments: 94, shares: 41, timeAgo: '1d',
  },
];

const storyUsers: StoryUser[] = [
  { id: '1', name: 'Your Story', avatar: '+', hasNew: false },
  { id: '2', name: 'luxury_time', avatar: 'MC', hasNew: true },
  { id: '3', name: 'thrift_queen', avatar: 'SK', hasNew: true },
  { id: '4', name: 'storage_king', avatar: 'JM', hasNew: true },
  { id: '5', name: 'rare_books', avatar: 'EV', hasNew: true },
  { id: '6', name: 'sneaker_sc', avatar: 'DH', hasNew: false },
  { id: '7', name: 'vintage_eye', avatar: 'VE', hasNew: true },
];

const clubs: CollectorClub[] = [
  { id: '1', name: 'Watch Collectors', members: 2341, icon: 'WC', color: 'var(--color-primary-500)', description: 'Luxury timepiece enthusiasts' },
  { id: '2', name: 'Antique Hunters', members: 1892, icon: 'AH', color: 'var(--color-secondary-500)', description: 'Estate sales and antique finds' },
  { id: '3', name: 'Storage Warriors', members: 1456, icon: 'SW', color: 'var(--color-accent-500)', description: 'Storage auction teams' },
  { id: '4', name: 'Sneaker Scouts', members: 3210, icon: 'SS', color: 'var(--color-error-500)', description: 'Deadstock and rare kicks' },
  { id: '5', name: 'Luxury Flips', members: 987, icon: 'LF', color: 'var(--color-warning-600)', description: 'High-value flip strategies' },
  { id: '6', name: 'Estate Experts', members: 1123, icon: 'EE', color: 'var(--color-success-600)', description: 'Estate sale coordination' },
];

const trendingFinds = [
  { title: 'Find of the Day', item: 'Cartier Tank Francaise', value: '$8,200', user: '@luxury_time' },
  { title: 'Weekly Spotlight', item: 'Nakamichi Dragon Cassette', value: '$4,500', user: '@analog_hunter' },
  { title: 'Viral Find', item: '$15 Painting worth $42,000', value: '$42,000', user: '@thrift_queen' },
];

const suggestedCollectors = [
  { name: 'vintage_eye', rank: 'Elite', followers: '12.4k', specialty: 'Mid-Century' },
  { name: 'chi_picker', rank: 'Pro', followers: '8.2k', specialty: 'Watches' },
  { name: 'estate_maven', rank: 'Elite', followers: '15.1k', specialty: 'Furniture' },
];

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function Community({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<CommunityView>('feed');

  if (view === 'feed') return <CommunityFeed onBack={onBack} onCreate={() => setView('create')} onDiscover={() => setView('discover')} onClubs={() => setView('clubs')} />;
  if (view === 'create') return <CreatePost onBack={() => setView('feed')} />;
  if (view === 'discover') return <DiscoverPage onBack={() => setView('feed')} onClubs={() => setView('clubs')} />;
  if (view === 'clubs') return <ClubsPage onBack={() => setView('feed')} />;
  return <CommunityFeed onBack={onBack} onCreate={() => setView('create')} onDiscover={() => setView('discover')} onClubs={() => setView('clubs')} />;
}

function CommunityFeed({ onBack, onCreate, onDiscover, onClubs }: {
  onBack: () => void; onCreate: () => void; onDiscover: () => void; onClubs: () => void;
}) {
  const { user } = useAuth();
  const { isGuest, requireAuth } = useGuestAction();
  const [posts, setPosts] = useState(feedPosts);
  const [realPosts, setRealPosts] = useState<CommunityPost[]>([]);
  const [userLikes, setUserLikes] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchCommunityPosts().then((data) => {
      if (data.length > 0) setRealPosts(data);
    }).catch(() => {});
    if (user) {
      fetchUserLikes(user.id).then(setUserLikes).catch(() => {});
    }
  }, [user]);

  const toggleLike = (id: string) => {
    if (isGuest) { requireAuth(() => {}); return; }
    const isReal = realPosts.some((p) => p.id === id);
    if (isReal && user) {
      const liked = userLikes.has(id);
      togglePostLike(user.id, id, liked);
      setUserLikes((prev) => {
        const next = new Set(prev);
        if (liked) next.delete(id); else next.add(id);
        return next;
      });
      setRealPosts((prev) => prev.map((p) => p.id === id ? { ...p, like_count: liked ? p.like_count - 1 : p.like_count + 1 } : p));
    } else {
      setPosts((prev) => prev.map((p) => p.id === id ? { ...p, liked: !p.liked, likes: p.liked ? p.likes - 1 : p.likes + 1 } : p));
    }
  };

  const toggleSave = (id: string) => {
    setPosts((prev) => prev.map((p) => p.id === id ? { ...p, saved: !p.saved } : p));
  };

  return (
    <div style={s.container}>
      <header style={s.header}>
        <button onClick={onBack} style={s.backBtn}><ArrowLeft size={20} /></button>
        <span style={s.headerTitle}>Community</span>
        <div style={s.headerRight}>
          <button onClick={onDiscover} style={s.headerIconBtn}><Search size={18} /></button>
          <button onClick={onClubs} style={s.headerIconBtn}><Users size={18} /></button>
        </div>
      </header>

      <div style={s.scrollContent}>
        {/* Stories */}
        <div style={s.storiesRow}>
          {storyUsers.map((u) => (
            <button key={u.id} style={s.storyItem}>
              <div style={{ ...s.storyAvatar, ...(u.hasNew ? s.storyAvatarNew : {}), ...(u.id === '1' ? s.storyAvatarAdd : {}) }}>
                <span style={s.storyAvatarText}>{u.avatar}</span>
              </div>
              <span style={s.storyName}>{u.name}</span>
            </button>
          ))}
        </div>

        {/* Trending banner */}
        <div style={s.trendingBanner}>
          <TrendingUp size={14} style={{ color: 'var(--color-primary-600)' }} />
          <span style={s.trendingText}><strong>Find of the Day:</strong> Cartier Tank found at $800 yard sale</span>
        </div>

        {/* Real posts from Supabase */}
        {realPosts.map((rp) => (
          <FeedCard
            key={rp.id}
            post={{
              id: rp.id,
              user: {
                name: rp.profiles?.username || 'Unknown',
                handle: rp.profiles?.username || 'user',
                rank: rp.profiles?.treasure_rank || 'Hunter',
                avatar: (rp.profiles?.username || 'U').slice(0, 2).toUpperCase(),
                verified: rp.profiles?.scout_verified || false,
              },
              type: rp.type as FeedPost['type'],
              image: rp.image_url || 'https://images.pexels.com/photos/1038000/pexels-photo-1038000.jpeg?auto=compress&cs=tinysrgb&w=600',
              caption: rp.caption,
              tags: rp.tags || [],
              location: rp.location || undefined,
              scoutAssisted: rp.scout_assisted,
              rarity: rp.rarity_score || undefined,
              estimatedValue: rp.estimated_value ? `$${rp.estimated_value.toLocaleString()}` : undefined,
              likes: rp.like_count,
              comments: rp.comment_count,
              shares: rp.share_count,
              timeAgo: getTimeAgo(rp.created_at),
              liked: userLikes.has(rp.id),
            }}
            onLike={() => toggleLike(rp.id)}
            onSave={() => {}}
          />
        ))}

        {/* Mock feed posts (fallback/demo content) */}
        {posts.map((post) => (
          <FeedCard key={post.id} post={post} onLike={() => toggleLike(post.id)} onSave={() => toggleSave(post.id)} />
        ))}
      </div>

      {/* Create FAB */}
      <button onClick={() => requireAuth(onCreate)} style={s.fab}>
        <Plus size={22} style={{ color: 'var(--color-neutral-0)' }} />
      </button>
    </div>
  );
}

function FeedCard({ post, onLike, onSave }: { post: FeedPost; onLike: () => void; onSave: () => void }) {
  const typeLabels: Record<string, string> = {
    find: 'Rare Find', flip: 'Flip Win', auction_win: 'Auction Win',
    collection: 'Collection', scout_story: 'Scout Story', sale: 'Sold',
  };
  const typeColors: Record<string, string> = {
    find: 'var(--color-primary-500)', flip: 'var(--color-success-500)', auction_win: 'var(--color-error-500)',
    collection: 'var(--color-secondary-500)', scout_story: 'var(--color-accent-500)', sale: 'var(--color-warning-600)',
  };

  return (
    <div style={s.postCard}>
      {/* Header */}
      <div style={s.postHeader}>
        <div style={s.postAvatarWrap}>
          <div style={s.postAvatar}><span style={s.postAvatarText}>{post.user.avatar}</span></div>
          {post.user.verified && <div style={s.postVerifyDot} />}
        </div>
        <div style={s.postUserInfo}>
          <div style={s.postNameRow}>
            <span style={s.postUserName}>{post.user.name}</span>
            <span style={s.postRankBadge}>{post.user.rank}</span>
          </div>
          <div style={s.postMeta}>
            <span style={s.postHandle}>@{post.user.handle}</span>
            <span style={s.postDot} />
            <span style={s.postTime}>{post.timeAgo}</span>
          </div>
        </div>
        <span style={{ ...s.postTypeBadge, backgroundColor: `color-mix(in srgb, ${typeColors[post.type]} 12%, transparent)`, color: typeColors[post.type] }}>
          {typeLabels[post.type]}
        </span>
      </div>

      {/* Image */}
      <div style={s.postImgWrap}>
        <img src={post.image} alt={post.caption} style={s.postImg} />
        {post.rarity && <span style={s.postRarityBadge}>{post.rarity} Rarity</span>}
        {post.estimatedValue && <span style={s.postValueBadge}>{post.estimatedValue}</span>}
      </div>

      {/* Actions */}
      <div style={s.postActions}>
        <button onClick={onLike} style={s.postActionBtn}>
          <Heart size={18} style={{ color: post.liked ? 'var(--color-error-500)' : 'var(--color-neutral-500)', fill: post.liked ? 'var(--color-error-500)' : 'none' }} />
          <span style={s.postActionCount}>{post.likes.toLocaleString()}</span>
        </button>
        <button style={s.postActionBtn}>
          <MessageCircle size={18} style={{ color: 'var(--color-neutral-500)' }} />
          <span style={s.postActionCount}>{post.comments}</span>
        </button>
        <button style={s.postActionBtn}>
          <Share2 size={18} style={{ color: 'var(--color-neutral-500)' }} />
          <span style={s.postActionCount}>{post.shares}</span>
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={onSave} style={s.postActionBtn}>
          <Bookmark size={18} style={{ color: post.saved ? 'var(--color-primary-500)' : 'var(--color-neutral-500)', fill: post.saved ? 'var(--color-primary-500)' : 'none' }} />
        </button>
      </div>

      {/* Caption */}
      <div style={s.postCaption}>
        <span style={s.postCaptionText}>{post.caption}</span>
      </div>

      {/* Tags & location */}
      <div style={s.postFooter}>
        <div style={s.postTags}>
          {post.tags.map((t) => <span key={t} style={s.postTag}>{t}</span>)}
        </div>
        <div style={s.postLocationRow}>
          {post.location && (
            <span style={s.postLocation}><MapPin size={10} /> {post.location}</span>
          )}
          {post.scoutAssisted && (
            <span style={s.postScoutBadge}><Users size={10} /> Scout Assisted</span>
          )}
        </div>
      </div>
    </div>
  );
}

function CreatePost({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const [postType, setPostType] = useState<string>('find');
  const [caption, setCaption] = useState('');
  const [tags, setTags] = useState('#vintage #find');
  const [posting, setPosting] = useState(false);

  const types = [
    { id: 'find', label: 'Find' },
    { id: 'flip', label: 'Flip Win' },
    { id: 'auction_win', label: 'Auction' },
    { id: 'collection', label: 'Collection' },
    { id: 'scout_story', label: 'Scout Story' },
    { id: 'sale', label: 'For Sale' },
  ];

  const handlePost = async () => {
    if (!user || !caption.trim()) return;
    setPosting(true);
    const tagArray = tags.split(/\s+/).filter((t) => t.startsWith('#'));
    await createCommunityPost({
      user_id: user.id,
      type: postType,
      caption: caption.trim(),
      tags: tagArray,
      for_sale: postType === 'sale',
      scout_assisted: postType === 'scout_story',
      category: 'other',
    });
    setPosting(false);
    onBack();
  };

  return (
    <div style={s.container}>
      <header style={s.header}>
        <button onClick={onBack} style={s.backBtn}><ArrowLeft size={20} /></button>
        <span style={s.headerTitle}>Share Find</span>
        <button onClick={handlePost} disabled={posting || !caption.trim()} style={{ ...s.postBtn, opacity: (!caption.trim() || posting) ? 0.5 : 1 }}><span style={s.postBtnText}>{posting ? '...' : 'Post'}</span></button>
      </header>

      <div style={s.scrollContent}>
        {/* Post type */}
        <div style={s.typeRow}>
          {types.map((t) => (
            <button key={t.id} onClick={() => setPostType(t.id)} style={{ ...s.typeChip, ...(postType === t.id ? s.typeChipActive : {}) }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Image upload */}
        <div style={s.createImgArea}>
          <Camera size={28} style={{ color: 'var(--color-neutral-300)' }} />
          <span style={s.createImgText}>Add Photos</span>
          <span style={s.createImgSub}>Share your find with the community</span>
        </div>

        {/* Caption */}
        <div style={s.createGroup}>
          <textarea style={s.createTextarea} placeholder="Tell the story of your find..." rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} />
        </div>

        {/* Tags */}
        <div style={s.createGroup}>
          <label style={s.createLabel}>Hashtags</label>
          <input type="text" style={s.createInput} placeholder="#vintage #find #treasure" value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>

        {/* Category */}
        <div style={s.createGroup}>
          <label style={s.createLabel}>Category</label>
          <div style={s.createCatRow}>
            {['Watches', 'Furniture', 'Art', 'Electronics', 'Books', 'Sneakers'].map((c) => (
              <button key={c} style={{ ...s.createCatChip, ...(c === 'Watches' ? s.createCatChipActive : {}) }}>{c}</button>
            ))}
          </div>
        </div>

        {/* Location */}
        <div style={s.createGroup}>
          <label style={s.createLabel}>Location</label>
          <div style={s.createLocationRow}>
            <MapPin size={14} style={{ color: 'var(--color-neutral-400)' }} />
            <input type="text" style={s.createLocationInput} placeholder="Add location" readOnly defaultValue="Brooklyn, NY" />
          </div>
        </div>

        {/* Toggles */}
        <div style={s.createGroup}>
          <div style={s.createToggleRow}>
            <span style={s.createToggleLabel}>For Sale</span>
            <div style={s.toggle}><div style={s.toggleKnob} /></div>
          </div>
          <div style={s.createToggleRow}>
            <span style={s.createToggleLabel}>Scout Assisted</span>
            <div style={{ ...s.toggle, backgroundColor: 'var(--color-primary-500)' }}><div style={{ ...s.toggleKnob, transform: 'translateX(14px)' }} /></div>
          </div>
          <div style={s.createToggleRow}>
            <span style={s.createToggleLabel}>Show Estimated Value</span>
            <div style={{ ...s.toggle, backgroundColor: 'var(--color-primary-500)' }}><div style={{ ...s.toggleKnob, transform: 'translateX(14px)' }} /></div>
          </div>
        </div>

        {/* Rarity */}
        <div style={s.createGroup}>
          <label style={s.createLabel}>Rarity Score</label>
          <div style={s.raritySlider}>
            <div style={s.rarityTrack}><div style={{ ...s.rarityFill, width: '75%' }} /></div>
            <span style={s.rarityVal}>7.5</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiscoverPage({ onBack, onClubs }: { onBack: () => void; onClubs: () => void }) {
  return (
    <div style={s.container}>
      <header style={s.header}>
        <button onClick={onBack} style={s.backBtn}><ArrowLeft size={20} /></button>
        <span style={s.headerTitle}>Discover</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={s.scrollContent}>
        {/* Search */}
        <div style={s.searchWrap}>
          <Search size={16} style={{ color: 'var(--color-neutral-400)' }} />
          <input type="text" placeholder="Search collectors, finds, categories..." style={s.searchInput} readOnly />
        </div>

        {/* Trending categories */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Trending Categories</h3>
          <div style={s.trendCatGrid}>
            {[
              { label: 'Vintage Watches', count: '+340%', color: 'var(--color-primary-500)' },
              { label: 'Mid-Century', count: '+220%', color: 'var(--color-secondary-500)' },
              { label: 'First Editions', count: '+180%', color: 'var(--color-accent-500)' },
              { label: 'Sneakers', count: '+150%', color: 'var(--color-error-500)' },
              { label: 'Brass/Copper', count: '+120%', color: 'var(--color-warning-600)' },
              { label: 'Storage Finds', count: '+95%', color: 'var(--color-success-600)' },
            ].map((cat) => (
              <div key={cat.label} style={s.trendCatCard}>
                <span style={s.trendCatLabel}>{cat.label}</span>
                <span style={{ ...s.trendCatCount, color: cat.color }}>{cat.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Featured finds */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Weekly Highlights</h3>
          {trendingFinds.map((f) => (
            <div key={f.title} style={s.highlightCard}>
              <div style={s.highlightBadge}><Award size={14} style={{ color: 'var(--color-primary-600)' }} /></div>
              <div style={s.highlightInfo}>
                <span style={s.highlightTitle}>{f.title}</span>
                <span style={s.highlightItem}>{f.item}</span>
                <span style={s.highlightMeta}>{f.value} - {f.user}</span>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--color-neutral-400)' }} />
            </div>
          ))}
        </div>

        {/* Suggested collectors */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Suggested Collectors</h3>
          {suggestedCollectors.map((c) => (
            <div key={c.name} style={s.suggestedRow}>
              <div style={s.suggestedAvatar}><span style={s.suggestedAvatarText}>{c.name[0].toUpperCase()}</span></div>
              <div style={s.suggestedInfo}>
                <div style={s.suggestedNameRow}>
                  <span style={s.suggestedName}>@{c.name}</span>
                  <span style={s.suggestedRank}>{c.rank}</span>
                </div>
                <span style={s.suggestedMeta}>{c.followers} followers - {c.specialty}</span>
              </div>
              <button style={s.followBtn}><span style={s.followBtnText}>Follow</span></button>
            </div>
          ))}
        </div>

        {/* Clubs link */}
        <div style={s.section}>
          <button onClick={onClubs} style={s.clubsLink}>
            <Users size={16} style={{ color: 'var(--color-primary-600)' }} />
            <span style={s.clubsLinkText}>Explore Collector Clubs</span>
            <ChevronRight size={14} style={{ color: 'var(--color-primary-600)' }} />
          </button>
        </div>

        {/* Viral rankings */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Top Flippers This Week</h3>
          <div style={s.leaderboard}>
            {[
              { rank: 1, name: 'thrift_queen', profit: '$18,400' },
              { rank: 2, name: 'storage_king', profit: '$12,800' },
              { rank: 3, name: 'luxury_time', profit: '$9,200' },
            ].map((l) => (
              <div key={l.rank} style={s.leaderRow}>
                <span style={{ ...s.leaderRank, color: l.rank === 1 ? 'var(--color-primary-500)' : l.rank === 2 ? 'var(--color-neutral-500)' : 'var(--color-accent-600)' }}>#{l.rank}</span>
                <span style={s.leaderName}>@{l.name}</span>
                <span style={s.leaderProfit}>{l.profit}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClubsPage({ onBack }: { onBack: () => void }) {
  return (
    <div style={s.container}>
      <header style={s.header}>
        <button onClick={onBack} style={s.backBtn}><ArrowLeft size={20} /></button>
        <span style={s.headerTitle}>Collector Clubs</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={s.scrollContent}>
        <p style={s.clubsIntro}>Join communities of like-minded collectors and treasure hunters</p>

        {clubs.map((club) => (
          <div key={club.id} style={s.clubCard}>
            <div style={{ ...s.clubIcon, backgroundColor: `color-mix(in srgb, ${club.color} 12%, transparent)` }}>
              <span style={{ ...s.clubIconText, color: club.color }}>{club.icon}</span>
            </div>
            <div style={s.clubInfo}>
              <span style={s.clubName}>{club.name}</span>
              <span style={s.clubDesc}>{club.description}</span>
              <span style={s.clubMembers}><Users size={10} /> {club.members.toLocaleString()} members</span>
            </div>
            <button style={s.joinBtn}><span style={s.joinBtnText}>Join</span></button>
          </div>
        ))}

        {/* Group features */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Club Features</h3>
          <div style={s.featureGrid}>
            <div style={s.featureCard}>
              <MessageCircle size={16} style={{ color: 'var(--color-primary-500)' }} />
              <span style={s.featureLabel}>Group Feed</span>
            </div>
            <div style={s.featureCard}>
              <Award size={16} style={{ color: 'var(--color-accent-500)' }} />
              <span style={s.featureLabel}>Challenges</span>
            </div>
            <div style={s.featureCard}>
              <TrendingUp size={16} style={{ color: 'var(--color-success-500)' }} />
              <span style={s.featureLabel}>Rankings</span>
            </div>
            <div style={s.featureCard}>
              <Star size={16} style={{ color: 'var(--color-warning-600)' }} />
              <span style={s.featureLabel}>Events</span>
            </div>
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
  headerRight: { display: 'flex', gap: 'var(--space-1)' },
  headerIconBtn: { width: '36px', height: '36px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-neutral-600)' },
  scrollContent: { flex: 1, overflow: 'auto' },

  // Stories
  storiesRow: { display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', overflow: 'auto', borderBottom: '1px solid var(--color-neutral-50)' },
  storyItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flexShrink: 0 },
  storyAvatar: { width: '48px', height: '48px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-neutral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--color-neutral-200)' },
  storyAvatarNew: { border: '2px solid var(--color-primary-500)', boxShadow: '0 0 0 2px var(--color-primary-100)' },
  storyAvatarAdd: { border: '2px dashed var(--color-neutral-300)' },
  storyAvatarText: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-600)' },
  storyName: { fontSize: '9px', color: 'var(--color-neutral-500)', maxWidth: '48px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  // Trending banner
  trendingBanner: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-4)', backgroundColor: 'var(--color-primary-50)', borderBottom: '1px solid var(--color-primary-100)' },
  trendingText: { fontSize: 'var(--font-size-xs)', color: 'var(--color-primary-800)' },

  // Post card
  postCard: { borderBottom: '1px solid var(--color-neutral-100)', paddingBottom: 'var(--space-3)' },
  postHeader: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)' },
  postAvatarWrap: { position: 'relative', flexShrink: 0 },
  postAvatar: { width: '36px', height: '36px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-neutral-200)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  postAvatarText: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-600)' },
  postVerifyDot: { position: 'absolute', bottom: '0', right: '0', width: '10px', height: '10px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-secondary-500)', border: '2px solid var(--color-neutral-0)' },
  postUserInfo: { flex: 1, minWidth: 0 },
  postNameRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  postUserName: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-900)' },
  postRankBadge: { fontSize: '9px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-700)', backgroundColor: 'var(--color-primary-50)', padding: '1px 5px', borderRadius: 'var(--radius-full)' },
  postMeta: { display: 'flex', alignItems: 'center', gap: '4px' },
  postHandle: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },
  postDot: { width: '3px', height: '3px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-neutral-300)' },
  postTime: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-400)' },
  postTypeBadge: { fontSize: '9px', fontWeight: 'var(--font-weight-bold)', padding: '2px 6px', borderRadius: 'var(--radius-full)', flexShrink: 0 },

  // Post image
  postImgWrap: { position: 'relative', aspectRatio: '4/3' },
  postImg: { width: '100%', height: '100%', objectFit: 'cover' },
  postRarityBadge: { position: 'absolute', top: 'var(--space-3)', left: 'var(--space-3)', padding: '3px 8px', borderRadius: 'var(--radius-full)', backgroundColor: 'rgba(0,0,0,0.7)', color: 'var(--color-primary-400)', fontSize: '10px', fontWeight: 'var(--font-weight-bold)' },
  postValueBadge: { position: 'absolute', top: 'var(--space-3)', right: 'var(--space-3)', padding: '3px 8px', borderRadius: 'var(--radius-full)', backgroundColor: 'rgba(0,0,0,0.7)', color: 'var(--color-success-400)', fontSize: '10px', fontWeight: 'var(--font-weight-bold)' },

  // Post actions
  postActions: { display: 'flex', alignItems: 'center', padding: 'var(--space-3) var(--space-4)', gap: 'var(--space-4)' },
  postActionBtn: { display: 'flex', alignItems: 'center', gap: '4px' },
  postActionCount: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-600)' },

  // Caption
  postCaption: { padding: '0 var(--space-4) var(--space-2)' },
  postCaptionText: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-800)', lineHeight: '1.5' },

  // Footer
  postFooter: { padding: '0 var(--space-4)' },
  postTags: { display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: 'var(--space-2)' },
  postTag: { fontSize: '10px', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-primary-600)' },
  postLocationRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' },
  postLocation: { display: 'flex', alignItems: 'center', gap: '2px', fontSize: '10px', color: 'var(--color-neutral-400)' },
  postScoutBadge: { display: 'flex', alignItems: 'center', gap: '2px', fontSize: '10px', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-accent-600)', backgroundColor: 'var(--color-accent-50)', padding: '1px 6px', borderRadius: 'var(--radius-full)' },

  // FAB
  fab: { position: 'absolute', bottom: 'var(--space-4)', right: 'var(--space-4)', width: '52px', height: '52px', borderRadius: 'var(--radius-full)', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(234, 179, 8, 0.4)' },

  // Create post
  postBtn: { padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))' },
  postBtnText: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-0)' },
  typeRow: { display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-4)', overflow: 'auto', borderBottom: '1px solid var(--color-neutral-50)' },
  typeChip: { padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', backgroundColor: 'var(--color-neutral-100)', color: 'var(--color-neutral-600)', whiteSpace: 'nowrap', flexShrink: 0 },
  typeChipActive: { backgroundColor: 'var(--color-neutral-900)', color: 'var(--color-neutral-0)' },
  createImgArea: { margin: 'var(--space-4)', aspectRatio: '16/9', borderRadius: 'var(--radius-md)', border: '2px dashed var(--color-neutral-200)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' },
  createImgText: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-600)' },
  createImgSub: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-400)' },
  createGroup: { padding: '0 var(--space-4)', marginBottom: 'var(--space-4)' },
  createLabel: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-700)', marginBottom: 'var(--space-2)' },
  createTextarea: { width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-200)', fontSize: 'var(--font-size-sm)', resize: 'vertical' as const, fontFamily: 'inherit' },
  createInput: { width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-200)', fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-800)' },
  createCatRow: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' },
  createCatChip: { padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', backgroundColor: 'var(--color-neutral-100)', color: 'var(--color-neutral-600)' },
  createCatChipActive: { backgroundColor: 'var(--color-neutral-900)', color: 'var(--color-neutral-0)' },
  createLocationRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-200)' },
  createLocationInput: { flex: 1, border: 'none', fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-800)', outline: 'none' },
  createToggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 'var(--space-3)', borderBottom: '1px solid var(--color-neutral-50)', marginBottom: 'var(--space-3)' },
  createToggleLabel: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-700)' },
  toggle: { width: '28px', height: '14px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-neutral-200)', position: 'relative' },
  toggleKnob: { position: 'absolute', top: '2px', left: '2px', width: '10px', height: '10px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-neutral-0)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' },
  raritySlider: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' },
  rarityTrack: { flex: 1, height: '4px', backgroundColor: 'var(--color-neutral-200)', borderRadius: 'var(--radius-full)', overflow: 'hidden' },
  rarityFill: { height: '100%', background: 'linear-gradient(90deg, var(--color-primary-400), var(--color-primary-600))', borderRadius: 'var(--radius-full)' },
  rarityVal: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-600)' },

  // Discover
  searchWrap: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3)', margin: 'var(--space-4)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-100)' },
  searchInput: { flex: 1, fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-800)', border: 'none', outline: 'none', background: 'transparent' },
  section: { padding: '0 var(--space-4)', marginBottom: 'var(--space-5)' },
  sectionTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-800)', marginBottom: 'var(--space-3)' },
  trendCatGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' },
  trendCatCard: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-sm)' },
  trendCatLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-700)' },
  trendCatCount: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)' },

  // Highlights
  highlightCard: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-100)', marginBottom: 'var(--space-2)' },
  highlightBadge: { width: '36px', height: '36px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  highlightInfo: { flex: 1 },
  highlightTitle: { display: 'block', fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-600)' },
  highlightItem: { display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)' },
  highlightMeta: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },

  // Suggested
  suggestedRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' },
  suggestedAvatar: { width: '40px', height: '40px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-neutral-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  suggestedAvatarText: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-600)' },
  suggestedInfo: { flex: 1 },
  suggestedNameRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  suggestedName: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)' },
  suggestedRank: { fontSize: '9px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-700)', backgroundColor: 'var(--color-primary-50)', padding: '1px 5px', borderRadius: 'var(--radius-full)' },
  suggestedMeta: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },
  followBtn: { padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-neutral-900)' },
  followBtnText: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-0)' },

  // Clubs link
  clubsLink: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-primary-50)', border: '1px solid var(--color-primary-100)', width: '100%' },
  clubsLinkText: { flex: 1, fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-primary-700)' },

  // Leaderboard
  leaderboard: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  leaderRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-sm)' },
  leaderRank: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', width: '24px' },
  leaderName: { flex: 1, fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-800)' },
  leaderProfit: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-success-600)' },

  // Clubs page
  clubsIntro: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-500)', padding: '0 var(--space-4)', marginBottom: 'var(--space-4)' },
  clubCard: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-neutral-50)' },
  clubIcon: { width: '44px', height: '44px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  clubIconText: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)' },
  clubInfo: { flex: 1 },
  clubName: { display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)' },
  clubDesc: { display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },
  clubMembers: { display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: 'var(--color-neutral-400)', marginTop: '2px' },
  joinBtn: { padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-neutral-900)' },
  joinBtnText: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-900)' },
  featureGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' },
  featureCard: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-sm)' },
  featureLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-700)' },
};
