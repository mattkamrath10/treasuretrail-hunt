import { useEffect, useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Bookmark, Share2, Flag, MessageCircle, Eye,
  Trash2, Shield, Tag, DollarSign, Calendar, Loader, Pencil, UserPlus, UserCheck,
} from 'lucide-react';
import { supabase, type MarketplaceListing, type Profile } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/ui/Badge';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { Lightbox } from '../components/ui/Lightbox';
import { MobileDetailPage } from '../components/ui/MobileDetailPage';
import { canDeletePost, deletePost, marketplaceListingToDeletable } from '../lib/moderation';
import { followUser, unfollowUser, checkIsFollowing, attachProfiles } from '../lib/database';
import { getOrCreateConversation } from '../lib/messaging';
import { saveListing, unsaveListing, isListingSaved } from '../lib/savedListings';
import { createScoutRequest, hasOpenScoutRequest } from '../lib/scouts';
import { trackListingView, fetchListingEngagement } from '../lib/listingViews';
import { blockUser, isUserBlocked } from '../lib/blocks';
import { shareWithImage } from '../lib/shareWithImage';
import { notifyUser } from '../lib/notifications';

type FullListing = MarketplaceListing & {
  description?: string | null;
  general_location?: string | null;
  marketplace_found?: string | null;
  scout_needed?: boolean | null;
  scouts_available?: boolean | null;
  profiles?: Pick<Profile, 'username' | 'avatar_url' | 'treasure_rank' | 'scout_verified'> | null;
};

const LISTING_KIND = 'marketplace' as const;

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [listing, setListing] = useState<FullListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [following, setFollowing] = useState(false);
  const [scoutSent, setScoutSent] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [scouting, setScouting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [imageZoomed, setImageZoomed] = useState(false);
  // Engagement counters surfaced under the title: "N viewed · N saved".
  // Defaults are 0; we fill them in after fetchListingEngagement resolves.
  const [engagement, setEngagement] = useState<{ view_count: number; save_count: number }>({ view_count: 0, save_count: 0 });
  // Seller block state — owners never see the option.
  const [blocked, setBlocked] = useState(false);
  const [blocking, setBlocking] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2400);
  }, []);

  // ---- fetch listing by id ---------------------------------------------
  useEffect(() => {
    let cancelled = false;
    if (!id) { setNotFound(true); setLoading(false); return; }
    setLoading(true); setNotFound(false); setLoadError(null);
    // Same FK-to-auth.users caveat as FindDetail — see attachProfiles
    // docstring. Two-step fetch avoids PGRST200 schema-cache errors.
    (async () => {
      const { data, error } = await supabase
        .from('marketplace_listings')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (cancelled) return;
      if (error) { setLoadError(error.message); setLoading(false); return; }
      if (!data) { setNotFound(true); setLoading(false); return; }
      const [withProfile] = await attachProfiles([data as Record<string, unknown>], 'seller_id');
      if (cancelled) return;
      setListing(withProfile as unknown as FullListing);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  // ---- hydrate per-user state (saved/following/scout) ------------------
  useEffect(() => {
    if (!id || !user || !listing) return;
    let cancelled = false;
    isListingSaved(user.id, id, LISTING_KIND).then((v) => { if (!cancelled) setSaved(v); });
    if (listing.seller_id && listing.seller_id !== user.id) {
      checkIsFollowing(user.id, listing.seller_id).then((v) => { if (!cancelled) setFollowing(v); });
      hasOpenScoutRequest(id, LISTING_KIND, user.id).then((v) => { if (!cancelled) setScoutSent(v); });
      isUserBlocked(user.id, listing.seller_id).then((v) => { if (!cancelled) setBlocked(v); });
    }
    return () => { cancelled = true; };
  }, [id, user, listing]);

  // ---- engagement: fire-and-forget view track + load counters ----------
  // We deliberately run this once per listing id (not per render) and don't
  // gate it on `user` — the RPC silently ignores anonymous viewers, so the
  // call is cheap when signed out. Counter fetch is unauthenticated-safe
  // because the views/saves count views grant SELECT to authenticated only;
  // anonymous returns 0s, which is fine for V1.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    if (user) {
      trackListingView(id, LISTING_KIND).catch(() => {});
    }
    fetchListingEngagement(id, LISTING_KIND).then((e) => {
      if (!cancelled) setEngagement(e);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [id, user]);

  // ---- guest fallback for saved-state (localStorage) -------------------
  useEffect(() => {
    if (!id || user) return;
    try {
      const raw = localStorage.getItem('tt_saved_marketplace');
      if (!raw) return;
      const ids: string[] = JSON.parse(raw);
      setSaved(Array.isArray(ids) && ids.includes(id));
    } catch { /* ignore */ }
  }, [id, user]);

  // ---- action handlers -------------------------------------------------
  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/marketplace');
  };

  const handleSave = async () => {
    if (!id) return;
    if (!user) {
      // Guest fallback: persist locally so save survives a refresh and the
      // user can be reminded when they sign in.
      try {
        const raw = localStorage.getItem('tt_saved_marketplace');
        const ids: string[] = raw ? JSON.parse(raw) : [];
        const next = new Set(Array.isArray(ids) ? ids : []);
        if (next.has(id)) { next.delete(id); setSaved(false); showToast('Removed from saved'); }
        else { next.add(id); setSaved(true); showToast('Saved (sign in to sync)'); }
        localStorage.setItem('tt_saved_marketplace', JSON.stringify([...next]));
      } catch { showToast('Could not update saved list'); }
      return;
    }
    const op = saved
      ? unsaveListing(user.id, id, LISTING_KIND)
      : saveListing(user.id, id, LISTING_KIND);
    const next = !saved;
    setSaved(next); // optimistic
    // Optimistic counter bump so the count moves in lockstep with the
    // heart icon. Rolled back below on error.
    setEngagement((e) => ({ ...e, save_count: Math.max(0, e.save_count + (next ? 1 : -1)) }));
    const { error } = await op;
    if (error) {
      setSaved(!next); // rollback
      setEngagement((e) => ({ ...e, save_count: Math.max(0, e.save_count + (next ? -1 : 1)) }));
      showToast(error);
    } else {
      showToast(next ? 'Saved to your list' : 'Removed from saved');
      // Notify the seller on save (not unsave). Best-effort; ignore errors.
      if (next && listing?.seller_id && listing.seller_id !== user.id) {
        notifyUser({
          target_user_id: listing.seller_id,
          type: 'listing_saved',
          title: 'Someone saved your listing',
          content: listing.title || 'Your listing was saved.',
          related_item_id: listing.id,
          related_item_type: 'marketplace_listing',
        }).catch(() => {});
      }
    }
  };

  const handleBlock = async () => {
    if (!user || !listing?.seller_id || blocking) return;
    if (listing.seller_id === user.id) return;
    setBlocking(true);
    const { error } = await blockUser(user.id, listing.seller_id);
    setBlocking(false);
    if (error) { showToast(error); return; }
    setBlocked(true);
    showToast(`Blocked @${listing.profiles?.username || 'seller'}`);
    // Take the user back to the marketplace — they've explicitly chosen
    // not to see this seller's content.
    window.setTimeout(() => navigate('/marketplace'), 700);
  };

  const handleShare = async () => {
    if (!listing) return;
    const url = `${window.location.origin}/listing/${listing.id}`;
    const title = listing.title || 'Check out this listing on TreasureTrail';
    const result = await shareWithImage({
      url,
      title,
      text: title,
      imageUrl: listing.image_url,
    });
    if (result.kind === 'copied') showToast('Link copied');
    else if (result.kind === 'unsupported') showToast('Sharing not supported');
    else if (result.kind === 'error') showToast('Could not share');
  };

  const handleProfileClick = () => {
    const uname = listing?.profiles?.username;
    if (uname) navigate(`/profile/${uname}`);
  };

  const handleFollow = async () => {
    if (!user) { showToast('Sign in to follow sellers'); return; }
    if (!listing?.seller_id || listing.seller_id === user.id) return;
    const next = !following;
    setFollowing(next); // optimistic
    const { error } = next
      ? await followUser(user.id, listing.seller_id)
      : await unfollowUser(user.id, listing.seller_id);
    if (error) {
      setFollowing(!next);
      showToast(error);
    } else {
      showToast(next ? `Following @${listing.profiles?.username || 'seller'}` : 'Unfollowed');
    }
  };

  const handleMessage = async () => {
    if (!user) { showToast('Sign in to message sellers'); return; }
    if (!listing?.seller_id) return;
    if (listing.seller_id === user.id) { showToast('That is your own listing'); return; }
    if (messaging) return;
    setMessaging(true);
    const { conversationId, error } = await getOrCreateConversation({
      otherUserId: listing.seller_id,
      listingId: listing.id,
      listingKind: LISTING_KIND,
    });
    setMessaging(false);
    if (error || !conversationId) { showToast(error || 'Could not open chat'); return; }
    navigate(`/messages/${conversationId}`);
  };

  const handleScout = async () => {
    if (!user) { showToast('Sign in to request a scout'); return; }
    if (!listing?.seller_id || listing.seller_id === user.id) return;
    if (scoutSent || scouting) return;
    setScouting(true);
    const { error } = await createScoutRequest({
      listingId: listing.id,
      listingKind: LISTING_KIND,
      sellerId: listing.seller_id,
      requesterId: user.id,
      listingTitle: listing.title,
    });
    setScouting(false);
    if (error) { showToast(error); return; }
    setScoutSent(true);
    showToast('Scout request sent');
  };

  const handleDelete = async () => {
    if (!listing || deleting) return;
    const ok = window.confirm('Delete this listing? This cannot be undone.');
    if (!ok) return;
    setDeleting(true);
    const result = await deletePost(marketplaceListingToDeletable(listing));
    if (result.ok) {
      showToast('Listing deleted');
      window.setTimeout(() => navigate('/marketplace'), 600);
    } else {
      setDeleting(false);
      showToast(result.error || 'Delete failed');
    }
  };

  // ---- render states ---------------------------------------------------
  if (loading) {
    return (
      <div style={styles.stateScreen}>
        <Loader size={28} style={{ color: 'var(--color-primary-500)', animation: 'spin 0.8s linear infinite' }} />
        <span style={styles.stateMuted}>Loading listing…</span>
      </div>
    );
  }
  if (loadError) {
    return (
      <div style={styles.stateScreen}>
        <span style={styles.stateTitle}>Couldn’t load this listing</span>
        <span style={styles.stateMuted}>{loadError}</span>
        <button style={styles.primaryBtn} onClick={handleBack}>Back to marketplace</button>
      </div>
    );
  }
  if (notFound || !listing) {
    return (
      <div style={styles.stateScreen}>
        <span style={styles.stateTitle}>This listing no longer exists.</span>
        <span style={styles.stateMuted}>It may have been removed by its seller or a moderator.</span>
        <button style={styles.primaryBtn} onClick={handleBack}>Back to marketplace</button>
      </div>
    );
  }

  const username = listing.profiles?.username || 'seller';
  const uploaderInitial = username.slice(0, 1).toUpperCase();
  // Listings reuse the `canDeletePost` predicate because the underlying
  // ownership rule is identical (`row.seller_id === auth.uid()` OR admin).
  const allowDelete = canDeletePost(user, profile, marketplaceListingToDeletable(listing));
  const isAdminDelete = !!(profile?.role === 'admin' && user && listing.seller_id !== user.id);
  const isOwner = !!user && listing.seller_id === user.id;
  const location = listing.general_location || (listing as any).location || '';
  const priceStr = typeof listing.price === 'number'
    ? `$${listing.price.toLocaleString()}`
    : (listing.price ? `$${listing.price}` : '');

  return (
    <MobileDetailPage>
      <header style={styles.topBar}>
        <button onClick={handleBack} style={styles.iconBtn} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <span style={styles.topTitle}>Listing</span>
        <button onClick={handleShare} style={styles.iconBtn} aria-label="Share listing">
          <Share2 size={18} />
        </button>
      </header>

      <button
          type="button"
          onClick={() => listing.image_url && setImageZoomed(true)}
          style={styles.heroBtn}
          aria-label={listing.image_url ? 'Zoom image' : 'Image unavailable'}
          disabled={!listing.image_url}
        >
          <ImageWithFade
            src={listing.image_url}
            alt={listing.title || 'Listing image'}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            containerStyle={{ width: '100%', height: '100%' }}
            fallback={
              <div style={styles.heroFallback}>
                <Bookmark size={64} style={{ color: 'var(--color-neutral-300)' }} />
              </div>
            }
          />
          <div style={styles.heroBadgeStack}>
            {listing.scout_needed && <Badge variant="scout">Scout Needed</Badge>}
            {listing.profiles?.scout_verified && <Badge variant="verified" icon={Shield}>Verified Seller</Badge>}
          </div>
          {priceStr && (
            <div style={styles.heroPriceBadge}>
              <span style={styles.heroPrice}>{priceStr}</span>
            </div>
          )}
        </button>

        <div style={styles.body}>
          <h1 style={styles.title}>{(listing.title ?? '').trim() || 'Untitled listing'}</h1>

          {/* Engagement strip — real, deduped counts from listing_view_counts
              + listing_save_counts. Empty when both are zero so freshly
              posted listings don't display a depressing "0 viewed · 0 saved". */}
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

          {/* uploader row — non-interactive when username unknown to avoid dead clicks */}
          {listing.profiles?.username ? (
            <button onClick={handleProfileClick} style={{ ...styles.uploaderRow, cursor: 'pointer' }} aria-label={`View @${username}'s profile`}>
              {listing.profiles.avatar_url ? (
                <img src={listing.profiles.avatar_url} alt={username} style={styles.avatarImg} />
              ) : (
                <div style={styles.avatarFallback}>{uploaderInitial}</div>
              )}
              <div style={styles.uploaderMeta}>
                <span style={styles.uploaderName}>@{username}</span>
                <span style={styles.uploaderSub}>
                  {listing.profiles.treasure_rank || 'Hunter'}
                  {listing.profiles.scout_verified ? ' • Verified' : ''}
                </span>
              </div>
              <ArrowLeft size={18} style={{ transform: 'rotate(180deg)', color: 'var(--color-neutral-400)' }} />
            </button>
          ) : (
            <div style={{ ...styles.uploaderRow, cursor: 'default' }} aria-label="Seller">
              <div style={styles.avatarFallback}>{uploaderInitial}</div>
              <div style={styles.uploaderMeta}>
                <span style={styles.uploaderName}>@seller</span>
                <span style={styles.uploaderSub}>Hunter</span>
              </div>
            </div>
          )}

          <div style={styles.chipRow}>
            {listing.category && <Badge variant="category" icon={Tag}>{listing.category}</Badge>}
            {listing.condition && <Badge variant="neutral">{listing.condition}</Badge>}
            {priceStr && <Badge variant="verified" icon={DollarSign}>{priceStr}</Badge>}
          </div>

          {(location || listing.created_at) && (
            <div style={styles.metaCol}>
              {location && (
                <div style={styles.metaLine}><MapPin size={14} /> <span>{location}</span></div>
              )}
              {listing.created_at && (
                <div style={styles.metaLine}>
                  <Calendar size={14} />
                  <span>Posted {new Date(listing.created_at).toLocaleString()}</span>
                </div>
              )}
            </div>
          )}

          {listing.description && listing.description.trim().length > 0 && (
            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>About this listing</h2>
              <p style={styles.description}>{listing.description}</p>
            </section>
          )}

          {/* primary action grid — owner vs other-user split */}
          <section style={styles.actionGrid}>
            {isOwner ? (
              <>
                <ActionButton icon={Pencil} label="Edit Listing" disabled hint="Coming Soon" onClick={() => {}} />
                <ActionButton icon={Eye} label="View Public Link" onClick={handleShare} />
              </>
            ) : (
              <>
                <ActionButton
                  icon={MessageCircle}
                  label={messaging ? 'Opening…' : 'Message Seller'}
                  disabled={messaging || !listing.seller_id}
                  onClick={handleMessage}
                />
                <ActionButton
                  icon={Eye}
                  label={scoutSent ? 'Scout Requested' : (scouting ? 'Sending…' : 'Scout This Item')}
                  active={scoutSent}
                  disabled={scoutSent || scouting || !listing.seller_id}
                  onClick={handleScout}
                />
                <ActionButton
                  icon={following ? UserCheck : UserPlus}
                  label={following ? 'Following' : 'Follow Seller'}
                  active={following}
                  disabled={!listing.seller_id || (user?.id === listing.seller_id)}
                  onClick={handleFollow}
                />
                <ActionButton icon={Bookmark} label={saved ? 'Saved' : 'Save Listing'} active={saved} onClick={handleSave} />
                <ActionButton icon={Share2} label="Share" onClick={handleShare} />
                <ActionButton
                  icon={Shield}
                  label={blocked ? 'Blocked' : (blocking ? 'Blocking…' : 'Block Seller')}
                  active={blocked}
                  disabled={blocked || blocking || !user || !listing.seller_id || listing.seller_id === user?.id}
                  onClick={handleBlock}
                />
                <ActionButton icon={Flag} label="Report" disabled hint="Coming Soon" onClick={() => {}} />
              </>
            )}
          </section>

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
        src={listing.image_url}
        alt={listing.title || 'Listing image'}
        onClose={() => setImageZoomed(false)}
        onUnrenderable={(msg) => showToast(msg)}
      />

      {toast && <div role="status" aria-live="polite" style={styles.toast}>{toast}</div>}
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
  topBar: {
    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
    backgroundColor: 'var(--color-neutral-0)', borderBottom: '1px solid var(--color-neutral-200)',
    position: 'sticky', top: 0, zIndex: 10,
  },
  topTitle: { flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-neutral-900)' },
  iconBtn: {
    width: 44, height: 44, borderRadius: 'var(--radius-full)', border: 'none',
    backgroundColor: 'transparent', color: 'var(--color-neutral-800)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  heroBtn: {
    position: 'relative', width: '100%', aspectRatio: '4 / 3', minHeight: 240,
    backgroundColor: 'var(--color-neutral-100)', border: 'none', padding: 0,
    overflow: 'hidden', display: 'block', cursor: 'zoom-in',
  },
  heroFallback: {
    width: '100%', height: '100%', display: 'flex',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-neutral-100)',
  },
  heroBadgeStack: { position: 'absolute', top: 12, left: 12, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' },
  heroPriceBadge: {
    position: 'absolute', bottom: 12, right: 12,
    background: 'rgba(0,0,0,0.72)', color: '#fff',
    padding: '6px 12px', borderRadius: 'var(--radius-md)',
    fontWeight: 800, fontSize: 'var(--font-size-lg)',
  },
  heroPrice: { color: '#fff', fontWeight: 800 },
  body: {
    padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)',
    maxWidth: 720, margin: '0 auto', width: '100%', boxSizing: 'border-box',
  },
  title: { fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--color-neutral-900)', lineHeight: 1.25, margin: 0 },
  engagementRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  engagementChip: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '4px 10px', borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-100)', color: 'var(--color-neutral-700)',
    fontSize: 'var(--font-size-xs)', fontWeight: 600,
  },
  uploaderRow: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
    padding: 'var(--space-3)', minHeight: 56,
    border: '1px solid var(--color-neutral-200)', borderRadius: 'var(--radius-lg)',
    backgroundColor: 'var(--color-neutral-0)', width: '100%', textAlign: 'left',
  },
  avatarImg: { width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
  avatarFallback: {
    width: 40, height: 40, borderRadius: '50%',
    backgroundColor: 'var(--color-primary-100)', color: 'var(--color-primary-700)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: 16, flexShrink: 0,
  },
  uploaderMeta: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  uploaderName: { fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-neutral-900)' },
  uploaderSub: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  metaCol: { display: 'flex', flexDirection: 'column', gap: 4 },
  metaLine: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-700)' },
  section: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  sectionTitle: {
    fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-neutral-500)',
    textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0,
  },
  description: {
    margin: 0, fontSize: 'var(--font-size-base)', lineHeight: 1.55,
    color: 'var(--color-neutral-800)', whiteSpace: 'pre-wrap',
  },
  actionGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-2)' },
  actionBtn: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    minHeight: 56, padding: '10px 14px',
    border: '1px solid var(--color-neutral-200)', borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-0)', textAlign: 'left',
  },
  deleteBtn: {
    marginTop: 'var(--space-2)', minHeight: 48, padding: '10px 16px',
    borderRadius: 'var(--radius-md)', border: 'none', color: '#fff',
    fontWeight: 700, fontSize: 'var(--font-size-sm)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  primaryBtn: {
    minHeight: 48, padding: '12px 20px', borderRadius: 'var(--radius-md)',
    border: 'none', backgroundColor: 'var(--color-primary-500)', color: '#fff',
    fontWeight: 700, cursor: 'pointer',
  },
  stateScreen: {
    height: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)',
    padding: 'var(--space-4)', textAlign: 'center', backgroundColor: 'var(--color-neutral-50)',
  },
  stateTitle: { fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-neutral-900)' },
  stateMuted: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-600)', maxWidth: 360 },
  zoomBackdrop: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.92)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 16, cursor: 'zoom-out',
  },
  zoomImg: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' },
  toast: {
    position: 'fixed', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 90px)',
    left: '50%', transform: 'translateX(-50%)',
    backgroundColor: 'var(--color-neutral-900)', color: '#fff',
    padding: '10px 16px', borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-sm)', fontWeight: 600,
    boxShadow: 'var(--shadow-lg)', zIndex: 1100,
  },
};
