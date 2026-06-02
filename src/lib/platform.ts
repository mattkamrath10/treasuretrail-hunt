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
