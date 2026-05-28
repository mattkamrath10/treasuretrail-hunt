/**
 * Payments — mocked. This is the ONLY file the rest of the app should
 * touch when initiating a paid action. Stripe (or RevenueCat for
 * mobile-store) plugs in here in Phase 2; nothing else has to change.
 *
 *   PHASE 1: writes the boost / Pro state directly on "success".
 *   PHASE 2: replace each `// MOCK` block with a real checkout call,
 *            move the DB write into the success webhook handler.
 *
 * Keeping the boundary tight means we can demo end-to-end monetization
 * for Flippa today without any payment surface to maintain.
 */

import { supabase } from './supabase';
import { boostExpiryFromNow, computePriorityScore, type BoostType } from './boost';

export type BoostTargetKind = 'event' | 'wanted' | 'find' | 'listing';

const TARGET_TABLE: Record<BoostTargetKind, string> = {
  event:   'events',
  wanted:  'wanted_items',
  find:    'community_posts',
  listing: 'marketplace_listings',
};

export type PaymentResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// =====================================================================
// Boost purchase
// =====================================================================

export interface StartBoostArgs {
  targetKind: BoostTargetKind;
  targetId: string;
  /** Defaults to 'paid'. 'pro' is reserved for the Pro-tier boost path. */
  boostType?: BoostType;
}

/**
 * Initiates a boost purchase. Today: instantly "succeeds" and applies
 * the boost. Tomorrow: opens Stripe Checkout, returns the session id,
 * and `applyBoost(...)` is called by the webhook.
 */
export async function startBoostPurchase(args: StartBoostArgs): Promise<PaymentResult<{ targetId: string }>> {
  const { targetKind, targetId, boostType = 'paid' } = args;

  // MOCK — replace with Stripe Checkout session creation in Phase 2.
  // No card collection, no webhook, no idempotency key. Treat every
  // call as an authoritative "go ahead and boost".
  const result = await applyBoost({ targetKind, targetId, boostType });
  if (!result.ok) return result;
  return { ok: true, data: { targetId } };
}

/**
 * Writes the four boost columns. Split from `startBoostPurchase` so
 * the Phase 2 webhook can call this directly without re-running the
 * checkout flow.
 */
export async function applyBoost(args: StartBoostArgs): Promise<PaymentResult<{ targetId: string }>> {
  const { targetKind, targetId, boostType = 'paid' } = args;
  const table = TARGET_TABLE[targetKind];
  if (!table) return { ok: false, error: `Unknown boost target: ${targetKind}` };

  const now = new Date().toISOString();
  const expires = boostExpiryFromNow();
  const priority = computePriorityScore({ boost_expires_at: expires, boost_type: boostType });

  const { error } = await supabase
    .from(table)
    .update({
      boosted_at: now,
      boost_expires_at: expires,
      boost_type: boostType,
      priority_score: priority,
    })
    .eq('id', targetId);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { targetId } };
}

// =====================================================================
// Pro upgrade
// =====================================================================

/**
 * Flips the current user to Pro. MOCK — replace with Stripe Billing
 * subscription create + webhook handler in Phase 2. The mock keeps
 * both `membership_tier` and the legacy `pro_member` boolean in sync
 * so any old call sites continue to work.
 */
export async function startProUpgrade(): Promise<PaymentResult<{ tier: 'pro' }>> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return { ok: false, error: 'Not signed in' };

  // MOCK — replace with Stripe checkout for the Pro plan.
  const { error } = await supabase
    .from('profiles')
    .update({ membership_tier: 'pro', pro_member: true })
    .eq('id', userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { tier: 'pro' } };
}

/** Phase-1 escape hatch for demos / testing: revert to free. */
export async function downgradeToFree(): Promise<PaymentResult<{ tier: 'free' }>> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return { ok: false, error: 'Not signed in' };
  const { error } = await supabase
    .from('profiles')
    .update({ membership_tier: 'free', pro_member: false })
    .eq('id', userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { tier: 'free' } };
}
