/**
 * Analytics Lite — single-firehose tracker. Backs the `analytics_events`
 * table created in `20260528000002_monetization_phase1.sql`. Foundation
 * only: this file ships the write path so events accrue immediately.
 * The dashboards / aggregation queries come in Phase 2 alongside the
 * Pro analytics surface.
 *
 * Every call is best-effort (network errors are swallowed). View
 * tracking must NEVER throw an error into the user's render path.
 */

import { supabase } from './supabase';
import { isNative } from './platform';

export type AnalyticsKind =
  | 'view'
  | 'click'
  | 'message_started'
  | 'save'
  | 'profile_visit';

export type AnalyticsTargetKind = 'event' | 'wanted' | 'find' | 'listing' | 'profile';

export interface TrackArgs {
  kind: AnalyticsKind;
  targetKind: AnalyticsTargetKind;
  targetId: string;
}

/**
 * Fire-and-forget. Resolves with `{ ok }` but most callers ignore the
 * return — we explicitly do NOT block UI on the network round-trip.
 */
export async function trackAnalyticsEvent(args: TrackArgs): Promise<{ ok: boolean }> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const actorId = auth.user?.id ?? null;
    const { error } = await supabase.from('analytics_events').insert({
      kind: args.kind,
      target_kind: args.targetKind,
      target_id: args.targetId,
      actor_id: actorId,
    });
    if (error) {
      // Swallow — RLS rejection or transient network issue. Analytics is
      // never load-bearing for the user-facing flow.
      console.warn('[analytics]', args.kind, args.targetKind, error.message);
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.warn('[analytics] threw', (e as Error).message);
    return { ok: false };
  }
}

// =====================================================================
// Web analytics (Google Analytics 4) — privacy-light, opt-in by env
// ---------------------------------------------------------------------
// Separate from Analytics Lite above (which tracks in-app engagement to
// Supabase). This is the SITE-traffic tracker for SEO/growth: how many people
// land on pages, from where, on what device. Completely inert until
// VITE_GA_MEASUREMENT_ID (a "G-XXXXXXX" id) is set at build time. We load gtag
// with send_page_view disabled and fire a manual page_view on every
// client-side route change, since this is a single-page app and the browser
// only does one real navigation. Web-only: we skip the native Capacitor shell
// so the iOS/Android apps don't ship a web tracker.
// =====================================================================
const GA_MEASUREMENT_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined)?.trim();

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let gaStarted = false;

export function analyticsEnabled(): boolean {
  return Boolean(GA_MEASUREMENT_ID) && !isNative();
}

// Loads the GA4 script once. Safe to call repeatedly.
export function initAnalytics(): void {
  if (gaStarted || !analyticsEnabled() || typeof document === 'undefined') return;
  gaStarted = true;

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };
  window.gtag('js', new Date());
  // We send page_view manually on route change for accurate SPA tracking.
  window.gtag('config', GA_MEASUREMENT_ID, { send_page_view: false });
}

// Records a single virtual pageview for the given path.
export function trackPageview(path: string): void {
  if (!analyticsEnabled() || !window.gtag) return;
  window.gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.origin + path,
    page_title: document.title,
  });
}
