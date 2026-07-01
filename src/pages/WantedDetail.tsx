import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Calendar, MessageCircle, UserCircle2, Loader2, Search,
  ImagePlus, X, Link2, Check, Pencil, Camera,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  fetchWantedItemWithRequester, updateWantedItem, WANTED_CATEGORY_LABEL,
  type WantedItemWithRequester, type WantedStatus, type WantedCategory,
} from '../lib/wanted';
import { getOrCreateConversation, sendMessage } from '../lib/messaging';
import {
  createWantedResponse, fetchMyActiveListings, type MyListingOption,
} from '../lib/wantedResponses';
import { uploadCompressedImage } from '../lib/uploadImage';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { MediaFallback } from '../components/ui/MediaFallback';
import { PageScroll } from '../components/ui/PageScroll';
import { toThumbUrl } from '../lib/imageCompress';
import { setPendingIntent } from '../lib/pendingIntent';
import { Zap } from 'lucide-react';
import { isBoosted, boostExpiresInLabel } from '../lib/boost';
import { startBoostPurchase, startProBoost } from '../lib/payments';
import { isProUser } from '../lib/entitlements';
import { monetizationHidden } from '../lib/platform';
import { flashToast } from '../lib/toast';
import { trackAnalyticsEvent } from '../lib/analytics';

const MAX_RESPONSE_PHOTOS = 3;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// Optional prefilled opener so the recipient sees context immediately
// instead of an empty bubble. Kept short — the sender can edit before
// hitting send.
const DEFAULT_PREFILL = "Hi, I think I may have the item you're looking for.";

const STATUS_OPTIONS: { value: WantedStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'fulfilled', label: 'Found' },
  { value: 'closed', label: 'Closed' },
];

// Public route — /wanted/:id. Renders without auth so shared links from
// Messages / external browsers hydrate cleanly. Auth is only required for
// the "I Have This Item" CTA, which opens (or creates) a DM thread.
export default function WantedDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isGuest, exitGuestMode } = useAuth();
  const [item, setItem] = useState<WantedItemWithRequester | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 2400);
  };

  // Respond / "I Have This" composer state. The composer is the non-owner
  // CTA for OPEN posts — a required message (prefilled), up to 3 optional
  // photos, and an optional link to one of the responder's own listings.
  const [composerOpen, setComposerOpen] = useState(false);
  const [replyText, setReplyText] = useState(DEFAULT_PREFILL);
  const [photos, setPhotos] = useState<string[]>([]);
  const [myListings, setMyListings] = useState<MyListingOption[]>([]);
  const [linkedListingId, setLinkedListingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Owner-only status control busy flag.
  const [statusBusy, setStatusBusy] = useState(false);
  // Owner-only inline edit flow (refine a wizard-created or any wanted post).
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!id) { setErr('Missing id'); setLoading(false); return; }
    let cancelled = false;
    fetchWantedItemWithRequester(id)
      .then((row) => {
        if (cancelled) return;
        setItem(row);
        setLoading(false);
        // Phase-1 analytics firehose: record the view once on hydrate.
        // Best-effort — failures must never block render.
        if (row) {
          trackAnalyticsEvent({ kind: 'view', targetKind: 'wanted', targetId: row.id })
            .catch(() => { /* best-effort */ });
        }
      })
      .catch((e: any) => { if (!cancelled) { setErr(e?.message ?? 'Failed to load'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [id]);

  const requester = item?.requester ?? null;
  const requesterHandle = requester?.username ?? null;
  const isOwner = !!user && !!requester && user.id === requester.id;

  // Open the respond composer. Guests / cold deep-links bounce to auth via
  // the existing pending-intent flow (resumed in AppShell once signed in).
  const openComposer = () => {
    if (!requester?.id || !id) { showToast('Requester unavailable'); return; }
    if (isOwner) { showToast("That's your wanted post"); return; }

    if (!user) {
      setPendingIntent({
        kind: 'message_requester',
        wantedId: id,
        requesterId: requester.id,
        prefill: DEFAULT_PREFILL,
      });
      if (isGuest) exitGuestMode();
      // navigate('/') so App.tsx re-evaluates: publicShare=false → no user
      // → Login screen renders. Public share paths bypass Login, so we
      // must leave /wanted/:id for the gate to fire.
      navigate('/');
      return;
    }

    setComposerOpen(true);
    // Lazy-load the responder's own active listings for the optional link
    // picker. Best-effort — an empty list just hides the picker.
    fetchMyActiveListings(user.id).then(setMyListings).catch(() => {});
  };

  const handlePickPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-selecting the same file
    if (!files.length) return;
    const room = MAX_RESPONSE_PHOTOS - photos.length;
    if (room <= 0) { showToast(`Up to ${MAX_RESPONSE_PHOTOS} photos`); return; }
    const next: string[] = [];
    for (const f of files.slice(0, room)) {
      try { next.push(await fileToDataUrl(f)); } catch { /* skip unreadable */ }
    }
    if (next.length) setPhotos((cur) => [...cur, ...next].slice(0, MAX_RESPONSE_PHOTOS));
  };

  const removePhoto = (i: number) => setPhotos((cur) => cur.filter((_, idx) => idx !== i));

  const submitResponse = async () => {
    if (!user || !requester?.id || !id) { showToast('Requester unavailable'); return; }
    const body = replyText.trim();
    if (!body) { showToast('Please add a message'); return; }

    setSubmitting(true);
    try {
      // 1) Upload any photos to the avatars bucket (RLS keys on userId/).
      //    A single failed upload is skipped, not fatal.
      let photoUrls: string[] = [];
      if (photos.length) {
        const uploaded = await Promise.all(
          photos.map((p) =>
            uploadCompressedImage(p, { userId: user.id, folder: 'wanted-responses' })
              .then((r) => r.url)
              .catch(() => null),
          ),
        );
        photoUrls = uploaded.filter((u): u is string => !!u);
      }

      // 2) Open (or reuse) the DM thread with the requester.
      const { conversationId, error: convErr } = await getOrCreateConversation({
        otherUserId: requester.id,
      });
      if (convErr || !conversationId) {
        showToast(convErr || 'Could not open chat');
        if (requesterHandle) navigate(`/u/${requesterHandle}`);
        return;
      }

      // 3) Send the opener message, optionally attaching the linked listing.
      //    A failed send is blocking — we must NOT record a response or fire
      //    the owner's alert for a message that never went through.
      const { error: msgErr } = await sendMessage({
        conversationId,
        receiverId: requester.id,
        content: body,
        listingId: linkedListingId,
        listingKind: linkedListingId ? 'marketplace' : null,
      });
      if (msgErr) { showToast(msgErr); return; }

      // 4) Record the structured response — this AFTER INSERT trigger is what
      //    fires the single wanted_post_response alert to the owner. The DM
      //    above does NOT create a notification, so there's no duplicate.
      const { error: respErr } = await createWantedResponse({
        wantedItemId: id,
        responderId: user.id,
        message: body,
        photoUrls,
        linkedListingId,
      });
      if (respErr) showToast(respErr); // non-fatal: the DM already went through

      navigate(`/messages/${conversationId}`, { state: { prefill: body } });
    } finally {
      setSubmitting(false);
    }
  };

  const changeStatus = async (next: WantedStatus) => {
    if (!id || statusBusy || item?.status === next) return;
    setStatusBusy(true);
    try {
      await updateWantedItem(id, { status: next });
      const fresh = await fetchWantedItemWithRequester(id);
      if (fresh) setItem(fresh);
      showToast(
        next === 'open' ? 'Marked as open'
          : next === 'fulfilled' ? 'Marked as found'
          : 'Marked as closed',
      );
    } catch (e: any) {
      showToast(e?.message ?? 'Could not update status');
    } finally {
      setStatusBusy(false);
    }
  };

  const handleViewProfile = () => {
    if (requesterHandle) navigate(`/u/${requesterHandle}`);
    else showToast('Requester unavailable');
  };

  if (loading) {
    return (
      <PageScroll style={s.page}>
        <Header onBack={() => navigate(-1)} />
        <div style={s.centerFill}><Loader2 size={28} className="spin" style={{ color: 'var(--tt-accent)' }} /></div>
      </PageScroll>
    );
  }

  if (err || !item) {
    return (
      <PageScroll style={s.page}>
        <Header onBack={() => navigate(-1)} />
        <div style={s.centerFill}>
          <div style={s.emptyCard}>
            <Search size={32} style={{ color: 'var(--tt-text-dim)', marginBottom: 10 }} />
            <h2 style={s.emptyTitle}>This wanted post is unavailable</h2>
            <p style={s.emptyBody}>It may have been removed or fulfilled.</p>
            <button onClick={() => navigate('/wanted')} style={s.primaryCta}>Browse wanted items</button>
          </div>
        </div>
      </PageScroll>
    );
  }

  const where = [item.city, item.region].filter(Boolean).join(', ');
  const created = new Date(item.created_at).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const displayName = requester?.display_name || requester?.username || null;

  return (
    <PageScroll style={s.page}>
      <Header onBack={() => navigate(-1)} />

      <div style={s.hero}>
        <ImageWithFade
          src={item.thumb_url ?? toThumbUrl(item.image_url)}
          fallbackSrc={item.image_url}
          alt={item.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          fallback={<MediaFallback kind="wanted" seed={item.id} label={item.title} />}
        />
        <div style={s.heroBadges}>
          <span style={s.wantedBadge}>WANTED</span>
          <span style={s.catBadge}>{WANTED_CATEGORY_LABEL[item.category]}</span>
        </div>
        {item.max_budget != null && (
          <span style={s.budgetBadge}>Budget: ${Math.round(item.max_budget)}</span>
        )}
      </div>

      <section style={s.section}>
        <h1 style={s.title}>{item.title}</h1>

        <div style={s.metaRow}>
          {where && (
            <span style={s.metaChip}><MapPin size={12} /> {where}</span>
          )}
          <span style={s.metaChip}><Calendar size={12} /> Posted {created}</span>
        </div>

        {item.max_budget != null && (
          <p style={s.budgetNote}>This amount represents the buyer's intended spending budget.</p>
        )}

        {item.description && <p style={s.desc}>{item.description}</p>}
      </section>

      {/* Requester identity card — always rendered. If the profile row is
          gone we show a branded "Requester unavailable" state instead of a
          broken row, per spec. */}
      <section style={{ ...s.section, paddingTop: 0 }}>
        <div style={s.requesterCard}>
          {requester ? (
            <button onClick={handleViewProfile} style={s.requesterRow} aria-label={`View @${requesterHandle ?? 'profile'}`}>
              <Avatar url={requester.avatar_url} name={displayName ?? requesterHandle ?? '?'} />
              <div style={{ minWidth: 0, textAlign: 'left' }}>
                {displayName && displayName !== requesterHandle && (
                  <div style={s.requesterName}>{displayName}</div>
                )}
                <div style={s.requesterHandle}>@{requesterHandle ?? 'unknown'}</div>
              </div>
            </button>
          ) : (
            <div style={s.requesterRow}>
              <Avatar url={null} name="?" />
              <div>
                <div style={s.requesterName}>Requester unavailable</div>
                <div style={s.requesterHandleMuted}>This account is no longer active</div>
              </div>
            </div>
          )}
        </div>

        {isOwner ? (
          editing ? (
            // Owner edit flow — refine the wizard-created (or any) post:
            // title / details / category / budget + an optional reference photo.
            <OwnerEditForm
              item={item}
              onCancel={() => setEditing(false)}
              onSaved={async () => {
                if (!id) return;
                const fresh = await fetchWantedItemWithRequester(id);
                if (fresh) setItem(fresh);
                setEditing(false);
                showToast('In Search Of post updated');
              }}
            />
          ) : (
            // Owner view: a status control (Open / Found / Closed) so they can
            // signal where the hunt stands, an Edit action, plus the Boost CTA.
            <>
              <div style={s.ownerNote}>
                <UserCircle2 size={14} style={{ color: 'var(--tt-text-muted)' }} />
                <span>This is your request</span>
              </div>
              <div style={s.statusControl}>
                <span style={s.statusLabel}>Status</span>
                <div style={s.statusBtnRow}>
                  {STATUS_OPTIONS.map((opt) => {
                    const active = item.status === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => changeStatus(opt.value)}
                        disabled={statusBusy}
                        style={{
                          ...s.statusBtn,
                          ...(active ? s.statusBtnActive : null),
                          cursor: statusBusy ? 'default' : 'pointer',
                          opacity: statusBusy && !active ? 0.6 : 1,
                        }}
                      >
                        {active && <Check size={13} />} {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ ...s.ctaRow, marginTop: 10 }}>
                <button type="button" onClick={() => setEditing(true)} style={s.secondaryCta}>
                  <Pencil size={14} /> Edit post
                </button>
              </div>
              <OwnerBoostRow
                item={item}
                onApplied={async () => {
                  if (!id) return;
                  const fresh = await fetchWantedItemWithRequester(id);
                  if (fresh) setItem(fresh);
                }}
              />
            </>
          )
        ) : item.status !== 'open' ? (
          // Non-owners normally only reach OPEN posts (RLS), but guard anyway:
          // a fulfilled/closed post shows a muted state instead of a composer.
          <>
            <div style={s.ownerNote}>
              <span>This request is no longer open.</span>
            </div>
            <button
              onClick={handleViewProfile}
              disabled={!requester}
              style={{ ...s.secondaryCta, marginTop: 8, opacity: requester ? 1 : 0.5, cursor: requester ? 'pointer' : 'not-allowed' }}
            >
              <UserCircle2 size={14} /> View Profile
            </button>
          </>
        ) : !composerOpen ? (
          <div style={s.ctaRow}>
            <button
              onClick={openComposer}
              disabled={!requester}
              style={{
                ...s.primaryCta,
                opacity: !requester ? 0.5 : 1,
                cursor: !requester ? 'not-allowed' : 'pointer',
              }}
            >
              <MessageCircle size={14} /> Respond / I Have This
            </button>
            <button
              onClick={handleViewProfile}
              disabled={!requester}
              style={{ ...s.secondaryCta, opacity: requester ? 1 : 0.5, cursor: requester ? 'pointer' : 'not-allowed' }}
            >
              <UserCircle2 size={14} /> View Profile
            </button>
          </div>
        ) : (
          <div style={s.composer}>
            <label style={s.composerLabel}>Your message</label>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Let them know what you've got…"
              style={s.composerTextarea}
            />

            <label style={s.composerLabel}>Photos (optional)</label>
            <div style={s.photoRow}>
              {photos.map((p, i) => (
                <div key={i} style={s.photoThumb}>
                  <img src={p} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
                  <button onClick={() => removePhoto(i)} style={s.photoRemove} aria-label="Remove photo">
                    <X size={12} />
                  </button>
                </div>
              ))}
              {photos.length < MAX_RESPONSE_PHOTOS && (
                <button onClick={() => fileInputRef.current?.click()} style={s.photoAdd} aria-label="Add photo">
                  <ImagePlus size={18} />
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePickPhotos}
              style={{ display: 'none' }}
            />

            {myListings.length > 0 && (
              <>
                <label style={s.composerLabel}>Link one of your listings (optional)</label>
                <div style={s.listingPicker}>
                  {myListings.map((l) => {
                    const sel = linkedListingId === l.id;
                    return (
                      <button
                        key={l.id}
                        onClick={() => setLinkedListingId(sel ? null : l.id)}
                        style={{ ...s.listingChip, ...(sel ? s.listingChipActive : null) }}
                      >
                        <Link2 size={12} />
                        <span style={s.listingChipText}>{l.title}</span>
                        {sel && <Check size={12} />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <div style={s.ctaRow}>
              <button
                onClick={submitResponse}
                disabled={submitting || !replyText.trim()}
                style={{ ...s.primaryCta, opacity: submitting || !replyText.trim() ? 0.6 : 1, cursor: submitting ? 'default' : 'pointer' }}
              >
                {submitting ? <Loader2 size={14} className="spin" /> : <MessageCircle size={14} />}
                Send Response
              </button>
              <button
                onClick={() => setComposerOpen(false)}
                disabled={submitting}
                style={s.secondaryCta}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {!user && requester && !isOwner && (
          <p style={s.signinHint}>Sign in to respond to @{requesterHandle ?? 'this user'} — we'll bring you straight back here.</p>
        )}
      </section>

      {toast && <div style={s.toast}>{toast}</div>}
    </PageScroll>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <header style={s.header}>
      <button onClick={onBack} style={s.backBtn} aria-label="Back"><ArrowLeft size={20} /></button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={s.headerTitle}>In Search Of</h1>
      </div>
    </header>
  );
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  if (url) {
    return (
      <ImageWithFade
        src={toThumbUrl(url) ?? url}
        fallbackSrc={url}
        alt={name}
        style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        fallback={<AvatarFallback initial={initial} />}
      />
    );
  }
  return <AvatarFallback initial={initial} />;
}

function AvatarFallback({ initial }: { initial: string }) {
  return (
    <div style={{
      width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--tt-accent-gradient)',
      color: 'var(--tt-accent-contrast)', fontWeight: 800, fontSize: 16,
    }}>{initial}</div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { background: 'var(--tt-bg)', color: 'var(--tt-text)', paddingBottom: 32 },
  header: {
    position: 'sticky', top: 0, zIndex: 10,
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '14px 16px',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)',
    background: 'var(--tt-header-bg)',
    backdropFilter: 'blur(10px)',
    borderBottom: '1px solid var(--tt-border)',
  },
  backBtn: {
    flexShrink: 0, width: 36, height: 36, borderRadius: 10,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--tt-surface-2)', border: '1px solid var(--tt-border)',
    color: 'var(--tt-text)', cursor: 'pointer',
  },
  headerTitle: { margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--tt-text)' },
  centerFill: {
    minHeight: '60vh',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  emptyCard: {
    maxWidth: 360, width: '100%', textAlign: 'center',
    padding: 24, borderRadius: 16,
    background: 'var(--tt-surface)',
    border: '1px solid var(--tt-border)',
  },
  emptyTitle: { margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: 'var(--tt-text)' },
  emptyBody: { margin: '0 0 16px', fontSize: 13, color: 'var(--tt-text-muted)' },
  hero: {
    position: 'relative', width: '100%', aspectRatio: '4 / 3',
    background: 'var(--tt-image-bg)', overflow: 'hidden',
  },
  heroBadges: {
    position: 'absolute', top: 12, left: 12,
    display: 'flex', gap: 6, flexWrap: 'wrap',
  },
  wantedBadge: {
    padding: '4px 9px', borderRadius: 999,
    background: 'var(--tt-accent-gradient)',
    color: 'var(--tt-accent-contrast)', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
  },
  catBadge: {
    padding: '4px 9px', borderRadius: 999,
    background: 'var(--tt-overlay)', color: '#fff',
    fontSize: 10, fontWeight: 700,
  },
  budgetBadge: {
    position: 'absolute', top: 12, right: 12,
    padding: '4px 10px', borderRadius: 999,
    background: 'var(--tt-overlay)', color: '#fff',
    fontSize: 11, fontWeight: 800,
  },
  section: { padding: '16px 16px 8px' },
  title: { margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--tt-text)', lineHeight: 1.25 },
  metaRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  metaChip: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '5px 10px', borderRadius: 999,
    background: 'var(--tt-surface-2)',
    border: '1px solid var(--tt-border)',
    color: 'var(--tt-text-muted)', fontSize: 11, fontWeight: 600,
  },
  desc: {
    margin: '14px 0 0', fontSize: 14, lineHeight: 1.55,
    color: 'var(--tt-text)', whiteSpace: 'pre-wrap',
  },
  budgetNote: {
    margin: '12px 0 0', fontSize: 12, lineHeight: 1.4,
    color: 'var(--tt-text-muted)',
  },
  requesterCard: {
    padding: 12, borderRadius: 14,
    background: 'var(--tt-surface)',
    border: '1px solid var(--tt-border)',
    marginBottom: 12,
  },
  requesterRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    width: '100%', padding: 0,
    background: 'transparent', border: 'none', cursor: 'pointer',
  },
  requesterName: {
    fontSize: 14, fontWeight: 700, color: 'var(--tt-text)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  requesterHandle: { fontSize: 12, color: 'var(--tt-accent-strong)', fontWeight: 600 },
  requesterHandleMuted: { fontSize: 12, color: 'var(--tt-text-dim)' },
  ctaRow: { display: 'flex', gap: 8, marginTop: 4 },
  primaryCta: {
    flex: 1, minHeight: 46,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '0 16px', borderRadius: 12,
    background: 'var(--tt-accent-gradient)',
    color: 'var(--tt-accent-contrast)', border: 'none',
    fontSize: 14, fontWeight: 800, cursor: 'pointer',
  },
  secondaryCta: {
    flex: 1, minHeight: 46,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '0 16px', borderRadius: 12,
    background: 'var(--tt-surface-2)',
    color: 'var(--tt-text)', border: '1px solid var(--tt-border-strong)',
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  ownerNote: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 46, padding: '0 16px', borderRadius: 12,
    background: 'var(--tt-surface)',
    border: '1px dashed var(--tt-border-strong)',
    color: 'var(--tt-text-muted)', fontSize: 13, fontWeight: 600,
  },
  statusControl: { marginTop: 10 },
  statusLabel: {
    display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
    color: 'var(--tt-text-muted)', textTransform: 'uppercase', marginBottom: 6,
  },
  statusBtnRow: { display: 'flex', gap: 8 },
  statusBtn: {
    flex: 1, minHeight: 40,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '0 10px', borderRadius: 10,
    background: 'var(--tt-surface-2)',
    border: '1px solid var(--tt-border-strong)',
    color: 'var(--tt-text)', fontSize: 13, fontWeight: 700,
  },
  statusBtnActive: {
    background: 'var(--tt-accent-gradient)',
    border: '1px solid var(--tt-accent-border)', color: 'var(--tt-accent-contrast)',
  },
  composer: {
    marginTop: 4, padding: 12, borderRadius: 14,
    background: 'var(--tt-surface)',
    border: '1px solid var(--tt-border)',
  },
  composerLabel: {
    display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
    color: 'var(--tt-text-muted)', textTransform: 'uppercase', margin: '10px 0 6px',
  },
  composerTextarea: {
    width: '100%', boxSizing: 'border-box', resize: 'vertical',
    padding: '10px 12px', borderRadius: 10,
    background: 'var(--tt-surface-2)', border: '1px solid var(--tt-border)',
    color: 'var(--tt-text)', fontSize: 14, lineHeight: 1.5,
  },
  photoRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  photoThumb: { position: 'relative', width: 64, height: 64 },
  photoRemove: {
    position: 'absolute', top: -6, right: -6,
    width: 22, height: 22, borderRadius: '50%',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(15,15,20,0.95)', border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff', cursor: 'pointer',
  },
  photoAdd: {
    width: 64, height: 64, borderRadius: 10,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--tt-surface-2)',
    border: '1px dashed var(--tt-border-strong)',
    color: 'var(--tt-text-muted)', cursor: 'pointer',
  },
  listingPicker: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  listingChip: {
    display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%',
    padding: '8px 12px', borderRadius: 999,
    background: 'var(--tt-surface-2)',
    border: '1px solid var(--tt-border-strong)',
    color: 'var(--tt-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  listingChipActive: {
    background: 'var(--tt-accent-soft)',
    border: '1px solid var(--tt-accent-border)', color: 'var(--tt-accent-strong)',
  },
  listingChipText: {
    maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  signinHint: {
    margin: '12px 0 0', fontSize: 12, color: 'var(--tt-text-muted)', textAlign: 'center',
  },
  toast: {
    position: 'fixed', left: '50%', bottom: 96, transform: 'translateX(-50%)',
    padding: '10px 16px', borderRadius: 999,
    background: 'rgba(15,15,20,0.95)', color: '#fff',
    fontSize: 13, fontWeight: 600, zIndex: 50,
    border: '1px solid rgba(255,255,255,0.1)',
  },
};

/**
 * Owner-only Boost row for wanted posts. Mirrors the EventDetail version
 * — see that file for behavior notes. Payments mocked in Phase 1.
 */
function OwnerBoostRow({ item, onApplied }: { item: WantedItemWithRequester; onApplied: () => Promise<void> | void }) {
  const { profile } = useAuth();
  const isPro = isProUser(profile);
  const [busy, setBusy] = useState(false);
  const active = isBoosted(item);
  const remaining = boostExpiresInLabel(item);

  // Temporarily hidden for App Store review — remove the entire boost row
  // (CTA and the "Boosted" status pill) from the iOS build.
  if (monetizationHidden()) return null;

  const onBoost = async () => {
    setBusy(true);
    // Pro includes unlimited boosts — redeem the included boost (no charge)
    // rather than opening the paid Apple purchase sheet.
    const res = isPro
      ? await startProBoost({ targetKind: 'wanted', targetId: item.id })
      : await startBoostPurchase({ targetKind: 'wanted', targetId: item.id });
    setBusy(false);
    if (!res.ok) {
      flashToast(
        res.comingSoon ? 'Boost checkout is coming soon.' : `Boost failed: ${res.error}`,
        'info',
      );
      return;
    }
    flashToast(
      isPro ? 'Boost active for 72 hours — included with Pro.' : 'Boost active for 72 hours.',
      'success',
    );
    await onApplied();
  };

  return (
    <div style={ownerBoostStyles.row}>
      {active ? (
        <span style={ownerBoostStyles.activePill}>
          <Zap size={12} style={{ color: '#fbbf24' }} /> Boosted{remaining ? ` · ${remaining} left` : ''}
        </span>
      ) : (
        <button
          type="button"
          onClick={onBoost}
          disabled={busy}
          style={{ ...ownerBoostStyles.boostBtn, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}
        >
          {busy ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
          {isPro ? 'Boost — Included with Pro' : 'Boost — $1.99 / 72h'}
        </button>
      )}
    </div>
  );
}

const ownerBoostStyles: Record<string, CSSProperties> = {
  row: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 10, flexWrap: 'wrap',
  },
  boostBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '10px 16px', minHeight: 40, borderRadius: 999,
    background: 'linear-gradient(135deg, #fbbf24, #f59e0b 55%, #d97706)',
    color: '#1a1208', border: '1px solid rgba(251,191,36,0.55)',
    fontSize: 13, fontWeight: 800,
    boxShadow: '0 6px 18px rgba(251, 191, 36, 0.28)',
  },
  activePill: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 12px', borderRadius: 999,
    background: 'rgba(251, 191, 36, 0.12)',
    border: '1px solid rgba(251, 191, 36, 0.35)',
    color: '#fbbf24', fontSize: 12, fontWeight: 700,
  },
};

/**
 * Owner-only inline editor for a wanted post. The Wanted Wizard folds the
 * buyer's ≤5 answers into the description and drops them here with no way to
 * revise — this lets the owner refine title / details / category / budget and
 * add (or change) a reference photo after the fact. Reuses updateWantedItem +
 * uploadCompressedImage; the parent re-fetches and closes on save.
 */
function OwnerEditForm({
  item,
  onCancel,
  onSaved,
}: {
  item: WantedItemWithRequester;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? '');
  const [category, setCategory] = useState<WantedCategory>(item.category);
  const [maxBudget, setMaxBudget] = useState(item.max_budget != null ? String(item.max_budget) : '');
  const [imageUrl, setImageUrl] = useState<string | null>(item.image_url);
  const [thumbUrl, setThumbUrl] = useState<string | null>(item.thumb_url);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onPickImage = async (file: File) => {
    if (!user) return;
    setErr(null);
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const up = await uploadCompressedImage(dataUrl, { userId: user.id, folder: 'wanted' });
      setImageUrl(up.url);
      setThumbUrl(up.thumbUrl);
    } catch (e: any) {
      setErr(`Image upload failed: ${e?.message ?? 'unknown'}`);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setErr(null);
    const t = title.trim();
    if (t.length < 2) { setErr('Title must be at least 2 characters'); return; }
    const budget = maxBudget.trim() ? Number(maxBudget) : null;
    if (budget != null && !Number.isFinite(budget)) { setErr('Budget must be a number'); return; }
    setSaving(true);
    try {
      // Only edit the fields the spec covers; city/region (and their geocoded
      // coords) are left untouched so we never need to re-geocode here.
      await updateWantedItem(item.id, {
        title: t,
        description: description.trim(),
        category,
        max_budget: budget,
        image_url: imageUrl,
        thumb_url: thumbUrl,
      });
      await onSaved();
    } catch (e: any) {
      setErr(e?.message ?? 'Could not save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={editStyles.form}>
      <label style={editStyles.cover}>
        {imageUrl ? (
          <ImageWithFade
            src={thumbUrl ?? imageUrl}
            fallbackSrc={imageUrl}
            alt="In Search Of item"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            fallback={<MediaFallback kind="wanted" seed={item.id} label={title} />}
          />
        ) : (
          <div style={editStyles.coverPlaceholder}>
            <Camera size={24} />
            <span>{uploading ? 'Uploading…' : 'Add a reference photo (optional)'}</span>
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickImage(f); }}
          style={{ display: 'none' }}
          disabled={uploading}
        />
        {imageUrl && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setImageUrl(null); setThumbUrl(null); }}
            style={editStyles.coverClear}
            aria-label="Remove image"
          >
            <X size={14} />
          </button>
        )}
      </label>

      <label style={s.composerLabel}>What are you looking for?</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        style={editStyles.input}
      />

      <label style={s.composerLabel}>Details</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={2000}
        placeholder="Condition, era, brand, any specifics that help sellers find you a match."
        style={{ ...editStyles.input, height: 96, resize: 'vertical' }}
      />

      <label style={s.composerLabel}>Category</label>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as WantedCategory)}
        style={editStyles.input}
      >
        {(Object.entries(WANTED_CATEGORY_LABEL) as [WantedCategory, string][]).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>

      <label style={s.composerLabel}>Maximum Budget ($)</label>
      <input
        value={maxBudget}
        onChange={(e) => setMaxBudget(e.target.value)}
        placeholder="Enter your maximum budget"
        inputMode="decimal"
        style={editStyles.input}
      />

      {err && <p style={editStyles.err}>{err}</p>}

      <div style={{ ...s.ctaRow, marginTop: 12 }}>
        <button
          type="button"
          onClick={save}
          disabled={saving || uploading}
          style={{ ...s.primaryCta, opacity: saving || uploading ? 0.6 : 1, cursor: saving ? 'default' : 'pointer' }}
        >
          {saving ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
          Save changes
        </button>
        <button type="button" onClick={onCancel} disabled={saving} style={s.secondaryCta}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const editStyles: Record<string, CSSProperties> = {
  form: {
    marginTop: 4, padding: 12, borderRadius: 14,
    background: 'var(--tt-surface)',
    border: '1px solid var(--tt-border)',
    display: 'flex', flexDirection: 'column',
  },
  cover: {
    position: 'relative', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden',
    borderRadius: 12, cursor: 'pointer', background: 'var(--tt-image-bg)',
    border: '1px dashed var(--tt-border-strong)',
  },
  coverPlaceholder: {
    width: '100%', height: '100%',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
    color: 'var(--tt-text-muted)', fontSize: 12,
  },
  coverClear: {
    position: 'absolute', top: 8, right: 8,
    width: 28, height: 28, borderRadius: '50%',
    background: 'rgba(0,0,0,0.65)', color: '#fff', border: 'none',
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  input: {
    width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px',
    background: 'var(--tt-surface-2)', border: '1px solid var(--tt-border)',
    borderRadius: 10, color: 'var(--tt-text)', fontSize: 14, outline: 'none', fontFamily: 'inherit',
  },
  err: {
    margin: '8px 0 0', padding: '10px 12px',
    background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)',
    borderRadius: 10, color: 'var(--color-error-600)', fontSize: 12,
  },
};
