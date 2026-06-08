/**
 * RevenueCat client wrapper — the ONLY place the app talks to StoreKit.
 *
 * Real Apple In-App Purchase is live on iOS through RevenueCat. Everything here
 * is hard-guarded behind `iapAvailable()` (iOS + a configured API key) and the
 * native plugin is loaded with a dynamic import, so the web/Android bundles
 * never execute RevenueCat code and a missing key can never crash startup
 * (mirrors the supabase.ts "never throw at import" rule).
 *
 * Products (App Store Connect):
 *   - Pro Seller, auto-renewing monthly subscription:
 *       com.treasuretrail.hunt.pro.monthly  (entitlement: "pro")
 *   - Event Boost, 72h consumable:
 *       com.treasuretrail.hunt.boost.event72h
 *
 * The DB is NEVER written from the client. A successful purchase here is made
 * authoritative server-side: Pro via the RevenueCat webhook + /api/iap/sync,
 * boosts via /api/iap/boost/confirm (see src/lib/payments.ts).
 */
import type {
  PurchasesOfferings,
  PurchasesPackage,
} from '@revenuecat/purchases-capacitor';
import { isIOS } from './platform';
import { supabase } from './supabase';

export const IAP_PRODUCTS = {
  proMonthly: 'com.treasuretrail.hunt.pro.monthly',
  boost72h: 'com.treasuretrail.hunt.boost.event72h',
} as const;

/** RevenueCat entitlement that represents an active Pro membership. */
export const PRO_ENTITLEMENT = 'pro';

const IOS_API_KEY = (import.meta.env.VITE_REVENUECAT_IOS_KEY ?? '').trim();

type RcModule = typeof import('@revenuecat/purchases-capacitor');

export type IapResult =
  | { ok: true }
  | { ok: false; cancelled?: boolean; error: string };

const NOT_AVAILABLE =
  'In-app purchases are only available in the TreasureTrail iOS app.';

/** True only on iOS with a configured RevenueCat API key. */
export function iapAvailable(): boolean {
  return isIOS() && IOS_API_KEY.length > 0;
}

let modPromise: Promise<RcModule> | null = null;
let configurePromise: Promise<void> | null = null;
let syncedUserId: string | null = null;

async function loadModule(): Promise<RcModule> {
  if (!modPromise) modPromise = import('@revenuecat/purchases-capacitor');
  return modPromise;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/**
 * Loads + configures the SDK once, then keeps the RevenueCat app-user-id in
 * sync with the signed-in Supabase user (so purchases are attributed to the
 * real uid the webhook/sync can map back to a profile). Returns null when IAP
 * isn't available so callers degrade gracefully.
 */
async function ensureReady(): Promise<RcModule | null> {
  if (!iapAvailable()) return null;
  const mod = await loadModule();
  if (!configurePromise) {
    configurePromise = (async () => {
      const uid = await currentUserId();
      await mod.Purchases.configure({
        apiKey: IOS_API_KEY,
        appUserID: uid ?? undefined,
      });
      syncedUserId = uid;
      try {
        await mod.Purchases.setLogLevel({ level: mod.LOG_LEVEL.ERROR });
      } catch {
        /* non-fatal */
      }
    })();
  }
  await configurePromise;

  const uid = await currentUserId();
  if (uid && uid !== syncedUserId) {
    await mod.Purchases.logIn({ appUserID: uid });
    syncedUserId = uid;
  }
  return mod;
}

function findProPackage(offerings: PurchasesOfferings): PurchasesPackage | null {
  const offering = offerings.current;
  if (!offering) return null;
  const byId = offering.availablePackages.find(
    (p) => p.product.identifier === IAP_PRODUCTS.proMonthly,
  );
  if (byId) return byId;
  if (offering.monthly) return offering.monthly;
  return offering.availablePackages[0] ?? null;
}

function isCancelled(mod: RcModule, err: unknown): boolean {
  const e = err as { code?: unknown; userCancelled?: boolean } | null;
  if (!e) return false;
  return (
    e.userCancelled === true ||
    e.code === mod.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
  );
}

function messageOf(err: unknown, fallback: string): string {
  const e = err as { message?: unknown } | null;
  return typeof e?.message === 'string' && e.message ? e.message : fallback;
}

/** Live, localized Pro price string (e.g. "$5.99"), or null if unavailable. */
export async function getProPrice(): Promise<string | null> {
  const mod = await ensureReady();
  if (!mod) return null;
  try {
    const offerings = await mod.Purchases.getOfferings();
    return findProPackage(offerings)?.product.priceString ?? null;
  } catch {
    return null;
  }
}

/** Live, localized Event Boost price string (e.g. "$1.99"), or null. */
export async function getBoostPrice(): Promise<string | null> {
  const mod = await ensureReady();
  if (!mod) return null;
  try {
    const { products } = await mod.Purchases.getProducts({
      productIdentifiers: [IAP_PRODUCTS.boost72h],
      type: mod.PRODUCT_CATEGORY.NON_SUBSCRIPTION,
    });
    return products[0]?.priceString ?? null;
  } catch {
    return null;
  }
}

/** Purchases the Pro monthly subscription via StoreKit. */
export async function purchasePro(): Promise<IapResult> {
  const mod = await ensureReady();
  if (!mod) return { ok: false, error: NOT_AVAILABLE };
  try {
    const offerings = await mod.Purchases.getOfferings();
    const pkg = findProPackage(offerings);
    if (!pkg) {
      return { ok: false, error: 'Pro Seller is not available right now.' };
    }
    const res = await mod.Purchases.purchasePackage({ aPackage: pkg });
    const active = Boolean(res.customerInfo.entitlements.active[PRO_ENTITLEMENT]);
    if (!active) {
      return {
        ok: false,
        error: 'Purchase did not activate Pro. Try Restore Purchases.',
      };
    }
    return { ok: true };
  } catch (err) {
    if (isCancelled(mod, err)) {
      return { ok: false, cancelled: true, error: 'Purchase cancelled.' };
    }
    return { ok: false, error: messageOf(err, 'Purchase failed.') };
  }
}

/**
 * Purchases the 72h Event Boost consumable via StoreKit. Granting the boost to
 * a specific item happens server-side (/api/iap/boost/confirm) which reads the
 * verified transaction from RevenueCat — so this only completes the purchase.
 */
export async function purchaseBoost(): Promise<IapResult> {
  const mod = await ensureReady();
  if (!mod) return { ok: false, error: NOT_AVAILABLE };
  try {
    const { products } = await mod.Purchases.getProducts({
      productIdentifiers: [IAP_PRODUCTS.boost72h],
      type: mod.PRODUCT_CATEGORY.NON_SUBSCRIPTION,
    });
    const product = products[0];
    if (!product) {
      return { ok: false, error: 'Event Boost is not available right now.' };
    }
    await mod.Purchases.purchaseStoreProduct({ product });
    return { ok: true };
  } catch (err) {
    if (isCancelled(mod, err)) {
      return { ok: false, cancelled: true, error: 'Purchase cancelled.' };
    }
    return { ok: false, error: messageOf(err, 'Purchase failed.') };
  }
}

/**
 * Restores prior purchases. Returns whether Pro is active afterwards so the UI
 * can confirm; the server /api/iap/sync call makes the DB authoritative.
 */
export async function restore(): Promise<
  { ok: true; pro: boolean } | { ok: false; error: string }
> {
  const mod = await ensureReady();
  if (!mod) return { ok: false, error: NOT_AVAILABLE };
  try {
    const { customerInfo } = await mod.Purchases.restorePurchases();
    const pro = Boolean(customerInfo.entitlements.active[PRO_ENTITLEMENT]);
    return { ok: true, pro };
  } catch (err) {
    return { ok: false, error: messageOf(err, 'Restore failed.') };
  }
}
