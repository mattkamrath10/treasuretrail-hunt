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
