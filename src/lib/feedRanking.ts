/**
 * Discover feed ranking — centralized so the priority order is one
 * place to reason about. Order, top to bottom:
 *
 *   1. Active live (boosted)
 *   2. Active live (not boosted)
 *   3. Boosted local events / wanted (anything boosted that isn't live)
 *   4. Newest non-boosted content (created_at desc)
 *   5. Expired live shows (kept visible but pushed to the bottom)
 *
 * The helper works on any heterogenous list whose items can be probed
 * for liveness/expiry/boost. Callers supply small probe functions so
 * we don't have to import every row type here.
 */

import { isBoosted, type BoostableRow } from './boost';

export interface RankProbes<T> {
  isLive: (item: T) => boolean;
  isExpired: (item: T) => boolean;
  createdAt: (item: T) => string | null | undefined;
}

// Lower bucket = higher in the feed.
const BUCKET = {
  LIVE_BOOSTED:   0,
  LIVE:           1,
  BOOSTED:        2,
  NORMAL:         3,
  EXPIRED:        4,
} as const;

function bucket<T extends BoostableRow>(item: T, p: RankProbes<T>): number {
  // Expired ALWAYS lands in the bottom bucket, even if it carries a
  // residual boost. "Expired" wins over "boosted" because surfacing a
  // dead show at the top would erode trust — the boost glow is wasted
  // on something the user can't act on.
  if (p.isExpired(item)) return BUCKET.EXPIRED;
  const live = p.isLive(item);
  const boosted = isBoosted(item);
  if (live && boosted) return BUCKET.LIVE_BOOSTED;
  if (live)            return BUCKET.LIVE;
  if (boosted)         return BUCKET.BOOSTED;
  return BUCKET.NORMAL;
}

/**
 * Pure sort — does not mutate input. Stable within bucket via
 * createdAt desc (newer first), so two boosted items rank by recency.
 */
export function rankDiscoverFeed<T extends BoostableRow>(
  items: T[],
  probes: RankProbes<T>,
): T[] {
  return [...items].sort((a, b) => {
    const diff = bucket(a, probes) - bucket(b, probes);
    if (diff !== 0) return diff;
    const ta = new Date(probes.createdAt(a) ?? 0).getTime();
    const tb = new Date(probes.createdAt(b) ?? 0).getTime();
    return tb - ta;
  });
}

/** Convenience probes for content types that don't have a "live" concept. */
export const STATIC_PROBES = {
  isLive: () => false,
  isExpired: () => false,
} as const;
