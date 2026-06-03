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
 * sold through In-App Purchase. Until StoreKit is wired, the iOS build must not
 * present ANY purchase surface — no prices, no buy buttons, no external payment
 * links. This flag gates every purchase CTA on iOS only; web and Android are
 * unaffected.
 */
export function iosPaymentsBlocked(): boolean {
  return isIOS();
}

/**
 * TEMPORARY App Store compliance switch.
 *
 * For the iOS resubmission to Apple, the build must not expose ANY
 * monetization surface at all — not just purchase buttons, but the whole
 * Pro/membership pages, event-boost flows, pricing, "Upgrade" CTAs and
 * Pro-only reach analytics. This is broader than `iosPaymentsBlocked()`
 * (which only hides prices/buy buttons): when this returns true, the
 * monetization screens themselves are removed from navigation.
 *
 * Currently hidden on ALL platforms (web, iOS, Android) at the user's
 * request so no monetization UI is visible anywhere while the app is under
 * App Store review. No monetization code was deleted — every feature is
 * gated behind this flag.
 *
 * Reversible:
 *   - to restore monetization everywhere, return `false`;
 *   - to restore it on web/Android only (hide on iOS), return `isIOS()`.
 */
export function monetizationHidden(): boolean {
  return true;
}
