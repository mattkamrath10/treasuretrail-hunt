import { supabase } from './supabase';
import { createNotification } from './notifications';

export type EventReminder = {
  id: string;
  user_id: string;
  event_id: string;
  remind_before_minutes: number;
  last_notified_at: string | null;
  created_at: string;
};

export type EventReminderWithEvent = EventReminder & {
  live_events: {
    id: string;
    title: string;
    starts_at: string;
    region: string | null;
  } | null;
};

export async function addReminder(
  userId: string,
  eventId: string,
  remindBeforeMinutes = 60
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('event_reminders')
    .upsert(
      {
        user_id: userId,
        event_id: eventId,
        remind_before_minutes: remindBeforeMinutes,
      },
      { onConflict: 'user_id,event_id' }
    );
  if (error) return { error: error.message };
  return { error: null };
}

export async function removeReminder(userId: string, eventId: string): Promise<void> {
  await supabase
    .from('event_reminders')
    .delete()
    .eq('user_id', userId)
    .eq('event_id', eventId);
}

export async function listReminders(userId: string): Promise<EventReminderWithEvent[]> {
  const { data, error } = await supabase
    .from('event_reminders')
    .select('*, live_events(id, title, starts_at, region)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as EventReminderWithEvent[];
}

export async function listReminderEventIds(userId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('event_reminders')
    .select('event_id')
    .eq('user_id', userId);
  return new Set((data ?? []).map((r) => r.event_id as string));
}

/**
 * Look at the user's reminders. For each whose event starts within
 * `remind_before_minutes` from now and was not already notified within
 * the last 24h, create a notification and stamp last_notified_at.
 * Returns count of notifications created.
 */
export async function checkUpcomingReminders(userId: string): Promise<number> {
  const reminders = await listReminders(userId);
  const now = Date.now();
  let created = 0;
  for (const r of reminders) {
    if (!r.live_events) continue;
    const startMs = new Date(r.live_events.starts_at).getTime();
    const minutesUntil = (startMs - now) / 60000;
    if (minutesUntil <= 0) continue; // already started
    if (minutesUntil > r.remind_before_minutes) continue;

    // Dedupe: skip if notified within last 24h
    if (r.last_notified_at) {
      const sinceNotified = now - new Date(r.last_notified_at).getTime();
      if (sinceNotified < 24 * 60 * 60 * 1000) continue;
    }

    const mins = Math.max(1, Math.round(minutesUntil));
    await createNotification({
      user_id: userId,
      type: 'event_reminder',
      title: `Starting soon: ${r.live_events.title}`,
      content: `Begins in about ${mins} minute${mins === 1 ? '' : 's'}.`,
      related_item_id: r.event_id,
      related_item_type: 'live_event',
    });
    await supabase
      .from('event_reminders')
      .update({ last_notified_at: new Date().toISOString() })
      .eq('id', r.id);
    created += 1;
  }
  return created;
}
