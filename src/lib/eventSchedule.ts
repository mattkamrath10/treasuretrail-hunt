/**
 * Phase 5 — Shared event-scheduling helpers.
 *
 * All Live Events status, badge, and countdown logic is derived from real
 * Supabase timestamps (start_at / ends_at). When start_at is missing we
 * fall back to created_at so legacy uploads keep rendering.
 */

export type EventStatus = 'upcoming' | 'live' | 'ending_soon' | 'ended' | 'open_ended';

export interface SchedulableListing {
  start_at?: string | null;
  ends_at?: string | null;
  created_at?: string | null;
}

const HOUR_MS = 60 * 60 * 1000;
const ENDING_SOON_WINDOW_MS = 3 * HOUR_MS;
const STARTING_SOON_WINDOW_MS = 6 * HOUR_MS;

export function effectiveStartMs(l: SchedulableListing): number | null {
  const raw = l.start_at ?? l.created_at ?? null;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function endMs(l: SchedulableListing): number | null {
  if (!l.ends_at) return null;
  const ms = new Date(l.ends_at).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function deriveStatus(l: SchedulableListing, now: number = Date.now()): EventStatus {
  const start = effectiveStartMs(l);
  const end = endMs(l);
  if (end != null && now > end) return 'ended';
  if (start != null && now < start) return 'upcoming';
  // Either start has passed or start is unknown.
  // Open-ended (no end time) post-start is treated as live — there's no
  // way for it to end on its own, so the host is actively running it.
  if (end == null) return 'live';
  if (end - now <= ENDING_SOON_WINDOW_MS) return 'ending_soon';
  return 'live';
}

/** Numeric priority for ranking — lower = higher priority. */
export function statusPriority(status: EventStatus): number {
  switch (status) {
    case 'live':         return 0;
    case 'ending_soon':  return 1;
    case 'upcoming':     return 2;
    case 'open_ended':   return 3;
    case 'ended':        return 4;
  }
}

export function isMultiDay(l: SchedulableListing): boolean {
  const s = effectiveStartMs(l);
  const e = endMs(l);
  if (s == null || e == null) return false;
  const sd = new Date(s);
  const ed = new Date(e);
  return sd.toDateString() !== ed.toDateString();
}

export function isStartingToday(l: SchedulableListing, now: number = Date.now()): boolean {
  const s = effectiveStartMs(l);
  if (s == null) return false;
  const today = new Date(now);
  const sd = new Date(s);
  return today.toDateString() === sd.toDateString();
}

export function isStartingSoon(l: SchedulableListing, now: number = Date.now()): boolean {
  const s = effectiveStartMs(l);
  if (s == null) return false;
  return s > now && s - now <= STARTING_SOON_WINDOW_MS;
}

export function isEndingSoon(l: SchedulableListing, now: number = Date.now()): boolean {
  return deriveStatus(l, now) === 'ending_soon';
}

export function durationMs(l: SchedulableListing): number | null {
  const s = effectiveStartMs(l);
  const e = endMs(l);
  if (s == null || e == null) return null;
  return Math.max(0, e - s);
}

export function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m === 0 ? `${h}h` : `${h}h ${m}m`;
  const days = Math.floor(h / 24);
  const rem = h % 24;
  return rem === 0 ? `${days}d` : `${days}d ${rem}h`;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function fmtDayShort(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

function fmtDateShort(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Format a human-readable schedule range.
 *   Same day:    "Sat 7:00 AM – 3:00 PM"
 *   Multi day:   "Fri Mar 1 8:00 AM – Sun Mar 3 5:00 PM"
 *   Open ended:  "Sat 7:00 AM • Open ended"
 *   Start only:  "Starts Sat 7:00 AM"
 *   End only:    "Ends Sat 3:00 PM"
 */
export function formatScheduleRange(l: SchedulableListing): string {
  const sMs = l.start_at ? new Date(l.start_at).getTime() : NaN;
  const eMs = l.ends_at ? new Date(l.ends_at).getTime() : NaN;
  const hasStart = Number.isFinite(sMs);
  const hasEnd = Number.isFinite(eMs);

  if (!hasStart && !hasEnd) return '';
  if (hasStart && !hasEnd) {
    const d = new Date(sMs);
    return `Starts ${fmtDayShort(d)} ${fmtTime(d)} • Open ended`;
  }
  if (!hasStart && hasEnd) {
    const d = new Date(eMs);
    return `Ends ${fmtDayShort(d)} ${fmtTime(d)}`;
  }
  const start = new Date(sMs);
  const end = new Date(eMs);
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    return `${fmtDayShort(start)} ${fmtTime(start)} – ${fmtTime(end)}`;
  }
  return `${fmtDayShort(start)} ${fmtDateShort(start)} ${fmtTime(start)} – ${fmtDayShort(end)} ${fmtDateShort(end)} ${fmtTime(end)}`;
}

export function formatCountdown(targetMs: number, now: number = Date.now()): string {
  const diff = targetMs - now;
  if (diff <= 0) return 'now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'in <1 min';
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
  const days = Math.floor(h / 24);
  const remH = h % 24;
  return remH === 0 ? `in ${days}d` : `in ${days}d ${remH}h`;
}

export function formatStartCountdown(l: SchedulableListing, now: number = Date.now()): string | null {
  const s = effectiveStartMs(l);
  if (s == null || s <= now) return null;
  return `Starts ${formatCountdown(s, now)}`;
}

export function formatEndCountdown(l: SchedulableListing, now: number = Date.now()): string | null {
  const e = endMs(l);
  if (e == null) return null;
  if (e <= now) return 'Ended';
  return `Ends ${formatCountdown(e, now)}`;
}

export interface StatusBadge {
  label: string;
  bg: string;
  fg: string;
  pulse?: boolean;
}

/** Returns the ordered list of badges that should appear on a listing card. */
export function statusBadges(l: SchedulableListing, now: number = Date.now()): StatusBadge[] {
  const out: StatusBadge[] = [];
  const status = deriveStatus(l, now);

  if (status === 'live') {
    out.push({ label: 'LIVE NOW', bg: 'var(--color-error-500)', fg: '#fff', pulse: true });
  } else if (status === 'ending_soon') {
    out.push({ label: 'ENDS SOON', bg: 'var(--color-warning-500)', fg: '#fff' });
  } else if (status === 'upcoming') {
    if (isStartingSoon(l, now)) {
      out.push({ label: 'STARTS SOON', bg: 'var(--color-primary-600)', fg: '#fff' });
    } else if (isStartingToday(l, now)) {
      out.push({ label: 'TODAY', bg: 'var(--color-primary-600)', fg: '#fff' });
    } else {
      out.push({ label: 'UPCOMING', bg: 'var(--color-neutral-700)', fg: '#fff' });
    }
  } else if (status === 'ended') {
    out.push({ label: 'ENDED', bg: 'var(--color-neutral-300)', fg: 'var(--color-neutral-700)' });
  }

  if (isMultiDay(l)) {
    out.push({ label: 'MULTI-DAY', bg: 'var(--color-secondary-50)', fg: 'var(--color-secondary-700)' });
  }
  return out;
}

/**
 * Sort comparator builders for the Live Events surface.
 * 'live_now' surfaces live > ending_soon > upcoming > open_ended > ended.
 */
export type EventSortKey = 'live_now' | 'starting_soonest' | 'ending_soon' | 'newest';

export function eventComparator(key: EventSortKey, now: number = Date.now()) {
  return (a: SchedulableListing, b: SchedulableListing): number => {
    const sa = effectiveStartMs(a) ?? 0;
    const sb = effectiveStartMs(b) ?? 0;
    const ea = endMs(a);
    const eb = endMs(b);
    const stA = statusPriority(deriveStatus(a, now));
    const stB = statusPriority(deriveStatus(b, now));
    switch (key) {
      case 'live_now':
        if (stA !== stB) return stA - stB;
        // Within the same status bucket, sort upcoming by soonest start,
        // live/ending by soonest end, ended by most-recently-ended.
        if (stA === 0 || stA === 1) {
          if (ea == null && eb == null) return 0;
          if (ea == null) return 1;
          if (eb == null) return -1;
          return ea - eb;
        }
        if (stA === 2) return sa - sb;
        return sb - sa;
      case 'starting_soonest': {
        // Future starts ascend; past starts pushed to the bottom.
        const fa = sa >= now ? sa : Number.POSITIVE_INFINITY;
        const fb = sb >= now ? sb : Number.POSITIVE_INFINITY;
        if (fa !== fb) return fa - fb;
        return sb - sa;
      }
      case 'ending_soon': {
        const fa = ea != null && ea >= now ? ea : Number.POSITIVE_INFINITY;
        const fb = eb != null && eb >= now ? eb : Number.POSITIVE_INFINITY;
        return fa - fb;
      }
      case 'newest':
      default: {
        const ca = a.created_at ? new Date(a.created_at).getTime() : 0;
        const cb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return cb - ca;
      }
    }
  };
}
