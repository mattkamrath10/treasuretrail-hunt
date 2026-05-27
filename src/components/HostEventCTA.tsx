import { useEffect, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, ArrowRight, Sparkles } from 'lucide-react';

type Variant = 'home' | 'events' | 'live';

const COPY: Record<Variant, { eyebrow: string; title: string; subtitle: string; cta: string }> = {
  home: {
    eyebrow: 'HOST · EARN',
    title: 'Host Your Own Event',
    subtitle: 'Local yard sales, estate auctions, or livestream shows — reach buyers near you.',
    cta: 'Create an Event',
  },
  events: {
    eyebrow: 'LIST IN MINUTES',
    title: 'Start an Event Now',
    subtitle: 'Estate sales, flea markets, auctions, or livestreams — free to publish.',
    cta: 'Host an Event',
  },
  live: {
    eyebrow: 'GO LIVE',
    title: 'Promote Your Live Show',
    subtitle: 'Whatnot, Poshmark Live, or eBay Live — get discovered by buyers in your area.',
    cta: 'Host a Live Show',
  },
};

const KEYFRAME_ID = 'tt-host-cta-keyframes';

function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAME_ID)) return;
  const style = document.createElement('style');
  style.id = KEYFRAME_ID;
  style.textContent = `
    @keyframes ttHostPulse {
      0%, 100% { box-shadow: 0 6px 24px rgba(217, 119, 6, 0.32), 0 0 0 0 rgba(251, 191, 36, 0.55); }
      50%      { box-shadow: 0 8px 28px rgba(217, 119, 6, 0.42), 0 0 0 8px rgba(251, 191, 36, 0.00); }
    }
    @keyframes ttHostShimmer {
      0%   { transform: translateX(-120%) skewX(-20deg); }
      100% { transform: translateX(220%)  skewX(-20deg); }
    }
    @keyframes ttHostSparkle {
      0%, 100% { opacity: 0.55; transform: rotate(0deg) scale(1); }
      50%      { opacity: 1;    transform: rotate(12deg) scale(1.15); }
    }
    @media (prefers-reduced-motion: reduce) {
      .tt-host-cta { animation: none !important; }
      .tt-host-cta-shimmer, .tt-host-cta-sparkle { display: none !important; }
    }
  `;
  document.head.appendChild(style);
}

export function HostEventCTA({ variant = 'home', dense = false }: { variant?: Variant; dense?: boolean }) {
  useEffect(ensureKeyframes, []);
  const navigate = useNavigate();
  const copy = COPY[variant];

  return (
    <button
      type="button"
      className="tt-host-cta"
      onClick={() => {
        console.log('[HOST_CTA] click', { variant });
        navigate('/seller/new');
      }}
      style={{ ...styles.card, ...(dense ? styles.cardDense : {}) }}
      aria-label={copy.cta}
    >
      <span className="tt-host-cta-shimmer" style={styles.shimmer} aria-hidden="true" />

      <span style={styles.iconBubble} aria-hidden="true">
        <Radio size={22} strokeWidth={2.4} />
        <span className="tt-host-cta-sparkle" style={styles.sparkle}>
          <Sparkles size={12} strokeWidth={2.4} />
        </span>
      </span>

      <span style={styles.textCol}>
        <span style={styles.eyebrow}>{copy.eyebrow}</span>
        <span style={styles.title}>{copy.title}</span>
        <span style={styles.subtitle}>{copy.subtitle}</span>
      </span>

      <span style={styles.cta} aria-hidden="true">
        <span style={styles.ctaLabel}>{copy.cta}</span>
        <ArrowRight size={16} strokeWidth={2.6} />
      </span>
    </button>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    width: 'calc(100% - 32px)',
    margin: '12px 16px 16px',
    padding: '16px 18px',
    minHeight: 88,
    border: 'none',
    borderRadius: 18,
    background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 45%, #d97706 100%)',
    color: '#fff',
    textAlign: 'left',
    cursor: 'pointer',
    overflow: 'hidden',
    boxShadow: '0 6px 24px rgba(217, 119, 6, 0.32), 0 0 0 0 rgba(251, 191, 36, 0.55)',
    animation: 'ttHostPulse 2.6s ease-in-out infinite',
    WebkitTapHighlightColor: 'transparent',
    transform: 'translateZ(0)',
  },
  cardDense: { minHeight: 76, padding: '12px 14px', gap: 12 },
  shimmer: {
    position: 'absolute',
    top: 0, left: 0, bottom: 0,
    width: '40%',
    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.45) 50%, transparent 100%)',
    pointerEvents: 'none',
    animation: 'ttHostShimmer 3.4s ease-in-out infinite',
    willChange: 'transform',
  },
  iconBubble: {
    position: 'relative',
    flexShrink: 0,
    width: 48, height: 48,
    borderRadius: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255, 255, 255, 0.22)',
    backdropFilter: 'blur(6px)',
    color: '#fff',
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.35)',
  },
  sparkle: {
    position: 'absolute', top: -6, right: -6,
    width: 20, height: 20, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#fff',
    color: '#d97706',
    boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
    animation: 'ttHostSparkle 2s ease-in-out infinite',
  },
  textCol: {
    flex: 1, minWidth: 0,
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  eyebrow: {
    fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 17, fontWeight: 800,
    color: '#fff',
    lineHeight: 1.2,
    textShadow: '0 1px 2px rgba(120, 53, 15, 0.25)',
  },
  subtitle: {
    fontSize: 12, fontWeight: 500,
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 1.35,
    marginTop: 2,
  },
  cta: {
    flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '10px 14px',
    borderRadius: 999,
    background: 'rgba(255,255,255,0.95)',
    color: '#b45309',
    fontWeight: 800, fontSize: 12,
    boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
    whiteSpace: 'nowrap',
  },
  ctaLabel: { fontSize: 12, fontWeight: 800, letterSpacing: '0.01em' },
};
