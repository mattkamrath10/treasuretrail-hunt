import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Shield, Star, Award, MapPin, ArrowLeft, UserPlus, UserCheck, Loader, MessageCircle, Flag } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { followUser, unfollowUser, checkIsFollowing } from '../lib/database';
import { MobileDetailPage } from '../components/ui/MobileDetailPage';
import { notifyUser } from '../lib/notifications';
import { accountAge, reputationTier, normalizeReputation } from '../lib/reputation';
import { getOrCreateConversation } from '../lib/messaging';
import { blockUser, isUserBlocked } from '../lib/blocks';
import ReportButton from '../components/moderation/ReportButton';
import UserShowcase from '../components/UserShowcase';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { AvatarFallback } from '../components/ui/MediaFallback';
import { toThumbUrl } from '../lib/imageCompress';

export default function PublicProfile() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { user, profile: meProfile } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  // Counts that aren't denormalized on profiles — we fetch them lazily so
  // the profile card paints immediately and the storefront numbers fill in.
  const [findsCount, setFindsCount] = useState<number | null>(null);
  const [savesReceived, setSavesReceived] = useState<number | null>(null);
  // Message + block (non-owner only)
  const [messaging, setMessaging] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 2400);
  };

  useEffect(() => {
    if (!username) { setNotFound(true); setLoading(false); return; }
    supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single()
      .then(({ data, error }) => {
        if (error || !data) setNotFound(true);
        else setProfile(data);
        setLoading(false);
      });
  }, [username]);

  useEffect(() => {
    if (!user || !profile?.id || user.id === profile.id) return;
    checkIsFollowing(user.id, profile.id).then(setFollowing).catch(() => {});
    isUserBlocked(user.id, profile.id).then(setBlocked).catch(() => {});
  }, [user, profile?.id]);

  const isSelf = !!user && !!profile && user.id === profile.id;

  // Storefront counts: total finds (community_posts + marketplace_listings),
  // and saves received across both. Both queries use HEAD+count so we don't
  // pull row payloads — this is a constant-cost network call per profile.
  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    Promise.all([
      supabase.from('community_posts').select('id', { count: 'exact', head: true }).eq('user_id', profile.id),
      supabase.from('marketplace_listings').select('id', { count: 'exact', head: true }).eq('seller_id', profile.id),
    ]).then(([a, b]) => {
      if (cancelled) return;
      setFindsCount((a.count ?? 0) + (b.count ?? 0));
    }).catch(() => { if (!cancelled) setFindsCount(0); });

    // Saves received: count saved_listings rows where the underlying listing
    // belongs to this user. We approximate by joining via two HEAD counts
    // against listing_save_counts × ownership — for V1 this stays simple
    // and just sums save_count over rows whose listing the user owns.
    // (Heavy aggregation; cap to first 200 listings to bound cost.)
    (async () => {
      try {
        const [posts, listings] = await Promise.all([
          supabase.from('community_posts').select('id').eq('user_id', profile.id).limit(200),
          supabase.from('marketplace_listings').select('id').eq('seller_id', profile.id).limit(200),
        ]);
        const ids: { id: string; kind: 'community_post' | 'marketplace' }[] = [];
        for (const r of (posts.data ?? [])) ids.push({ id: (r as any).id, kind: 'community_post' });
        for (const r of (listings.data ?? [])) ids.push({ id: (r as any).id, kind: 'marketplace' });
        if (ids.length === 0) { if (!cancelled) setSavesReceived(0); return; }
        const { data: counts } = await supabase
          .from('listing_save_counts')
          .select('listing_id, listing_kind, save_count')
          .in('listing_id', ids.map((x) => x.id));
        let total = 0;
        for (const c of counts ?? []) {
          if (ids.some((x) => x.id === (c as any).listing_id && x.kind === (c as any).listing_kind)) {
            total += (c as any).save_count ?? 0;
          }
        }
        if (!cancelled) setSavesReceived(total);
      } catch { if (!cancelled) setSavesReceived(0); }
    })();

    return () => { cancelled = true; };
  }, [profile?.id]);

  const handleMessage = async () => {
    if (!user) { showToast('Sign in to message'); return; }
    if (!profile?.id || isSelf || messaging) return;
    setMessaging(true);
    const { conversationId, error } = await getOrCreateConversation({
      otherUserId: profile.id,
    });
    setMessaging(false);
    if (error || !conversationId) { showToast(error || 'Could not open chat'); return; }
    navigate(`/messages/${conversationId}`);
  };

  const handleBlock = async () => {
    if (!user || !profile?.id || isSelf || blockBusy) return;
    setBlockBusy(true);
    const { error } = await blockUser(user.id, profile.id);
    setBlockBusy(false);
    if (error) { showToast(error); return; }
    setBlocked(true);
    showToast(`Blocked @${profile.username}`);
    window.setTimeout(() => navigate('/'), 700);
  };

  const handleToggleFollow = async () => {
    if (!user || !profile?.id || isSelf || followBusy) return;
    setFollowBusy(true);
    if (following) {
      await unfollowUser(user.id, profile.id);
      setFollowing(false);
      setProfile((p: any) => p ? { ...p, follower_count: Math.max(0, (p.follower_count ?? 0) - 1) } : p);
    } else {
      const { error } = await followUser(user.id, profile.id);
      if (!error) {
        setFollowing(true);
        setProfile((p: any) => p ? { ...p, follower_count: (p.follower_count ?? 0) + 1 } : p);
        // Identify the follower in the notification so the recipient
        // can see WHO followed them (previously it said only "You have
        // a new follower" with no name). Prefer @username; fall back
        // to display name; final fallback to "Someone" if the current
        // user has no profile row yet (brand-new account edge case).
        const followerName = meProfile?.username
          ? `@${meProfile.username}`
          : 'Someone';
        notifyUser({
          target_user_id: profile.id,
          type: 'follow',
          title: 'New follower',
          content: `${followerName} started following you.`,
          related_item_id: user.id,
          related_item_type: 'profile',
          metadata: {
            follower_id: user.id,
            follower_username: meProfile?.username ?? null,
          },
        }).catch(() => {});
      }
    }
    setFollowBusy(false);
  };

  const joinDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  if (loading) {
    return (
      <div style={s.center}>
        <div style={s.spinner} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={s.center}>
        <p style={s.notFoundTitle}>Profile not found</p>
        <p style={s.notFoundSub}>This user doesn't exist or has been removed.</p>
        <button onClick={() => navigate('/')} style={s.ctaBtn}>Open TreasureTrail</button>
      </div>
    );
  }

  return (
    <MobileDetailPage style={{ maxWidth: 480, margin: '0 auto' }}>
      <header style={s.header}>
        <button
          onClick={() => {
            // Use history.back when there's somewhere to go back to;
            // otherwise fall back to Home so deep-linked visitors aren't
            // dumped onto a blank tab.
            if (typeof window !== 'undefined' && window.history.length > 1) navigate(-1);
            else navigate('/');
          }}
          style={s.backBtn}
          aria-label="Go back"
        >
          <ArrowLeft size={20} style={{ color: 'var(--color-neutral-700)' }} />
        </button>
        <span style={s.headerTitle}>Profile</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={s.content}>
        <div style={s.card}>
          <div style={s.avatar as any}>
            <ImageWithFade
              src={toThumbUrl(profile.avatar_url) ?? profile.avatar_url}
              fallbackSrc={profile.avatar_url}
              alt={profile.username}
              fallback={<AvatarFallback name={profile.username} seed={profile.username} />}
            />
          </div>

          <h1 style={s.username}>@{profile.username}</h1>
          {profile.bio && <p style={s.bio}>{profile.bio}</p>}

          <div style={s.badges}>
            <span style={s.rankBadge}>{profile.treasure_rank || 'Hunter'}</span>
            <span style={s.levelBadge}>Lv. {profile.level || 1}</span>
            <span style={s.xpBadge}>{profile.xp || 0} XP</span>
          </div>

          {(profile.location_city || profile.location_state) && (
            <div style={s.locationRow}>
              <MapPin size={12} style={{ color: 'var(--color-neutral-400)' }} />
              <span style={s.locationText}>
                {[profile.location_city, profile.location_state].filter(Boolean).join(', ')}
              </span>
            </div>
          )}

          {joinDate && <span style={s.joinDate}>Member since {joinDate}</span>}
          <span style={s.joinDate}>{accountAge(profile.created_at)}</span>

          <div style={s.stats}>
            <div style={s.stat}>
              <span style={s.statNumber}>{findsCount ?? '—'}</span>
              <span style={s.statLabel}>Finds</span>
            </div>
            <div style={s.statDivider} />
            <div style={s.stat}>
              <span style={s.statNumber}>{profile.follower_count || 0}</span>
              <span style={s.statLabel}>Followers</span>
            </div>
            <div style={s.statDivider} />
            <div style={s.stat}>
              <span style={s.statNumber}>{savesReceived ?? '—'}</span>
              <span style={s.statLabel}>Saves</span>
            </div>
            <div style={s.statDivider} />
            <div style={s.stat}>
              <span style={s.statNumber}>{normalizeReputation(profile.reputation_score).toFixed(1)}</span>
              <span style={s.statLabel}>Rep ★</span>
            </div>
          </div>
        </div>

        {!isSelf && user && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-3)' }}>
            <button
              onClick={handleToggleFollow}
              disabled={followBusy}
              style={{ ...(following ? followStyles.unfollow : followStyles.follow), flex: 1, marginBottom: 0 }}
            >
              {followBusy ? <Loader size={14} /> : following ? <UserCheck size={14} /> : <UserPlus size={14} />}
              <span>{following ? 'Following' : 'Follow'}</span>
            </button>
            <button
              onClick={handleMessage}
              disabled={messaging}
              style={{ ...followStyles.unfollow, flex: 1, marginBottom: 0 }}
              aria-label="Message"
            >
              {messaging ? <Loader size={14} /> : <MessageCircle size={14} />}
              <span>Message</span>
            </button>
          </div>
        )}
        {!isSelf && user && (
          <button
            onClick={handleBlock}
            disabled={blocked || blockBusy}
            style={s.blockBtn}
            aria-label={blocked ? 'Already blocked' : 'Block this user'}
          >
            <Shield size={14} />
            <span>{blocked ? 'Blocked' : (blockBusy ? 'Blocking…' : 'Block User')}</span>
          </button>
        )}
        {!isSelf && user && (
          <ReportButton contentType="profile" contentId={profile.id} reportedUserId={profile.id}>
            <button style={s.blockBtn} type="button" aria-label="Report this user">
              <Flag size={14} />
              <span>Report User</span>
            </button>
          </ReportButton>
        )}

        {toast && (
          <div style={s.toast}>{toast}</div>
        )}

        <div style={s.repCard}>
          <Award size={18} style={{ color: 'var(--color-primary-500)' }} />
          <div style={s.repInfo}>
            <span style={s.repTitle}>{reputationTier(profile.reputation_score)}</span>
            <span style={s.repSub}>
              {(profile.reputation_score ?? 0) > 0 ? 'Based on real activity' : 'No ratings yet'}
            </span>
          </div>
          <div style={s.repScore}>
            <span style={s.repNum}>{profile.reputation_score ?? 0}</span>
            <Star size={12} style={{ color: 'var(--color-primary-500)', fill: 'var(--color-primary-500)' }} />
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.sectionTitle}>{isSelf ? 'Your Showcase' : `@${profile.username}'s Showcase`}</h2>
          <UserShowcase userId={profile.id} isSelf={isSelf} />
        </div>

        {profile.favorite_categories && profile.favorite_categories.length > 0 && (
          <div style={s.section}>
            <h2 style={s.sectionTitle}>Specialty Categories</h2>
            <div style={s.tags}>
              {profile.favorite_categories.map((cat: string) => (
                <span key={cat} style={s.tag}>{cat}</span>
              ))}
            </div>
          </div>
        )}

        <div style={s.ctaCard}>
          <Shield size={24} style={{ color: 'var(--color-primary-500)', marginBottom: 8 }} />
          <p style={s.ctaTitle}>Join TreasureTrail</p>
          <p style={s.ctaSub}>Discover hidden treasures, follow sellers, and build your own collection.</p>
          <button onClick={() => navigate('/')} style={s.ctaBtn}>Get Started Free</button>
        </div>
      </div>
    </MobileDetailPage>
  );
}

const followStyles: Record<string, CSSProperties> = {
  follow: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    width: '100%', minHeight: 44, marginBottom: 'var(--space-3)',
    padding: '0 var(--space-4)',
    backgroundColor: 'var(--color-primary-500)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer',
  },
  unfollow: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    width: '100%', minHeight: 44, marginBottom: 'var(--space-3)',
    padding: '0 var(--space-4)',
    backgroundColor: 'var(--color-neutral-100)', color: 'var(--color-neutral-800)',
    border: '1px solid var(--color-neutral-200)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer',
  },
};

const s: Record<string, CSSProperties> = {
  center: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-4)',
    padding: 'var(--space-6)',
  },
  spinner: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: '3px solid var(--color-neutral-200)',
    borderTopColor: 'var(--color-primary-500)',
    animation: 'spin 0.8s linear infinite',
  },
  notFoundTitle: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-800)',
  },
  notFoundSub: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    textAlign: 'center',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderBottom: '1px solid var(--color-neutral-100)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  backBtn: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },
  content: {
    flex: 1,
    padding: 'var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'var(--space-6) var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--color-neutral-100)',
    boxShadow: 'var(--shadow-sm)',
    gap: 'var(--space-2)',
  },
  avatar: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '3px solid var(--color-primary-200)',
    marginBottom: 'var(--space-1)',
  },
  avatarPlaceholder: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-primary-100)',
    border: '3px solid var(--color-primary-200)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 'var(--space-1)',
  },
  avatarInitial: {
    fontSize: 'var(--font-size-2xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-600)',
  },
  username: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    margin: 0,
  },
  bio: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-600)',
    textAlign: 'center',
    lineHeight: 'var(--line-height-normal)',
    maxWidth: '280px',
    margin: 0,
  },
  badges: {
    display: 'flex',
    gap: 'var(--space-2)',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  rankBadge: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-700)',
    backgroundColor: 'var(--color-primary-50)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--color-primary-200)',
  },
  levelBadge: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-600)',
    backgroundColor: 'var(--color-neutral-100)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
  },
  xpBadge: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-accent-700)',
    backgroundColor: 'var(--color-accent-50)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
  },
  locationRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  locationText: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  joinDate: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },
  stats: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    marginTop: 'var(--space-2)',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
  },
  statNumber: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  statLabel: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  statDivider: {
    width: '1px',
    height: '32px',
    backgroundColor: 'var(--color-neutral-200)',
  },
  repCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-primary-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-primary-100)',
  },
  repInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  repTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
  },
  repSub: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  repScore: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  repNum: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-700)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
  },
  sectionTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
    margin: 0,
  },
  tags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
  },
  tag: {
    padding: 'var(--space-1) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-secondary-50)',
    color: 'var(--color-secondary-700)',
    border: '1px solid var(--color-secondary-100)',
  },
  verifiedBadge: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-100)',
    color: 'var(--color-primary-700)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 700,
    border: '1px solid var(--color-primary-200)',
  },
  blockBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    width: '100%', minHeight: 40, marginBottom: 'var(--space-3)',
    padding: '0 var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)', color: 'var(--color-neutral-600)',
    border: '1px solid var(--color-neutral-200)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-xs)', fontWeight: 500, cursor: 'pointer',
  },
  repApplyBtn: {
    minHeight: 36, padding: '0 14px',
    backgroundColor: 'var(--color-primary-500)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer',
  },
  modalOverlay: {
    position: 'fixed', inset: 0, zIndex: 100,
    backgroundColor: 'rgba(15,23,42,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%', maxWidth: 420,
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-4)',
    display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
    boxShadow: 'var(--shadow-lg)',
  },
  modalTitle: { fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-neutral-900)', margin: 0 },
  modalSub: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-600)', margin: 0 },
  modalInput: {
    padding: '10px 12px', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)', fontSize: 'var(--font-size-sm)',
  },
  modalTextarea: {
    padding: '10px 12px', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)', fontSize: 'var(--font-size-sm)',
    minHeight: 120, resize: 'vertical', fontFamily: 'inherit',
  },
  modalPrimary: {
    minHeight: 44, padding: '0 14px',
    backgroundColor: 'var(--color-primary-500)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer',
  },
  modalSecondary: {
    minHeight: 44, padding: '0 14px',
    backgroundColor: 'var(--color-neutral-100)', color: 'var(--color-neutral-700)',
    border: '1px solid var(--color-neutral-200)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer',
  },
  toast: {
    position: 'fixed', left: '50%', bottom: 80, transform: 'translateX(-50%)',
    padding: '10px 14px', borderRadius: 'var(--radius-md)',
    backgroundColor: 'rgba(15,23,42,0.92)', color: '#fff',
    fontSize: 'var(--font-size-sm)', fontWeight: 500,
    zIndex: 1000, maxWidth: '90vw',
  },
  ctaCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'var(--space-6) var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--color-neutral-100)',
    textAlign: 'center',
  },
  ctaTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    margin: '0 0 var(--space-1)',
  },
  ctaSub: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    maxWidth: '260px',
    lineHeight: 'var(--line-height-normal)',
    margin: '0 0 var(--space-4)',
  },
  ctaBtn: {
    padding: 'var(--space-3) var(--space-6)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-primary-500)',
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    cursor: 'pointer',
    border: 'none',
  },
};
