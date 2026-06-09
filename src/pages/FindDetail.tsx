import { useEffect, useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Bookmark, Share2, Flag, ExternalLink, MessageCircle,
  Eye, Trash2, Shield, Tag, DollarSign, Sparkles, Calendar, Loader,
  Pencil, X, Save,
} from 'lucide-react';
import { supabase, type CommunityPost, type Profile } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/ui/Badge';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { MediaFallback, AvatarFallback } from '../components/ui/MediaFallback';
import { Lightbox } from '../components/ui/Lightbox';
import { MobileDetailPage } from '../components/ui/MobileDetailPage';
import { canDeletePost, deletePost, communityPostToDeletable } from '../lib/moderation';
import { trackListingView, fetchListingEngagement } from '../lib/listingViews';
import { shareWithImage } from '../lib/shareWithImage';
import { publicWebUrl } from '../lib/apiBase';
import { attachProfiles } from '../lib/database';
import { saveListing, unsaveListing } from '../lib/savedListings';
import ReportButton from '../components/moderation/ReportButton';
import BlockUserButton from '../components/moderation/BlockUserButton';

type FullPost = CommunityPost & {
  general_location?: string | null;
  marketplace_found?: string | null;
  scout_needed?: boolean | null;
  description?: string | null;
  profiles?: Pick<Profile, 'username' | 'avatar_url' | 'scout_verified'> | null;
};

function formatMarketplace(raw?: string | null): string {
  if (!raw) return '';
  const map: Record<string, string> = {
    facebook_marketplace: 'Facebook Marketplace',
    craigslist: 'Craigslist',
    offerup: 'OfferUp',
    ebay: 'eBay',
    poshmark: 'Poshmark',
    mercari: 'Mercari',
    nextdoor: 'Nextdoor',
    other: 'Other',
  };
  return map[raw] ?? raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function postBadgeLabel(p: FullPost): { label: string; variant: 'shipping' | 'marketplace' | 'event' } | null {
  if (p.type === 'rare_radar') return { label: 'Looking For', variant: 'marketplace' };
  if (p.type === 'flash_find' || p.type === 'find') return { label: 'Found', variant: 'shipping' };
  if (p.type === 'auction_win') return { label: 'Live Event', variant: 'event' };
  return null;
}

export default function FindDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [post, setPost] = useState<FullPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [imageZoomed, setImageZoomed] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [engagement, setEngagement] = useState<{ view_count: number; save_count: number }>({ view_count: 0, save_count: 0 });

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2400);
  }, []);

  // ---- fetch by id ------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setNotFound(false);
    setLoadError(null);
    // PostgREST cannot auto-embed `profiles` here because the FK on
    // community_posts.user_id targets auth.users(id), not profiles(id).
    // Fetch the row first, then merge a single profile lookup so the
    // detail view doesn't blow up with PGRST200.
    (async () => {
      const { data, error } = await supabase
        .from('community_posts')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (cancelled) return;
      if (error) { setLoadError(error.message); setLoading(false); return; }
      if (!data) { setNotFound(true); setLoading(false); return; }
      const [withProfile] = await attachProfiles([data as Record<string, unknown>], 'user_id');
      if (cancelled) return;
      setPost(withProfile as unknown as FullPost);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  // ---- hydrate saved-state from localStorage ----------------------------
  useEffect(() => {
    if (!id) return;
    try {
      const raw = localStorage.getItem('tt_saved_posts');
      if (!raw) return;
      const ids: string[] = JSON.parse(raw);
      setSaved(Array.isArray(ids) && ids.includes(id));
    } catch { /* ignore parse errors */ }
  }, [id]);

  // ---- track view + load engagement counts ------------------------------
  // Same shape as ListingDetail: anonymous viewers don't write rows; the
  // counter view returns 0 for those callers, which renders an empty strip.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    if (user) trackListingView(id, 'community_post').catch(() => {});
    fetchListingEngagement(id, 'community_post').then((e) => {
      if (!cancelled) setEngagement(e);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [id, user]);

  // ---- action handlers --------------------------------------------------
  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  };

  const handleSave = () => {
    if (!user) { showToast('Sign in to save listings'); return; }
    if (!id) return;
    try {
      const raw = localStorage.getItem('tt_saved_posts');
      const ids: string[] = raw ? JSON.parse(raw) : [];
      const next = new Set(Array.isArray(ids) ? ids : []);
      if (next.has(id)) {
        next.delete(id);
        setSaved(false);
        showToast('Removed from saved');
        unsaveListing(user.id, id, 'community_post').catch(() => {});
      } else {
        next.add(id);
        setSaved(true);
        showToast('Saved to your list');
        saveListing(user.id, id, 'community_post').catch(() => {});
      }
      localStorage.setItem('tt_saved_posts', JSON.stringify([...next]));
    } catch {
      showToast('Could not update saved list');
    }
  };

  const handleShare = async () => {
    if (!post) return;
    const url = publicWebUrl(`/find/${post.id}`);
    const title = post.caption || 'Check out this find on TreasureTrail';
    const result = await shareWithImage({
      url,
      title,
      text: title,
      imageUrl: post.image_url,
    });
    if (result.kind === 'copied') showToast('Link copied');
    else if (result.kind === 'unsupported') showToast('Sharing not supported');
    else if (result.kind === 'error') showToast('Could not share');
  };

  const handleProfileClick = () => {
    const uname = post?.profiles?.username;
    if (uname) navigate(`/profile/${uname}`);
  };

  const handleDelete = async () => {
    if (!post || deleting) return;
    const ok = window.confirm('Delete this find? This cannot be undone.');
    if (!ok) return;
    setDeleting(true);
    const result = await deletePost(communityPostToDeletable(post));
    if (result.ok) {
      showToast('Find deleted');
      window.setTimeout(() => navigate('/'), 600);
    } else {
      setDeleting(false);
      showToast(result.error || 'Delete failed');
    }
  };

  // ---- render states ----------------------------------------------------
  if (loading) {
    return (
      <div style={styles.stateScreen}>
        <Loader size={28} style={{ color: 'var(--color-primary-500)', animation: 'spin 0.8s linear infinite' }} />
        <span style={styles.stateMuted}>Loading find…</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={styles.stateScreen}>
        <span style={styles.stateTitle}>Couldn’t load this find</span>
        <span style={styles.stateMuted}>{loadError}</span>
        <button style={styles.primaryBtn} onClick={handleBack}>Back to feed</button>
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div style={styles.stateScreen}>
        <span style={styles.stateTitle}>This listing no longer exists.</span>
        <span style={styles.stateMuted}>It may have been removed by its owner or a moderator.</span>
        <button style={styles.primaryBtn} onClick={handleBack}>Back to feed</button>
      </div>
    );
  }

  const badge = postBadgeLabel(post);
  const location = post.general_location || post.location || '';
  const username = post.profiles?.username || 'hunter';
  const uploaderInitial = username.slice(0, 1).toUpperCase();
  const allowDelete = canDeletePost(user, profile, post);
  const isAdminDelete = !!(profile?.role === 'admin' && user && post.user_id !== user.id);
  const isOwner = !!user && post.user_id === user.id;
  const isForSale = !!post.for_sale;
  const tags: string[] = Array.isArray(post.tags) ? post.tags.filter(Boolean) : [];

  return (
    <MobileDetailPage>
      {/* sticky top bar */}
      <header style={styles.topBar}>
        <button onClick={handleBack} style={styles.iconBtn} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <span style={styles.topTitle}>Find Details</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {isOwner && (
            <button
              onClick={() => {
                setEditTitle((post.caption ?? '').trim());
                setEditDescription((post.description ?? '').toString());
                setEditCategory((post.category ?? '').trim());
                setEditError(null);
                setShowEdit(true);
              }}
              style={styles.iconBtn}
              aria-label="Edit find"
            >
              <Pencil size={18} />
            </button>
          )}
          <button onClick={handleShare} style={styles.iconBtn} aria-label="Share find">
            <Share2 size={18} />
          </button>
        </div>
      </header>

      {/* hero image */}
      <button
          type="button"
          onClick={() => post.image_url && setImageZoomed(true)}
          style={styles.heroBtn}
          aria-label={post.image_url ? 'Zoom image' : 'Image unavailable'}
          disabled={!post.image_url}
        >
          <ImageWithFade
            src={post.image_url}
            alt={post.caption || 'Find image'}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            containerStyle={{ width: '100%', height: '100%' }}
            fallback={
              <MediaFallback
                kind="find"
                seed={post.id}
                label={(post.caption ?? '').slice(0, 18) || 'FIND'}
              />
            }
          />
          <div style={styles.heroBadgeStack}>
            {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
          </div>
          {post.marketplace_found && (
            <div style={styles.heroSourceBadge}>
              <Badge variant="marketplace">{formatMarketplace(post.marketplace_found)}</Badge>
            </div>
          )}
        </button>

        <div style={styles.body}>
          {/* title */}
          <h1 style={styles.title}>{(post.caption ?? '').trim() || 'Untitled Find'}</h1>

          {(engagement.view_count > 0 || engagement.save_count > 0) && (
            <div style={styles.engagementRow}>
              {engagement.view_count > 0 && (
                <span style={styles.engagementChip}>
                  <Eye size={13} /> {engagement.view_count} {engagement.view_count === 1 ? 'viewer' : 'viewers'}
                </span>
              )}
              {engagement.save_count > 0 && (
                <span style={styles.engagementChip}>
                  <Bookmark size={13} /> {engagement.save_count} {engagement.save_count === 1 ? 'save' : 'saves'}
                </span>
              )}
            </div>
          )}

          {/* uploader row — only interactive when we actually have a
              username to navigate to. If the post has no joined profile
              row, render an identical-looking but non-interactive div so
              there are no dead clicks (architect review). */}
          {post.profiles?.username ? (
            <button onClick={handleProfileClick} style={{ ...styles.uploaderRow, cursor: 'pointer' }} aria-label={`View @${username}'s profile`}>
              <div style={styles.avatarImg as any}>
                <ImageWithFade
                  src={post.profiles?.avatar_url}
                  alt={username}
                  fallback={<AvatarFallback name={username} seed={username} />}
                />
              </div>
              <div style={styles.uploaderMeta}>
                <span style={styles.uploaderName}>@{username}</span>
              </div>
              <ArrowLeft size={18} style={{ transform: 'rotate(180deg)', color: 'var(--color-neutral-400)' }} />
            </button>
          ) : (
            <div style={{ ...styles.uploaderRow, cursor: 'default' }} aria-label="Anonymous uploader">
              <div style={styles.avatarFallback}>{uploaderInitial}</div>
              <div style={styles.uploaderMeta}>
                <span style={styles.uploaderName}>@hunter</span>
                <span style={styles.uploaderSub}>Anonymous</span>
              </div>
            </div>
          )}

          {/* meta chips */}
          <div style={styles.chipRow}>
            {post.category && <Badge variant="category" icon={Tag}>{post.category}</Badge>}
            {typeof post.estimated_value === 'number' && (
              <Badge variant="verified" icon={DollarSign}>Est. ${post.estimated_value.toFixed(0)}</Badge>
            )}
            {typeof post.rarity_score === 'number' && post.rarity_score > 0 && (
              <Badge variant="warning" icon={Sparkles}>Rarity {post.rarity_score}</Badge>
            )}
          </div>

          {/* location + posted-at */}
          {(location || post.created_at) && (
            <div style={styles.metaCol}>
              {location && (
                <div style={styles.metaLine}>
                  <MapPin size={14} /> <span>{location}</span>
                </div>
              )}
              {post.created_at && (
                <div style={styles.metaLine}>
                  <Calendar size={14} />
                  <span>Posted {new Date(post.created_at).toLocaleString()}</span>
                </div>
              )}
            </div>
          )}

          {/* description / caption body */}
          {post.description && post.description.trim().length > 0 && (
            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>About this find</h2>
              <p style={styles.description}>{post.description}</p>
            </section>
          )}

          {/* tags */}
          {tags.length > 0 && (
            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>Tags</h2>
              <div style={styles.chipRow}>
                {tags.map((t) => (
                  <Badge key={t} variant="neutral">#{t}</Badge>
                ))}
              </div>
            </section>
          )}

          {/* primary actions */}
          <section style={styles.actionGrid}>
            <ActionButton
              icon={ExternalLink}
              label="View Original Listing"
              disabled
              hint="Coming Soon"
              onClick={() => {}}
            />
            <ActionButton
              icon={MessageCircle}
              label={isForSale ? 'Contact Seller' : 'Contact Uploader'}
              disabled
              hint="Coming Soon"
              onClick={() => {}}
            />
            <ActionButton
              icon={Bookmark}
              label={saved ? 'Saved' : 'Save Listing'}
              active={saved}
              onClick={handleSave}
            />
            <ActionButton
              icon={Share2}
              label="Share"
              onClick={handleShare}
            />
            <ReportButton contentType="find" contentId={post.id} reportedUserId={post.user_id}>
              <ActionButton icon={Flag} label="Report" onClick={() => {}} />
            </ReportButton>
            {!isOwner && post.user_id && (
              <BlockUserButton targetUserId={post.user_id} targetName={post.profiles?.username || 'uploader'} variant="row" />
            )}
          </section>

          {/* delete (owner / admin) */}
          {allowDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                ...styles.deleteBtn,
                backgroundColor: isAdminDelete
                  ? 'var(--color-warning-600, #b45309)'
                  : 'var(--color-error-600, #b91c1c)',
                opacity: deleting ? 0.6 : 1,
                cursor: deleting ? 'wait' : 'pointer',
              }}
            >
              {isAdminDelete ? <Shield size={16} /> : <Trash2 size={16} />}
              {deleting ? 'Deleting…' : isOwner ? 'Delete Listing' : 'Admin Delete'}
            </button>
          )}

          <div style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }} />
        </div>

      <Lightbox
        open={imageZoomed}
        src={post.image_url}
        alt={post.caption || 'Find image'}
        onClose={() => setImageZoomed(false)}
        onUnrenderable={(msg) => showToast(msg)}
      />

      {toast && (
        <div role="status" aria-live="polite" style={styles.toast}>{toast}</div>
      )}

      {showEdit && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-find-title"
          style={styles.editBackdrop}
          onClick={(e) => { if (e.target === e.currentTarget && !editSaving) setShowEdit(false); }}
        >
          <div style={styles.editCard}>
            <div style={styles.editHeader}>
              <h2 id="edit-find-title" style={styles.editTitle}>Edit find</h2>
              <button
                onClick={() => { if (!editSaving) setShowEdit(false); }}
                style={styles.iconBtn}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <label style={styles.editLabel}>
              Title
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                style={styles.editInput}
                maxLength={120}
                placeholder="Short name for this item"
              />
            </label>
            <label style={styles.editLabel}>
              Description
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                style={{ ...styles.editInput, minHeight: 120, resize: 'vertical' }}
                maxLength={2000}
                placeholder="Details, authentication marks, condition, etc."
              />
            </label>
            <label style={styles.editLabel}>
              Category
              <input
                type="text"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                style={styles.editInput}
                maxLength={60}
                placeholder="Other"
              />
            </label>
            {editError && <p style={styles.editError}>{editError}</p>}
            <div style={styles.editActions}>
              <button
                onClick={() => { if (!editSaving) setShowEdit(false); }}
                disabled={editSaving}
                style={styles.editCancelBtn}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const t = editTitle.trim();
                  if (!t) { setEditError('Title is required.'); return; }
                  setEditSaving(true);
                  setEditError(null);
                  const { data, error } = await supabase
                    .from('community_posts')
                    .update({
                      caption: t,
                      description: editDescription.trim() || null,
                      category: editCategory.trim() || 'Other',
                    })
                    .eq('id', post.id)
                    .select()
                    .maybeSingle();
                  setEditSaving(false);
                  if (error) { setEditError(error.message); return; }
                  if (data) {
                    setPost({ ...post, ...(data as Partial<FullPost>) } as FullPost);
                  }
                  setShowEdit(false);
                  setToast('Find updated');
                }}
                disabled={editSaving}
                style={{ ...styles.editSaveBtn, opacity: editSaving ? 0.7 : 1 }}
              >
                {editSaving ? <Loader size={16} /> : <Save size={16} />}
                {editSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MobileDetailPage>
  );
}

function ActionButton({
  icon: Icon, label, onClick, disabled, active, hint,
}: {
  icon: typeof Bookmark;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  hint?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles.actionBtn,
        backgroundColor: active ? 'var(--color-primary-50)' : 'var(--color-neutral-0)',
        borderColor: active ? 'var(--color-primary-300)' : 'var(--color-neutral-200)',
        color: active ? 'var(--color-primary-700)' : 'var(--color-neutral-800)',
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      title={hint}
    >
      <Icon size={18} />
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{label}</span>
        {hint && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' }}>{hint}</span>}
      </span>
    </button>
  );
}

const styles: Record<string, CSSProperties> = {
  editBackdrop: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 'var(--space-4)', zIndex: 1000,
  },
  editCard: {
    width: '100%', maxWidth: 480, backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)',
    display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
    maxHeight: '90vh', overflowY: 'auto',
    boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
  },
  editHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  editTitle: { margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  editLabel: {
    display: 'flex', flexDirection: 'column', gap: 6,
    fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-700)',
  },
  editInput: {
    padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)', fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-normal)', color: 'var(--color-neutral-900)',
    fontFamily: 'inherit', backgroundColor: 'var(--color-neutral-0)',
  },
  editError: {
    margin: 0, padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-error-50)', color: 'var(--color-error-700)',
    borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)',
  },
  editActions: { display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', marginTop: 'var(--space-2)' },
  editCancelBtn: {
    padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)', backgroundColor: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-700)', fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer',
  },
  editSaveBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)',
    border: 'none', backgroundColor: 'var(--color-primary-500)',
    color: 'var(--color-neutral-0)', fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)', cursor: 'pointer',
  },
  topBar: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
    backgroundColor: 'var(--color-neutral-0)',
    borderBottom: '1px solid var(--color-neutral-200)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontWeight: 700,
    fontSize: 'var(--font-size-base)',
    color: 'var(--color-neutral-900)',
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 'var(--radius-full)',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--color-neutral-800)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  heroBtn: {
    position: 'relative',
    width: '100%',
    aspectRatio: '4 / 3',
    minHeight: 240,
    backgroundColor: 'var(--color-neutral-100)',
    border: 'none',
    padding: 0,
    overflow: 'hidden',
    display: 'block',
    cursor: 'zoom-in',
  },
  heroFallback: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--color-neutral-100)',
  },
  heroBadgeStack: {
    position: 'absolute',
    top: 12,
    left: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    alignItems: 'flex-start',
  },
  heroSourceBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
  },
  body: {
    padding: 'var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    maxWidth: 720,
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box',
  },
  title: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 800,
    color: 'var(--color-neutral-900)',
    lineHeight: 1.25,
    margin: 0,
  },
  engagementRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  engagementChip: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '4px 10px', borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-100)', color: 'var(--color-neutral-700)',
    fontSize: 'var(--font-size-xs)', fontWeight: 600,
  },
  uploaderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    minHeight: 56,
    border: '1px solid var(--color-neutral-200)',
    borderRadius: 'var(--radius-lg)',
    backgroundColor: 'var(--color-neutral-0)',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
  },
  avatarImg: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    objectFit: 'cover',
    flexShrink: 0,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    backgroundColor: 'var(--color-primary-100)',
    color: 'var(--color-primary-700)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 16,
    flexShrink: 0,
  },
  uploaderMeta: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  uploaderName: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 700,
    color: 'var(--color-neutral-900)',
  },
  uploaderSub: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  metaLine: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-700)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  sectionTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 700,
    color: 'var(--color-neutral-500)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    margin: 0,
  },
  description: {
    margin: 0,
    fontSize: 'var(--font-size-base)',
    lineHeight: 1.55,
    color: 'var(--color-neutral-800)',
    whiteSpace: 'pre-wrap',
  },
  actionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 'var(--space-2)',
  },
  actionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    minHeight: 56,
    padding: '10px 14px',
    border: '1px solid var(--color-neutral-200)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-0)',
    textAlign: 'left',
  },
  deleteBtn: {
    marginTop: 'var(--space-2)',
    minHeight: 48,
    padding: '10px 16px',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    color: '#fff',
    fontWeight: 700,
    fontSize: 'var(--font-size-sm)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtn: {
    minHeight: 48,
    padding: '12px 20px',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    backgroundColor: 'var(--color-primary-500)',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  },
  stateScreen: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    textAlign: 'center',
    backgroundColor: 'var(--color-neutral-50)',
  },
  stateTitle: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 700,
    color: 'var(--color-neutral-900)',
  },
  stateMuted: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-600)',
    maxWidth: 360,
  },
  zoomBackdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.92)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    padding: 'var(--space-4)',
    cursor: 'zoom-out',
  },
  zoomImg: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
  },
  toast: {
    position: 'fixed',
    left: '50%',
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
    transform: 'translateX(-50%)',
    backgroundColor: 'var(--color-neutral-900, #111)',
    color: '#fff',
    padding: '12px 18px',
    borderRadius: 'var(--radius-md, 8px)',
    fontSize: 'var(--font-size-sm, 14px)',
    fontWeight: 600,
    boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
    zIndex: 3000,
    maxWidth: 'min(92vw, 420px)',
    textAlign: 'center',
  },
};
