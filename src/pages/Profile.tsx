import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Settings, Star, Camera, Heart, Upload, Award, LogOut, Shield, User, Users, CircleCheck as CheckCircle, Trophy, X, Save, Loader, Share2, Sparkles, Crown, Calendar, Tag, ImageIcon, BarChart3, ChevronRight, FileText, Trash2, TriangleAlert as AlertTriangle } from 'lucide-react';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { AvatarFallback } from '../components/ui/MediaFallback';
import { useAuth } from '../context/AuthContext';
import { GuestOverlay } from '../components/GuestGate';
import { PageScroll } from '../components/ui/PageScroll';
import { supabase } from '../lib/supabase';
import { fetchAiScanUsage, type AiScanUsage } from '../lib/aiAnalysis';
import { compressImage } from '../lib/imageCompress';
import { Badge } from '../components/ui/Badge';
import { ProBadge } from '../components/ui/ProBadge';
import { UpgradeProCard } from '../components/ui/UpgradeProCard';
import { isProUser } from '../lib/entitlements';
import UserFindsGrid from '../components/UserFindsGrid';
import { BecomeHostCard } from '../components/BecomeHostCard';
import { shareWithImage } from '../lib/shareWithImage';
import { deleteAccount } from '../lib/account';
import { fetchSavedFinds, type SavedFindCard } from '../lib/savedListings';
import { MediaFallback, type FallbackKind } from '../components/ui/MediaFallback';

type ProfileTab = 'overview' | 'reputation' | 'activity';

type TrustIndicator = { label: string; icon: typeof Shield; earned: boolean };

function getTrustIndicators(profile: any): TrustIndicator[] {
  // Use the canonical entitlement helper so any tier-resolution change
  // (e.g. trials, grace periods) ripples through every UI surface.
  const isPro = isProUser(profile);
  return [
    { label: 'Member since ' + (profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'), icon: Calendar, earned: !!profile?.created_at },
    { label: 'Profile photo added', icon: ImageIcon, earned: !!profile?.avatar_url },
    { label: 'Bio completed', icon: User, earned: !!(profile?.bio && profile.bio.trim().length > 0) },
    { label: 'Categories chosen', icon: Tag, earned: !!(profile?.favorite_categories && profile.favorite_categories.length > 0) },
    ...(isPro ? [{ label: 'Pro Member', icon: Crown, earned: true }] : []),
  ];
}

export default function Profile() {
  const { profile, signOut, isGuest } = useAuth();
  const [tab, setTab] = useState<ProfileTab>('overview');
  const [showSettings, setShowSettings] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const navigate = useNavigate();

  const handleShare = async () => {
    const username = profile?.username;
    const profileUrl = `${window.location.origin}/u/${username || ''}`;
    const title = `${username ? '@' + username : 'My'} TreasureTrail Profile`;
    const text = `Check out my TreasureTrail profile!`;

    const result = await shareWithImage({
      url: profileUrl,
      title,
      text,
      imageUrl: profile?.avatar_url || null,
    });

    if (result.kind === 'shared' || result.kind === 'cancelled') return;
    if (result.kind === 'copied') {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
      return;
    }
    // unsupported / error — last-ditch legacy copy.
    try {
      const ta = document.createElement('textarea');
      ta.value = profileUrl;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch {
      window.prompt('Copy this link to share:', profileUrl);
    }
  };

  if (isGuest) {
    return (
      <PageScroll style={styles.container}>
        <GuestOverlay
          title="Your Treasure Profile"
          subtitle="Create a free account to build your TreasureRank, track finds, and connect with collectors."
        />
      </PageScroll>
    );
  }

  return (
    <PageScroll style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Profile</h1>
        <div style={styles.headerActions}>
          <button onClick={() => navigate('/achievements')} style={styles.achieveBtn}>
            <Trophy size={14} style={{ color: 'var(--color-primary-600)' }} />
            <span style={styles.achieveBtnText}>Rank</span>
          </button>
          <button onClick={() => navigate('/following')} style={styles.iconBtn} aria-label="Following feed">
            <Users size={18} style={{ color: 'var(--color-neutral-600)' }} />
          </button>
          <button onClick={handleShare} style={styles.iconBtn} aria-label="Share profile">
            <Share2 size={18} style={{ color: 'var(--color-neutral-600)' }} />
          </button>
          <button onClick={() => navigate('/safety')} style={styles.iconBtn}>
            <Shield size={18} style={{ color: 'var(--color-secondary-500)' }} />
          </button>
          <button onClick={signOut} style={styles.iconBtn} aria-label="Sign out">
            <LogOut size={18} style={{ color: 'var(--color-neutral-600)' }} />
          </button>
          <button onClick={() => setShowSettings(true)} style={styles.iconBtn}>
            <Settings size={20} style={{ color: 'var(--color-neutral-600)' }} />
          </button>
        </div>
      </header>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {shareCopied && (
        <div style={styles.shareToast}>
          Link copied to clipboard!
        </div>
      )}

      <div style={styles.content}>
        <ProfileHeader profile={profile} />

        {!isProUser(profile) && (
          <UpgradeProCard
            onUpgrade={() => navigate('/pro')}
            style={{ marginTop: 'var(--space-4)' }}
          />
        )}

        {profile && isProUser(profile) && profile.account_type === 'holder' && (
          <button
            onClick={() => navigate('/seller/analytics')}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%',
              textAlign: 'left', marginTop: 'var(--space-4)',
              padding: '14px 16px', borderRadius: 16,
              border: '1px solid var(--color-neutral-200)',
              background: 'var(--color-neutral-0)', cursor: 'pointer',
            }}
          >
            <span style={{
              display: 'inline-flex', width: 36, height: 36, borderRadius: 10,
              alignItems: 'center', justifyContent: 'center',
              background: 'rgba(251, 191, 36, 0.16)', flexShrink: 0,
            }}>
              <BarChart3 size={18} style={{ color: 'var(--color-primary-600, #d97706)' }} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-900)' }}>
                Reach Analytics
              </span>
              <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' }}>
                Views, saves & taps across your events
              </span>
            </span>
            <ChevronRight size={18} style={{ color: 'var(--color-neutral-400)', flexShrink: 0 }} />
          </button>
        )}

        <div style={styles.tabs}>
          {(['overview', 'reputation', 'activity'] as ProfileTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'overview' && <OverviewTab profile={profile} />}
        {tab === 'reputation' && <ReputationTab profile={profile} />}
        {tab === 'activity' && <ActivityTab />}

        {/* Prominent, clearly-labeled Sign Out CTA at the bottom of the
            Profile page. The header has an icon-only sign-out button as
            well, but users couldn't find it — this is the discoverable
            one. */}
        <button
          onClick={signOut}
          style={{
            marginTop: 'var(--space-8)',
            marginBottom: 'var(--space-6)',
            width: '100%',
            padding: 'var(--space-4)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-neutral-200)',
            backgroundColor: 'var(--color-neutral-0)',
            color: 'var(--color-neutral-700)',
            fontSize: 'var(--font-size-base)',
            fontWeight: 'var(--font-weight-semibold)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-2)',
            cursor: 'pointer',
          }}
        >
          <LogOut size={18} />
          {isGuest ? 'Exit Guest Mode' : 'Sign Out'}
        </button>
      </div>
    </PageScroll>
  );
}

function ProfileHeader({ profile }: { profile: any }) {
  const { user, updateProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(null);
  const [findsCount, setFindsCount] = useState<number>(0);
  const [savedCount, setSavedCount] = useState<number>(0);

  // Pull real counters so the stat row stops showing hardcoded zeros.
  // Finds = community_posts authored by me (Flash Finds + any other
  // type that lives in community_posts). Saved = the union of saved
  // marketplace listings (DB) and locally-bookmarked community posts
  // (localStorage), matching what the rest of the app actually persists.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [postsRes, savedListingsRes] = await Promise.all([
        supabase
          .from('community_posts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),
        supabase
          .from('saved_listings')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),
      ]);
      if (cancelled) return;
      setFindsCount(postsRes.count ?? 0);
      let localSaved = 0;
      try {
        const raw = localStorage.getItem('tt_saved_posts');
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) localSaved = arr.length;
        }
      } catch { /* ignore */ }
      setSavedCount((savedListingsRes.count ?? 0) + localSaved);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const avatarUrl = localAvatarUrl || profile?.avatar_url || null;

  const joinDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'May 2026';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    e.target.value = '';

    setUploading(true);
    setUploadError('');

    try {
      // Avatars only need a small square — 512px is plenty for retina at
      // 88px display. We compress before upload so the storage bucket
      // never holds a 10MB selfie. If compression fails (e.g. an exotic
      // HEIC the canvas can't decode), we fall back to the raw file.
      let uploadBlob: Blob = file;
      let ext = file.name.split('.').pop() || 'jpg';
      try {
        const dataUrl: string = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = () => reject(r.error);
          r.readAsDataURL(file);
        });
        const compressed = await compressImage(dataUrl, 512, 0.85);
        const cres = await fetch(compressed);
        uploadBlob = await cres.blob();
        ext = 'jpg';
      } catch {
        // keep raw file
      }
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, uploadBlob, {
          upsert: true,
          contentType: uploadBlob.type || file.type,
          // Timestamped filename → URL is the version → safe to mark
          // as immutable. Browser & CDN keep the avatar bytes for a
          // year without revalidating. New uploads write to new paths
          // and update profiles.avatar_url, so the cache never gets
          // stuck on a stale image.
          cacheControl: '31536000, immutable',
        });

      if (uploadErr) throw new Error(uploadErr.message);

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(path);

      const publicUrl = urlData.publicUrl;

      const { error: profileErr } = await updateProfile({ avatar_url: publicUrl });
      if (profileErr) throw new Error(profileErr);

      setLocalAvatarUrl(publicUrl);
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={styles.profileCard}>
      {/* Hidden file inputs — one for camera, one for gallery */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        aria-hidden="true"
      />

      <div style={styles.avatarContainer}>
        <button
          onClick={() => fileInputRef.current?.click()}
          style={styles.avatarBtn}
          disabled={uploading}
          aria-label="Change profile photo"
        >
          {avatarUrl ? (
            <div style={styles.avatarImg as any}>
              <ImageWithFade
                src={avatarUrl}
                alt="Profile avatar"
                fallback={<AvatarFallback name={profile?.username ?? 'You'} seed={profile?.username ?? 'avatar'} />}
              />
            </div>
          ) : (
            <div style={styles.avatarPlaceholder}>
              {uploading
                ? <Loader size={24} style={{ color: 'var(--color-primary-400)', animation: 'spin 1s linear infinite' }} />
                : <Camera size={24} style={{ color: 'var(--color-neutral-400)' }} />
              }
            </div>
          )}
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{ ...styles.editBadge, opacity: uploading ? 0.6 : 1 }}
          disabled={uploading}
          aria-label="Change profile photo"
        >
          {uploading
            ? <Loader size={10} style={{ color: 'var(--color-neutral-0)', animation: 'spin 1s linear infinite' }} />
            : <Camera size={10} style={{ color: 'var(--color-neutral-0)' }} />
          }
        </button>
      </div>

      {uploadError && (
        <p style={styles.uploadError}>{uploadError}</p>
      )}

      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        <h2 style={styles.username}>@{profile?.username || 'treasure_hunter'}</h2>
        {isProUser(profile) && <ProBadge size="md" />}
      </div>
      {profile?.bio && <p style={styles.bio}>{profile.bio}</p>}
      <div style={styles.rankRow}>
        <span style={styles.rankBadge}>{profile?.treasure_rank || 'Hunter'}</span>
        <span style={styles.levelBadge}>Lv. {profile?.level || 1}</span>
        <span style={styles.xpBadge}>{profile?.xp || 0} XP</span>
      </div>
      <span style={styles.joinDate}>Member since {joinDate}</span>

      <div style={styles.stats}>
        <div style={styles.stat}>
          <span style={styles.statNumber}>{profile?.follower_count || 0}</span>
          <span style={styles.statLabel}>Followers</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.stat}>
          <span style={styles.statNumber}>{profile?.following_count || 0}</span>
          <span style={styles.statLabel}>Following</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.stat}>
          <span style={styles.statNumber}>{findsCount}</span>
          <span style={styles.statLabel}>Finds</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.stat} title="Items you've bookmarked to revisit later">
          <span style={styles.statNumber}>{savedCount}</span>
          <span style={styles.statLabel}>Saved</span>
        </div>
      </div>
    </div>
  );
}

function AiScanUsageCard() {
  const [usage, setUsage] = useState<AiScanUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchAiScanUsage().then((u) => {
      if (cancelled) return;
      setUsage(u);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div style={proStyles.usageCard}>
        <div style={proStyles.usageHeader}>
          <Sparkles size={16} style={{ color: 'var(--color-primary-500)' }} />
          <span style={proStyles.usageTitle}>AI Treasure Scans</span>
        </div>
        <span style={proStyles.usageSub}>Loading…</span>
      </div>
    );
  }
  if (!usage) return null;

  const isPro = usage.tier === 'pro';
  const pct = isPro ? 0 : Math.min(100, (usage.used / usage.limit) * 100);

  return (
    <div style={proStyles.usageCard}>
      <div style={proStyles.usageHeader}>
        <Sparkles size={16} style={{ color: 'var(--color-primary-500)' }} />
        <span style={proStyles.usageTitle}>AI Treasure Scans</span>
        {isPro && (
          <span style={proStyles.proPill}>
            <Crown size={10} style={{ color: 'var(--color-neutral-0)' }} />
            PRO
          </span>
        )}
      </div>
      {isPro ? (
        <>
          <span style={proStyles.usageBig}>Unlimited</span>
          <span style={proStyles.usageSub}>
            {usage.used} used today (safety cap {usage.limit})
          </span>
        </>
      ) : (
        <>
          <span style={proStyles.usageBig}>
            {usage.remaining} <span style={proStyles.usageBigSuffix}>of {usage.limit} left today</span>
          </span>
          <div style={proStyles.usageBar}>
            <div style={{ ...proStyles.usageFill, width: `${pct}%` }} />
          </div>
          <span style={proStyles.usageSub}>
            {usage.remaining > 0
              ? 'Resets 24 hours after each scan.'
              : 'Come back tomorrow or upgrade to Pro for unlimited scans.'}
          </span>
        </>
      )}
    </div>
  );
}

function OverviewTab({ profile }: { profile: any }) {
  const repScore = profile?.reputation_score ?? 0;
  const { user } = useAuth();
  const navigate = useNavigate();
  // null = still loading; [] = loaded and genuinely empty.
  const [savedFinds, setSavedFinds] = useState<SavedFindCard[] | null>(null);

  useEffect(() => {
    if (!user) { setSavedFinds([]); return; }
    let cancelled = false;
    (async () => {
      const finds = await fetchSavedFinds(user.id);
      if (!cancelled) setSavedFinds(finds);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const openSavedFind = (item: SavedFindCard) => {
    if (item.externalUrl) {
      try {
        const u = new URL(item.externalUrl);
        if (u.protocol === 'http:' || u.protocol === 'https:') {
          window.open(u.toString(), '_blank', 'noopener,noreferrer');
        }
      } catch { /* ignore malformed url */ }
      return;
    }
    if (item.to) navigate(item.to);
  };

  return (
    <>
      <BecomeHostCard surface="profile" />
      <AiScanUsageCard />
      <div style={styles.reputationCard}>
        <div style={styles.repLeft}>
          <Award size={20} style={{ color: 'var(--color-primary-500)' }} />
          <div>
            <h3 style={styles.repTitle}>Reputation Score</h3>
            <p style={styles.repSubtitle}>{repScore > 0 ? 'Based on your activity' : 'No ratings yet'}</p>
          </div>
        </div>
        <div style={styles.repScore}>
          <span style={styles.scoreNumber}>{repScore}</span>
          <Star size={14} style={{ color: 'var(--color-primary-500)', fill: 'var(--color-primary-500)' }} />
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <Shield size={16} style={{ color: 'var(--color-secondary-500)' }} />
          <h3 style={styles.sectionTitle}>Profile Trust</h3>
        </div>
        <div style={styles.badgesGrid}>
          {getTrustIndicators(profile).map((ind) => (
            <div
              key={ind.label}
              style={{
                ...styles.badgeItem,
                ...(ind.earned ? {} : styles.badgeItemLocked),
              }}
            >
              <ind.icon
                size={18}
                style={{
                  color: ind.earned ? 'var(--color-primary-500)' : 'var(--color-neutral-300)',
                }}
              />
              <span
                style={{
                  ...styles.badgeLabel,
                  color: ind.earned ? 'var(--color-neutral-700)' : 'var(--color-neutral-400)',
                }}
              >
                {ind.label}
              </span>
              {ind.earned && (
                <CheckCircle size={14} style={{ color: 'var(--color-success-500)' }} aria-label="Completed" />
              )}
            </div>
          ))}
        </div>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)', marginTop: 'var(--space-2)', lineHeight: 1.4 }}>
          Trust signals reflect your real profile completeness — no fake ratings.
        </p>
      </div>

      {profile?.favorite_categories && profile.favorite_categories.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Favorite Categories</h3>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {profile.favorite_categories.map((cat: string) => (
              <Badge key={cat} variant="category">{cat}</Badge>
            ))}
          </div>
        </div>
      )}

      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <Heart size={16} style={{ color: 'var(--color-error-400)' }} />
          <h3 style={styles.sectionTitle}>Saved Finds</h3>
        </div>
        {savedFinds === null ? (
          <div style={styles.emptyTabState}>
            <Loader size={24} style={{ color: 'var(--color-neutral-300)', marginBottom: 8 }} />
            <p style={styles.emptyTabSub}>Loading your saved finds…</p>
          </div>
        ) : savedFinds.length === 0 ? (
          <div style={styles.emptyTabState}>
            <Heart size={24} style={{ color: 'var(--color-neutral-300)', marginBottom: 8 }} />
            <p style={styles.emptyTabTitle}>No saved finds yet</p>
            <p style={styles.emptyTabSub}>Items you save will appear here.</p>
          </div>
        ) : (
          <div style={styles.savedGrid}>
            {savedFinds.map((item) => {
              const fbKind: FallbackKind =
                item.kind === 'community_post' ? 'find'
                  : item.kind === 'external_listing' ? 'listing'
                    : 'listing';
              return (
                <button
                  key={item.key}
                  type="button"
                  style={styles.savedCard}
                  onClick={() => openSavedFind(item)}
                  title={item.title}
                >
                  <div style={styles.savedThumb}>
                    <ImageWithFade
                      src={item.imageUrl}
                      alt={item.title}
                      fallback={<MediaFallback kind={fbKind} seed={item.id} compact />}
                    />
                  </div>
                  <span style={styles.savedTitle}>{item.title}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function ReputationTab({ profile }: { profile: any }) {
  const score = profile?.reputation_score ?? 0;
  const scorePercent = Math.min((score / 5) * 100, 100);
  return (
    <>
      <div style={styles.repPanel}>
        <div style={styles.repPanelHeader}>
          <div style={styles.trustedBadge}>
            <Shield size={20} style={{ color: 'var(--color-primary-600)' }} />
            <span style={styles.trustedText}>Building Reputation</span>
          </div>
          <div style={styles.repScoreLarge}>
            <span style={styles.repScoreNum}>{score.toFixed(1)}</span>
            <span style={styles.repScoreMax}>/5.0</span>
          </div>
        </div>

        <div style={styles.repMetrics}>
          <div style={styles.repMetric}>
            <div style={styles.repMetricIcon}>
              <Star size={14} style={{ color: 'var(--color-primary-500)' }} />
            </div>
            <div style={styles.repMetricInfo}>
              <span style={styles.repMetricLabel}>Reputation Score</span>
              <span style={styles.repMetricValue}>{score.toFixed(1)} / 5.0</span>
            </div>
            <div style={styles.repMetricBar}>
              <div style={{ ...styles.repMetricFill, width: `${scorePercent}%` }} />
            </div>
          </div>
        </div>
      </div>

      {profile?.favorite_categories && profile.favorite_categories.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Specialty Categories</h3>
          </div>
          <div style={styles.categoriesList}>
            {profile.favorite_categories.map((cat: string) => (
              <span key={cat} style={styles.categoryTag}>{cat}</span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function ActivityTab() {
  const { user } = useAuth();
  if (!user) {
    return (
      <div style={styles.emptyTabState}>
        <Upload size={28} style={{ color: 'var(--color-neutral-300)', marginBottom: 8 }} />
        <p style={styles.emptyTabTitle}>Sign in to see your activity</p>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <h3 style={{ ...styles.sectionTitle, margin: 0 }}>Your Finds</h3>
      <UserFindsGrid userId={user.id} emptyLabel="You haven't posted any finds yet" />
    </div>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const { profile, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState(profile?.username || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  const handleSave = async () => {
    if (!username.trim()) { setError('Username is required.'); return; }
    setSaving(true);
    setError('');
    const { error: err } = await updateProfile({ username: username.trim(), bio: bio.trim() });
    setSaving(false);
    if (err) { setError(err); return; }
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 1000);
  };

  const goLegal = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <div style={settingsStyles.overlay}>
      <div style={settingsStyles.modal}>
        <div style={settingsStyles.modalHeader}>
          <h2 style={settingsStyles.modalTitle}>Profile Settings</h2>
          <button onClick={onClose} style={settingsStyles.closeBtn}>
            <X size={20} style={{ color: 'var(--color-neutral-600)' }} />
          </button>
        </div>

        <div style={settingsStyles.body}>
          <div style={settingsStyles.field}>
            <label style={settingsStyles.label}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your_username"
              style={settingsStyles.input}
            />
          </div>

          <div style={settingsStyles.field}>
            <label style={settingsStyles.label}>Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell the community about yourself..."
              rows={3}
              style={{ ...settingsStyles.input, resize: 'vertical', minHeight: '72px' }}
            />
          </div>

          {error && <p style={settingsStyles.errorText}>{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            style={{ ...settingsStyles.saveBtn, opacity: saving ? 0.6 : 1 }}
          >
            <Save size={16} style={{ color: 'var(--color-neutral-0)' }} />
            <span style={settingsStyles.saveBtnText}>
              {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Changes'}
            </span>
          </button>

          <div style={settingsStyles.linkGroup}>
            <button onClick={() => goLegal('/privacy')} style={settingsStyles.linkRow}>
              <FileText size={16} style={{ color: 'var(--color-neutral-500)' }} />
              <span style={settingsStyles.linkText}>Privacy Policy</span>
              <ChevronRight size={14} style={{ color: 'var(--color-neutral-400)', marginLeft: 'auto' }} />
            </button>
            <button onClick={() => goLegal('/terms')} style={settingsStyles.linkRow}>
              <FileText size={16} style={{ color: 'var(--color-neutral-500)' }} />
              <span style={settingsStyles.linkText}>Terms of Service</span>
              <ChevronRight size={14} style={{ color: 'var(--color-neutral-400)', marginLeft: 'auto' }} />
            </button>
          </div>

          <button onClick={() => setShowDelete(true)} style={settingsStyles.deleteRow}>
            <Trash2 size={16} style={{ color: 'var(--color-error-600)' }} />
            <span style={settingsStyles.deleteText}>Delete Account</span>
          </button>
        </div>
      </div>

      {showDelete && <DeleteAccountConfirm onCancel={() => setShowDelete(false)} />}
    </div>
  );
}

function DeleteAccountConfirm({ onCancel }: { onCancel: () => void }) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const canDelete = confirmText.trim().toUpperCase() === 'DELETE';

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    setError('');
    const result = await deleteAccount();
    if (!result.ok) {
      setDeleting(false);
      setError(result.error);
      return;
    }
    // Account + session are gone; reload to the signed-out state.
    if (typeof window !== 'undefined') window.location.assign('/');
  };

  return (
    <div style={settingsStyles.overlay}>
      <div style={settingsStyles.confirmModal}>
        <div style={settingsStyles.confirmIconWrap}>
          <AlertTriangle size={24} style={{ color: 'var(--color-error-600)' }} />
        </div>
        <h2 style={settingsStyles.confirmTitle}>Delete your account?</h2>
        <p style={settingsStyles.confirmDesc}>
          This permanently deletes your account and all associated data — your profile, listings,
          finds, wanted posts, messages, and photos. This cannot be undone.
        </p>

        <label style={settingsStyles.confirmLabel}>Type DELETE to confirm</label>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="DELETE"
          autoCapitalize="characters"
          style={settingsStyles.input}
        />

        {error && <p style={settingsStyles.errorText}>{error}</p>}

        <button
          onClick={handleDelete}
          disabled={!canDelete || deleting}
          style={{
            ...settingsStyles.confirmDeleteBtn,
            opacity: !canDelete || deleting ? 0.5 : 1,
            cursor: !canDelete || deleting ? 'not-allowed' : 'pointer',
          }}
        >
          {deleting ? (
            <Loader size={16} style={{ color: 'var(--color-neutral-0)', animation: 'spin 0.8s linear infinite' }} />
          ) : (
            <Trash2 size={16} style={{ color: 'var(--color-neutral-0)' }} />
          )}
          <span style={settingsStyles.saveBtnText}>
            {deleting ? 'Deleting…' : 'Permanently Delete'}
          </span>
        </button>

        <button onClick={onCancel} disabled={deleting} style={settingsStyles.confirmCancelBtn}>
          <span style={settingsStyles.confirmCancelText}>Cancel</span>
        </button>
      </div>
    </div>
  );
}

const proStyles: Record<string, React.CSSProperties> = {
  proBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-700))',
    color: 'var(--color-neutral-0)',
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    letterSpacing: '0.5px',
  },
  proPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    marginLeft: 'auto',
    padding: '1px 6px',
    borderRadius: 'var(--radius-full)',
    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-700))',
    color: 'var(--color-neutral-0)',
    fontSize: '9px',
    fontWeight: 'var(--font-weight-bold)',
    letterSpacing: '0.5px',
  },
  usageCard: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-lg)',
    marginBottom: 'var(--space-4)',
    border: '1px solid var(--color-primary-100)',
    boxShadow: 'var(--shadow-sm)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  usageHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  usageTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
  },
  usageBig: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-700)',
  },
  usageBigSuffix: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-500)',
  },
  usageBar: {
    height: '6px',
    width: '100%',
    backgroundColor: 'var(--color-neutral-100)',
    borderRadius: 'var(--radius-full)',
    overflow: 'hidden',
  },
  usageFill: {
    height: '100%',
    background: 'linear-gradient(90deg, var(--color-primary-400), var(--color-primary-600))',
    borderRadius: 'var(--radius-full)',
  },
  usageSub: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
};

const settingsStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 200,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  modal: {
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
    width: '100%',
    maxWidth: '480px',
    boxShadow: 'var(--shadow-xl)',
    paddingBottom: 'var(--space-6)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4)',
    borderBottom: '1px solid var(--color-neutral-100)',
  },
  modalTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  closeBtn: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: 'var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },
  label: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-700)',
  },
  input: {
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-900)',
    backgroundColor: 'var(--color-neutral-50)',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  errorText: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-error-500)',
  },
  saveBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-primary-500)',
    cursor: 'pointer',
    marginTop: 'var(--space-2)',
  },
  saveBtnText: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-0)',
  },
  linkGroup: {
    display: 'flex',
    flexDirection: 'column',
    borderTop: '1px solid var(--color-neutral-100)',
    paddingTop: 'var(--space-2)',
  },
  linkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
  },
  linkText: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-800)',
  },
  deleteRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-error-200)',
    backgroundColor: 'var(--color-error-50)',
    cursor: 'pointer',
    marginTop: 'var(--space-1)',
  },
  deleteText: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-error-600)',
  },
  confirmModal: {
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-xl)',
    width: 'calc(100% - 32px)',
    maxWidth: '400px',
    margin: 'auto',
    padding: 'var(--space-5)',
    boxShadow: 'var(--shadow-xl)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },
  confirmIconWrap: {
    width: '48px',
    height: '48px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-error-50)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  confirmTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    textAlign: 'center',
  },
  confirmDesc: {
    fontSize: 'var(--font-size-sm)',
    lineHeight: 1.5,
    color: 'var(--color-neutral-600)',
    textAlign: 'center',
  },
  confirmLabel: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-700)',
    marginTop: 'var(--space-1)',
  },
  confirmDeleteBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    backgroundColor: 'var(--color-error-600)',
    marginTop: 'var(--space-1)',
  },
  confirmCancelBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
  },
  confirmCancelText: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-600)',
  },
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: 'var(--color-neutral-0)',
  },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4)',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--space-4))',
    backgroundColor: 'var(--color-neutral-0)',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  title: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  achieveBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: 'var(--space-1) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-50)',
    border: '1px solid var(--color-primary-200)',
  },
  achieveBtnText: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-primary-700)',
  },
  iconBtn: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareToast: {
    position: 'fixed',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'var(--color-neutral-900)',
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    padding: 'var(--space-2) var(--space-4)',
    borderRadius: 'var(--radius-full)',
    whiteSpace: 'nowrap',
    zIndex: 300,
    boxShadow: 'var(--shadow-lg)',
    pointerEvents: 'none',
  },
  content: {
    padding: 'var(--space-4)',
  },

  // Profile card
  profileCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'var(--space-5) var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-lg)',
    marginBottom: 'var(--space-4)',
    boxShadow: 'var(--shadow-sm)',
    border: '1px solid var(--color-neutral-100)',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 'var(--space-3)',
  },
  avatarBtn: {
    width: '80px',
    height: '80px',
    borderRadius: 'var(--radius-full)',
    border: '3px solid var(--color-primary-200)',
    padding: 0,
    overflow: 'hidden',
    display: 'block',
    cursor: 'pointer',
    backgroundColor: 'transparent',
  },
  avatarImg: {
    width: '80px',
    height: '80px',
    borderRadius: 'var(--radius-full)',
    objectFit: 'cover',
    display: 'block',
  },
  avatarPlaceholder: {
    width: '80px',
    height: '80px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-100)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadError: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-error-500)',
    textAlign: 'center',
    maxWidth: '220px',
    marginBottom: 'var(--space-2)',
  },
  editBadge: {
    position: 'absolute',
    bottom: '2px',
    right: '2px',
    width: '24px',
    height: '24px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-500)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid var(--color-neutral-0)',
    cursor: 'pointer',
  },
  username: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  bio: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-600)',
    textAlign: 'center',
    marginTop: 'var(--space-1)',
    lineHeight: 'var(--line-height-normal)',
    maxWidth: '280px',
  },
  rankRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginTop: 'var(--space-2)',
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
    marginTop: 'var(--space-2)',
  },
  locationText: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  joinDate: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
    marginTop: 'var(--space-1)',
    marginBottom: 'var(--space-4)',
  },
  stats: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    width: '100%',
    justifyContent: 'center',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  statLabel: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
    marginTop: '2px',
  },
  statDivider: {
    width: '1px',
    height: '32px',
    backgroundColor: 'var(--color-neutral-200)',
  },

  // Tabs
  tabs: {
    display: 'flex',
    gap: 'var(--space-1)',
    marginBottom: 'var(--space-4)',
    padding: 'var(--space-1)',
    backgroundColor: 'var(--color-neutral-100)',
    borderRadius: 'var(--radius-md)',
  },
  tab: {
    flex: 1,
    padding: 'var(--space-2) var(--space-2)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-500)',
    textAlign: 'center',
    transition: 'all var(--transition-fast)',
  },
  tabActive: {
    backgroundColor: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-900)',
    fontWeight: 'var(--font-weight-semibold)',
    boxShadow: 'var(--shadow-sm)',
  },

  // Reputation card
  reputationCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-primary-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-primary-100)',
    marginBottom: 'var(--space-5)',
  },
  repLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  repTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
  },
  repSubtitle: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  repScore: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  scoreNumber: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-700)',
  },

  // Badges
  badgesGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  badgeItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
  },
  badgeItemLocked: {
    opacity: 0.5,
  },
  badgeLabel: {
    flex: 1,
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
  },

  // Sections
  section: {
    marginBottom: 'var(--space-5)',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-3)',
  },
  sectionTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
  },
  categoriesList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
  },
  categoryTag: {
    padding: 'var(--space-1) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-secondary-50)',
    color: 'var(--color-secondary-700)',
    border: '1px solid var(--color-secondary-100)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 'var(--space-2)',
  },
  gridItem: {
    position: 'relative',
    aspectRatio: '1',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  gridOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 'var(--space-2) var(--space-3)',
    background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
  },
  gridPrice: {
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
  },

  // Reputation panel
  repPanel: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
    marginBottom: 'var(--space-5)',
  },
  repPanelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-4)',
    paddingBottom: 'var(--space-3)',
    borderBottom: '1px solid var(--color-neutral-100)',
  },
  trustedBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-primary-50)',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--color-primary-200)',
  },
  trustedText: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-700)',
  },
  repScoreLarge: {
    display: 'flex',
    alignItems: 'baseline',
  },
  repScoreNum: {
    fontSize: 'var(--font-size-2xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  repScoreMax: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-400)',
  },
  repMetrics: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
  },
  repMetric: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    flexWrap: 'wrap',
  },
  repMetricIcon: {
    width: '28px',
    height: '28px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--color-neutral-50)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  repMetricInfo: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 0,
  },
  repMetricLabel: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-700)',
  },
  repMetricValue: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },
  repMetricBar: {
    width: '100%',
    height: '4px',
    backgroundColor: 'var(--color-neutral-100)',
    borderRadius: 'var(--radius-full)',
    marginTop: 'var(--space-1)',
  },
  repMetricFill: {
    height: '100%',
    backgroundColor: 'var(--color-primary-500)',
    borderRadius: 'var(--radius-full)',
    transition: 'width 0.6s ease',
  },

  // Regional coverage
  regionCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
  },
  regionRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  regionLabel: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-500)',
  },
  regionValue: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-800)',
  },

  // Activity
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },
  activityItem: {
    display: 'flex',
    gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
    animation: 'slideUp 0.4s ease forwards',
    opacity: 0,
    animationFillMode: 'forwards',
  },
  activityIcon: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  activityContent: {
    flex: 1,
    minWidth: 0,
  },
  activityTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-800)',
    lineHeight: 'var(--line-height-tight)',
    marginBottom: '2px',
  },
  activityDetail: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
    lineHeight: 'var(--line-height-normal)',
    marginBottom: '2px',
  },
  activityTime: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },

  // Empty tab states
  emptyTabState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-10) var(--space-4)',
    textAlign: 'center',
  },
  emptyTabTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-600)',
    marginBottom: 'var(--space-1)',
  },
  emptyTabSub: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
    maxWidth: '260px',
    lineHeight: 'var(--line-height-normal)',
  },

  savedGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 'var(--space-3)',
  },
  savedCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    padding: 0,
    border: '1px solid var(--color-neutral-100)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-0)',
    overflow: 'hidden',
    cursor: 'pointer',
    textAlign: 'left',
    appearance: 'none',
    WebkitAppearance: 'none',
  },
  savedThumb: {
    width: '100%',
    aspectRatio: '1 / 1',
    backgroundColor: 'var(--color-neutral-100)',
  },
  savedTitle: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-700)',
    lineHeight: 'var(--line-height-tight)',
    padding: '0 var(--space-2) var(--space-2)',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },

};
