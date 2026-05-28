/**
 * Boost helpers — pure functions over the boost columns added in
 * `20260528000002_monetization_phase1.sql`. Every boostable row
 * (events, wanted, finds, listings) carries the same four columns,
 * so the helpers are agnostic to target type.
 *
 * The actual "buy a boost" action lives in `src/lib/payments.ts` so
 * the payment boundary stays cleanly separated from the data shape.
 */

import { BOOST_PRODUCT } from './entitlements';

export type BoostType = 'paid' | 'pro';

/** Shape every boostable row exposes. Any DB row that has these
 * columns can be passed to the helpers below without type gymnastics. */
export interface BoostableRow {
  boosted_at?: string | null;
  boost_expires_at?: string | null;
  boost_type?: BoostType | null;
  priority_score?: number | null;
}

export const BOOST_DURATION_HOURS = BOOST_PRODUCT.durationHours;

/** True iff the row currently has an active boost (expiry in the future). */
export function isBoosted(row: BoostableRow | null | undefined, now: number = Date.now()): boolean {
  if (!row?.boost_expires_at) return false;
  return new Date(row.boost_expires_at).getTime() > now;
}

/** Human-readable "expires in 12h" / "expires in 45m" / null. */
export function boostExpiresInLabel(row: BoostableRow | null | undefined, now: number = Date.now()): string | null {
  if (!isBoosted(row, now)) return null;
  const ms = new Date(row!.boost_expires_at!).getTime() - now;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours}h left`;
  const mins = Math.max(1, Math.floor(ms / 60_000));
  return `${mins}m left`;
}

/**
 * Compute the expiry timestamp for a new boost, starting now. The
 * payments lib writes this into the row on "purchase" success.
 */
export function boostExpiryFromNow(durationHours: number = BOOST_DURATION_HOURS): string {
  return new Date(Date.now() + durationHours * 3_600_000).toISOString();
}

/**
 * Priority hint for ranking. We deliberately keep this small and
 * monotonic so the Discover ranking helper can sort by it without
 * surprising kinks.
 *   active paid boost -> 100
 *   active pro boost  -> 80
 *   no active boost   -> 0
 * Stored on the row for cheap ORDER BY, but always derivable.
 */
export function computePriorityScore(row: BoostableRow | null | undefined, now: number = Date.now()): number {
  if (!isBoosted(row, now)) return 0;
  return row?.boost_type === 'pro' ? 80 : 100;
}
