import type { CSSProperties } from 'react';
import { Gem } from 'lucide-react';

/**
 * FoundingPartnerBadge — an exclusive recognition chip for invite-only
 * Founding Partners (founding businesses + top live-show sellers on
 * Whatnot / Poshmark Live / eBay Live). Distinct amethyst→indigo gradient
 * so it doesn't read as Pro (gold), Verified (green) or Featured (amber).
 *
 * This is a recognition marker, NOT a paid tier, so it is intentionally
 * NOT gated by monetizationHidden() — it can show anywhere, anytime.
 */
export function FoundingPartnerBadge({
  size = 'sm',
  style,
}: {
  size?: 'sm' | 'md';
  style?: CSSProperties;
}) {
  const isMd = size === 'md';
  return (
    <span
      aria-label="Founding Partner"
      title="Founding Partner"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: isMd ? '4px 10px' : '3px 8px',
        borderRadius: 999,
        background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
        color: '#fff',
        fontSize: isMd ? 11 : 10,
        fontWeight: 800,
        letterSpacing: '0.05em',
        whiteSpace: 'nowrap',
        boxShadow: '0 1px 3px rgba(79, 70, 229, 0.4)',
        ...style,
      }}
    >
      <Gem size={isMd ? 12 : 11} strokeWidth={2.6} />
      FOUNDING PARTNER
    </span>
  );
}
