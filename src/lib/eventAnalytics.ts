import { supabase } from './supabase';

export type EventClickKind = 'directions' | 'featured_item' | 'contact' | 'share';

/**
 * Record a view of an event. Dedupes per (event, viewer, day) via the
 * SECURITY DEFINER RPC. Best-effort — tracking failures must never break
 * the page render.
 */
export async function trackEventView(eventId: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('track_event_view', { p_event_id: eventId });
    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e?.message ?? 'track_event_view failed' };
  }
}

/**
 * Log a CTA click. No dedupe — we want raw totals for the analytics card
 * ("23 directions taps").
 */
export async function trackEventClick(
  eventId: string,
  kind: EventClickKind,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('track_event_click', {
      p_event_id: eventId,
      p_click_kind: kind,
    });
    if (error) return { error: error.message };
    return { error: null };
  } catch (e: any) {
    return { error: e?.message ?? 'track_event_click failed' };
  }
}

export interface EventEngagement {
  view_count: number;
  save_count: number;
  click_counts: Record<EventClickKind, number>;
}

const ZERO_CLICKS: EventEngagement['click_counts'] = {
  directions: 0,
  featured_item: 0,
  contact: 0,
  share: 0,
};

/** One-shot engagement fetch for a single event (used by the holder dashboard). */
export async function fetchEventEngagement(eventId: string): Promise<EventEngagement> {
  const [viewsRes, savesRes, clicksRes] = await Promise.all([
    supabase.from('event_view_counts').select('view_count').eq('event_id', eventId).maybeSingle(),
    supabase.from('event_save_counts').select('save_count').eq('event_id', eventId).maybeSingle(),
    supabase.from('event_click_counts').select('click_kind, click_count').eq('event_id', eventId),
  ]);
  const click_counts: EventEngagement['click_counts'] = { ...ZERO_CLICKS };
  for (const row of clicksRes.data ?? []) {
    const k = (row as any).click_kind as EventClickKind;
    if (k in click_counts) click_counts[k] = (row as any).click_count ?? 0;
  }
  return {
    view_count: (viewsRes.data?.view_count as number | undefined) ?? 0,
    save_count: (savesRes.data?.save_count as number | undefined) ?? 0,
    click_counts,
  };
}
