/**
 * Lightweight client-side reminder store backed by localStorage. Used for
 * prototype/hardcoded events whose IDs are not real `live_events` rows in
 * Supabase. When real events are seeded, switch to `eventReminders.ts`.
 *
 * Each entry holds the event id, title, and an ISO start timestamp so we
 * can fire "starting soon" notifications without hitting the DB.
 */
import { createNotification } from './notifications';

const KEY = 'tt_local_reminders_v1';
const NOTIFIED_KEY = 'tt_local_reminders_notified_v1';

export type LocalReminder = {
  eventId: string;
  title: string;
  startsAtISO: string;
  remindBeforeMinutes: number;
  createdAt: string;
};

function readAll(): LocalReminder[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LocalReminder[];
  } catch { return []; }
}

function writeAll(rows: LocalReminder[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch {}
}

function readNotified(): Record<string, string> {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch { return {}; }
}

function writeNotified(map: Record<string, string>): void {
  try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(map)); } catch {}
}

export function isReminderOn(eventId: string): boolean {
  return readAll().some((r) => r.eventId === eventId);
}

export function listLocalReminders(): LocalReminder[] {
  return readAll();
}

export function toggleLocalReminder(input: Omit<LocalReminder, 'createdAt'>): boolean {
  const all = readAll();
  const existing = all.findIndex((r) => r.eventId === input.eventId);
  if (existing >= 0) {
    all.splice(existing, 1);
    writeAll(all);
    return false;
  }
  all.unshift({ ...input, createdAt: new Date().toISOString() });
  writeAll(all);
  return true;
}

/**
 * For each local reminder whose event starts within remindBeforeMinutes and
 * has not yet been notified within the last 24h, write a notification.
 * Returns count of notifications created. No-op if userId is missing.
 */
export async function checkLocalReminders(userId: string | null | undefined): Promise<number> {
  if (!userId) return 0;
  const all = readAll();
  if (all.length === 0) return 0;
  const notified = readNotified();
  const now = Date.now();
  let created = 0;

  for (const r of all) {
    const startMs = new Date(r.startsAtISO).getTime();
    if (Number.isNaN(startMs)) continue;
    const minutesUntil = (startMs - now) / 60000;
    if (minutesUntil <= 0 || minutesUntil > r.remindBeforeMinutes) continue;

    const last = notified[r.eventId] ? new Date(notified[r.eventId]).getTime() : 0;
    if (now - last < 24 * 60 * 60 * 1000) continue;

    const mins = Math.max(1, Math.round(minutesUntil));
    await createNotification({
      user_id: userId,
      type: 'event_reminder',
      title: `Starting soon: ${r.title}`,
      content: `Begins in about ${mins} minute${mins === 1 ? '' : 's'}.`,
      related_item_id: r.eventId,
      related_item_type: 'local_event',
    });
    notified[r.eventId] = new Date().toISOString();
    created += 1;
  }
  writeNotified(notified);
  return created;
}
