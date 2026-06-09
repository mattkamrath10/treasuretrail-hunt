import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Camera, Heart, Upload, LogOut, Shield, ShieldOff, Users, CircleCheck as CheckCircle, Loader, Share2, BarChart3, ChevronRight, FileText, Trash2, TriangleAlert as AlertTriangle } from 'lucide-react';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { AvatarFallback } from '../components/ui/MediaFallback';
import { useAuth } from '../context/AuthContext';
import { GuestOverlay } from '../components/GuestGate';
import { PageScroll } from '../components/ui/PageScroll';
import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/imageCompress';
import { ProBadge } from '../components/ui/ProBadge';
import { UpgradeProCard } from '../components/ui/UpgradeProCard';
import { isProUser } from '../lib/entitlements';
import { monetizationHidden } from '../lib/platform';
import UserShowcase from '../components/UserShowcase';
import { shareWithImage } from '../lib/shareWithImage';
import { publicWebUrl } from '../lib/apiBase';
import { deleteAccount } from '../lib/account';
import { useScrollLock } from '../hooks/useScrollLock';
import { fetchSavedFinds, type SavedFindCard } from '../lib/savedListings';
import { fetchMyEvents, type EventRow } from '../lib/events';
import { fetchMyWantedItems, type WantedItemRow } from '../lib/wanted';
import { MediaFallback, type FallbackKind } from '../components/ui/MediaFallback';

export default function Profile() {
  const { profile, signOut, isGuest, isAdmin } = useAuth();
  const [showDelete, setShowDelete] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const navigate = useNavigate();

  const handleShare = async () => {
    const username = profile?.username;
    const profileUrl = publicWebUrl(`/u/${username || ''}`);
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
          subtitle="Create a free account to track finds, list items, and connect with collectors."
        />
      </PageScroll>
    );
  }

  return (
    <PageScroll style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Profile</h1>
        <div style={styles.headerActions}>
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
        </div>
      </header>
      {showDelete && <DeleteAccountConfirm onCancel={() => setShowDelete(false)} />}
      {shareCopied && (
        <div style={styles.shareToast}>
          Link copied to clipboard!
        </div>
      )}

      <div style={styles.content}>
        <ProfileHeader profile={profile} />

        {!monetizationHidden() && !isProUser(profile) && (
          <UpgradeProCard
            onUpgrade={() => navigate('/pro')}
            style={{ marginTop: 'var(--space-4)' }}
          />
        )}

        {!monetizationHidden() && profile && isProUser(profile) && profile.account_type === 'holder' && (
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

        <ActivitySection />

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

        <div style={settingsStyles.accountSection}>
          <h3 style={settingsStyles.accountHeading}>Account</h3>
          <div style={settingsStyles.linkGroup}>
            <button onClick={() => navigate('/privacy')} style={settingsStyles.linkRow}>
              <FileText size={16} style={{ color: 'var(--color-neutral-500)' }} />
              <span style={settingsStyles.linkText}>Privacy Policy</span>
              <ChevronRight size={14} style={{ color: 'var(--color-neutral-400)', marginLeft: 'auto' }} />
            </button>
            <button onClick={() => navigate('/terms')} style={settingsStyles.linkRow}>
              <FileText size={16} style={{ color: 'var(--color-neutral-500)' }} />
              <span style={settingsStyles.linkText}>Terms of Service</span>
              <ChevronRight size={14} style={{ color: 'var(--color-neutral-400)', marginLeft: 'auto' }} />
            </button>
            <button onClick={() => navigate('/guidelines')} style={settingsStyles.linkRow}>
              <Shield size={16} style={{ color: 'var(--color-neutral-500)' }} />
              <span style={settingsStyles.linkText}>Community Guidelines</span>
              <ChevronRight size={14} style={{ color: 'var(--color-neutral-400)', marginLeft: 'auto' }} />
            </button>
            <button onClick={() => navigate('/blocked')} style={settingsStyles.linkRow}>
              <ShieldOff size={16} style={{ color: 'var(--color-neutral-500)' }} />
              <span style={settingsStyles.linkText}>Blocked Users</span>
              <ChevronRight size={14} style={{ color: 'var(--color-neutral-400)', marginLeft: 'auto' }} />
            </button>
            <button onClick={() => navigate('/review-mode')} style={settingsStyles.linkRow}>
              <CheckCircle size={16} style={{ color: 'var(--color-neutral-500)' }} />
              <span style={settingsStyles.linkText}>Review Mode</span>
              <ChevronRight size={14} style={{ color: 'var(--color-neutral-400)', marginLeft: 'auto' }} />
            </button>
            {isAdmin && (
              <button onClick={() => navigate('/admin/moderation')} style={settingsStyles.linkRow}>
                <AlertTriangle size={16} style={{ color: 'var(--color-neutral-500)' }} />
                <span style={settingsStyles.linkText}>Moderation Queue</span>
                <ChevronRight size={14} style={{ color: 'var(--color-neutral-400)', marginLeft: 'auto' }} />
              </button>
            )}
          </div>
          <button onClick={() => setShowDelete(true)} style={settingsStyles.deleteRow}>
            <Trash2 size={16} style={{ color: 'var(--color-error-600)' }} />
            <span style={settingsStyles.deleteText}>Delete Account</span>
          </button>
        </div>
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
  const [eventsCount, setEventsCount] = useState<number>(0);
  const [wantedCount, setWantedCount] = useState<number>(0);
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
      // Stats mirror the Activity carousels exactly:
      //  - Finds  = community_posts + marketplace_listings (UserShowcase
      //    merges both, so the header must sum both or it under-counts).
      //  - Events = my published, non-hidden events.
      //  - Wanted = my open, non-hidden wanted items.
      //  - Saved  = fetchSavedFinds (deduped union of local + server saves).
      const [postsRes, listingsRes, evs, wants, finds] = await Promise.all([
        supabase.from('community_posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('marketplace_listings').select('id', { count: 'exact', head: true }).eq('seller_id', user.id),
        fetchMyEvents(user.id).catch(() => [] as EventRow[]),
        fetchMyWantedItems(user.id).catch(() => [] as WantedItemRow[]),
        fetchSavedFinds(user.id),
      ]);
      if (cancelled) return;
      setFindsCount((postsRes.count ?? 0) + (listingsRes.count ?? 0));
      setEventsCount(evs.filter((e) => e.status === 'published' && !e.is_hidden).length);
      setWantedCount(wants.filter((w) => w.status === 'open' && !w.is_hidden).length);
      setSavedCount(finds.length);
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
        {!monetizationHidden() && isProUser(profile) && <ProBadge size="md" />}
      </div>
      {profile?.bio && <p style={styles.bio}>{profile.bio}</p>}
      <span style={styles.joinDate}>Member since {joinDate}</span>

      <div style={styles.stats}>
        <div style={styles.stat}>
          <span style={styles.statNumber}>{findsCount}</span>
          <span style={styles.statLabel}>Finds</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.stat}>
          <span style={styles.statNumber}>{eventsCount}</span>
          <span style={styles.statLabel}>Events</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.stat}>
          <span style={styles.statNumber}>{wantedCount}</span>
          <span style={styles.statLabel}>Wanted</span>
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

function ActivitySection() {
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

  if (!user) {
    return (
      <div style={styles.emptyTabState}>
        <Upload size={28} style={{ color: 'var(--color-neutral-300)', marginBottom: 8 }} />
        <p style={styles.emptyTabTitle}>Sign in to see your activity</p>
      </div>
    );
  }

  return (
    <>
      <h2 style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-neutral-900)' }}>
        Activity
      </h2>
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <UserShowcase userId={user.id} isSelf />
      </div>

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

function DeleteAccountConfirm({ onCancel }: { onCancel: () => void }) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const canDelete = confirmText.trim().toUpperCase() === 'DELETE';
  useScrollLock(true);

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
    <div className="tt-modal-overlay" style={settingsStyles.overlay}>
      <div className="tt-sheet" style={settingsStyles.confirmModal} data-scroll-lock-allow>
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

const settingsStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
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
    display: 'flex',
    flexDirection: 'column',
    boxShadow: 'var(--shadow-xl)',
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
    paddingBottom: 'calc(var(--space-6) + env(safe-area-inset-bottom))',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    WebkitOverflowScrolling: 'touch',
    flex: 1,
    minHeight: 0,
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
  accountSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    marginBottom: 'calc(var(--space-8) + env(safe-area-inset-bottom))',
  },
  accountHeading: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-500)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  linkGroup: {
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid var(--color-neutral-200)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
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
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    WebkitOverflowScrolling: 'touch',
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
