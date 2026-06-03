import type { CSSProperties } from 'react';
import { Zap } from 'lucide-react';
import { monetizationHidden } from '../../lib/platform';

/**
 * BoostedBadge — small gold pill applied to any boosted card. Designed
 * for the dark Discover surface (white card surfaces look fine too).
 * Subtle glow only — no animation, per Phase 1 "don't overdo it".
 */
export function BoostedBadge({
  size = 'sm',
  style,
}: {
  size?: 'sm' | 'md';
  style?: CSSProperties;
}) {
  const isMd = size === 'md';
  // Temporarily hidden for App Store review — no boost-related labels in iOS.
  if (monetizationHidden()) return null;
  return (
    <span
      aria-label="Boosted"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: isMd ? '4px 9px' : '3px 7px',
        borderRadius: 999,
        background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
        color: '#78350f',
        fontSize: isMd ? 11 : 9,
        fontWeight: 800,
        letterSpacing: '0.06em',
        boxShadow: '0 2px 10px rgba(217, 119, 6, 0.45)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <Zap size={isMd ? 12 : 10} strokeWidth={2.6} />
      BOOSTED
    </span>
  );
}

/**
 * Style preset to wrap any card surface with the subtle gold halo
 * that signals "this item is boosted". Spread into the card's style
 * prop next to (not replacing) its existing background/border.
 */
export const BOOSTED_CARD_GLOW: CSSProperties = {
  border: '1px solid rgba(251, 191, 36, 0.55)',
  boxShadow: '0 0 0 1px rgba(251, 191, 36, 0.18), 0 8px 24px -10px rgba(217, 119, 6, 0.45)',
};
