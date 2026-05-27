import { supabase } from './supabase';

export type EventCategory =
  | 'estate_sale'
  | 'yard_sale'
  | 'flea_market'
  | 'auction'
  | 'pop_up'
  | 'collectibles_show'
  | 'other';

export type EventStatus = 'draft' | 'published' | 'cancelled';

export interface EventRow {
  id: string;
  holder_id: string;
  title: string;
  description: string;
  category: EventCategory;
  starts_at: string;
  ends_at: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  cover_image_url: string | null;
  cover_thumb_url: string | null;
  status: EventStatus;
  created_at: string;
  updated_at: string;
}

export interface EventFeaturedItem {
  id: string;
  event_id: string;
  title: string;
  price: number | null;
  image_url: string | null;
  thumb_url: string | null;
  position: number;
  created_at: string;
}

export interface EventUpsert {
  id?: string;
  title: string;
  description?: string;
  category: EventCategory;
  starts_at: string;
  ends_at?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  lat?: number | null;
  lng?: number | null;
  cover_image_url?: string | null;
  cover_thumb_url?: string | null;
  status: EventStatus;
}

/** Public feed of published events, soonest first. */
export async function fetchPublishedEvents(opts?: { city?: string | null; limit?: number }) {
  let q = supabase
    .from('events')
    .select('*')
    .eq('status', 'published')
    .order('starts_at', { ascending: true })
    .limit(opts?.limit ?? 50);
  if (opts?.city) q = q.eq('city', opts.city);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as EventRow[];
}

/** All events owned by a holder (any status). */
export async function fetchMyEvents(holderId: string) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('holder_id', holderId)
    .order('starts_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as EventRow[];
}

export async function fetchEvent(id: string) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as EventRow | null;
}

/**
 * Owner-scoped fetch for the edit page. Without the `holder_id` filter
 * a holder could open another holder's published event URL and have the
 * edit form silently preload it (RLS still blocks saves, but the load
 * itself leaks edit affordances). Always use this for /seller/event/:id.
 */
export async function fetchMyEvent(id: string, holderId: string) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .eq('holder_id', holderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as EventRow | null;
}

export async function createEvent(holderId: string, input: EventUpsert) {
  const { data, error } = await supabase
    .from('events')
    .insert({ ...input, holder_id: holderId })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as EventRow;
}

export async function updateEvent(id: string, patch: Partial<EventUpsert>) {
  const { data, error } = await supabase
    .from('events')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as EventRow;
}

export async function deleteEvent(id: string) {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ---------------- Featured items ---------------- */

export async function fetchEventFeaturedItems(eventId: string) {
  const { data, error } = await supabase
    .from('event_featured_items')
    .select('*')
    .eq('event_id', eventId)
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as EventFeaturedItem[];
}

export async function addEventFeaturedItem(
  eventId: string,
  item: { title: string; price?: number | null; image_url?: string | null; thumb_url?: string | null; position?: number },
) {
  const { data, error } = await supabase
    .from('event_featured_items')
    .insert({ event_id: eventId, ...item })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as EventFeaturedItem;
}

export async function deleteEventFeaturedItem(id: string) {
  const { error } = await supabase.from('event_featured_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
