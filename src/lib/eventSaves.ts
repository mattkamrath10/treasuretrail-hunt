import { supabase } from './supabase';

/** Whether the current user has saved this event. */
export async function isEventSaved(userId: string, eventId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('event_saves')
    .select('event_id')
    .eq('user_id', userId)
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

export async function saveEvent(userId: string, eventId: string) {
  const { error } = await supabase
    .from('event_saves')
    .insert({ user_id: userId, event_id: eventId });
  // Duplicate-save is fine — swallow 23505.
  if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
}

export async function unsaveEvent(userId: string, eventId: string) {
  const { error } = await supabase
    .from('event_saves')
    .delete()
    .eq('user_id', userId)
    .eq('event_id', eventId);
  if (error) throw new Error(error.message);
}

/** All events the user has saved, joined to the event row. */
export async function fetchSavedEvents(userId: string) {
  const { data, error } = await supabase
    .from('event_saves')
    .select('event_id, created_at, events:event_id(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => r.events).filter(Boolean);
}
