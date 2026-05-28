import { useState, useEffect } from 'react';
import {
  ArrowLeft, Heart, MessageCircle, Share2, Bookmark,
  MapPin, Users, Plus,
  Search, Camera,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useGuestAction } from '../components/GuestGate';
import { fetchCommunityPosts, createCommunityPost, togglePostLike, fetchUserLikes } from '../lib/database';
import type { CommunityPost } from '../lib/supabase';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { MediaFallback, AvatarFallback } from '../components/ui/MediaFallback';

type CommunityView = 'feed' | 'create' | 'discover' | 'profile' | 'stories';

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

  if (view === 'feed') return <CommunityFeed onBack={onBack} onCreate={() => setView('create')} onDiscover={() => setView('discover')} />;
  if (view === 'create') return <CreatePost onBack={() => setView('feed')} />;
  if (view === 'discover') return <DiscoverPage onBack={() => setView('feed')} />;
  return <CommunityFeed onBack={onBack} onCreate={() => setView('create')} onDiscover={() => setView('discover')} />;
}

function CommunityFeed({ onBack, onCreate, onDiscover }: {
  onBack: () => void; onCreate: () => void; onDiscover: () => void;
}) {
  const { user } = useAuth();
  const { isGuest, requireAuth } = useGuestAction();
  const [realPosts, setRealPosts] = useState<CommunityPost[]>([]);
  const [userLikes, setUserLikes] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchCommunityPosts()
      .then(setRealPosts)
      .catch((err) => {
        console.error('[SUPABASE_QUERY_FAIL] source=Community.useEffect', err);
      });
    if (user) {
      fetchUserLikes(user.id).then(setUserLikes).catch(() => {});
    }
    try {
      const raw = localStorage.getItem('tt_saved_posts');
      if (raw) setSavedIds(new Set(JSON.parse(raw)));
    } catch {}
  }, [user]);

  const toggleSave = (id: string) => {
    requireAuth(() => {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        try { localStorage.setItem('tt_saved_posts', JSON.stringify([...next])); } catch {}
        return next;
      });
    });
  };

  const toggleLike = (id: string) => {
    if (isGuest) { requireAuth(() => {}); return; }
    if (user) {
      const liked = userLikes.has(id);
      togglePostLike(user.id, id, liked);
      setUserLikes((prev) => {
        const next = new Set(prev);
        if (liked) next.delete(id); else next.add(id);
        return next;
      });
      setRealPosts((prev) => prev.map((p) => p.id === id ? { ...p, like_count: liked ? p.like_count - 1 : p.like_count + 1 } : p));
    }
  };

  return (
    <div style={s.container}>
      <header style={s.header}>
        <button onClick={onBack} style={s.backBtn}><ArrowLeft size={20} /></button>
        <span style={s.headerTitle}>Community</span>
        <div style={s.headerRight}>
          <button onClick={onDiscover} style={s.headerIconBtn}><Search size={18} /></button>
        </div>
      </header>

      <div style={s.scrollContent}>
        {/* Stories row — Your Story only */}
        <div style={s.storiesRow}>
          <button onClick={() => requireAuth(onCreate)} style={s.storyItem} aria-label="Add your story">
            <div style={{ ...s.storyAvatar, ...s.storyAvatarAdd }}>
              <span style={s.storyAvatarText}>+</span>
            </div>
            <span style={s.storyName}>Your Story</span>
          </button>
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
              saved: savedIds.has(rp.id),
            }}
            onLike={() => toggleLike(rp.id)}
            onSave={() => toggleSave(rp.id)}
          />
        ))}

        {realPosts.length === 0 && (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--color-neutral-400)' }}>
            <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: '4px' }}>No posts yet</p>
            <p style={{ fontSize: 'var(--font-size-xs)' }}>Be the first to share a find with the community!</p>
          </div>
        )}
      </div>

      {/* Create FAB */}
      <button onClick={() => requireAuth(onCreate)} style={s.fab}>
        <Plus size={22} style={{ color: 'var(--color-neutral-0)' }} />
      </button>
    </div>
  );
}

async function sharePost(post: FeedPost) {
  const url = typeof window !== 'undefined' ? window.location.origin : '';
  const text = post.caption;
  const nav: any = typeof navigator !== 'undefined' ? navigator : null;
  if (nav?.share) {
    try { await nav.share({ title: 'TreasureTrail', text, url }); return; } catch {}
  }
  if (nav?.clipboard?.writeText) {
    try { await nav.clipboard.writeText(`${text} ${url}`); } catch {}
  }
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
          <div style={{ ...s.postAvatar, backgroundColor: 'transparent', overflow: 'hidden' }}>
            <AvatarFallback name={post.user.name || post.user.handle} seed={post.user.handle || post.user.name} />
          </div>
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

      {/* Image — route every community post through ImageWithFade +
          MediaFallback so missing/broken photos render as a branded
          gradient card instead of a broken-img icon. */}
      <div style={s.postImgWrap}>
        <ImageWithFade
          src={post.image}
          alt={post.caption}
          style={s.postImg as any}
          fallback={
            <MediaFallback
              kind={post.type === 'flip' || post.type === 'auction_win' ? 'auction' : 'find'}
              category={post.type}
              seed={post.id}
              label={post.type === 'flip' ? 'FLIP WIN' : post.type === 'auction_win' ? 'AUCTION WIN' : 'FIND'}
            />
          }
        />
        {post.rarity && <span style={s.postRarityBadge}>{post.rarity} Rarity</span>}
        {post.estimatedValue && <span style={s.postValueBadge}>{post.estimatedValue}</span>}
      </div>

      {/* Actions */}
      <div style={s.postActions}>
        <button onClick={onLike} style={s.postActionBtn}>
          <Heart size={18} style={{ color: post.liked ? 'var(--color-error-500)' : 'var(--color-neutral-500)', fill: post.liked ? 'var(--color-error-500)' : 'none' }} />
          <span style={s.postActionCount}>{post.likes.toLocaleString()}</span>
        </button>
        <div style={{ ...s.postActionBtn, opacity: 0.5, cursor: 'default' }} title="Comments coming soon">
          <MessageCircle size={18} style={{ color: 'var(--color-neutral-500)' }} />
          <span style={s.postActionCount}>{post.comments}</span>
        </div>
        <button onClick={() => sharePost(post)} style={s.postActionBtn} aria-label="Share">
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
  const [tags, setTags] = useState('');
  const [posting, setPosting] = useState(false);
  const [selectedCat, setSelectedCat] = useState<string>('Watches');
  const [postLocation, setPostLocation] = useState('');

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
      category: selectedCat.toLowerCase(),
      location: postLocation.trim() || undefined,
      general_location: postLocation.trim() || undefined,
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
              <button
                key={c}
                onClick={() => setSelectedCat(c)}
                style={{ ...s.createCatChip, ...(selectedCat === c ? s.createCatChipActive : {}) }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Location */}
        <div style={s.createGroup}>
          <label style={s.createLabel}>Location</label>
          <div style={s.createLocationRow}>
            <MapPin size={14} style={{ color: 'var(--color-neutral-400)' }} />
            <input
              type="text"
              style={s.createLocationInput}
              placeholder="Add location"
              value={postLocation}
              onChange={(e) => setPostLocation(e.target.value)}
            />
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

function DiscoverPage({ onBack }: { onBack: () => void }) {
  const [discoverQuery, setDiscoverQuery] = useState('');
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
          <input
            type="text"
            placeholder="Search collectors, finds, categories..."
            style={s.searchInput}
            value={discoverQuery}
            onChange={(e) => setDiscoverQuery(e.target.value)}
          />
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

        {/* Weekly Highlights */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Weekly Highlights</h3>
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-neutral-400)', fontSize: 'var(--font-size-sm)' }}>
            No highlights yet — post your finds to be featured here!
          </div>
        </div>

        {/* Suggested collectors */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Suggested Collectors</h3>
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-neutral-400)', fontSize: 'var(--font-size-sm)' }}>
            Discover collectors after more members join.
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
