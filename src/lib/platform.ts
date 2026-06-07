/**
 * Platform detection helpers for the Capacitor native shell.
 *
 * `Capacitor.isNativePlatform()` is true inside the iOS/Android shells and
 * false on the web. `getPlatform()` returns 'ios' | 'android' | 'web'.
 */
import { Capacitor } from '@capacitor/core';

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export function isIOS(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

export function isAndroid(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/**
 * Apple Guideline 3.1.1: digital goods (Pro membership, boosts) may only be
 * sold through In-App Purchase.
 *
 * Real Apple IAP is now wired on iOS via RevenueCat (see src/lib/iap.ts), so
 * the iOS build SHOWS prices and purchase CTAs and completes purchases through
 * StoreKit. This flag therefore returns false. It is kept as a single, named
 * kill-switch: return `isIOS()` again to instantly hide every iOS price/buy
 * button if a compliance issue ever arises.
 */
export function iosPaymentsBlocked(): boolean {
  return false;
}

/**
 * Master monetization visibility switch.
 *
 * When true, the whole monetization surface is removed — Pro/membership pages,
 * event-boost flows, pricing, "Upgrade" CTAs, Pro badges and Pro-only reach
 * analytics. No monetization code is deleted; every feature is gated behind
 * this flag so it can be toggled in one place.
 *
 * Now returns false: the membership screen is the production Apple IAP
 * subscription screen. Purchases are real on iOS (RevenueCat → StoreKit); on
 * web/Android the same screen is shown but the purchase initiators surface a
 * clear "available in the TreasureTrail iOS app" message until those platforms
 * get their own payment path (see src/lib/payments.ts).
 *
 * Reversible:
 *   - to hide monetization everywhere again, return `true`;
 *   - to show on web/Android only (hide on iOS), return `isIOS()`.
 */
export function monetizationHidden(): boolean {
  return false;
}
