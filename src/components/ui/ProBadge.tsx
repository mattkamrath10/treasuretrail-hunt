import type { CSSProperties } from 'react';
import { Crown } from 'lucide-react';
import { monetizationHidden } from '../../lib/platform';

/**
 * ProBadge — small crown pill rendered next to a Pro member's handle
 * (Profile header, leaderboard rows, message inbox rows). Uses the
 * same gold gradient family as BoostedBadge but in an outlined chip
 * variant so the two don't compete visually when they appear together.
 *
 * Self-gates on iOS: while monetizationHidden() is true the badge (and
 * its crown icon) renders nothing, so no Pro-tier signal can leak from
 * any call site during App Store review. Reversible via the flag.
 */
export function ProBadge({
  size = 'sm',
  style,
}: {
  size?: 'sm' | 'md';
  style?: CSSProperties;
}) {
  if (monetizationHidden()) return null;
  const isMd = size === 'md';
  return (
    <span
      aria-label="TreasureTrail Pro"
      title="TreasureTrail Pro"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: isMd ? '3px 9px' : '2px 7px',
        borderRadius: 999,
        background: 'rgba(251, 191, 36, 0.14)',
        border: '1px solid rgba(251, 191, 36, 0.55)',
        color: '#fbbf24',
        fontSize: isMd ? 11 : 10,
        fontWeight: 800,
        letterSpacing: '0.06em',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <Crown size={isMd ? 11 : 10} strokeWidth={2.6} />
      PRO
    </span>
  );
}
