import { useEffect, useState, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Calendar, MessageCircle, UserCircle2, Loader2, Search,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  fetchWantedItemWithRequester, WANTED_CATEGORY_LABEL,
  type WantedItemWithRequester,
} from '../lib/wanted';
import { getOrCreateConversation } from '../lib/messaging';
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

// Optional prefilled opener so the recipient sees context immediately
// instead of an empty bubble. Kept short — the sender can edit before
// hitting send.
const DEFAULT_PREFILL = "Hi, I think I may have the item you're looking for.";

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
  const [opening, setOpening] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 2400);
  };

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

  const handleMessageRequester = async () => {
    if (!requester?.id || !id) { showToast('Requester unavailable'); return; }
    if (isOwner) { showToast("That's your wanted post"); return; }

    // Unauthenticated visitor (cold deep-link OR guest mode): stash the
    // intent and bounce to the auth screen. AppShell's resume hook picks
    // the intent back up once `user` becomes truthy and lands them in the
    // freshly-created conversation.
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

    setOpening(true);
    const { conversationId, error } = await getOrCreateConversation({
      otherUserId: requester.id,
    });
    setOpening(false);
    if (error || !conversationId) {
      // Soft fallback — drop the user on the requester's profile so they
      // can still make contact (follow, view storefront) even if RPC fails.
      showToast(error || 'Could not open chat');
      if (requesterHandle) navigate(`/u/${requesterHandle}`);
      return;
    }
    // Pass the prefilled opener via location.state so the composer seeds
    // its draft once on mount. The user can edit/delete before sending.
    navigate(`/messages/${conversationId}`, { state: { prefill: DEFAULT_PREFILL } });
  };

  const handleViewProfile = () => {
    if (requesterHandle) navigate(`/u/${requesterHandle}`);
    else showToast('Requester unavailable');
  };

  if (loading) {
    return (
      <PageScroll style={s.page}>
        <Header onBack={() => navigate(-1)} />
        <div style={s.centerFill}><Loader2 size={28} className="spin" style={{ color: '#10b981' }} /></div>
      </PageScroll>
    );
  }

  if (err || !item) {
    return (
      <PageScroll style={s.page}>
        <Header onBack={() => navigate(-1)} />
        <div style={s.centerFill}>
          <div style={s.emptyCard}>
            <Search size={32} style={{ color: 'rgba(245,245,247,0.5)', marginBottom: 10 }} />
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
          <span style={s.budgetBadge}>up to ${Math.round(item.max_budget)}</span>
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
          // Owner can't message themselves — show a muted state-of-affairs
          // panel instead of a disabled CTA so the page doesn't look broken.
          // Below it we surface the Boost CTA so the owner has a single
          // obvious way to raise visibility.
          <>
            <div style={s.ownerNote}>
              <UserCircle2 size={14} style={{ color: 'rgba(245,245,247,0.55)' }} />
              <span>This is your request</span>
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
        ) : (
          <div style={s.ctaRow}>
            <button
              onClick={handleMessageRequester}
              disabled={!requester || opening}
              style={{
                ...s.primaryCta,
                opacity: !requester ? 0.5 : 1,
                cursor: !requester ? 'not-allowed' : 'pointer',
              }}
            >
              {opening ? <Loader2 size={14} className="spin" /> : <MessageCircle size={14} />}
              Message Requester
            </button>
            <button
              onClick={handleViewProfile}
              disabled={!requester}
              style={{ ...s.secondaryCta, opacity: requester ? 1 : 0.5, cursor: requester ? 'pointer' : 'not-allowed' }}
            >
              <UserCircle2 size={14} /> View Profile
            </button>
          </div>
        )}

        {!user && requester && !isOwner && (
          <p style={s.signinHint}>Sign in to message @{requesterHandle ?? 'this user'} — we'll bring you straight back here.</p>
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
        <h1 style={s.headerTitle}>Wanted</h1>
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
      background: 'linear-gradient(135deg, #10b981, #047857)',
      color: '#fff', fontWeight: 800, fontSize: 16,
    }}>{initial}</div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { background: '#0b0b10', color: '#f5f5f7', paddingBottom: 32 },
  header: {
    position: 'sticky', top: 0, zIndex: 10,
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '14px 16px',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)',
    background: 'rgba(11,11,16,0.92)',
    backdropFilter: 'blur(10px)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  backBtn: {
    flexShrink: 0, width: 36, height: 36, borderRadius: 10,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
    color: '#fff', cursor: 'pointer',
  },
  headerTitle: { margin: 0, fontSize: 16, fontWeight: 800, color: '#fff' },
  centerFill: {
    minHeight: '60vh',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  emptyCard: {
    maxWidth: 360, width: '100%', textAlign: 'center',
    padding: 24, borderRadius: 16,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  emptyTitle: { margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: '#fff' },
  emptyBody: { margin: '0 0 16px', fontSize: 13, color: 'rgba(245,245,247,0.6)' },
  hero: {
    position: 'relative', width: '100%', aspectRatio: '4 / 3',
    background: '#15151a', overflow: 'hidden',
  },
  heroBadges: {
    position: 'absolute', top: 12, left: 12,
    display: 'flex', gap: 6, flexWrap: 'wrap',
  },
  wantedBadge: {
    padding: '4px 9px', borderRadius: 999,
    background: 'linear-gradient(135deg, #10b981, #047857)',
    color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
  },
  catBadge: {
    padding: '4px 9px', borderRadius: 999,
    background: 'rgba(15, 23, 42, 0.78)', color: '#fff',
    fontSize: 10, fontWeight: 700,
  },
  budgetBadge: {
    position: 'absolute', top: 12, right: 12,
    padding: '4px 10px', borderRadius: 999,
    background: 'rgba(15, 23, 42, 0.85)', color: '#fff',
    fontSize: 11, fontWeight: 800,
  },
  section: { padding: '16px 16px 8px' },
  title: { margin: 0, fontSize: 20, fontWeight: 800, color: '#fff', lineHeight: 1.25 },
  metaRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  metaChip: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '5px 10px', borderRadius: 999,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(245,245,247,0.8)', fontSize: 11, fontWeight: 600,
  },
  desc: {
    margin: '14px 0 0', fontSize: 14, lineHeight: 1.55,
    color: 'rgba(245,245,247,0.82)', whiteSpace: 'pre-wrap',
  },
  requesterCard: {
    padding: 12, borderRadius: 14,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    marginBottom: 12,
  },
  requesterRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    width: '100%', padding: 0,
    background: 'transparent', border: 'none', cursor: 'pointer',
  },
  requesterName: {
    fontSize: 14, fontWeight: 700, color: '#fff',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  requesterHandle: { fontSize: 12, color: '#10b981', fontWeight: 600 },
  requesterHandleMuted: { fontSize: 12, color: 'rgba(245,245,247,0.5)' },
  ctaRow: { display: 'flex', gap: 8, marginTop: 4 },
  primaryCta: {
    flex: 1, minHeight: 46,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '0 16px', borderRadius: 12,
    background: 'linear-gradient(135deg, #10b981, #047857)',
    color: '#fff', border: 'none',
    fontSize: 14, fontWeight: 800, cursor: 'pointer',
  },
  secondaryCta: {
    flex: 1, minHeight: 46,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '0 16px', borderRadius: 12,
    background: 'rgba(255,255,255,0.06)',
    color: '#fff', border: '1px solid rgba(255,255,255,0.12)',
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  ownerNote: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 46, padding: '0 16px', borderRadius: 12,
    background: 'rgba(255,255,255,0.04)',
    border: '1px dashed rgba(255,255,255,0.12)',
    color: 'rgba(245,245,247,0.7)', fontSize: 13, fontWeight: 600,
  },
  signinHint: {
    margin: '12px 0 0', fontSize: 12, color: 'rgba(245,245,247,0.55)', textAlign: 'center',
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
          {isPro ? 'Boost — Included with Pro' : 'Boost — $3 / 72h'}
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
