/**
 * Entitlements — the single source of truth for "what can this user do?".
 *
 * Before this lib, tier checks were scattered: `profile?.membership_tier
 * === 'pro'` in Profile.tsx, `profile?.pro_member` elsewhere, the server
 * route had its own copy. Any change to the Pro definition meant chasing
 * every site. Centralizing here lets us extend the rules (trials, team
 * seats, Stripe webhook reconciliation) without touching call sites.
 *
 * Phase 1 rules:
 *  - Free: post 1 active local event at a time; basic Discover surface.
 *  - Pro:  unlimited boosts, analytics, Pro badge, priority placement.
 *  - Boost: a paid one-off ($1.99, 72h) anyone can buy on any of their
 *           content. Not a tier — orthogonal to membership.
 *
 * Anyone (including unauth visitors with a future account) "can boost"
 * in the UI sense — we surface the CTA; the actual purchase needs auth.
 * That keeps the storefront discoverable.
 */

import type { Profile } from './supabase';

export type MembershipTier = 'free' | 'pro';

/** Resolve a profile (possibly null/loading) to its effective tier. */
export function tierOf(profile: Profile | null | undefined): MembershipTier {
  if (!profile) return 'free';
  // `membership_tier` is the canonical column. `pro_member` is a legacy
  // boolean kept in sync via the same upgrade flow; either being truthy
  // counts as Pro so we don't lock anyone out during the transition.
  if (profile.membership_tier === 'pro') return 'pro';
  if (profile.pro_member) return 'pro';
  return 'free';
}

export function isProUser(profile: Profile | null | undefined): boolean {
  return tierOf(profile) === 'pro';
}

/**
 * Whether the UI should expose a "Boost" CTA at all. We return true
 * even for unauth visitors so they can see the value prop on someone
 * else's listing; the actual purchase handler gates on auth.
 */
export function canBoost(_profile: Profile | null | undefined): boolean {
  return true;
}

/**
 * Free users get a soft cap of 1 live local event. Pro is unlimited.
 * The cap is enforced at create-time in the seller form, not here —
 * this hook just answers the policy question.
 */
export function canCreateUnlimitedEvents(profile: Profile | null | undefined): boolean {
  return isProUser(profile);
}

/** Pro feature: per-listing/event analytics dashboards. */
export function canViewAnalytics(profile: Profile | null | undefined): boolean {
  return isProUser(profile);
}

/**
 * Pro feature: any feature reserved for Pro members (storefront,
 * cross-platform promotion, priority placement). UI components use
 * this to flip between the live feature and the upgrade-prompt state.
 */
export function canAccessProFeatures(profile: Profile | null | undefined): boolean {
  return isProUser(profile);
}

/** Free-tier active-event cap. Centralized so future tweaks are one-line. */
export const FREE_TIER_EVENT_LIMIT = 1;

/** Boost product config. Mirrors what the UI shows on Pro / Boost CTAs. */
export const BOOST_PRODUCT = {
  priceUsd: 1.99,
  durationHours: 72,
  label: 'Boost — $1.99 for 72h',
} as const;

/** Pro product config. */
export const PRO_PRODUCT = {
  priceUsd: 5.99,
  cadence: 'month' as const,
  label: 'TreasureTrail Pro — $5.99/mo',
} as const;
