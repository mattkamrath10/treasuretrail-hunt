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
 * Reversible: to bring monetization back on iOS, return `false` here. No
 * monetization code was deleted — every feature is gated behind this flag.
 * Web and Android are unaffected.
 */
export function monetizationHidden(): boolean {
  return isIOS();
}
