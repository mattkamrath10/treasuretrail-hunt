import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Crown, Loader2, Sparkles } from 'lucide-react';
import { PageScroll } from '../components/ui/PageScroll';
import { useAuth } from '../context/AuthContext';
import { startProUpgrade, restorePurchases, syncProEntitlement } from '../lib/payments';
import { iosPaymentsBlocked } from '../lib/platform';
import { iapAvailable, getProPrice, getBoostPrice } from '../lib/iap';
import { isProUser } from '../lib/entitlements';
import { flashToast } from '../lib/toast';

const KEYFRAME_ID = 'tt-pro-pricing-keyframes';

function ensureKeyframes() {
  if (typeof document === 'undefined' || document.getElementById(KEYFRAME_ID)) return;
  const style = document.createElement('style');
  style.id = KEYFRAME_ID;
  style.textContent = `
    @keyframes ttProGlow {
      0%, 100% { box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.55), 0 18px 48px -12px rgba(217, 119, 6, 0.55), 0 0 32px rgba(251, 191, 36, 0.18); }
      50%      { box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.95), 0 22px 56px -10px rgba(217, 119, 6, 0.75), 0 0 56px rgba(251, 191, 36, 0.35); }
    }
    @keyframes ttProCtaPulse {
      0%, 100% { box-shadow: 0 6px 20px rgba(217, 119, 6, 0.45), 0 0 0 0 rgba(251, 191, 36, 0.55); }
      50%      { box-shadow: 0 8px 26px rgba(217, 119, 6, 0.55), 0 0 0 8px rgba(251, 191, 36, 0); }
    }
    @keyframes ttProShimmer {
      0%   { transform: translateX(-130%) skewX(-20deg); }
      100% { transform: translateX(230%)  skewX(-20deg); }
    }
    @keyframes ttProHeroFade {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes ttProHeroPulse {
      0%, 100% { text-shadow: 0 0 22px rgba(251, 191, 36, 0.18), 0 0 44px rgba(251, 191, 36, 0.08); }
      50%      { text-shadow: 0 0 28px rgba(251, 191, 36, 0.42), 0 0 64px rgba(251, 191, 36, 0.22); }
    }
    .tt-pro-hero-title { animation: ttProHeroPulse 3.6s ease-in-out infinite; }
    .tt-pro-card { transition: transform .25s ease, box-shadow .25s ease; }
    .tt-pro-card:hover { transform: translateY(-3px); }
    .tt-pro-cta { transition: transform .15s ease, filter .15s ease; }
    .tt-pro-cta:hover { transform: translateY(-1px); filter: brightness(1.05); }
    .tt-pro-cta:active { transform: translateY(0); filter: brightness(0.96); }
    @media (min-width: 760px) {
      .tt-pro-plans-grid { grid-template-columns: 1fr 1fr 1.08fr !important; align-items: stretch; gap: 18px !important; }
      .tt-pro-card-highlight { transform: scale(1.05); transform-origin: center; }
      .tt-pro-card-highlight:hover { transform: scale(1.05) translateY(-3px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .tt-pro-pulse, .tt-pro-glow, .tt-pro-shimmer, .tt-pro-fade,
      .tt-pro-hero-title, .tt-pro-best-value { animation: none !important; }
      .tt-pro-shimmer { display: none !important; }
    }
  `;
  document.head.appendChild(style);
}

const AUDIENCE = [
  'Estate Sales', 'Yard Sales', 'Flea Markets', 'Auction Houses',
  'Whatnot', 'Poshmark Live', 'eBay Live',
];

type PlanId = 'free' | 'boost' | 'pro';

type Plan = {
  id: PlanId;
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  features: string[];
  cta: string;
  footnote?: string;
  ctaFootnote?: string;
  highlight?: boolean;
};

const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    tagline: 'Yard sales · Garage sales · Casual sellers',
    features: [
      'List one local event at a time',
      'Appear on the TreasureTrail map',
      'Get saved by nearby treasure hunters',
      'Basic event details & photos',
    ],
    cta: 'Start free',
  },
  {
    id: 'boost',
    name: 'Local Event Boost',
    price: '$1.99',
    cadence: '/ per promoted event',
    tagline: 'Estate sales · Flea markets · Auction houses',
    features: [
      'Featured pin on the local map',
      'Push notifications to nearby buyers',
      'Priority placement for 72 hours',
      'Shareable event flyer',
    ],
    cta: 'Boost an event',
    footnote: 'One-time $1.99 — perfect for yard sales, estate sales, flea markets & auction events.',
  },
  {
    id: 'pro',
    name: 'Pro Seller',
    price: '$5.99',
    cadence: '/ per month',
    tagline: 'Whatnot · Poshmark Live · eBay Live',
    features: [
      'Priority placement in Discover — every time',
      'Reach analytics: views, saves & buyer taps',
      'Unlimited event & live-stream boosts',
      'Pro badge on your profile',
    ],
    cta: 'Start Growing Now',
    ctaFootnote: 'More viewers • More bids • More customers',
    highlight: true,
  },
];

export default function Pro({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const { profile, user, refreshProfile } = useAuth();
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [livePrices, setLivePrices] = useState<{ pro?: string; boost?: string }>({});
  useEffect(ensureKeyframes, []);

  // On iOS, load live App Store prices and reconcile the Pro entitlement with
  // RevenueCat so the screen shows the real localized price and an up-to-date
  // membership state (self-heals if a webhook was ever missed).
  useEffect(() => {
    if (!iapAvailable()) return;
    let cancelled = false;
    (async () => {
      const [pro, boost] = await Promise.all([getProPrice(), getBoostPrice()]);
      if (!cancelled) {
        setLivePrices({ pro: pro ?? undefined, boost: boost ?? undefined });
      }
      if (user) {
        const isPro = await syncProEntitlement();
        if (!cancelled && isPro) await refreshProfile();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const showRestore = iapAvailable();
  const alreadyPro = isProUser(profile);
  // Apple 3.1.1: the iOS build may not present any purchasable digital goods.
  // Hide all prices and purchase CTAs on iOS — the page stays informational.
  const blockPurchases = iosPaymentsBlocked();

  // Payments are intentionally disabled until Stripe lands (see
  // src/lib/payments.ts). startProUpgrade() grants nothing — it returns a
  // "coming soon" result so Pro is never handed out for free. Boost is
  // per-content, so we route the user to their seller dashboard to pick an
  // item; the actual purchase is likewise gated until Stripe. When Stripe
  // lands the only change is the implementation of startProUpgrade — this
  // UI stays put.
  const handlePlan = async (id: PlanId) => {
    console.log('[PRO_PRICING] click', { plan: id });
    if (id === 'free') { navigate('/seller/new'); return; }
    if (id === 'boost') {
      // Boost is per-content. Surface the seller flow where the user
      // owns content and can hit "Boost — $1.99" on a specific item.
      if (!user) { navigate('/'); return; }
      navigate('/seller/new');
      return;
    }
    // id === 'pro'
    if (!user) { navigate('/'); return; }
    if (alreadyPro) { flashToast("You're already Pro — enjoy your unlimited boosts.", 'info'); return; }
    setBusy('pro');
    const res = await startProUpgrade();
    setBusy(null);
    if (!res.ok) {
      if (res.cancelled) return; // user backed out of the Apple sheet
      flashToast(
        res.comingSoon
          ? 'Pro Seller is available to purchase in the TreasureTrail iOS app.'
          : `Could not upgrade: ${res.error}`,
        'info',
      );
      return;
    }
    await refreshProfile();
    flashToast('Welcome to Pro! Priority placement is now active.', 'success');
  };

  const handleRestore = async () => {
    setRestoring(true);
    const res = await restorePurchases();
    setRestoring(false);
    if (!res.ok) {
      flashToast(res.error, 'info');
      return;
    }
    await refreshProfile();
    flashToast(
      res.data.pro
        ? 'Purchases restored — Pro is active.'
        : 'No previous purchases found to restore.',
      res.data.pro ? 'success' : 'info',
    );
  };

  return (
    <PageScroll style={s.page}>
      <header style={s.header}>
        <button onClick={onBack} style={s.backBtn} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <span style={s.headerEyebrow}>
          <Crown size={13} style={{ color: '#fbbf24' }} />
          TREASURETRAIL MEMBERSHIP
        </span>
        <span style={{ width: 36 }} />
      </header>

      <section style={s.hero} className="tt-pro-fade">
        <h1 className="tt-pro-hero-title" style={s.heroTitle}>
          Grow your live sales <br />and local events.
        </h1>
        <p style={s.heroSub}>
          Built for event hosts and live sellers — from driveway yard sales to
          Whatnot shows. Pick the plan that gets you in front of more buyers, today.
        </p>

        <div style={s.chipRow} role="list">
          {AUDIENCE.map((a) => (
            <span key={a} role="listitem" style={s.chip}>{a}</span>
          ))}
        </div>
      </section>

      {blockPurchases && (
        <p style={s.iosNote}>
          Memberships and event boosts aren't available for purchase in the app
          yet. The features below are included with your free account where noted.
        </p>
      )}

      <section className="tt-pro-plans-grid" style={s.plansWrap}>
        {PLANS.map((p) => {
          const live =
            p.id === 'pro' ? livePrices.pro : p.id === 'boost' ? livePrices.boost : undefined;
          const plan = live ? { ...p, price: live } : p;
          return (
            <PlanCard
              key={p.id}
              plan={plan}
              disabled={p.id === 'pro' && alreadyPro}
              busy={busy === p.id}
              hidePurchase={blockPurchases && p.id !== 'free'}
              onPick={() => handlePlan(p.id)}
            />
          );
        })}
      </section>

      <p style={s.trustLine}>
        Designed for real sellers, real events, and real-time discovery.
      </p>
      {!blockPurchases && (
        <p style={s.footnote}>
          Cancel or pause anytime. Boosts charged per promoted event. Pro Seller billed monthly.
        </p>
      )}

      {/* Auto-renewable subscription disclosure — required by Apple Guideline
          3.1.2(c). Always rendered (not gated on IAP detection) so the
          subscription title, length, price, and the functional Terms of Use
          (EULA) + Privacy Policy links are present on the membership screen. */}
      {!blockPurchases ? (
        <div style={s.subDisclosure}>
          <p style={s.subHeading}>Pro Seller · Auto-Renewable Subscription</p>
          <ul style={s.subList}>
            <li style={s.subItem}>
              <span style={s.subLabel}>Subscription</span>
              <span>Pro Seller (Monthly)</span>
            </li>
            <li style={s.subItem}>
              <span style={s.subLabel}>Length</span>
              <span>1 month</span>
            </li>
            <li style={s.subItem}>
              <span style={s.subLabel}>Price</span>
              <span>{livePrices.pro ?? '$5.99'} per month</span>
            </li>
          </ul>
          <p style={s.legalText}>
            Payment is charged to your Apple ID at confirmation of purchase. The
            subscription renews automatically for the same 1-month period at the
            same price unless canceled at least 24 hours before the end of the
            current period. Manage or cancel anytime in your App Store account
            settings.
          </p>
          <p style={s.legalLinks}>
            <button type="button" onClick={() => navigate('/terms')} style={s.linkBtn}>
              Terms of Use (EULA)
            </button>
            <span style={s.legalDot}>·</span>
            <button type="button" onClick={() => navigate('/privacy')} style={s.linkBtn}>
              Privacy Policy
            </button>
          </p>
        </div>
      ) : (
        <p style={s.legalLinks}>
          <button type="button" onClick={() => navigate('/terms')} style={s.linkBtn}>
            Terms of Use (EULA)
          </button>
          <span style={s.legalDot}>·</span>
          <button type="button" onClick={() => navigate('/privacy')} style={s.linkBtn}>
            Privacy Policy
          </button>
        </p>
      )}

      {showRestore && (
        <div style={s.iapFooter}>
          <button
            type="button"
            onClick={handleRestore}
            disabled={restoring}
            style={{ ...s.restoreBtn, opacity: restoring ? 0.6 : 1 }}
          >
            {restoring ? 'Restoring…' : 'Restore Purchases'}
          </button>
        </div>
      )}
    </PageScroll>
  );
}

function PlanCard({ plan, onPick, busy = false, disabled = false, hidePurchase = false }: {
  plan: Plan;
  onPick: () => void;
  busy?: boolean;
  disabled?: boolean;
  hidePurchase?: boolean;
}) {
  const highlight = !!plan.highlight;
  return (
    <article
      className={`tt-pro-card ${highlight ? 'tt-pro-glow tt-pro-card-highlight' : ''}`}
      style={{
        ...s.card,
        ...(highlight ? s.cardHighlight : {}),
      }}
    >
      {highlight && (
        <div style={s.badgeStack}>
          <span className="tt-pro-best-value" style={s.bestValue}>BEST VALUE</span>
          <span style={s.badge}>
            <Sparkles size={11} strokeWidth={2.6} />
            MOST POPULAR
          </span>
        </div>
      )}

      <header style={s.cardHead}>
        <span style={{
          ...s.cardIcon,
          ...(highlight ? s.cardIconPro : {}),
        }}>
          <Crown size={16} style={{ color: highlight ? '#78350f' : '#fbbf24' }} />
        </span>
        <h2 style={s.cardName}>{plan.name}</h2>
      </header>

      <p style={s.cardTagline}>{plan.tagline}</p>

      {!hidePurchase && (
        <div style={s.priceRow}>
          <span style={s.price}>{plan.price}</span>
          <span style={s.cadence}>{plan.cadence}</span>
        </div>
      )}

      <ul style={s.featList}>
        {plan.features.map((f) => (
          <li key={f} style={s.featItem}>
            <span style={{ ...s.checkBubble, ...(highlight ? s.checkBubblePro : {}) }}>
              <Check size={11} strokeWidth={3} />
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {!hidePurchase && plan.footnote && (
        <p style={s.planFootnote}>{plan.footnote}</p>
      )}

      {!hidePurchase && (
        <button
          type="button"
          onClick={onPick}
          disabled={busy || disabled}
          className={`tt-pro-cta ${highlight && !disabled ? 'tt-pro-pulse' : ''}`}
          style={{
            ...s.cta,
            ...(highlight ? s.ctaPro : {}),
            opacity: disabled ? 0.6 : 1,
            cursor: busy || disabled ? 'default' : 'pointer',
          }}
        >
          {highlight && !disabled && <span className="tt-pro-shimmer" style={s.ctaShimmer} aria-hidden="true" />}
          <span style={{ position: 'relative', zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {busy && <Loader2 size={14} className="spin" />}
            {disabled ? 'Active' : plan.cta}
          </span>
        </button>
      )}

      {!hidePurchase && plan.ctaFootnote && (
        <p style={s.ctaFootnote}>{plan.ctaFootnote}</p>
      )}
    </article>
  );
}

const s: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    width: '100%',
    background: 'radial-gradient(1200px 600px at 50% -10%, rgba(217, 119, 6, 0.18), transparent 60%), #0b0b10',
    color: '#f5f5f7',
    paddingBottom: 64,
  },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '14px 16px',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)',
    background: 'rgba(11, 11, 16, 0.85)',
    backdropFilter: 'blur(10px)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#f5f5f7',
    cursor: 'pointer',
  },
  headerEyebrow: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
    color: 'rgba(245,245,247,0.85)',
  },
  hero: {
    padding: '32px 20px 24px',
    textAlign: 'center',
    animation: 'ttProHeroFade .55s ease-out both',
  },
  heroTitle: {
    margin: 0,
    fontSize: 30,
    lineHeight: 1.1,
    fontWeight: 800,
    letterSpacing: '-0.01em',
    color: '#fff',
  },
  heroSub: {
    margin: '14px auto 0',
    maxWidth: 560,
    fontSize: 14,
    lineHeight: 1.55,
    color: 'rgba(245,245,247,0.7)',
  },
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
  },
  chip: {
    padding: '7px 12px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    color: 'rgba(245,245,247,0.9)',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    backdropFilter: 'blur(6px)',
  },
  plansWrap: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 14,
    padding: '8px 16px 0',
    maxWidth: 1100,
    margin: '0 auto',
  },
  card: {
    position: 'relative',
    padding: '26px 20px 22px',
    borderRadius: 18,
    background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#f5f5f7',
    display: 'flex', flexDirection: 'column', gap: 12,
    transform: 'translateZ(0)',
    minWidth: 0,
  },
  cardHighlight: {
    background: 'linear-gradient(180deg, rgba(251, 191, 36, 0.08) 0%, rgba(217, 119, 6, 0.04) 100%)',
    border: '1px solid rgba(251, 191, 36, 0.55)',
    animation: 'ttProGlow 2.8s ease-in-out infinite',
  },
  badgeStack: {
    position: 'absolute', top: -22, right: 16,
    display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4,
    zIndex: 2,
  },
  bestValue: {
    display: 'inline-block',
    padding: '3px 8px',
    borderRadius: 6,
    background: 'rgba(251, 191, 36, 0.18)',
    border: '1px solid rgba(251, 191, 36, 0.55)',
    color: '#fbbf24',
    fontSize: 9, fontWeight: 800, letterSpacing: '0.14em',
  },
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '5px 10px',
    borderRadius: 999,
    background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
    color: '#78350f',
    fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
    boxShadow: '0 4px 14px rgba(217, 119, 6, 0.45)',
  },
  cardHead: { display: 'flex', alignItems: 'center', gap: 10 },
  cardIcon: {
    width: 32, height: 32, borderRadius: 10,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(251, 191, 36, 0.10)',
    border: '1px solid rgba(251, 191, 36, 0.25)',
  },
  cardIconPro: {
    background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
    border: '1px solid rgba(255,255,255,0.4)',
  },
  cardName: {
    margin: 0,
    fontSize: 17,
    fontWeight: 800,
    color: '#fff',
  },
  cardTagline: {
    margin: 0,
    fontSize: 12,
    color: 'rgba(245,245,247,0.6)',
  },
  priceRow: {
    display: 'flex', alignItems: 'baseline', gap: 8,
    marginTop: 4, marginBottom: 4,
  },
  price: {
    fontSize: 36,
    fontWeight: 800,
    color: '#fff',
    letterSpacing: '-0.02em',
  },
  cadence: {
    fontSize: 12,
    color: 'rgba(245,245,247,0.55)',
  },
  featList: {
    margin: 0, padding: 0, listStyle: 'none',
    display: 'flex', flexDirection: 'column', gap: 9,
  },
  featItem: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    fontSize: 13,
    color: 'rgba(245,245,247,0.88)',
    lineHeight: 1.4,
  },
  checkBubble: {
    flexShrink: 0,
    width: 18, height: 18, borderRadius: '50%',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(251, 191, 36, 0.18)',
    color: '#fbbf24',
    marginTop: 1,
  },
  checkBubblePro: {
    background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
    color: '#78350f',
  },
  planFootnote: {
    margin: '2px 0 0',
    fontSize: 11,
    color: 'rgba(245,245,247,0.55)',
    fontStyle: 'italic',
    lineHeight: 1.4,
  },
  ctaFootnote: {
    margin: '8px 0 0',
    fontSize: 11,
    fontWeight: 600,
    color: 'rgba(251, 191, 36, 0.9)',
    textAlign: 'center',
    letterSpacing: '0.02em',
  },
  cta: {
    position: 'relative',
    overflow: 'hidden',
    marginTop: 'auto',
    minHeight: 52,
    padding: '15px 18px',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 999,
    background: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontSize: 14, fontWeight: 700,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  ctaPro: {
    border: 'none',
    background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)',
    color: '#fff',
    fontWeight: 800,
    boxShadow: '0 6px 20px rgba(217, 119, 6, 0.45)',
    textShadow: '0 1px 2px rgba(120, 53, 15, 0.35)',
  },
  ctaShimmer: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0,
    width: '40%',
    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 50%, transparent 100%)',
    pointerEvents: 'none',
    animation: 'ttProShimmer 3.2s ease-in-out infinite',
    willChange: 'transform',
  },
  trustLine: {
    margin: '32px auto 0',
    maxWidth: 560,
    padding: '0 20px',
    textAlign: 'center',
    fontSize: 13,
    fontWeight: 600,
    color: 'rgba(251, 191, 36, 0.85)',
    letterSpacing: '0.01em',
  },
  footnote: {
    margin: '10px auto 0',
    maxWidth: 560,
    padding: '0 20px',
    textAlign: 'center',
    fontSize: 11,
    color: 'rgba(245,245,247,0.45)',
  },
  subDisclosure: {
    margin: '22px auto 0',
    maxWidth: 560,
    width: 'calc(100% - 40px)',
    padding: '16px 18px',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.04)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  subHeading: {
    margin: 0,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'rgba(251, 191, 36, 0.9)',
  },
  subList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  subItem: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    fontSize: 13,
    fontWeight: 600,
    color: '#f5f5f7',
  },
  subLabel: {
    color: 'rgba(245,245,247,0.55)',
    fontWeight: 600,
  },
  iapFooter: {
    margin: '20px auto 0',
    maxWidth: 560,
    padding: '0 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },
  restoreBtn: {
    appearance: 'none',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 999,
    color: '#f5f5f7',
    fontSize: 13,
    fontWeight: 700,
    padding: '10px 20px',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  legalText: {
    margin: 0,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 1.5,
    color: 'rgba(245,245,247,0.5)',
  },
  legalLinks: {
    margin: '14px auto 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  linkBtn: {
    appearance: 'none',
    background: 'transparent',
    border: 'none',
    color: 'rgba(251, 191, 36, 0.9)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
    textDecoration: 'underline',
  },
  legalDot: {
    color: 'rgba(245,245,247,0.4)',
    fontSize: 12,
  },
  iosNote: {
    margin: '0 auto 4px',
    maxWidth: 560,
    padding: '12px 16px',
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 1.5,
    color: 'rgba(245,245,247,0.8)',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
    width: 'calc(100% - 32px)',
  },
};
