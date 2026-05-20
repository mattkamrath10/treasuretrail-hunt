import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Settings, Star, Camera, Heart, Upload, Award, LogOut, Shield, User, CircleCheck as CheckCircle, Trophy, X, Save, Loader, Share2, Sparkles, Crown, Calendar, Tag, ImageIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GuestOverlay } from '../components/GuestGate';
import { supabase } from '../lib/supabase';
import { fetchAiScanUsage, type AiScanUsage } from '../lib/aiAnalysis';
import { compressImage } from '../lib/imageCompress';
import { Badge } from '../components/ui/Badge';
import {
  fetchMyScoutApplication,
  submitScoutApplication,
  withdrawScoutApplication,
  type ScoutApplication,
} from '../lib/scoutApplications';

type ProfileTab = 'overview' | 'reputation' | 'activity' | 'scouts';

type TrustIndicator = { label: string; icon: typeof Shield; earned: boolean };

function getTrustIndicators(profile: any): TrustIndicator[] {
  const isPro = profile?.membership_tier === 'pro';
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
    const shareData = {
      title: `${username ? '@' + username : 'My'} TreasureTrail Profile`,
      text: `Check out my TreasureTrail profile!`,
      url: profileUrl,
    };

    if (navigator.share && navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (_) {
      }
    }

    try {
      await navigator.clipboard.writeText(profileUrl);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = profileUrl;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2500);
  };

  if (isGuest) {
    return (
      <div style={styles.container}>
        <GuestOverlay
          title="Your Treasure Profile"
          subtitle="Create a free account to build your TreasureRank, track finds, and connect with collectors."
        />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Profile</h1>
        <div style={styles.headerActions}>
          <button onClick={() => navigate('/achievements')} style={styles.achieveBtn}>
            <Trophy size={14} style={{ color: 'var(--color-primary-600)' }} />
            <span style={styles.achieveBtnText}>Rank</span>
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

        <div style={styles.tabs}>
          {(['overview', 'reputation', 'activity', 'scouts'] as ProfileTab[]).map((t) => (
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
        {tab === 'scouts' && <ScoutsTab />}

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
    </div>
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
        .upload(path, uploadBlob, { upsert: true, contentType: uploadBlob.type || file.type });

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
            <img
              src={avatarUrl}
              alt="Profile avatar"
              style={styles.avatarImg}
            />
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

      <h2 style={styles.username}>@{profile?.username || 'treasure_hunter'}</h2>
      {profile?.bio && <p style={styles.bio}>{profile.bio}</p>}
      <div style={styles.rankRow}>
        <span style={styles.rankBadge}>{profile?.treasure_rank || 'Hunter'}</span>
        <span style={styles.levelBadge}>Lv. {profile?.level || 1}</span>
        <span style={styles.xpBadge}>{profile?.xp || 0} XP</span>
        {profile?.membership_tier === 'pro' && (
          <span style={proStyles.proBadge}>
            <Crown size={11} style={{ color: 'var(--color-neutral-0)' }} />
            <span>PRO</span>
          </span>
        )}
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
  return (
    <>
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
        <div style={styles.emptyTabState}>
          <Heart size={24} style={{ color: 'var(--color-neutral-300)', marginBottom: 8 }} />
          <p style={styles.emptyTabTitle}>No saved finds yet</p>
          <p style={styles.emptyTabSub}>Items you save will appear here.</p>
        </div>
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
            <span style={styles.trustedText}>{score >= 4.5 ? 'Trusted Scout' : 'Building Reputation'}</span>
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
  return (
    <div style={styles.emptyTabState}>
      <Upload size={28} style={{ color: 'var(--color-neutral-300)', marginBottom: 8 }} />
      <p style={styles.emptyTabTitle}>No activity yet</p>
      <p style={styles.emptyTabSub}>Your finds, scout jobs, and auction activity will appear here.</p>
    </div>
  );
}

function ScoutsTab() {
  const { user, profile, refreshProfile } = useAuth();
  const [app, setApp] = useState<ScoutApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [showApply, setShowApply] = useState(false);
  const [pitch, setPitch] = useState('');
  const [region, setRegion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Refetches the latest scout_application row AND the user's profile.
  // Both are needed because the apply_scout_verification trigger writes
  // to profiles.scout_verified server-side on status transitions — so an
  // admin's approval is invisible to the client until we re-pull profile.
  //
  // In-flight guard via a ref prevents the focus + visibilitychange
  // listeners from firing two concurrent refreshes when a tab returns
  // to the foreground (both events typically fire back-to-back).
  const refreshingRef = useRef(false);
  const refresh = async () => {
    if (!user || refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const a = await fetchMyScoutApplication(user.id);
      setApp(a);
      await refreshProfile();
    } finally {
      refreshingRef.current = false;
    }
  };

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const a = await fetchMyScoutApplication(user.id);
      if (cancelled) return;
      setApp(a);
      setLoading(false);
      // Always pull a fresh profile on tab open — covers the case where
      // approval happened in another session / via DB SQL / via an admin
      // tool while this client was offline.
      if (a?.status === 'approved' || a?.status === 'declined') {
        await refreshProfile();
      } else {
        // Even with no terminal-status application, refresh so legacy
        // direct-grant scout_verified flips show up.
        await refreshProfile();
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Re-sync whenever the tab is brought back to the foreground. This is
  // what makes "approve in DB → user opens app → badge appears" work
  // without a manual reload.
  useEffect(() => {
    const onFocus = () => { refresh(); };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user]);

  if (loading) {
    return (
      <div style={styles.emptyTabState}>
        <Loader size={20} style={{ color: 'var(--color-neutral-400)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const isVerified = !!profile?.scout_verified;

  if (isVerified) {
    return (
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <Shield size={16} style={{ color: 'var(--color-primary-600)' }} />
          <h3 style={styles.sectionTitle}>You're a Verified Scout</h3>
        </div>
        <p style={styles.emptyTabSub}>
          Your verified badge appears on your profile and listings.
        </p>
      </div>
    );
  }

  // Already applied → show status card.
  if (app && app.status !== 'withdrawn' && app.status !== 'declined') {
    return (
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <Shield size={16} style={{ color: 'var(--color-primary-600)' }} />
          <h3 style={styles.sectionTitle}>Scout application</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Badge variant={app.status === 'approved' ? 'verified' : 'warning'}>
              {app.status === 'pending' ? 'Pending review' : app.status}
            </Badge>
            <span style={styles.emptyTabSub}>
              Submitted {new Date(app.created_at).toLocaleDateString()}
            </span>
          </div>
          {app.region && (
            <p style={styles.emptyTabSub}>Region: {app.region}</p>
          )}
          {app.pitch && (
            <p style={{ ...styles.emptyTabSub, whiteSpace: 'pre-wrap' }}>{app.pitch}</p>
          )}
          {app.status === 'pending' && (
            <button
              onClick={async () => {
                const { error } = await withdrawScoutApplication(app.id);
                if (!error) setApp({ ...app, status: 'withdrawn' });
              }}
              style={{
                alignSelf: 'flex-start', marginTop: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-neutral-200)',
                backgroundColor: 'var(--color-neutral-0)',
                color: 'var(--color-neutral-700)', fontSize: 'var(--font-size-sm)',
                cursor: 'pointer',
              }}
            >
              Withdraw application
            </button>
          )}
        </div>
      </div>
    );
  }

  // Not applied (or withdrawn/declined) → show CTA + apply form.
  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>
        <Shield size={16} style={{ color: 'var(--color-primary-600)' }} />
        <h3 style={styles.sectionTitle}>Become a Verified Scout</h3>
      </div>
      <p style={{ ...styles.emptyTabSub, marginBottom: 'var(--space-3)' }}>
        Scouts help collectors source rare finds and earn a verified badge on
        their profile. Tell us a bit about your specialties and we'll review.
      </p>
      {app && app.status === 'declined' && (
        <p style={{ ...styles.emptyTabSub, color: 'var(--color-error-600)' }}>
          Your previous application was declined. You can submit a new one.
        </p>
      )}
      {!showApply ? (
        <button
          onClick={() => setShowApply(true)}
          style={{
            alignSelf: 'flex-start',
            padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)',
            border: 'none', backgroundColor: 'var(--color-primary-500)',
            color: 'var(--color-neutral-0)', fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-bold)', cursor: 'pointer',
          }}
        >
          Apply to be a Scout
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)' }}>
            Region (city or area)
            <input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              maxLength={120}
              placeholder="e.g. Portland, OR"
              style={{
                padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-neutral-200)',
                fontSize: 'var(--font-size-base)',
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)' }}>
            Why should you be a Scout? (min 20 chars)
            <textarea
              value={pitch}
              onChange={(e) => setPitch(e.target.value)}
              maxLength={2000}
              placeholder="Specialties, experience, the kinds of finds you source…"
              style={{
                padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-neutral-200)',
                fontSize: 'var(--font-size-base)', minHeight: 120, resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </label>
          {submitError && (
            <p style={{ margin: 0, color: 'var(--color-error-600)', fontSize: 'var(--font-size-sm)' }}>
              {submitError}
            </p>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setShowApply(false); setSubmitError(null); }}
              disabled={submitting}
              style={{
                padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-neutral-200)',
                backgroundColor: 'var(--color-neutral-0)',
                color: 'var(--color-neutral-700)', fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!user) return;
                setSubmitting(true);
                setSubmitError(null);
                const { application, error } = await submitScoutApplication({
                  applicantId: user.id,
                  pitch,
                  region,
                });
                setSubmitting(false);
                if (error) { setSubmitError(error); return; }
                setApp(application);
                setShowApply(false);
                setPitch(''); setRegion('');
              }}
              disabled={submitting}
              style={{
                padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)',
                border: 'none', backgroundColor: 'var(--color-primary-500)',
                color: 'var(--color-neutral-0)', fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-bold)', cursor: 'pointer',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Submitting…' : 'Submit application'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


function SettingsModal({ onClose }: { onClose: () => void }) {
  const { profile, updateProfile } = useAuth();
  const [username, setUsername] = useState(profile?.username || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

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

        </div>
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
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: 'var(--color-neutral-0)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4)',
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
    flex: 1,
    overflow: 'auto',
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

  // Scouts tab
  scoutsIntro: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    marginBottom: 'var(--space-4)',
  },
  scoutsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },
  scoutCard: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
    boxShadow: 'var(--shadow-sm)',
    animation: 'slideUp 0.4s ease forwards',
    opacity: 0,
    animationFillMode: 'forwards',
  },
  scoutCardTop: {
    display: 'flex',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-3)',
  },
  scoutAvatar: {
    width: '44px',
    height: '44px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-100)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  scoutInfo: {
    flex: 1,
  },
  scoutNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    marginBottom: '2px',
  },
  scoutUsername: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },
  scoutMetaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  scoutRating: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-700)',
  },
  scoutRegion: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  scoutSpecialties: {
    display: 'flex',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-3)',
  },
  scoutSpecTag: {
    padding: '2px 10px',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    backgroundColor: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-600)',
  },
  scoutCardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 'var(--space-3)',
    borderTop: '1px solid var(--color-neutral-100)',
  },
  scoutJobs: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  requestBtn: {
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-0)',
  },
};
