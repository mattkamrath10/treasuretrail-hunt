/**
 * Payments boundary — client side.
 *
 * Paid state is NEVER written by the client. Pro and boosts are granted only
 * server-side (server/grants.ts, service-role) in response to a VERIFIED Apple
 * payment. These initiators drive RevenueCat's StoreKit purchase and then ask
 * the server to make the result authoritative.
 *
 * Platform behavior:
 *   - iOS: real Apple In-App Purchase via RevenueCat (src/lib/iap.ts).
 *   - web / Android: no native store, so these return a clear "use the iOS
 *     app" result (NOT a fake/mocked grant) until those platforms get their own
 *     payment path.
 */

import { apiUrl } from './apiBase';
import { supabase } from './supabase';
import {
  iapAvailable,
  purchasePro,
  purchaseBoost,
  restore as iapRestore,
} from './iap';

export type BoostTargetKind = 'event' | 'wanted' | 'find' | 'listing';
export type BoostType = 'paid' | 'pro';

export type PaymentResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; comingSoon?: boolean; cancelled?: boolean };

/** Whether a real purchase surface is wired on this platform (iOS IAP). */
export const PAYMENTS_ENABLED = true;

const USE_THE_APP =
  'Memberships and boosts are purchased in the TreasureTrail iOS app.';

export interface StartBoostArgs {
  targetKind: BoostTargetKind;
  targetId: string;
  /** Defaults to 'paid'. 'pro' is reserved for the Pro-tier boost path. */
  boostType?: BoostType;
}

async function authHeaders(): Promise<Record<string, string> | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

/**
 * Makes the server reconcile the caller's Pro entitlement with RevenueCat
 * (grants/revokes in the DB). Safe to call after a purchase, after restore, or
 * on the membership screen to self-heal. Returns whether Pro is active.
 */
export async function syncProEntitlement(): Promise<boolean> {
  const headers = await authHeaders();
  if (!headers) return false;
  try {
    const resp = await fetch(apiUrl('/api/iap/sync'), { method: 'POST', headers });
    if (!resp.ok) return false;
    const json = (await resp.json()) as { pro?: boolean };
    return Boolean(json.pro);
  } catch {
    return false;
  }
}

/**
 * Initiates a Pro upgrade via Apple IAP. On success the server is asked to
 * reconcile the entitlement so the profile reflects Pro immediately (the
 * RevenueCat webhook is the long-term source of truth for renewals/expiry).
 */
export async function startProUpgrade(): Promise<PaymentResult<{ tier: 'pro' }>> {
  if (!iapAvailable()) {
    return { ok: false, error: USE_THE_APP, comingSoon: true };
  }
  const res = await purchasePro();
  if (!res.ok) {
    return { ok: false, error: res.error, cancelled: res.cancelled };
  }
  await syncProEntitlement();
  return { ok: true, data: { tier: 'pro' } };
}

/**
 * Initiates a boost purchase via Apple IAP, then asks the server to apply it to
 * the target. The server independently verifies the purchase with RevenueCat
 * (it never trusts a client transaction id), so a failed confirm leaves the
 * purchase unredeemed and retryable.
 */
export async function startBoostPurchase(
  args: StartBoostArgs,
): Promise<PaymentResult<{ targetId: string }>> {
  if (!iapAvailable()) {
    return { ok: false, error: USE_THE_APP, comingSoon: true };
  }
  const res = await purchaseBoost();
  if (!res.ok) {
    return { ok: false, error: res.error, cancelled: res.cancelled };
  }

  const headers = await authHeaders();
  if (!headers) return { ok: false, error: 'Please sign in to boost.' };

  try {
    const resp = await fetch(apiUrl('/api/iap/boost/confirm'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ targetKind: args.targetKind, targetId: args.targetId }),
    });
    if (!resp.ok) {
      const json = (await resp.json().catch(() => ({}))) as { error?: string };
      return {
        ok: false,
        error:
          json.error ??
          'Your boost was purchased but could not be applied. Please try again.',
      };
    }
    return { ok: true, data: { targetId: args.targetId } };
  } catch {
    return {
      ok: false,
      error:
        'Your boost was purchased but could not be applied. Please try again.',
    };
  }
}

/**
 * Applies a Pro member's INCLUDED boost — no Apple purchase, no charge. Pro
 * advertises "unlimited event & live-stream boosts", so a Pro member must never
 * be sent through the paid IAP sheet to boost their own content. The server
 * independently re-verifies Pro entitlement and ownership (it never trusts the
 * client's claim of being Pro), then applies a 'pro' boost. Non-Pro callers are
 * rejected server-side and should use startBoostPurchase instead.
 */
export async function startProBoost(
  args: StartBoostArgs,
): Promise<PaymentResult<{ targetId: string }>> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, error: 'Please sign in to boost.' };

  try {
    const resp = await fetch(apiUrl('/api/boost/pro'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ targetKind: args.targetKind, targetId: args.targetId }),
    });
    if (!resp.ok) {
      const json = (await resp.json().catch(() => ({}))) as { error?: string };
      return {
        ok: false,
        error: json.error ?? 'Could not apply your Pro boost. Please try again.',
      };
    }
    return { ok: true, data: { targetId: args.targetId } };
  } catch {
    return {
      ok: false,
      error: 'Could not apply your Pro boost. Please try again.',
    };
  }
}

/**
 * Restores prior purchases and reconciles Pro server-side. Returns whether Pro
 * is active afterwards.
 */
export async function restorePurchases(): Promise<PaymentResult<{ pro: boolean }>> {
  if (!iapAvailable()) {
    return { ok: false, error: USE_THE_APP, comingSoon: true };
  }
  const res = await iapRestore();
  if (!res.ok) return { ok: false, error: res.error };
  const pro = (await syncProEntitlement()) || res.pro;
  return { ok: true, data: { pro } };
}
