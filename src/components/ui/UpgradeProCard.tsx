import type { CSSProperties } from 'react';
import { Crown, ChevronRight } from 'lucide-react';
import { PRO_PRODUCT } from '../../lib/entitlements';

/**
 * UpgradeProCard — the single "Upgrade to Pro" CTA tile surfaced to
 * non-Pro users on Discover and Profile. One component so the value
 * prop and price stay consistent everywhere; callers only pass the
 * navigation handler. Gating (only show to non-Pro) lives at the call
 * site so this stays a dumb presentational tile.
 */
export function UpgradeProCard({
  onUpgrade,
  style,
}: {
  onUpgrade: () => void;
  style?: CSSProperties;
}) {
  return (
    <button
      onClick={onUpgrade}
      aria-label="Upgrade to TreasureTrail Pro"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        textAlign: 'left',
        padding: '14px 16px',
        borderRadius: 16,
        border: '1px solid rgba(251, 191, 36, 0.55)',
        background: 'linear-gradient(135deg, rgba(251,191,36,0.16), rgba(245,158,11,0.10))',
        boxShadow: '0 8px 24px -12px rgba(217, 119, 6, 0.5)',
        cursor: 'pointer',
        ...style,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 40,
          height: 40,
          borderRadius: 12,
          background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
          flexShrink: 0,
        }}
      >
        <Crown size={20} strokeWidth={2.4} style={{ color: '#78350f' }} />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: 'block',
            fontSize: 15,
            fontWeight: 800,
            color: 'var(--color-neutral-900)',
            lineHeight: 1.2,
          }}
        >
          Upgrade to Pro
        </span>
        <span
          style={{
            display: 'block',
            fontSize: 12,
            color: 'var(--color-neutral-600)',
            marginTop: 2,
          }}
        >
          {PRO_PRODUCT.label} · unlimited boosts, analytics & priority placement
        </span>
      </span>
      <ChevronRight size={18} style={{ color: '#d97706', flexShrink: 0 }} />
    </button>
  );
}
